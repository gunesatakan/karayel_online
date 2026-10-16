/**
 * Uretim kaydinin yeniden oynatilmasi (`apps/server/src/debug/recorder.ts`).
 *
 * Kayit: tohum, kurulum secenekleri, katilim/ayrilma/yeniden baglanma, her
 * mesaj (tick'i ve saatiyle), her tick'in suresi (mikrosaniye) ve saati,
 * bes saniyede bir durum parmak izi. Burada ayni `MatchRoom` tohumlu kipte
 * (`SeededRoomRuntime`) kuruluyor; saat kayittan, mesajlar Colyseus'un tel
 * yolundan (msgpack baytlari -> `_onMessage`), tick'ler kayittaki surelerle.
 * Parmak izleri ayni tick'te karsilastiriliyor: ayni iz = birebir ayni mac.
 *
 * Simulatorun yeniden oynatmasindan (`tools/sim/replay.mjs`) farki: o kendi
 * bot gunlugunu canli kipte, sanal dunyada oynatiyor; bu uretimde kaydedilen
 * maci, uretimin kendi saat/zar kaynagiyla oynatiyor.
 */
import { readFileSync } from "node:fs";
import { getMessageBytes, Protocol } from "@colyseus/core";
import { MatchRoom } from "../../apps/server/dist/rooms/MatchRoom.js";
import { SeededRoomRuntime } from "../../apps/server/dist/debug/room-runtime.js";
import { fingerprintHash } from "../../apps/server/dist/debug/recorder.js";
import { parseRecordingBuffer } from "../../apps/server/dist/debug/reader.js";

export { fingerprintHash };

/** Dosya -> satirlar -> oynatilabilir kayit. */
export function loadRecordingFile(path) {
  return assembleRecording(parseRecordingBuffer(readFileSync(path)));
}

export function assembleRecording(lines) {
  const header = lines.find((line) => line.k === "hdr");
  if (!header) throw new Error("recording has no header");
  const events = [];
  const fingerprints = new Map();
  let finalFingerprint;
  const dt = [];
  const clock = [];
  let clockAt = header.createdAt;
  let end;
  let truncated;
  for (const line of lines) {
    if (line.k === "ev") events.push(line);
    else if (line.k === "fp") {
      if (line.fin) finalFingerprint = line;
      else fingerprints.set(line.t, line);
    }
    else if (line.k === "tk") {
      if (line.t0 !== dt.length) throw new Error(`tick tape gap at ${dt.length} (line starts at ${line.t0})`);
      for (let index = 0; index < line.dt.length; index += 1) {
        dt.push(line.dt[index]);
        clockAt += line.c[index];
        clock.push(clockAt);
      }
    } else if (line.k === "end") end = line;
    else if (line.k === "trunc") truncated = line;
  }
  return { header, events, fingerprints, finalFingerprint, dt, clock, end, truncated, lines };
}

class Deferred {
  constructor() {
    this.settled = false;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (value) => { this.settled = true; resolve(value); };
      this.reject = (error) => { this.settled = true; reject(error); };
    });
    // Colyseus'un Deferred'i gibi: `then`/`catch` dogrudan.
    this.promise.catch(() => {});
  }
  then(onFulfilled, onRejected) { return this.promise.then(onFulfilled, onRejected); }
  catch(onRejected) { return this.promise.catch(onRejected); }
}

