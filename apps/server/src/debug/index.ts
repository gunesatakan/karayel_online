import type { Express } from "express";
import { randomBytes } from "node:crypto";
import { MatchRoom } from "../rooms/MatchRoom.js";
import { createAdminRouter } from "./admin.js";
import { ProcessSampler } from "./process-sampler.js";
import { MatchRecorder } from "./recorder.js";
import { SeededRoomRuntime } from "./room-runtime.js";
import { DEBUG_RECORDER_MAX_TOTAL_BYTES, DEBUG_RECORDER_MIN_FREE_BYTES, DEBUG_RECORDER_RETENTION_DAYS, DebugRecordingStore, resolveDebugRecorderDir } from "./store.js";

/**
 * Mac kaydedicisinin kurulumu (`index.ts`'in tek kancasi).
 *
 * Ortam:
 * - `DEBUG_RECORDER=off` kaydi tamamen kapatir: odalar eski (canli) saat ve
 *   zarla calisir, hicbir sey yazilmaz. Varsayilan acik.
 * - `DEBUG_ADMIN_TOKEN` (yoksa `TELEMETRY_ADMIN_TOKEN`): panel ve API jetonu;
 *   ikisi de yoksa `/admin` 404.
 * - `DEBUG_RECORDER_DIR` (varsayilan `/data/debug`, yoksa `data/debug`),
 *   `DEBUG_RECORDER_MAX_MB` (300), `DEBUG_RECORDER_RETENTION_DAYS` (30),
 *   `DEBUG_RECORDER_MIN_FREE_MB` (128, diskte birakilacak bos yer),
 *   `DEBUG_RECORDER_MATCH_MAX_MB` (40), `DEBUG_RECORDER_SPIKE_MS` (10),
 *   `DEBUG_RECORDER_LOOP_STALL_MS` (50).
 */
export type DebugRecorderInstall = {
  enabled: boolean;
  store: DebugRecordingStore;
  sampler: ProcessSampler;
  active: Map<string, MatchRecorder>;
  stop: () => void;
};

function readNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isFinite(value) && raw !== undefined && raw !== "" ? Math.min(max, Math.max(min, value)) : fallback;
}

export function isDebugRecorderDisabled(env: NodeJS.ProcessEnv = process.env) {
  return /^(0|off|false|no|disabled)$/i.test(String(env.DEBUG_RECORDER ?? "").trim());
}

export function randomRoomSeed() {
  return randomBytes(4).readUInt32LE(0);
}

export type InstallDebugRecorderOptions = {
  env?: NodeJS.ProcessEnv;
  /** Testler: surec cikis kancasi ve zamanlayicilar kurulmasin. */
  autoStart?: boolean;
  log?: (message: string) => void;
};

export function installDebugRecorder(app: Express | undefined, options: InstallDebugRecorderOptions = {}): DebugRecorderInstall {
  const env = options.env ?? process.env;
  const enabled = !isDebugRecorderDisabled(env);
  const store = new DebugRecordingStore({
    dir: resolveDebugRecorderDir(env),
    maxTotalBytes: readNumber(env.DEBUG_RECORDER_MAX_MB, DEBUG_RECORDER_MAX_TOTAL_BYTES / 1024 / 1024, 1, 100_000) * 1024 * 1024,
    retentionDays: readNumber(env.DEBUG_RECORDER_RETENTION_DAYS, DEBUG_RECORDER_RETENTION_DAYS, 1, 3650),
    minFreeBytes: readNumber(env.DEBUG_RECORDER_MIN_FREE_MB, DEBUG_RECORDER_MIN_FREE_BYTES / 1024 / 1024, 0, 100_000) * 1024 * 1024,
    log: options.log
  });
  const sampler = new ProcessSampler(() => MatchRoom.rooms.size);
  const active = new Map<string, MatchRecorder>();
  const config = {
    store,
    sampler,
    spikeMs: readNumber(env.DEBUG_RECORDER_SPIKE_MS, 10, 1, 10_000),
    loopStallMs: readNumber(env.DEBUG_RECORDER_LOOP_STALL_MS, 50, 20, 60_000),
    maxRecordingBytes: readNumber(env.DEBUG_RECORDER_MATCH_MAX_MB, 40, 1, 10_000) * 1024 * 1024,
    maxEvents: 400_000,
    serverVersion: String(env.FLY_IMAGE_REF ?? env.npm_package_version ?? "dev").slice(0, 120)
  };
  const timers: NodeJS.Timeout[] = [];
  const onExit = () => {
    // Bekleyen her sey esanli: Fly durdururken yarim kalan mac da okunabilsin.
    const extra = new Map<string, string>();
    for (const recorder of active.values()) {
      const text = recorder.drainForExit();
      if (text) extra.set(recorder.id, text);
    }
    store.flushSync(extra);
  };

  if (enabled) {
    MatchRoom.createRuntime = () => new SeededRoomRuntime(randomRoomSeed(), Date.now());
    MatchRoom.createRecorder = (room, roomOptions) => {
      if (!(room.runtime instanceof SeededRoomRuntime)) return undefined;
      const recorder = new MatchRecorder(room as unknown as ConstructorParameters<typeof MatchRecorder>[0], roomOptions, config);
      active.set(recorder.id, recorder);
      const dispose = recorder.dispose.bind(recorder);
      const discard = recorder.discard.bind(recorder);
      recorder.dispose = () => {
        dispose();
        active.delete(recorder.id);
        void store.drain(recorder.id).then(() => store.prune());
      };
      recorder.discard = () => {
        discard();
        active.delete(recorder.id);
      };
      return recorder;
    };
    if (options.autoStart !== false) {
      sampler.start();
      void store.init().then(() => store.prune());
      const prune = setInterval(() => void store.prune(), 60 * 60 * 1000);
      prune.unref();
      timers.push(prune);
      process.once("exit", onExit);
    }
  }

  if (app) {
    app.use("/admin", createAdminRouter({
      store,
      token: env.DEBUG_ADMIN_TOKEN?.trim() || env.TELEMETRY_ADMIN_TOKEN?.trim() || undefined,
      flushLive: (id) => active.get(id)?.flushNow(),
      status: () => ({
        enabled,
        live: Array.from(active.keys()),
        process: sampler.latest,
        spikeMs: config.spikeMs,
        loopStallMs: config.loopStallMs,
        maxRecordingBytes: config.maxRecordingBytes,
        minFreeBytes: store.minFreeBytes
      })
    }));
  }
  if (enabled && options.autoStart !== false) void store.init();

  return {
    enabled,
    store,
    sampler,
    active,
    stop: () => {
      for (const timer of timers) clearInterval(timer);
      sampler.stop();
      process.off("exit", onExit);
      if (MatchRoom.createRecorder) MatchRoom.createRecorder = undefined;
      if (MatchRoom.createRuntime) MatchRoom.createRuntime = undefined;
    }
  };
}
