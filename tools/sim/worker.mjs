/** Havuzun is parcacigi: bir is al, maci oynat, raporu gonder. */
import { parentPort } from "node:worker_threads";
import { runJob } from "./jobs.mjs";

parentPort.on("message", ({ job }) => {
  try {
    parentPort.postMessage({ report: runJob(job).report });
  } catch (error) {
    parentPort.postMessage({ error: error?.stack ?? String(error) });
  }
});
