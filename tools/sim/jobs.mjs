/**
 * Is tanimi -> bot maci, ve isleri cekirdeklere dagitan havuz.
 *
 * Is: { operators, stage, seed, policy, overrides, builds?, maxWaves, unsafe, label }
 * `builds`: oyuncu basina kurulus (yoksa `overrides.build` ya da operatorun
 * varsayilani).
 */
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { runMatch } from "./match.mjs";
import { createBot, resolvePolicyOptions } from "./policies.mjs";

export function runJob(job) {
  const { operators, stage = 1, seed = 1, policy = "standard", overrides = {}, builds, maxWaves, unsafe = {}, label = "", record = false } = job;
  const bots = [];
  const output = runMatch({
    operators,
    stage,
    seed,
    maxWaves,
    unsafe,
    label,
    record,
    createPolicy: (ctx) => {
      const build = builds?.[ctx.playerIndex] ?? (ctx.playerIndex === 0 ? overrides.build : undefined);
      const bot = createBot(ctx, resolvePolicyOptions(policy, { ...overrides, build }));
      bots.push(bot);
      return bot;
    }
  });
  output.report.policy = policy;
  output.report.builds = bots.map((bot) => bot.buildName);
  output.report.decisions = bots.map((bot) => bot.decisions);
  return output;
}

/**
 * Isleri `workers` is parcacigina dagitir; sonuclar is sirasiyla doner.
 * Tek is parcacigi istenirse ayni surecte sirayla calisir.
 */
export async function runJobs(jobs, { workers = Math.max(1, cpus().length - 1), onResult } = {}) {
  const results = new Array(jobs.length);
  if (workers <= 1 || jobs.length <= 1) {
    for (const [index, job] of jobs.entries()) {
      results[index] = runJob(job).report;
      onResult?.(results[index], index);
    }
    return results;
  }
  let next = 0;
  const pool = Array.from({ length: Math.min(workers, jobs.length) }, () => new Worker(new URL("./worker.mjs", import.meta.url)));
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) {
        worker.terminate().then(resolve, resolve);
        return;
      }
      const index = next++;
      worker.once("message", (message) => {
        if (message.error) {
          reject(new Error(`job ${index} (${JSON.stringify(jobs[index])}): ${message.error}`));
          worker.terminate();
          return;
        }
        results[index] = message.report;
        onResult?.(message.report, index);
        feed();
      });
      worker.postMessage({ job: jobs[index] });
    };
    worker.once("error", reject);
    feed();
  })));
  return results;
}
