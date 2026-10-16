import express, { type Request, type Response, type Router } from "express";
import { createReadStream, existsSync } from "node:fs";
import { FixedWindowRateLimiter, ipRateKey, readClientIp } from "../rate-limit.js";
import { tokenMatches } from "../telemetry.js";
import { ADMIN_PANEL_HTML } from "./admin-panel.js";
import { Worker } from "node:worker_threads";
import { readRecordingTimeline } from "./reader.js";
import { DEBUG_RECORDING_ID_PATTERN, type DebugRecordingStore } from "./store.js";

/**
 * Yonetici paneli: `GET /admin` (sayfa), `GET /admin/api/*` (JSON, jetonlu).
 *
 * Jeton yoksa (`DEBUG_ADMIN_TOKEN`, yoksa `TELEMETRY_ADMIN_TOKEN`) butun
 * yollar 404: ucun varligi bile gorunmuyor. Yanlis jeton 401; IP basina
 * dakikada sinirli deneme (jeton tahmini). Sayfanin kendisi veri tasimiyor,
 * jetonu kullanicidan alip API'ye `Authorization: Bearer` ile gidiyor.
 */
export const ADMIN_FAILED_AUTH_PER_MINUTE = 20;

export type AdminRouterOptions = {
  store: DebugRecordingStore;
  token?: string;
  /** Suren kayitlar: zaman cizelgesinden once bellektekini diske yazdir. */
  flushLive?: (id: string) => void;
  status?: () => Record<string, unknown>;
  /** Testler: ayristirici (varsayilan ayri is parcacigi). */
  parseTimeline?: (path: string) => Promise<string>;
};

/**
 * Kaydi ayri is parcaciginda ayristirir, JSON metni dondurur. Is parcacigi
 * acilamazsa (derleme eksik) ana is parcaciginda akisla okunur.
 */
export function parseTimelineInWorker(path: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./timeline-worker.js", import.meta.url), { workerData: { path } });
    } catch {
      readRecordingTimeline(path).then((timeline) => resolvePromise(JSON.stringify(timeline)), reject);
      return;
    }
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("timeline worker timeout"));
    }, timeoutMs);
    timer.unref();
    worker.once("message", (message: { ok: boolean; json?: string; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message.ok && typeof message.json === "string") resolvePromise(message.json);
      else reject(new Error(message.error ?? "timeline worker failed"));
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = express.Router();
  const token = options.token?.trim() || undefined;
  const failures = new FixedWindowRateLimiter(ADMIN_FAILED_AUTH_PER_MINUTE).startPruning();
  const blocked = new Map<string, number>();
  const cache = new Map<string, { bytes: number; json: string }>();
  // Ayristirma tek tek: ayni anda tek is parcacigi (paylasimli CPU'da oyunla yarismasin).
  let parsing: Promise<unknown> = Promise.resolve();
  const parseTimeline = (path: string) => {
    const run = parsing.then(() => (options.parseTimeline ?? parseTimelineInWorker)(path));
    parsing = run.catch(() => undefined);
    return run;
  };

  const authorized = (request: Request, response: Response) => {
    if (!token) {
      response.status(404).end();
      return false;
    }
    const key = ipRateKey(readClientIp(request.headers, request.socket.remoteAddress));
    const now = Date.now();
    const until = blocked.get(key) ?? 0;
    if (until > now) {
      response.setHeader("Retry-After", String(Math.ceil((until - now) / 1000)));
      response.status(429).end();
      return false;
    }
    if (!tokenMatches(request.headers.authorization, token)) {
      // Yalnizca basarisiz deneme sayiliyor; sinir dolunca bir dakika bekleme.
      if (!failures.hit(key)) blocked.set(key, now + 60_000);
      response.status(401).end();
      return false;
    }
    return true;
  };

  const noStore = (response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Robots-Tag", "noindex");
  };

  router.get(["/", "/index.html"], (_request, response) => {
    if (!token) {
      response.status(404).end();
      return;
    }
    noStore(response);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.send(ADMIN_PANEL_HTML);
  });

  router.use("/api", (request, response, next) => {
    if (blocked.size > 1000) for (const [key, until] of blocked) if (until <= Date.now()) blocked.delete(key);
    if (!authorized(request, response)) return;
    noStore(response);
    next();
  });

  router.get("/api/status", (_request, response) => {
    response.json({
      dir: options.store.dir,
      totalBytes: options.store.totalBytes(),
      maxTotalBytes: options.store.maxTotalBytes,
      retentionDays: options.store.retentionDays,
      recordings: options.store.list().length,
      stats: options.store.stats,
      ...(options.status?.() ?? {})
    });
  });

  router.get("/api/matches", (_request, response) => {
    const matches = options.store.list().sort((a, b) => b.createdAt - a.createdAt);
    response.json({ matches, totalBytes: options.store.totalBytes(), maxTotalBytes: options.store.maxTotalBytes });
  });

  const recordingId = (request: Request, response: Response) => {
    const id = String(request.params.id ?? "");
    if (!DEBUG_RECORDING_ID_PATTERN.test(id)) {
      response.status(400).end();
      return undefined;
    }
    return id;
  };

  router.get("/api/matches/:id", (request, response) => {
    const id = recordingId(request, response);
    if (!id) return;
    const summary = options.store.get(id);
    if (!summary) {
      response.status(404).end();
      return;
    }
    response.json(summary);
  });

  router.get("/api/matches/:id/timeline", (request, response) => {
    const id = recordingId(request, response);
    if (!id) return;
    void (async () => {
      try {
        if (options.store.isActive(id)) options.flushLive?.(id);
        await options.store.drain(id);
        const path = options.store.dataPath(id);
        if (!existsSync(path)) {
          response.status(404).end();
          return;
        }
        const bytes = options.store.sizeOf(id);
        let json = cache.get(id)?.bytes === bytes ? cache.get(id)?.json : undefined;
        if (!json) {
          json = await parseTimeline(path);
          cache.set(id, { bytes, json });
          // Yalnizca son birkac kayit bellekte.
          while (cache.size > 3) cache.delete(cache.keys().next().value as string);
        }
        if (request.query.download) response.setHeader("Content-Disposition", `attachment; filename="${id}.timeline.json"`);
        // Metin birlestirme: ana is parcacigi cizelgeyi yeniden ayristirmiyor.
        const head = `{"id":${JSON.stringify(id)},"summary":${JSON.stringify(options.store.get(id) ?? null)}`;
        response.type("application/json").send(json.length > 2 ? `${head},${json.slice(1)}` : `${head}}`);
      } catch {
        if (!response.headersSent) response.status(500).end();
      }
    })();
  });

  router.get("/api/matches/:id/replay", (request, response) => {
    const id = recordingId(request, response);
    if (!id) return;
    void (async () => {
      try {
        if (options.store.isActive(id)) options.flushLive?.(id);
        await options.store.drain(id);
        const path = options.store.dataPath(id);
        if (!existsSync(path)) {
          response.status(404).end();
          return;
        }
        response.setHeader("Content-Type", "application/gzip");
        response.setHeader("Content-Disposition", `attachment; filename="${id}.ndjson.gz"`);
        const stream = createReadStream(path);
        stream.on("error", () => {
          if (!response.headersSent) response.status(500).end();
          else response.destroy();
        });
        stream.pipe(response);
      } catch {
        if (!response.headersSent) response.status(500).end();
      }
    })();
  });

  return router;
}
