/**
 * Bagimsiz yeniden oynatma: bot macinin mesaj gunlugunu ayni tohumla, ama
 * botsuz ve Colyseus'un tel yolundan gecirerek oynatir.
 *
 * Surucuden (`match.mjs`) farki:
 * - bot yok; yalnizca gunlukteki mesajlar, kaydedildikleri tick'te;
 * - mesajlar `onMessageHandlers`a dogrudan degil, istemcinin gonderdigi gibi
 *   msgpack ile kodlanip odanin `_onMessage`ina ham bayt olarak veriliyor
 *   (Colyseus'un soketten gelen mesaji isledigi yer);
 * - oda kurulumu ve lobi mesajlari da ayni yoldan.
 *
 * Sonuc surucunun sonucuyla birebir ayniysa: (1) botun oda durumunu mesaj
 * disinda hicbir yolla degistirmedigi, (2) karar dizisinin maci tamamen
 * belirledigi, (3) mesajlarin gercek istemci yolundan da ayni etkiyi
 * yaptigi kanitlanmis olur.
 */
import { MatchRoom } from "../../apps/server/dist/rooms/MatchRoom.js";
import * as shared from "../../packages/shared/dist/index.js";
import { getMessageBytes, Protocol } from "@colyseus/core";
import { withSeededWorld } from "./world.mjs";

function wireClient(sessionId) {
  return {
    sessionId,
    id: sessionId,
    state: 1,
    ref: { bufferedAmount: 0 },
    send() {},
    sendBytes() {},
    enqueueRaw() {},
    raw() {},
    leave() {},
    error() {}
  };
}

function encode(type, message) {
  return Buffer.from(getMessageBytes.raw(Protocol.ROOM_DATA, type, message ?? {}));
}

/**
 * @param {{operators: string[], stage: number, seed: number, mapScale?: number, tickMs: number, ticks: number, log: Array<{t:number,p:number,type:string,m:object}>}} input
 * @returns {{ result, wave, teamHealth, kills, waveRecords, room }}
 */
export function replayMatch({ operators, stage, seed, mapScale = 1, tickMs, ticks, log }) {
  return withSeededWorld(seed, (world) => {
    const room = new MatchRoom();
    room.setSimulationInterval = () => {};
    room.broadcast = () => {};
    const solo = operators.length === 1;
    const options = { stage, mapScale, wireDelta: shared.WIRE_DELTA_PROTOCOL ?? 2 };
    room.setupRoom({ ...options, autoStart: solo, characterId: operators[0], playerName: "Bot1" });
    const clients = operators.map((_, index) => wireClient(`p${index + 1}`));
    for (const [index, client] of clients.entries()) {
      room.clients.push(client);
      room.onJoin(client, { ...options, autoStart: solo, characterId: operators[index], playerName: `Bot${index + 1}` });
    }
    // Canli bot maciyla ayni: bedenin kuyrugu mesajin hemen ardindan bitiyor (match.mjs).
    const deliver = (client, type, message) => {
      room._onMessage(client, encode(type, message));
      room.settleOperatorBody?.(client.sessionId);
    };
    if (!solo) {
      for (const client of clients) deliver(client, "lobby:setReady", { ready: true });
      deliver(clients[0], "lobby:start", {});
    }
    room.lastSnapshotBroadcastAt = Number.POSITIVE_INFINITY;
    room.lastPerfBroadcastAt = Number.POSITIVE_INFINITY;
    let cursor = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      while (cursor < log.length && log[cursor].t === tick) {
        const entry = log[cursor];
        deliver(clients[entry.p], entry.type, entry.m);
        cursor += 1;
      }
      world.advance(tickMs);
      room.update(tickMs);
    }
    return {
      result: room.matchResult ?? "",
      wave: room.wave,
      teamHealth: room.teamHealth,
      kills: room.kills,
      leaksPerWave: room.runLedger.waves.map((record) => record.l),
      room
    };
  });
}
