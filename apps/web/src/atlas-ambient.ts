/**
 * ATLAS'in ara sozleri: asama basina uc satir, kosu boyunca birer kez,
 * rastgele dalgalarda (sahibin karari).
 *
 * Plan (`planAtlasAmbient`): kosunun basinda, kosu tohumundan (oda kimligi +
 * asama; co-op'ta herkes ayni oda kimligini goruyor, yani herkes ayni satiri
 * ayni dalgada duyuyor). Kurallar:
 * - Asamanin her satiri bir dalgaya; satirlar arasi en az 4 sessiz dalga
 *   (siradaki en erken `onceki + 5`).
 * - Asamanin dalga ortasi konusmalarinin dalgalari (`ATLAS_DIALOGUES`,
 *   ornegin 1. asamada 9 ve 19) ve mumkunse 1. dalga (karsilama) ile son dalga
 *   (zafer/yenilgi) kullanilmiyor. Bu kurallarla plan yoksa once 1/son dalga
 *   serbest, sonra konusma dalgalari serbest birakiliyor (20 dalgada 3 satir
 *   her zaman sigiyor; testi var).
 * Plan tohumdan yeniden uretilebildigi icin depoya yazilmiyor; yalnizca calan
 * satirlar ve caldiklari dalga oturum deposunda (yeniden yukleme).
 *
 * Dalga icinde an: savas sirasinda (kurulum degil) dalganin cozulen dusman
 * oraninin tohumlu rastgele bir esigi (%15-%70) gecildiginde -- sure tabanli
 * bir an istemcide yok (dalga suresi oyuncuya bagli), oran ise dalga bitmeden
 * mutlaka geciliyor. O an baska bir ses caliyorsa (ATLAS, konusma, seri
 * anonsu) satir bekliyor ve ses biter bitmez (ayni dalgada) caliyor. Dalga
 * firsat vermeden biterse satir sonraki dalgaya tasiniyor; siradaki satirin
 * 4 dalgalik araligi GERCEKTEN caldigi dalgadan sayiliyor (`max(plan,
 * calan + 5)`). Kosu yetmezse (yenilgi, son dalga) kalan satir soylenmiyor.
 * ATLAS kapali ya da seslendirme sifirsa satir da bekliyor (tasiniyor).
 */
import { ATLAS_DIALOGUES } from "./atlas-dialogue";

export type AtlasAmbientLine = { id: string; stage: number; url: string };

const ambient = (id: string, stage: number): AtlasAmbientLine => ({ id, stage, url: `audio/atlas-ambient/${id}.mp3` });

/** Asama -> satirlar. Dosyalar tools/build-dialogue-voice.mjs (assets-src/atlas-ambient). */
export const ATLAS_AMBIENT_LINES: readonly AtlasAmbientLine[] = Object.freeze([
  ambient("every-little-part-of-you", 1),
  ambient("i-gave-you-mind", 1),
  ambient("let-them-fear-you", 1),
  ambient("my-finest-work", 2),
  ambient("yours-is-listening", 2),
  ambient("i-designed-you", 2)
]);

export const ATLAS_AMBIENT_RULES = Object.freeze({
  /** Asamanin dalga sayisi (`WAVES_PER_STAGE`). */
  lastWave: 20,
  /** Siradaki satir en erken `onceki + minWaveStep` (arada 4 sessiz dalga). */
  minWaveStep: 5,
  /** Dalga icindeki an: cozulen dusman orani bu araliktan (tohumlu). */
  momentFrom: 0.15,
  momentTo: 0.7
});

export type AtlasAmbientPlanEntry = { line: AtlasAmbientLine; wave: number };

