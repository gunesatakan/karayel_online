/**
 * Basliksiz "bot maci": gercek `MatchRoom` uzerinde tam bir asama.
 *
 * Oda sunucunun kendi yoluyla kuruluyor (`setupRoom` -> `onJoin` ->
 * solo icin dogrudan baslatma, co-op icin lobi hazir + baslat). Botlar odaya
 * yalnizca istemcinin gonderdigi mesajlarla dokunuyor ve mesajlar odanin
 * kayitli isleyicilerinden geciyor (`onMessageHandlers`): govde duzeltme,
 * hiz siniri ve asama kapisi gercek oyundaki gibi. Kural kopyasi yok; her
 * kural (lojistik, isabet, donus hizi, menzil, kontrol, irk mekanikleri,
 * karsi ataklar, yasak bolgeler, dalga paternleri) odanin kendisinden.
 *
 * Degisen yalnizca dis dunya:
 * - saat sanal ve zar tohumlu (`world.mjs`);
 * - ag yayini kapali: `broadcast` ve istemci `send` bos, snapshot ve perf
 *   yayini hic tetiklenmiyor (`lastSnapshotBroadcastAt = Infinity`). Bunun
 *   sonucu degistirmedigi `validate.mjs`te olculuyor.
 *
 * Mermi/enerji yapay olarak doldurulmuyor. Tek kolaylik bayragi
 * `unsafe.freeLogistics` (varsayilan kapali, raporda isaretli).
 */
import { MatchRoom } from "../../apps/server/dist/rooms/MatchRoom.js";
import * as shared from "../../packages/shared/dist/index.js";
import { withSeededWorld, mulberry32, deriveSeed } from "./world.mjs";

export { shared, MatchRoom };

/** Colyseus'un varsayilan simulasyon araligi (60 Hz); sunucu bunu kullaniyor. */
export const SERVER_TICK_MS = 1000 / 60;
/** Bir dalga bundan uzun surerse mac "stalled" sayilip kesiliyor (gercek dalga ~1 dk). */
const MAX_WAVE_GAME_MS = 6 * 60 * 1000;

function createBotClient(sessionId, inbox) {
  return {
    sessionId,
    id: sessionId,
    state: 1,
    ref: { bufferedAmount: 0 },
    userData: undefined,
    auth: undefined,
    send(type) { inbox.set(type, (inbox.get(type) ?? 0) + 1); },
    sendBytes() {},
    enqueueRaw() {},
    raw() {},
    leave() {},
    error() {}
  };
}

/**
 * Odayi gercek kurulum yoluyla acar. Saat/zar cagirandan (withSeededWorld).
 *
 * `operators`: oyuncu basina operator. Tek oyuncu solo yolundan
 * (`autoStart`), birden fazlasi lobi yolundan baslar.
 */
export function openRoom({ operators, stage = 1, mapScale = 1, snapshots = false }) {
  const room = new MatchRoom();
  // Gercek Colyseus saati kurulmasin: tick'i surucu cagiriyor.
  room.setSimulationInterval = () => {};
  if (!snapshots) room.broadcast = () => {};
  const solo = operators.length === 1;
  const baseOptions = { stage, mapScale, wireDelta: shared.WIRE_DELTA_PROTOCOL ?? 2 };
  room.setupRoom({ ...baseOptions, autoStart: solo, characterId: operators[0], playerName: "Bot1" });
  const inboxes = operators.map(() => new Map());
  const clients = operators.map((_, index) => createBotClient(`p${index + 1}`, inboxes[index]));
  for (const [index, client] of clients.entries()) {
    room.clients.push(client);
    room.onJoin(client, { ...baseOptions, autoStart: solo, characterId: operators[index], playerName: `Bot${index + 1}` });
  }
  const dispatch = (client, type, message) => {
    const handler = room.onMessageHandlers[type];
    if (!handler) throw new Error(`unknown message type ${type}`);
    handler.callback(client, message);
  };
  if (!solo) {
    for (const client of clients) dispatch(client, "lobby:setReady", { ready: true });
    dispatch(clients[0], "lobby:start", {});
  }
  if (!room.gameStarted) throw new Error("room did not start");
  for (const [index, client] of clients.entries()) {
    const player = room.state.players.get(client.sessionId);
    if (player?.characterId !== operators[index]) throw new Error(`player ${index + 1} got ${player?.characterId}, wanted ${operators[index]}`);
  }
  if (!snapshots) {
    room.lastSnapshotBroadcastAt = Number.POSITIVE_INFINITY;
    room.lastPerfBroadcastAt = Number.POSITIVE_INFINITY;
  }
  return { room, clients, inboxes, dispatch };
}

