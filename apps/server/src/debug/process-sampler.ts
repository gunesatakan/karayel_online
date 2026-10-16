import { PerformanceObserver, monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { cpus, loadavg } from "node:os";

/**
 * Surec olcusu, saniyede bir: olay dongusu gecikmesi, GC duraklamalari,
 * CPU payi ve bellek. Odalar ayni sureci paylasiyor; bir odadaki takilmanin
 * sebebi baska bir oda ya da GC olabilir. Her kaydedici son ornegi kendi
 * saniyelik satirina kopyaliyor.
 *
 * Zamanlayici `unref`: sureci acik tutmuyor. Tek ornek, ilk kaydediciyle
 * basliyor.
 */
export type ProcessSample = {
  /** Olay dongusu gecikmesi (ms): ortalama, p99, en buyuk. */
  elMean: number;
  elP99: number;
  elMax: number;
  /** GC: toplam duraklama (ms) ve sayi; en uzun duraklama. */
  gcMs: number;
  gcN: number;
  gcMax: number;
  /** CPU: bir cekirdegin yuzdesi (kullanici + sistem). */
  cpu: number;
  /** Bellek (MB). */
  rss: number;
  heap: number;
  heapTotal: number;
  ext: number;
  load1: number;
  rooms: number;
};

const EMPTY: ProcessSample = { elMean: 0, elP99: 0, elMax: 0, gcMs: 0, gcN: 0, gcMax: 0, cpu: 0, rss: 0, heap: 0, heapTotal: 0, ext: 0, load1: 0, rooms: 0 };
const round1 = (value: number) => Math.round(value * 10) / 10;
const MB = 1024 * 1024;

export class ProcessSampler {
  latest: ProcessSample = { ...EMPTY };
  readonly cores = Math.max(1, cpus().length);
  private histogram?: IntervalHistogram;
  private observer?: PerformanceObserver;
  private timer?: NodeJS.Timeout;
  private gcMs = 0;
  private gcN = 0;
  private gcMax = 0;
  private lastCpu = process.cpuUsage();
  private lastAt = performance.now();

  constructor(private readonly countRooms: () => number) {}

  start() {
    if (this.timer) return;
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 10 });
      this.histogram.enable();
    } catch {
      this.histogram = undefined;
    }
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.gcMs += entry.duration;
          this.gcN += 1;
          if (entry.duration > this.gcMax) this.gcMax = entry.duration;
        }
      });
      this.observer.observe({ entryTypes: ["gc"] });
    } catch {
      this.observer = undefined;
    }
    this.timer = setInterval(() => this.sample(), 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.histogram?.disable();
    this.observer?.disconnect();
  }

  sample() {
    const now = performance.now();
    const elapsedMs = Math.max(1, now - this.lastAt);
    const cpu = process.cpuUsage(this.lastCpu);
    this.lastCpu = process.cpuUsage();
    this.lastAt = now;
    const memory = process.memoryUsage();
    const histogram = this.histogram;
    // Histogram nanosaniye; resolution kadar taban gecikme her olcumde var.
    const elMean = histogram && histogram.count > 0 ? histogram.mean / 1e6 : 0;
    const elP99 = histogram && histogram.count > 0 ? histogram.percentile(99) / 1e6 : 0;
    const elMax = histogram && histogram.count > 0 ? histogram.max / 1e6 : 0;
    histogram?.reset();
    this.latest = {
      elMean: round1(elMean),
      elP99: round1(elP99),
      elMax: round1(elMax),
      gcMs: round1(this.gcMs),
      gcN: this.gcN,
      gcMax: round1(this.gcMax),
      cpu: round1(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100),
      rss: Math.round(memory.rss / MB),
      heap: Math.round(memory.heapUsed / MB),
      heapTotal: Math.round(memory.heapTotal / MB),
      ext: Math.round((memory.external + (memory.arrayBuffers ?? 0)) / MB),
      load1: round1(loadavg()[0] ?? 0),
      rooms: this.countRooms()
    };
    this.gcMs = 0;
    this.gcN = 0;
    this.gcMax = 0;
    return this.latest;
  }
}
