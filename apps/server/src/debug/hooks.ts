import type { Client } from "colyseus";

/**
 * Odanin kaydediciye cagirdigi kancalar (`MatchRoom` -> `recorder.ts`).
 * Tick yolundaki kancalar (`tickStart`, `tickEnd`, `wireSkip`) yalnizca
 * bellege yaziyor; disk isi tick'in disinda.
 */
export type DebugTickSections = {
  latestMs: number;
  bodiesMs: number;
  legendaryMs: number;
  procsMs: number;
  wireMs: number;
  perfMs: number;
};

export type DebugTickWire = {
  deltaBytes: number;
  fullBytes: number;
  legacyBytes: number;
  deltaFrames: number;
  fullFrames: number;
  legacyFrames: number;
  skipped: number;
};

/** `recordPerfFrame`e giden kare: sayaclar ve bolum sureleri (ms). */
export type DebugPerfFrame = {
  targetSearches: number;
  targetChecks: number;
  aoeChecks: number;
  chainChecks: number;
  damageEvents: number;
  spawnMs: number;
  towersMs: number;
  projectilesMs: number;
  enemiesMs: number;
  cooldownsMs: number;
  ultimatesMs: number;
  snapshotMs: number;
  tickMs: number;
  snapshotBytes: number;
};

export interface MatchRecorderHooks {
  tickStart(deltaUs: number, now: number): void;
  tickEnd(totalMs: number, frame: DebugPerfFrame | undefined, sections: DebugTickSections, wire: DebugTickWire): void;
  message(sessionId: string, type: string, message: Record<string, unknown>, at: number): void;
  /** Giris: `accepted` false ise oda reddetti (govdesiz kaydediliyor). */
  join(client: Client, options: Record<string, unknown>, at: number, accepted?: boolean): void;
  /** Kovanin reddettigi mesaj: yan etkisi yok, yalnizca sayiliyor. */
  dropped(sessionId: string, type: string): void;
  /** Baska odanin kurulumu bu odayi yerinden etti. */
  evicted(): void;
  leave(sessionId: string, consented: boolean, at: number): void;
  reconnect(client: Client, ok: boolean, at: number): void;
  wireSkip(sessionId: string): void;
  clientSample(sessionId: string, sample: Record<string, unknown>): void;
  /** Kurulamayan oda: kayit hic yazilmasin. */
  discard(): void;
  dispose(): void;
}