function percentileOf(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export function summarize(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return { n: sorted.length, mean, median: percentileOf(sorted, 0.5), p10: percentileOf(sorted, 0.1), p90: percentileOf(sorted, 0.9), min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0 };
}

/**
 * Tek mac. Saf fonksiyon: ayni girdi -> ayni cikti (tohumlu dunya).
 *
 * @param {object} options
 * @param {string[]} options.operators
 * @param {number} options.stage
 * @param {number} options.seed
 * @param {(ctx) => object} options.createPolicy  oyuncu basina bot
 * @param {number} [options.maxWaves]  bu dalga kapaninca dur (duman testi)
 * @param {boolean} [options.record]  mesaj gunlugunu dondur
 */
export function runMatch(options) {
  const {
    operators,
    stage = 1,
    seed = 1,
    createPolicy,
    mapScale = 1,
    maxWaves = shared.FINAL_WAVE,
    tickMs = SERVER_TICK_MS,
    record = false,
    snapshots = false,
    unsafe = {},
    label = ""
  } = options;
  const startedAt = process.hrtime.bigint();
  const result = withSeededWorld(seed, (world) => {
    const { room, clients, inboxes, dispatch } = openRoom({ operators, stage, mapScale, snapshots });
    const log = [];
    let tick = 0;
    const playerIds = clients.map((client) => client.sessionId);
    const sold = new Set();
    const policies = clients.map((client, index) => {
      const send = (type, message = {}) => {
        if (record) log.push({ t: tick, p: index, type, m: message });
        // Yikik yapinin satilmasi kayip sayilmaya devam ediyor.
        if (type === "sellTower" && message.towerId && (room.towers.get(message.towerId)?.hp ?? 0) > 0) sold.add(message.towerId);
        dispatch(client, type, message);
      };
      return createPolicy({
        room,
        shared,
        client,
        playerId: client.sessionId,
        playerIndex: index,
        operator: operators[index],
        stage,
        send,
        inbox: inboxes[index],
        rng: mulberry32(deriveSeed(seed, 100 + index)),
        get tick() { return tick; }
      });
    });

    const metrics = createMetrics(room, playerIds, tickMs);
    let waveStartTick = 0;
    let status = "running";
    let stall;
    let lastWave = room.wave;
    while (true) {
      // Botlar once (kurulum evresinde her tick, savasta kendi araliklariyla).
      for (const policy of policies) policy.act();
      world.advance(tickMs);
      room.update(tickMs);
      tick += 1;
      if (unsafe.freeLogistics) {
        for (const tower of room.towers.values()) {
          tower.ammo = tower.maxAmmo;
          tower.energy = tower.maxEnergy;
        }
      }
      metrics.afterTick(tick);
      if (tick % 15 === 0) metrics.scanTowers(sold);
      if (room.wave !== lastWave) {
        metrics.closeWave(lastWave, tick);
        lastWave = room.wave;
        waveStartTick = tick;
        if (lastWave > maxWaves) { status = "capped"; break; }
      }
      if (room.matchResult) {
        metrics.closeWave(room.wave, tick, true);
        status = room.matchResult;
        break;
      }
      if (!room.setupPhase && (tick - waveStartTick) * tickMs > MAX_WAVE_GAME_MS) {
        status = "stalled";
        stall = [...room.enemies.values()].slice(0, 3).map((enemy) => {
          const cell = shared.worldToGrid(enemy.x, enemy.y, room.activeMap);
          return { type: enemy.type, movementKind: enemy.movementKind, champion: Boolean(enemy.champion), special: enemy.special?.kind, col: cell.col, row: cell.row, hp: Math.round(enemy.hp), navigator: enemy.navigator?.mode };
        });
        metrics.closeWave(room.wave, tick, true);
        break;
      }
    }
    const report = metrics.report({ status, operators, stage, seed, label, ticks: tick, unsafe });
    if (stall) report.stall = stall;
    return { report, log, fingerprint: fingerprintRoom(room) };
  });
  result.report.wallSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
  return record ? result : { report: result.report, fingerprint: result.fingerprint };
}

/**
 * Odanin son halinin parmak izi: ayni karar dizisi ayni odayi uretmeli
 * (`validate.mjs` bunu bagimsiz bir yeniden oynatmayla karsilastiriyor).
 */
export function fingerprintRoom(room) {
  const round = (value) => Math.round(value * 1000) / 1000;
  const players = [...room.state.players.entries()].map(([id, player]) => [id, round(player.gold), round(player.goldSpent), round(player.experience), [...player.ownedCardIds].join(","), [...player.ownedShopItemIds].join(",")].join("|"));
  const towers = [...room.towers.values()].map((tower) => `${tower.id}:${tower.definition.id}:${tower.level}:${round(tower.x)},${round(tower.y)}:${round(tower.hp)}:${round(tower.ammo)}:${round(tower.energy)}:${round(tower.damageDealt)}`);
  const enemies = [...room.enemies.values()].map((enemy) => `${enemy.id}:${round(enemy.hp)}:${round(enemy.x)},${round(enemy.y)}`);
  const drones = [...room.drones.values()].map((drone) => `${drone.id}:${round(drone.x)},${round(drone.y)}:${round(drone.cargo ?? 0)}`);
  return [
    `result=${room.matchResult ?? ""} wave=${room.wave} hp=${round(room.teamHealth)} kills=${room.kills}`,
    `players=${players.join(";")}`,
    `towers=${towers.join(";")}`,
    `enemies=${enemies.join(";")}`,
    `drones=${drones.join(";")}`
  ].join("\n");
}

function createMetrics(room, playerIds, tickMs) {
  const realSeconds = (ticks) => ticks * tickMs / 1000;
  const waves = [];
  const towerSeen = new Map();
  const lost = [];
  let combatTicks = 0;
  let damageAtWaveStart = 0;
  let wallsBuilt = 0;
  const startGold = new Map(playerIds.map((id) => [id, room.state.players.get(id).gold]));
  const totalTowerDamage = () => {
    let sum = 0;
    for (const entry of room.runLedger.towerStats.values()) sum += entry.damage;
    return sum;
  };
  return {
    /** Yikilan (can 0) ya da satilmadan kaybolan yapi bir kez "kayip" sayiliyor. */
    scanTowers(sold) {
      for (const [id, seen] of towerSeen) {
        if (seen.lost) continue;
        const tower = room.towers.get(id);
        if (tower ? tower.hp <= 0 : !sold.has(id)) {
          seen.lost = true;
          lost.push({ definitionId: seen.definitionId, ownerId: seen.ownerId, wave: seen.wave, lostWave: room.wave });
        }
      }
    },
    afterTick() {
      if (!room.setupPhase && room.waveClearedAt === 0) combatTicks += 1;
      for (const tower of room.towers.values()) {
        if (towerSeen.has(tower.id)) continue;
        towerSeen.set(tower.id, { definitionId: tower.definition.id, ownerId: tower.ownerId, wave: room.wave });
        if (tower.definition.id === shared.WALL_TOWER_ID) wallsBuilt += 1;
      }
    },
    closeWave(wave, tick, final = false) {
      const record = room.runLedger.waves.at(-1);
      const damage = totalTowerDamage();
      const seconds = realSeconds(combatTicks);
      waves.push({
        wave,
        leaks: record?.w === wave ? record.l : 0,
        hpLost: record?.w === wave ? record.h ?? 0 : 0,
        kills: record?.w === wave ? record.k : 0,
        nexusHp: Math.max(0, room.teamHealth),
        towers: [...room.towers.values()].filter((tower) => shared.occupiesTowerSlot(tower.definition)).length,
        walls: [...room.towers.values()].filter((tower) => tower.definition.id === shared.WALL_TOWER_ID).length,
        damage: Math.round(damage - damageAtWaveStart),
        combatSeconds: +seconds.toFixed(2),
        dps: seconds > 0 ? +((damage - damageAtWaveStart) / seconds).toFixed(1) : 0,
        final
      });
      damageAtWaveStart = damage;
      combatTicks = 0;
      void tick;
    },
    report({ status, operators, stage, seed, label, ticks, unsafe }) {
      const victory = status === "victory";
      const reachedWave = victory ? shared.FINAL_WAVE : Math.max(0, (waves.at(-1)?.wave ?? room.wave) - (status === "defeat" || status === "stalled" ? 1 : 0));
      const damageByTower = {};
      for (const entry of room.runLedger.towerStats.values()) damageByTower[entry.definitionId] = Math.round((damageByTower[entry.definitionId] ?? 0) + entry.damage);
      const lastWaves = waves.filter((wave) => wave.combatSeconds > 0).slice(-3);
      const players = playerIds.map((id) => {
        const player = room.state.players.get(id);
        return {
          id,
          operator: player.characterId,
          goldEarned: Math.round(player.gold + player.goldSpent - startGold.get(id)),
          goldSpent: Math.round(player.goldSpent),
          goldUnspent: Math.round(player.gold),
          experience: Math.round(player.experience),
          cards: [...player.ownedCardIds],
          items: [...player.ownedShopItemIds],
          workersHired: player.hiredWorkers.length
        };
      });
      return {
        label,
        operators,
        stage,
        seed,
        status,
        result: victory ? "win" : "loss",
        waveReached: reachedWave,
        lastWave: waves.at(-1)?.wave ?? room.wave,
        nexusHp: Math.max(0, room.teamHealth),
        kills: room.kills,
        leaks: waves.reduce((sum, wave) => sum + wave.leaks, 0),
        leaksPerWave: waves.map((wave) => wave.leaks),
        dpsFinal: lastWaves.length ? +(lastWaves.reduce((sum, wave) => sum + wave.dps, 0) / lastWaves.length).toFixed(1) : 0,
        damageByTower,
        towersLost: lost.length,
        towersLostByType: lost.reduce((map, entry) => (map[entry.definitionId] = (map[entry.definitionId] ?? 0) + 1, map), {}),
        wallsBuilt,
        wallsEnd: [...room.towers.values()].filter((tower) => tower.definition.id === shared.WALL_TOWER_ID).length,
        towersEnd: [...room.towers.values()].filter((tower) => shared.occupiesTowerSlot(tower.definition)).map((tower) => `${tower.definition.id}:L${tower.level}`),
        players,
        waves,
        ticks,
        gameSeconds: +realSeconds(ticks).toFixed(1),
        unsafe: Object.keys(unsafe).filter((key) => unsafe[key])
      };
    }
  };
}
