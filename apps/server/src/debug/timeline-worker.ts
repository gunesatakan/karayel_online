import { parentPort, workerData } from "node:worker_threads";
import { readRecordingTimeline } from "./reader.js";

/**
 * Zaman cizelgesi ayristirmasi ayri is parcaciginda (`admin.ts`): buyuk bir
 * kaydi acmak suren maclarin tick'ine titreme eklemesin. Sonuc JSON metni
 * olarak donuyor; ana is parcacigi onu ayristirmadan yanita yaziyor.
 */
const { path } = workerData as { path: string };
readRecordingTimeline(path).then(
  (timeline) => parentPort?.postMessage({ ok: true, json: JSON.stringify(timeline) }),
  (error: unknown) => parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
);
