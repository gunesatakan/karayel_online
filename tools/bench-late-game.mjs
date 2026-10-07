/**
 * Gec oyun sunucu olcumu: dort oyuncu, oyuncu basina ~20 kule, dalga 20.
 *
 * Gercek `MatchRoom` (derlenmis) suruluyor; `onCreate` cagrilmiyor (gercek
 * Colyseus saati kurardi), oda alanlari elle kuruluyor. Sahte istemciler
 * gonderilen her mesaji Colyseus'un kendi kodlayicisiyla (msgpack) kodlayip
 * bayt sayiyor, yani olculen bayt teldeki bayt.
 *
 * Kipler:
 *   node tools/bench-late-game.mjs                  sabit adim: tick suresi, bayt, mesaj
 *   node tools/bench-late-game.mjs --realtime       gercek zamanlayici: olay dongusu gecikmesi, ping gecikmesi
 *   node tools/bench-late-game.mjs --verify out.txt  belirlenimci parmak izi (tick basina durum + istemcinin gordugu)
 *
 * Secenekler: --wave N (20), --seconds N (75), --seed N, --scale N (harita
 * olcegi, 2), --burst N (dalga basinda N dusman birden), --breakdown (snapshot
 * bolum/alan baytlari), --slow (en yavas tickler).
 *
 * Sabit adim ve dogrulama kipinde `Date.now`, `performance.now` ve
 * `Math.random` sanal/tohumlu: ayni kod iki kez ayni maci oynar. Tick suresi
 * `process.hrtime` ile olculuyor.
 *
 * Once/sonra karsilastirmasi (`--baseline`): eski derleme `.bench-baseline/`
 * altinda bekleniyor. Kurmak icin (git durumunu degistirmez):
 *   git archive <ref> apps/server packages/shared tsconfig.base.json | tar -x -C .bench-baseline
 *   node node_modules/typescript/bin/tsc -p .bench-baseline/packages/shared
 *   node node_modules/typescript/bin/tsc -p .bench-baseline/apps/server
 * ve derlenen sunucudaki `"@karayel/shared"` iceri aktarimlari
 * `"../../../../packages/shared/dist/index.js"` yapilir (eski paylasilan kodu
 * okusun diye). Iki kosunun `--verify` ciktilari `cmp` ile birebir ayni olmali.
 *
 * Profil: node --cpu-prof --cpu-prof-dir=<dir> tools/bench-late-game.mjs
 * Once `npm run build:server` (dist okunuyor).
 */
process.env.NODE_ENV = "production";

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const REALTIME = flag("realtime");
const VERIFY_PATH = option("verify", undefined);
const WAVE = Number(option("wave", 20));
const MAX_GAME_SECONDS = Number(option("seconds", 75));
const SEED = Number(option("seed", 1337));
const TICK_MS = 1000 / 60;
const BUDGET_MS = 1000 / 60;

// --- Belirlenimcilik: sanal saat ve tohumlu rastgelelik -----------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const virtualClock = { now: 1_700_000_000_000 };
const realPerformanceNow = performance.now.bind(performance);
if (!REALTIME) {
  Math.random = mulberry32(SEED);
  Date.now = () => Math.floor(virtualClock.now);
  const perfOrigin = virtualClock.now;
  performance.now = () => virtualClock.now - perfOrigin;
}

const { getMessageBytes, Protocol } = await import("@colyseus/core");
const { unpack, Packr } = await import("@colyseus/msgpackr");
const breakdownPackr = new Packr({ useRecords: false });
// `--baseline`: once alinmis derleme kopyasi (A/B karsilastirmasi icin).
const BASELINE = flag("baseline");
const { MatchRoom } = await import(BASELINE ? "../.bench-baseline/apps/server/dist/rooms/MatchRoom.js" : "../apps/server/dist/rooms/MatchRoom.js");
const shared = await import(BASELINE ? "../.bench-baseline/packages/shared/dist/index.js" : "../packages/shared/dist/index.js");
const { cardCatalog, shopCatalog, isGlobalShopItem, canEquipShopItem, cardAppliesToTower, getMapGridSize, getMapOrigin } = shared;