function fakeClient(sessionId, inbox) {
  return {
    sessionId,
    id: sessionId,
    state: 1,
    ref: { bufferedAmount: 0 },
    userData: undefined,
    auth: undefined,
    send(type) { if (inbox) inbox.set(type, (inbox.get(type) ?? 0) + 1); },
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

const turn = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Kaydi oynatir.
 *
 * @param {ReturnType<typeof assembleRecording>} recording
 * @param {object} [options]
 * @param {(room, tick) => void} [options.beforeTick]  tick'ten once (profil penceresi)
 * @param {(room, tick, ms) => void} [options.afterTick]
 * @param {object} [options.profiler]  odanin kaydedici kancalari (`MatchRecorderHooks`): bolum sureleri
 * @param {boolean} [options.stopOnDivergence]
 * @returns {Promise<{ room, ticks, checked, mismatches: Array<{t, expected, actual}>, firstMismatch?, wallMs }>}
 */
export async function replayRecording(recording, options = {}) {
  const { header, events, fingerprints, finalFingerprint, dt, clock } = recording;
  const consumed = new Set();
  let cursor = 0;
  let pending;
  let lastNow = header.createdAt;
  let tickClock = header.createdAt;
  const scopeEvent = { msg: "msg", join: "join", leave: "leave", rc: "rc" };
  const source = {
    tick: () => (lastNow = tickClock),
    scope(kind, sessionId) {
      if (pending && pending.e === scopeEvent[kind] && pending.s === sessionId) {
        const at = pending.c;
        pending = undefined;
        return (lastNow = at);
      }
      // Ana dongunun vermedigi bir giris noktasi: yeniden baglanma bekleyisinin
      // devami (ornegin yuvayi yeni oturum devraldi). Kayittaki sirasi hemen
      // sonra; ileriye bakip o olayi tuketiyoruz.
      const want = scopeEvent[kind];
      for (let index = cursor; index < events.length; index += 1) {
        const event = events[index];
        if (consumed.has(index) || event.e !== want || event.s !== sessionId) continue;
        consumed.add(index);
        return (lastNow = event.c);
      }
      return lastNow;
    }
  };
  const runtime = new SeededRoomRuntime(header.seed, header.createdAt, source);
  runtime.setReplaySeats(0);

  const previousRuntime = MatchRoom.createRuntime;
  const previousRecorder = MatchRoom.createRecorder;
  const previousLimit = MatchRoom.maxConcurrentRooms;
  MatchRoom.createRuntime = () => runtime;
  MatchRoom.createRecorder = options.profiler ? () => options.profiler : undefined;
  MatchRoom.maxConcurrentRooms = Number.MAX_SAFE_INTEGER;
  const room = new MatchRoom();
  const startedAt = performance.now();
  const clients = new Map();
  const reconnections = new Map();
  const mismatches = [];
  let checked = 0;
  try {
    room.roomId = header.roomId;
    room.setSimulationInterval = () => {};
    room.disconnect = () => Promise.resolve();
    room.allowReconnection = (client) => {
      const deferred = new Deferred();
      reconnections.set(client.sessionId, deferred);
      return deferred;
    };
    await room.onCreate(header.options ?? {});

    const apply = async (index) => {
      const event = events[index];
      if (consumed.has(index)) return;
      consumed.add(index);
      switch (event.e) {
        case "join": {
          // Uretimde reddedilen giris odaya dokunmadi; ardindan gelen ayrilma kayitta.
          if (event.rejected) break;
          const client = fakeClient(event.s);
          clients.set(event.s, client);
          room.clients.push(client);
          pending = event;
          try {
            room.onJoin(client, event.o ?? {});
          } catch {
            // Uretimde de reddedildi; Colyseus'un ardindan cagirdigi ayrilma kayitta.
          }
          pending = undefined;
          await turn();
          break;
        }
        case "leave": {
          const client = clients.get(event.s) ?? fakeClient(event.s);
          const at = room.clients.indexOf(client);
          if (at >= 0) room.clients.splice(at, 1);
          pending = event;
          void Promise.resolve(room.onLeave(client, Boolean(event.ok))).catch(() => {});
          pending = undefined;
          await turn();
          break;
        }
        case "rc": {
          const deferred = reconnections.get(event.s);
          pending = event;
          if (event.ok) {
            const client = fakeClient(event.s);
            clients.set(event.s, client);
            room.clients.push(client);
            deferred?.resolve(client);
          } else if (deferred && !deferred.settled) {
            deferred.reject(false);
          }
          await turn();
          pending = undefined;
          break;
        }
        case "msg": {
          const client = clients.get(event.s) ?? fakeClient(event.s);
          pending = event;
          room._onMessage(client, encode(event.y, event.m));
          pending = undefined;
          break;
        }
        case "seats":
          runtime.setReplaySeats(event.n);
          break;
        case "evict":
          room.disposeAbandoned("evict");
          break;
        default:
          break;
      }
    };

    for (let tick = 0; tick < dt.length; tick += 1) {
      while (cursor < events.length && events[cursor].t <= tick) {
        await apply(cursor);
        cursor += 1;
      }
      options.beforeTick?.(room, tick);
      tickClock = clock[tick];
      const tickStart = performance.now();
      room.update(dt[tick] / 1000);
      options.afterTick?.(room, tick, performance.now() - tickStart);
      const expected = fingerprints.get(tick + 1);
      if (expected && expected.h !== "error") {
        checked += 1;
        const actual = fingerprintHash(room.getDebugFingerprint());
        if (actual !== expected.h) {
          mismatches.push({ t: tick + 1, expected: expected.h, actual, wave: expected.w });
          if (options.stopOnDivergence) break;
        }
      }
    }
    // Son tick'ten sonraki olaylar (ayrilmalar).
    while (cursor < events.length) {
      await apply(cursor);
      cursor += 1;
    }
    if (finalFingerprint && finalFingerprint.h !== "error" && !(options.stopOnDivergence && mismatches.length > 0)) {
      checked += 1;
      const actual = fingerprintHash(room.getDebugFingerprint());
      if (actual !== finalFingerprint.h) mismatches.push({ t: finalFingerprint.t, expected: finalFingerprint.h, actual, wave: finalFingerprint.w, final: true });
    }
  } finally {
    MatchRoom.createRuntime = previousRuntime;
    MatchRoom.createRecorder = previousRecorder;
    MatchRoom.maxConcurrentRooms = previousLimit;
    MatchRoom.rooms.delete(room.roomId);
    MatchRoom.publicRooms.delete(room.roomId);
  }
  return { room, ticks: dt.length, checked, mismatches, firstMismatch: mismatches[0], wallMs: performance.now() - startedAt };
}
