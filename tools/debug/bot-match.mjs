/**
 * Uretim yolundan bot maci: kaydedicinin ve yeniden oynatmanin sinavi.
 *
 * Simulatorun surucusunden (`tools/sim/match.mjs`) farki:
 * - oda uretimdeki gibi tohumlu kipte (`SeededRoomRuntime`) ve gercek
 *   kaydediciyle (`MatchRecorder`) kuruluyor; `onCreate` -> `onJoin`;
 * - bot mesajlari Colyseus'un tel yolundan (msgpack -> `_onMessage`); beden
 *   kisayolu (`settleOperatorBody`) yok, beden gercek oyundaki gibi ucuyor;
 * - tick suresi titresimli (Colyseus'un gercek araligi gibi 16-17,5 ms);
 * - saat sanal (bot maci saniyeler icinde bitsin); kaynak enjekte ediliyor,
 *   oda kodu ayni.
 *
 * Kayit `store` dizinine duser; `replay-lib.mjs` onu bagimsiz oynatir.
 */
import { getMessageBytes, Protocol } from "@colyseus/core";
import { MatchRoom } from "../../apps/server/dist/rooms/MatchRoom.js";
import { SeededRoomRuntime } from "../../apps/server/dist/debug/room-runtime.js";
import { installDebugRecorder } from "../../apps/server/dist/debug/index.js";
import * as shared from "../../packages/shared/dist/index.js";
import { createBot, resolvePolicyOptions } from "../sim/policies.mjs";
import { mulberry32, deriveSeed } from "../sim/world.mjs";

export const BOT_EPOCH_MS = 1_800_000_000_000;

function botClient(sessionId, inbox) {
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
 * @param {object} options
 * @param {string[]} options.operators
 * @param {number} [options.stage]
 * @param {number} [options.seed]  oda tohumu ve bot zari
 * @param {number} [options.maxWaves]
 * @param {number} [options.maxTicks]
 * @param {string} options.dir  kayit dizini
 * @param {boolean} [options.reconnect]  ortada bir kopma + yeniden baglanma
 */
export async function runRecordedBotMatch({ operators, stage = 1, seed = 1, maxWaves = 2, maxTicks = 60 * 60 * 30, dir, policy = "standard", reconnect = false, flood = false, roomId }) {
  const install = installDebugRecorder(undefined, { env: { DEBUG_RECORDER_DIR: dir }, autoStart: false, log: () => {} });
  const world = { now: BOT_EPOCH_MS };
  const clock = { tick: () => Math.floor(world.now), scope: () => Math.floor(world.now) };
  MatchRoom.createRuntime = () => new SeededRoomRuntime(deriveSeed(seed, 7) >>> 0, BOT_EPOCH_MS, clock);
  const previousLimit = MatchRoom.maxConcurrentRooms;
  MatchRoom.maxConcurrentRooms = Number.MAX_SAFE_INTEGER;
  const jitter = mulberry32(deriveSeed(seed, 99));
  const room = new MatchRoom();
  room.roomId = roomId ?? `bot${seed}x${operators.join("")}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  room.setSimulationInterval = () => {};
  room.disconnect = () => Promise.resolve();
  const reconnections = new Map();
  room.allowReconnection = (client) => {
    let resolve;
    let reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    promise.catch(() => {});
    const deferred = { promise, resolve, reject, then: (a, b) => promise.then(a, b), catch: (b) => promise.catch(b) };
    reconnections.set(client.sessionId, deferred);
    return deferred;
  };
  const solo = operators.length === 1;
  const baseOptions = { stage, mapScale: 1, wireDelta: shared.WIRE_DELTA_PROTOCOL ?? 2 };
  const ownerSecret = "bot-owner-secret-0123456789abcdef";
  try {
    await room.onCreate({ ...baseOptions, autoStart: solo, characterId: operators[0], playerName: "Bot1", ownerSecret });
    const inboxes = operators.map(() => new Map());
    const clients = operators.map((_, index) => botClient(`s${seed}p${index + 1}`, inboxes[index]));
    for (const [index, client] of clients.entries()) {
      room.clients.push(client);
      room.onJoin(client, { ...baseOptions, autoStart: solo, characterId: operators[index], playerName: `Bot${index + 1}`, ownerSecret });
    }
    const wire = (client, type, message) => room._onMessage(client, Buffer.from(getMessageBytes.raw(Protocol.ROOM_DATA, type, message ?? {})));
    if (!solo) {
      for (const client of clients) wire(client, "lobby:setReady", { ready: true });
      wire(clients[0], "lobby:start", {});
    }
    let tick = 0;
    const policies = clients.map((client, index) => createBot({
      room,
      shared,
      client,
      playerId: client.sessionId,
      playerIndex: index,
      operator: operators[index],
      stage,
      send: (type, message = {}) => wire(client, type, message),
      inbox: inboxes[index],
      rng: mulberry32(deriveSeed(seed, 100 + index)),
      get tick() { return tick; }
    }, resolvePolicyOptions(policy, {})));
    let disconnectedAt = -1;
    while (tick < maxTicks) {
      // Kopma ve donus: ilk dalganin ortasinda (yeniden oynatma bunu da tasimali).
      if (reconnect && disconnectedAt < 0 && room.wave >= 1 && !room.setupPhase && tick > 600) {
        disconnectedAt = tick;
        const client = clients[0];
        room.clients.splice(room.clients.indexOf(client), 1);
        void room.onLeave(client, false);
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (reconnect && disconnectedAt >= 0 && tick === disconnectedAt + 90) {
        const fresh = botClient(clients[0].sessionId, inboxes[0]);
        room.clients.push(fresh);
        clients[0] = fresh;
        reconnections.get(fresh.sessionId)?.resolve(fresh);
        await new Promise((resolve) => setImmediate(resolve));
      }
      // Mesaj seli: kovanin reddettikleri kayda girmemeli, yeniden oynatma yine tutmali.
      if (flood && tick % 120 === 7) {
        for (let index = 0; index < 60; index += 1) {
          wire(clients[clients.length - 1], "latency:ping", { sentAt: tick });
          wire(clients[clients.length - 1], "card:sync", {});
        }
      }
      const offline = reconnect && disconnectedAt >= 0 && tick < disconnectedAt + 90;
      for (const [index, policy] of policies.entries()) if (!(offline && index === 0)) policy.act();
      const dt = 1000 / 60 + (jitter() - 0.5) * 1.6;
      world.now += dt;
      room.update(dt);
      tick += 1;
      if (room.matchResult) break;
      if (room.wave > maxWaves) break;
    }
    const fingerprint = room.getDebugFingerprint();
    const recorderId = [...install.active.keys()][0];
    for (const client of [...room.clients]) {
      room.clients.splice(room.clients.indexOf(client), 1);
      await room.onLeave(client, true);
    }
    room.onDispose();
    await install.store.drain();
    const summary = install.store.get(recorderId);
    return { room, ticks: tick, id: recorderId, path: install.store.dataPath(recorderId), summary, fingerprint, store: install.store };
  } finally {
    install.stop();
    MatchRoom.maxConcurrentRooms = previousLimit;
    MatchRoom.rooms.delete(room.roomId);
    MatchRoom.publicRooms.delete(room.roomId);
  }
}