// --- Sahte istemci --------------------------------------------------------------
function readType(bytes) {
  const header = bytes[1];
  if ((header & 0xe0) === 0xa0) return bytes.toString("utf8", 2, 2 + (header & 0x1f));
  if (header === 0xd9) return bytes.toString("utf8", 3, 3 + bytes[2]);
  return `#${header}`;
}

function payloadOffset(bytes) {
  const header = bytes[1];
  if ((header & 0xe0) === 0xa0) return 2 + (header & 0x1f);
  if (header === 0xd9) return 3 + bytes[2];
  return 2;
}

function createClient(sessionId, sink) {
  const client = {
    sessionId,
    id: sessionId,
    state: 1,
    ref: { bufferedAmount: 0 },
    userData: undefined,
    auth: undefined,
    send(type, message) {
      client.enqueueRaw(getMessageBytes.raw(Protocol.ROOM_DATA, type, message));
    },
    sendBytes(type, bytes) {
      client.enqueueRaw(getMessageBytes.raw(Protocol.ROOM_DATA_BYTES, type, undefined, bytes));
    },
    enqueueRaw(bytes) {
      sink(sessionId, bytes);
    },
    raw(bytes) {
      sink(sessionId, bytes);
    },
    leave() {},
    error() {}
  };
  return client;
}

// --- Istatistik -----------------------------------------------------------------
const stats = {
  bytesBySession: new Map(),
  bytesByType: new Map(),
  countByType: new Map(),
  snapshotBytes: []
};
let captureMessages = undefined;

function sink(sessionId, bytes) {
  const type = readType(bytes);
  stats.bytesBySession.set(sessionId, (stats.bytesBySession.get(sessionId) ?? 0) + bytes.length);
  stats.bytesByType.set(type, (stats.bytesByType.get(type) ?? 0) + bytes.length);
  stats.countByType.set(type, (stats.countByType.get(type) ?? 0) + 1);
  if (type === "snapshot" && sessionId === "p1") {
    stats.snapshotBytes.push(bytes.length);
    if (BREAKDOWN) recordBreakdown(unpack(bytes.subarray(payloadOffset(bytes))));
  }
  if (captureMessages && sessionId === "p1") {
    captureMessages.push({ type, payload: bytes.length > payloadOffset(bytes) ? unpack(bytes.subarray(payloadOffset(bytes))) : undefined });
  }
}

const BREAKDOWN = flag("breakdown");
const breakdown = { sections: new Map(), towerFields: new Map(), enemyFields: new Map(), playerFields: new Map(), frames: 0 };
const packForBreakdown = (value) => breakdownPackr.pack(value);
function recordBreakdown(snapshot) {
  breakdown.frames += 1;
  for (const [key, value] of Object.entries(snapshot)) {
    breakdown.sections.set(key, (breakdown.sections.get(key) ?? 0) + packForBreakdown(value).length + key.length + 1);
  }
  const fields = (records, store) => {
    for (const record of records ?? []) {
      for (const [key, value] of Object.entries(record)) {
        store.set(key, (store.get(key) ?? 0) + packForBreakdown(value).length + key.length + 1);
      }
    }
  };
  fields(snapshot.towers, breakdown.towerFields);
  fields(snapshot.enemies, breakdown.enemyFields);
  fields(snapshot.players, breakdown.playerFields);
}