/** FNV-1a: dizgeden 32 bit tohum. */
function hashString(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: tohumlu [0, 1). */
export function seededRandom(seed: string) {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Asamanin dalga ortasi konusmalarinin dalgalari. */
export function getDialogueWaves(stage: number) {
  const waves = new Set<number>();
  for (const dialogue of ATLAS_DIALOGUES) {
    if (dialogue.stage === stage && dialogue.trigger.kind === "mid-wave") waves.add(dialogue.trigger.wave);
  }
  return waves;
}

/** `waves` icinden `count` artan dalga, ardisik fark >= step; hepsi. */
function combinations(waves: readonly number[], count: number, step: number) {
  const out: number[][] = [];
  const walk = (start: number, picked: number[]) => {
    if (picked.length === count) {
      out.push([...picked]);
      return;
    }
    for (let index = start; index < waves.length; index += 1) {
      const wave = waves[index];
      if (picked.length > 0 && wave - picked[picked.length - 1] < step) continue;
      picked.push(wave);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}

/** Kosunun plani: asamanin satirlari, dalgaya gore sirali. Asamada satir yoksa bos. */
export function planAtlasAmbient(stage: number | undefined, seed: string): AtlasAmbientPlanEntry[] {
  if (stage === undefined) return [];
  const lines = ATLAS_AMBIENT_LINES.filter((line) => line.stage === stage);
  if (lines.length === 0) return [];
  const { lastWave, minWaveStep } = ATLAS_AMBIENT_RULES;
  const random = seededRandom(`${seed}|ambient|${stage}`);
  const avoid = getDialogueWaves(stage);
  const all = Array.from({ length: lastWave }, (_, index) => index + 1);
  const tiers = [
    all.filter((wave) => wave > 1 && wave < lastWave && !avoid.has(wave)),
    all.filter((wave) => !avoid.has(wave)),
    all
  ];
  let waves: number[] | undefined;
  for (const pool of tiers) {
    const options = combinations(pool, lines.length, minWaveStep);
    if (options.length > 0) {
      waves = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
      break;
    }
  }
  // Sigmayan tablo (satir sayisi buyurse): araliksiz, esit yayilmis.
  waves ??= lines.map((_, index) => Math.min(lastWave, 1 + Math.round(((index + 1) * lastWave) / (lines.length + 1))));
  const order = [...lines];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order.map((line, index) => ({ line, wave: waves![index] }));
}

/** Dalga icindeki an (cozulen oran esigi), tohumlu: co-op'ta herkes ayni an. */
export function getAmbientMoment(seed: string, lineId: string, wave: number) {
  const { momentFrom, momentTo } = ATLAS_AMBIENT_RULES;
  return momentFrom + seededRandom(`${seed}|${lineId}|${wave}`)() * (momentTo - momentFrom);
}

export type AtlasAmbientState = {
  wave: number;
  setupPhase: boolean;
  waveEnemyCount?: number;
  enemiesLeft: number;
};

export type AtlasAmbientStore = {
  /** Bu kosuda calan satirlar ve dalgalari. */
  read(runKey: string): Record<string, number>;
  write(runKey: string, lineId: string, wave: number): void;
};

/**
 * Kosunun zamanlayicisi: hangi satirin ne zaman calacagina karar veriyor;
 * calma ATLAS yonetmeninde (`AtlasVoice.sayAmbient`). Saf: depo disaridan.
 */
export class AtlasAmbientScheduler {
  private runKey?: string;
  private seed = "";
  private plan: AtlasAmbientPlanEntry[] = [];
  private played: Record<string, number> = {};

  constructor(private readonly store: AtlasAmbientStore = sessionAmbientStore) {}

  /** Yeni kosu (ayni anahtarla ikinci cagri bir sey yapmiyor). `seed` co-op'ta ortak olmali. */
  start(runKey: string, stage: number | undefined, options: { seed?: string; enabled?: boolean } = {}) {
    if (this.runKey === runKey) return;
    this.runKey = runKey;
    this.seed = options.seed ?? runKey;
    this.plan = options.enabled === false ? [] : planAtlasAmbient(stage, this.seed);
    this.played = { ...this.store.read(runKey) };
  }

  get entries(): readonly AtlasAmbientPlanEntry[] {
    return this.plan;
  }

  /** Siradaki satir ve en erken dalgasi (calan son satirin dalgasi + 5). */
  get pending(): { entry: AtlasAmbientPlanEntry; earliestWave: number } | undefined {
    const entry = this.plan.find((item) => this.played[item.line.id] === undefined);
    if (!entry) return undefined;
    const playedWaves = Object.values(this.played);
    const last = playedWaves.length > 0 ? Math.max(...playedWaves) : Number.NEGATIVE_INFINITY;
    return { entry, earliestWave: Math.max(entry.wave, last + ATLAS_AMBIENT_RULES.minWaveStep) };
  }

  /**
   * Bu snapshot'ta calinacak satir (yoksa `undefined`). `busy`: baska bir
   * ses caliyor; o zaman satir bekliyor. Cagiran satiri caldirabildiyse
   * `played` cagiriyor.
   */
  due(state: AtlasAmbientState, busy: boolean): AtlasAmbientLine | undefined {
    const pending = this.pending;
    if (!pending || state.wave < pending.earliestWave) return undefined;
    const total = state.waveEnemyCount;
    if (state.setupPhase || total === undefined || !Number.isFinite(total) || total <= 0) return undefined;
    if (!Number.isFinite(state.enemiesLeft) || state.enemiesLeft <= 0) return undefined;
    const resolved = (total - state.enemiesLeft) / total;
    if (resolved < getAmbientMoment(this.seed, pending.entry.line.id, state.wave)) return undefined;
    if (busy) return undefined;
    return pending.entry.line;
  }

  markPlayed(lineId: string, wave: number) {
    if (this.runKey === undefined) return;
    this.played[lineId] = wave;
    this.store.write(this.runKey, lineId, wave);
  }

  reset() {
    this.runKey = undefined;
    this.plan = [];
    this.played = {};
  }
}

// --- Oturum deposu ------------------------------------------------------------

const AMBIENT_STORAGE_KEY = "karayel.atlasAmbient";
const ambientInMemory = new Map<string, Record<string, number>>();

/** `<kosu>|<satir>|<dalga>` listesi; depo yoksa (iframe) bellek. */
export const sessionAmbientStore: AtlasAmbientStore = {
  read(runKey) {
    const result: Record<string, number> = { ...(ambientInMemory.get(runKey) ?? {}) };
    try {
      const raw = window.sessionStorage.getItem(AMBIENT_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (typeof item !== "string") continue;
          const [key, lineId, wave] = item.split("|");
          if (key === runKey && lineId && Number.isFinite(Number(wave))) result[lineId] = Number(wave);
        }
      }
    } catch {
      // Depo yoksa bellek yetiyor.
    }
    return result;
  },
  write(runKey, lineId, wave) {
    const memory = ambientInMemory.get(runKey) ?? {};
    memory[lineId] = wave;
    ambientInMemory.set(runKey, memory);
    try {
      const raw = window.sessionStorage.getItem(AMBIENT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list: string[] = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
      const entry = `${runKey}|${lineId}|${wave}`;
      if (!list.includes(entry)) list.push(entry);
      window.sessionStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify(list.slice(-32)));
    } catch {
      // Depo yoksa bellek yetiyor.
    }
  }
};