function printBreakdown() {
  const print = (title, store) => {
    console.log(`${title} (kare basina bayt):`);
    for (const [key, total] of [...store.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
      console.log(`  ${key.padEnd(26)} ${(total / breakdown.frames).toFixed(0).padStart(7)}`);
    }
  };
  print("bolumler", breakdown.sections);
  print("kule alanlari", breakdown.towerFields);
  print("dusman alanlari", breakdown.enemyFields);
  print("oyuncu alanlari", breakdown.playerFields);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

// --- Oda kurulumu -----------------------------------------------------------------
const ROSTER = [
  {
    sessionId: "p1",
    characterId: "warrior",
    towers: [
      ["warrior-5", 10], ["warrior-5", 10], ["warrior-5", 10], ["warrior-5", 8],
      ["warrior-1", 8], ["warrior-1", 8], ["warrior-1", 7], ["warrior-1", 6], ["warrior-1", 6],
      ["warrior-4", 7], ["warrior-4", 7], ["warrior-4", 6],
      ["warrior-6", 7], ["warrior-6", 6], ["warrior-6", 5],
      ["warrior-3", 6], ["warrior-3", 5],
      ["warrior-2", 5], ["warrior-7", 4], ["warrior-8", 4]
    ]
  },
  {
    sessionId: "p2",
    characterId: "zeynep",
    towers: [
      ["zeynep-1", 8], ["zeynep-1", 8], ["zeynep-1", 7], ["zeynep-1", 7], ["zeynep-1", 7], ["zeynep-1", 6],
      ["zeynep-2", 8], ["zeynep-2", 7], ["zeynep-2", 6],
      ["zeynep-3", 7], ["zeynep-3", 6], ["zeynep-3", 6],
      ["zeynep-6", 6], ["zeynep-6", 6], ["zeynep-6", 5],
      ["zeynep-7", 5], ["zeynep-8", 5], ["zeynep-8", 5],
      ["zeynep-9", 4], ["zeynep-10", 4]
    ]
  },
  {
    sessionId: "p3",
    characterId: "archer",
    towers: [
      ["archer-1", 8], ["archer-1", 8], ["archer-1", 7], ["archer-1", 6],
      ["archer-2", 8], ["archer-2", 7], ["archer-2", 6],
      ["archer-3", 7], ["archer-3", 6], ["archer-3", 6],
      ["archer-4", 7], ["archer-4", 6],
      ["archer-5", 7], ["archer-5", 6], ["archer-5", 6],
      ["archer-6", 7], ["archer-6", 6], ["archer-6", 5],
      ["archer-7", 4], ["archer-8", 4]
    ]
  },
  {
    sessionId: "p4",
    characterId: "onur",
    towers: [
      ["onur-1", 8], ["onur-1", 8], ["onur-1", 7], ["onur-1", 7], ["onur-1", 6], ["onur-1", 6], ["onur-1", 6],
      ["onur-2", 8], ["onur-2", 8], ["onur-2", 7], ["onur-2", 7], ["onur-2", 6], ["onur-2", 6],
      ["onur-1", 5], ["onur-2", 5], ["onur-1", 5], ["onur-2", 5], ["onur-1", 4], ["onur-2", 4], ["onur-1", 4]
    ]
  }
];

function setupRoom() {
  const room = new MatchRoom();
  room.state = { players: new Map() };
  room.broadcastPatch = () => false;
  room.mapScale = Number(option("scale", 2));
  const clients = ROSTER.map((entry) => createClient(entry.sessionId, sink));
  room.clients = clients;

  for (const [index, entry] of ROSTER.entries()) {
    // Guncel istemci gibi tel surumunu bildiriyor; bildirmeyen eski istemci
    // sayilip oyuncu/isci kayitlarini tam alirdi (olcum eski teli olcerdi).
    // Taban surum secenegi tanimiyor, yok sayiyor.
    room.onJoin(clients[index], { characterId: entry.characterId, playerName: `Bench${index + 1}`, wireDelta: shared.WIRE_DELTA_PROTOCOL ?? 2 });
  }
  for (const player of room.state.players.values()) player.ready = true;
  room.startLobbyMatch(clients[0]);

  const rng = mulberry32(SEED ^ 0x5eed);
  const pick = (list) => list[Math.floor(rng() * list.length)];

  // Kuleler: koridorlar birakilarak (col % 3 === 1 bos) haritanin ortasina.
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const { cols, rows } = room.activeMap;
  const cells = [];
  const middleRow = Math.floor(rows / 2);
  for (let row = 3; row < rows - 3; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (col % 3 === 1) continue;
      cells.push({ col, row, order: Math.abs(row - middleRow) * 100 + Math.abs(col - cols / 2) });
    }
  }
  cells.sort((a, b) => a.order - b.order);

  const queue = [];
  for (let slot = 0; slot < 20; slot += 1) {
    for (const [index, entry] of ROSTER.entries()) {
      if (entry.towers[slot]) queue.push({ client: clients[index], definitionId: entry.towers[slot][0], level: entry.towers[slot][1] });
    }
  }
  for (const item of queue) {
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const x = origin.x + cell.col * gridSize + gridSize / 2;
      const y = origin.y + cell.row * gridSize + gridSize / 2;
      if (!room.canPlaceTower(x, y, item.definitionId, "horizontal")) continue;
      const before = room.towers.size;
      room.placeTower(item.client, { x, y, definitionId: item.definitionId }, { free: true, ignoreLimit: true });
      if (room.towers.size > before) {
        const tower = [...room.towers.values()].at(-1);
        tower.level = item.level;
        cells.splice(index, 1);
        break;
      }
    }
  }

  // Kartlar ve esyalar: tohumlu secim, gec oyunda bir oyuncunun elindeki kadar.
  for (const [index, entry] of ROSTER.entries()) {
    const player = room.state.players.get(entry.sessionId);
    const ownTowers = [...room.towers.values()].filter((tower) => tower.ownerId === entry.sessionId);
    const definitions = ownTowers.map((tower) => tower.definition);
    const playerCards = cardCatalog.filter((card) => card.scope.kind === "global"
      || (card.scope.kind === "tagged" && definitions.some((definition) => cardAppliesToTower(card, definition))));
    for (let count = 0; count < 16; count += 1) {
      const card = pick(playerCards);
      if (!player.ownedCardIds.includes(card.id) || card.stackable) player.ownedCardIds.push(card.id);
    }
    const targetedCards = cardCatalog.filter((card) => card.scope.kind === "targeted");
    for (let count = 0; count < 3; count += 1) {
      const card = pick(targetedCards);
      const tower = ownTowers.find((candidate) => cardAppliesToTower(card, candidate.definition) && !candidate.targetedCardIds.includes(card.id));
      if (!tower) continue;
      tower.targetedCardIds.push(card.id);
      player.ownedCardIds.push(card.id);
    }
    const globalItems = shopCatalog.filter((item) => isGlobalShopItem(item));
    for (let count = 0; count < 4; count += 1) {
      const item = pick(globalItems);
      if (!player.ownedShopItemIds.includes(item.id)) player.ownedShopItemIds.push(item.id);
    }
    const towerItems = shopCatalog.filter((item) => !isGlobalShopItem(item));
    for (const tower of ownTowers) {
      if (tower.definition.resourceProvider) continue;
      for (let count = 0; count < 4; count += 1) {
        const item = pick(towerItems);
        if (canEquipShopItem(item, tower.definition, tower.equippedShopItemIds).ok) {
          tower.equippedShopItemIds.push(item.id);
          player.ownedShopItemIds.push(item.id);
        }
      }
    }
    room.rebuildCreativeLoadout(entry.sessionId);
    player.gold = 4000;
    player.ultimatePower = 3;
    void index;
  }

  for (const tower of room.towers.values()) {
    tower.ammo = tower.maxAmmo;
    tower.energy = tower.maxEnergy;
  }

  // Dalga: kurulum evresinden herkes "hazir" diyerek cikiyor.
  room.teamHealth = 1e9;
  room.wave = WAVE;
  room.waveSpawned = 0;
  room.planWaveSpawns(WAVE);
  room.waveClearedAt = 0;
  for (const client of clients) room.markSetupReady(client);
  // `--burst N`: dalga basinda N dusman birden (yaratici modun patlamasiyla ayni yol).
  const burst = Number(option("burst", 0));
  if (burst > 0) {
    room.waveTarget = Math.max(room.waveTarget, room.waveSpawned + burst);
    for (let index = 0; index < burst; index += 1) room.spawnNextWaveEnemy();
  }
  return { room, clients };
}

// --- Parmak izi ---------------------------------------------------------------------
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function simulationFingerprint(room) {
  let hp = 0;
  let shield = 0;
  let x = 0;
  for (const enemy of room.enemies.values()) {
    hp += enemy.hp;
    shield += enemy.shield;
    x += enemy.x + enemy.y;
  }
  const gold = [...room.state.players.values()].map((player) => round6(player.gold)).join(",");
  const exp = [...room.state.players.values()].map((player) => round6(player.experience)).join(",");
  let towerState = 0;
  for (const tower of room.towers.values()) towerState += tower.temperature + tower.ammo + tower.energy + tower.hp + tower.damageDealt;
  return `${room.enemies.size}|${round6(hp)}|${round6(shield)}|${round6(x)}|${room.kills}|${gold}|${exp}|${round6(towerState)}|${room.projectiles.size}|${room.beams.size}|${room.waveSpawned}`;
}

/** Istemcinin (p1) gordugu dunya: deltalar birlestirilip tam kayda donuyor. */
function createClientMirror() {
  const towers = new Map();
  const enemies = new Map();
  const players = new Map();
  const drones = new Map();
  const merge = (store, records = []) => {
    const alive = new Set();
    for (const record of records) {
      alive.add(record.id);
      const previous = store.get(record.id);
      const next = previous ? { ...previous } : {};
      for (const [key, value] of Object.entries(record)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      store.set(record.id, next);
    }
    for (const id of [...store.keys()]) if (!alive.has(id)) store.delete(id);
    return [...store.values()];
  };
  return {
    apply(message) {
      if (message.type === "snapshot") {
        const { wireFull, ...snapshot } = message.payload;
        if (wireFull) for (const store of [towers, enemies, players, drones]) store.clear();
        const view = {
          ...snapshot,
          serverTime: 0,
          // `insight` arayuz metni: tazelenme evresi bilerek kaydiriliyor (oyuna
          // etkisi yok), o yuzden karsilastirmaya girmiyor. Gerisi birebir.
          towers: merge(towers, snapshot.towers).map(({ insight, ...rest }) => rest),
          enemies: merge(enemies, snapshot.enemies),
          players: merge(players, snapshot.players),
          drones: merge(drones, snapshot.drones)
        };
        return createHash("sha1").update(JSON.stringify(view)).digest("hex").slice(0, 16);
      }
      return createHash("sha1").update(`${message.type}:${JSON.stringify(message.payload ?? null)}`).digest("hex").slice(0, 16);
    }
  };
}

// --- Kosu ---------------------------------------------------------------------------
function runFixed() {
  const { room } = setupRoom();
  for (const key of stats.bytesBySession.keys()) stats.bytesBySession.set(key, 0);
  stats.bytesByType.clear();
  stats.countByType.clear();
  stats.snapshotBytes.length = 0;

  const verify = Boolean(VERIFY_PATH);
  const mirror = verify ? createClientMirror() : undefined;
  const fingerprints = [];
  const tickTimes = [];
  const slowTicks = [];
  const activeTickTimes = [];
  let maxEnemies = 0;
  let maxProjectiles = 0;
  let maxBeams = 0;
  const totalTicks = Math.round(MAX_GAME_SECONDS * 60);
  let ticks = 0;
  let clearedAtTick = -1;
  for (; ticks < totalTicks; ticks += 1) {
    virtualClock.now += TICK_MS;
    if (verify) captureMessages = [];
    const start = process.hrtime.bigint();
    room.update(TICK_MS);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    tickTimes.push(elapsed);
    slowTicks.push([elapsed, ticks]);
    if (room.enemies.size > 0 || room.waveSpawned < room.waveTarget) activeTickTimes.push(elapsed);
    maxEnemies = Math.max(maxEnemies, room.enemies.size);
    maxProjectiles = Math.max(maxProjectiles, room.projectiles.size);
    maxBeams = Math.max(maxBeams, room.beams.size);
    if (verify) {
      const clientView = captureMessages.map((message) => mirror.apply(message)).join(",");
      fingerprints.push(`${ticks}:${simulationFingerprint(room)}#${clientView}`);
      captureMessages = undefined;
    }
    if (clearedAtTick < 0 && room.waveSpawned >= room.waveTarget && room.enemies.size === 0) {
      clearedAtTick = ticks;
      // Temizlendikten sonra bir saniye daha: dalga sonu islemleri de olculsun.
    }
    if (clearedAtTick >= 0 && ticks - clearedAtTick > 60) break;
    if (room.matchResult) break;
  }

  if (verify) {
    writeFileSync(VERIFY_PATH, `${fingerprints.join("\n")}\n`);
    console.log(`verify: ${fingerprints.length} tick yazildi -> ${VERIFY_PATH}`);
    console.log(`son: ${fingerprints.at(-1)?.split("#")[0]}`);
    return;
  }

  const gameSeconds = ticks / 60;
  const sorted = [...activeTickTimes].sort((a, b) => a - b);
  const mean = activeTickTimes.reduce((total, value) => total + value, 0) / Math.max(1, activeTickTimes.length);
  const over = activeTickTimes.filter((value) => value > BUDGET_MS).length;
  const snapshotsSorted = [...stats.snapshotBytes].sort((a, b) => a - b);
  console.log(`== Gec oyun olcumu: dalga ${WAVE}, ${room.towers.size} kule, 4 oyuncu, harita olcegi ${room.mapScale} ==`);
  console.log(`tick: ${ticks} (${gameSeconds.toFixed(1)} sn), dalga temizlendi: ${clearedAtTick >= 0 ? (clearedAtTick / 60).toFixed(1) + " sn" : "hayir"}, oldurme ${room.kills}`);
  console.log(`zirve: dusman ${maxEnemies}, mermi ${maxProjectiles}, isin ${maxBeams}`);
  console.log(`aktif tick suresi (ms): ort ${mean.toFixed(2)}  p50 ${percentile(sorted, 0.5).toFixed(2)}  p95 ${percentile(sorted, 0.95).toFixed(2)}  p99 ${percentile(sorted, 0.99).toFixed(2)}  max ${sorted.at(-1)?.toFixed(2)}  butce asan ${over}/${activeTickTimes.length} (${(100 * over / Math.max(1, activeTickTimes.length)).toFixed(1)}%)`);
  const cpuShare = activeTickTimes.reduce((total, value) => total + value, 0) / (activeTickTimes.length * TICK_MS);
  console.log(`aktif dalgada CPU payi (tick/butce): ${(cpuShare * 100).toFixed(0)}%`);
  // Rastgele anda gelen bir ping, suren tick bitene kadar bekler: ortalama
  // bekleme sum(t^2) / (2 * toplam sure). Tick butceyi asarsa Colyseus saati
  // geride kalir ve bekleme birikir; o durum burada ayrica sayiliyor (butce asan).
  const squareSum = activeTickTimes.reduce((total, value) => total + value * value, 0);
  const wall = activeTickTimes.reduce((total, value) => total + Math.max(value, TICK_MS), 0);
  console.log(`tick'in pinge ekledigi bekleme (ms): ort ${(squareSum / (2 * wall)).toFixed(2)}, en kotu ${sorted.at(-1)?.toFixed(1)}`);
  console.log(`snapshot (p1): ${stats.snapshotBytes.length} adet, ort ${(stats.snapshotBytes.reduce((a, b) => a + b, 0) / Math.max(1, stats.snapshotBytes.length) / 1024).toFixed(1)} KB, p95 ${(percentile(snapshotsSorted, 0.95) / 1024).toFixed(1)} KB, max ${((snapshotsSorted.at(-1) ?? 0) / 1024).toFixed(1)} KB`);
  for (const [sessionId, bytes] of stats.bytesBySession) {
    console.log(`  ${sessionId}: ${(bytes / gameSeconds / 1024).toFixed(1)} KB/s toplam giden`);
  }
  console.log("mesaj tipleri (oda geneli, saniyede adet / KB):");
  const rows = [...stats.countByType.entries()].sort((a, b) => (stats.bytesByType.get(b[0]) ?? 0) - (stats.bytesByType.get(a[0]) ?? 0));
  for (const [type, count] of rows) {
    console.log(`  ${type.padEnd(24)} ${(count / gameSeconds).toFixed(1).padStart(8)} /s  ${((stats.bytesByType.get(type) ?? 0) / gameSeconds / 1024).toFixed(1).padStart(8)} KB/s`);
  }
  if (BREAKDOWN) printBreakdown();
  if (flag("slow")) console.log("en yavas tickler (ms@tick, tick%60):", slowTicks.sort((a, b) => b[0] - a[0]).slice(0, 15).map(([ms, tick]) => `${ms.toFixed(1)}@${tick}(${tick % 60})`).join(" "));
  if (flag("json")) {
    console.log(JSON.stringify({ mean, p95: percentile(sorted, 0.95), max: sorted.at(-1), over, active: activeTickTimes.length }));
  }
}

async function runRealtime() {
  const { room } = setupRoom();
  const seconds = Number(option("realtime-seconds", 30));
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  histogram.enable();
  const tickTimes = [];
  const pingDelays = [];
  let last = realPerformanceNow();
  const interval = setInterval(() => {
    const now = realPerformanceNow();
    const delta = now - last;
    last = now;
    const start = realPerformanceNow();
    room.update(delta);
    tickTimes.push(realPerformanceNow() - start);
  }, TICK_MS);
  // Ping vekili: soket mesaji gibi bir G/C geri cagrisi her 100 ms'de bir
  // kuyruga giriyor; ne kadar sonra islendigi, sunucunun pong'u ne kadar
  // gecikmeyle yazacaginin alt siniri.
  const pingTimer = setInterval(() => {
    const queuedAt = realPerformanceNow();
    setImmediate(() => pingDelays.push(realPerformanceNow() - queuedAt));
  }, 100);
  const started = realPerformanceNow();
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const cleared = room.waveSpawned >= room.waveTarget && room.enemies.size === 0;
      if (realPerformanceNow() - started > seconds * 1000 || cleared || room.matchResult) {
        clearInterval(check);
        resolve();
      }
    }, 250);
  });
  clearInterval(interval);
  clearInterval(pingTimer);
  histogram.disable();
  const elapsedSeconds = (realPerformanceNow() - started) / 1000;
  const sortedTicks = [...tickTimes].sort((a, b) => a - b);
  const sortedPings = [...pingDelays].sort((a, b) => a - b);
  console.log(`== Gercek zamanli: ${elapsedSeconds.toFixed(1)} sn, ${tickTimes.length} tick (${(tickTimes.length / elapsedSeconds).toFixed(1)} Hz, hedef 60) ==`);
  if (process.platform === "win32") console.log("not: Windows zamanlayici cozunurlugu (~15.6 ms) setInterval(16.7)yi ~30 ms'ye yuvarlar; Hz ve olay dongusu gecikmesi burada tick yukunu degil zamanlayiciyi olcer. Linux'ta (Fly) anlamli.");
  console.log(`tick (ms): ort ${(tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length).toFixed(2)}  p95 ${percentile(sortedTicks, 0.95).toFixed(2)}  max ${sortedTicks.at(-1)?.toFixed(2)}`);
  console.log(`olay dongusu gecikmesi (ms): ort ${(histogram.mean / 1e6).toFixed(2)}  p50 ${(histogram.percentile(50) / 1e6).toFixed(2)}  p99 ${(histogram.percentile(99) / 1e6).toFixed(2)}  max ${(histogram.max / 1e6).toFixed(2)}`);
  console.log(`ping vekili (G/C kuyruk bekleme, ms): ort ${(pingDelays.reduce((a, b) => a + b, 0) / pingDelays.length).toFixed(2)}  p95 ${percentile(sortedPings, 0.95).toFixed(2)}  max ${sortedPings.at(-1)?.toFixed(2)}`);
  console.log(`oldurme ${room.kills}, kalan dusman ${room.enemies.size}`);
}

if (REALTIME) {
  await runRealtime();
} else {
  runFixed();
}
