/**
 * Mac sonu sahnesi: kosu raporundan once, yerel ve kozmetik.
 *
 * Yenilgi: butun yapilar (senin ve takim arkadaslarinin) nexus'tan disari
 * dogru, uzakliga gore sirayla patliyor; ATLAS'in yenilgi satiri bu sirada
 * konusuyor; nexus en son, daha agir patliyor; kisa bir bekleme, sonra rapor.
 *
 * Zafer ("Sevkiyat kalkisi"): komutan yapay zeka kaynaklari ana aga
 * yolluyor. Nexus'tan gokyuzune dikey bir sevkiyat isini yukseliyor; kuleler
 * disaridan iceri, nexus'a dogru birer birer gucu devrediyor (isik sonuyor,
 * soguk bir enerji darbesi nexus'a gidiyor). Isin satirin sonunda tepe
 * noktasinda; kisa bekleme, sonra rapor.
 *
 * Bu modul saf: siralama, zamanlama ve denetleyici. Cizim `vfx/match-end-vfx`,
 * baglama GameScene ve galeri. Sunucuya hicbir sey gitmiyor (oynanis bitti);
 * co-op'ta her istemci kendi sahnesini oynuyor. Sonuctan sonra giren ya da
 * yeniden baglanan istemci sahneyi gormuyor, rapor hemen aciliyor.
 */
import { ATLAS_LINE_COUNTS, getAtlasLineUrls } from "./atlas-voice";

export type MatchEndKind = "defeat" | "victory";

/** Sahnedeki yapi: kule, duvar ya da kenar yapisi; dunya koordinatinda. */
export type MatchEndStructure = {
  id: string;
  x: number;
  y: number;
  /** Diskin capi (dunya birimi). */
  size: number;
  /** Duvar ve kenar yapisi: toplu ve hafif efektle. */
  wall?: boolean;
};

export type MatchEndPoint = { x: number; y: number };

/** Zamanlamanin sayilari (ms). */
export const MATCH_END_TIMING = Object.freeze({
  /** Ses kapali ya da satir bilinmiyorsa sahnenin boyu. */
  fallbackMs: 5_000,
  /** Satirdan gelen surenin sinirlari: cok kisa satir sahneyi bogmasin, uzun satir raporu bekletmesin. */
  minDurationMs: 4_000,
  maxDurationMs: 9_000,
  /** Iki patlama arasi: cok kule de zamaninda bitsin, az kule de surunmesin. */
  minGapMs: 80,
  maxGapMs: 450,
  /** Ilk patlamadan once: HUD kararir, dusmanlar durur, ATLAS baslar. */
  startMs: 350,
  /** Son yapi ile nexus (ya da isinin tepesi) arasi. */
  nexusLeadMs: 700,
  /** Yenilgide nexus en erken satirin bu oraninda patliyor (az kule surunmesin ama aceleye de gelmesin). */
  defeatNexusFloor: 0.6,
  /** Nexus patlamasi ya da isin tepesi ile rapor arasi. */
  holdMs: 800,
  /** Ardisik duvarlar bu kadarlik gruplarla ayni anda. */
  wallBatch: 4,
  /** Kare dongusu durursa (gizli sekme) rapor yine bu kadar sonra aciliyor. */
  safetyMarginMs: 2_500
});

/**
 * ATLAS'in son satirlarinin sureleri (sn); apps/web/public/audio/atlas/manifest.json
 * ile ayni (tests/match-end-sequence.test.mjs denetliyor). Manifest calisma
 * aninda indirilmiyor: sahne satir baslar baslamaz sureyi bilmeli.
 */
export const ATLAS_FINAL_LINE_SECONDS: Readonly<Record<string, number>> = Object.freeze({
  "audio/atlas/death/death-01.mp3": 6.746,
  "audio/atlas/death/death-02.mp3": 6.354,
  "audio/atlas/death/death-03.mp3": 6.668,
  "audio/atlas/death/death-04.mp3": 7.321,
  "audio/atlas/death/death-05.mp3": 6.354,
  "audio/atlas/death/death-06.mp3": 10.508,
  "audio/atlas/death/death-07.mp3": 8.914,
  "audio/atlas/death/death-08.mp3": 8.836,
  "audio/atlas/ending/ending-01.mp3": 5.231,
  "audio/atlas/ending/ending-02.mp3": 5.466,
  "audio/atlas/ending/ending-03.mp3": 6.198,
  "audio/atlas/ending/ending-04.mp3": 5.806,
  "audio/atlas/ending/ending-05.mp3": 5.309,
  "audio/atlas/ending/ending-06.mp3": 6.929
});

/** Butun son satirlarin adresleri (test: tablo eksiksiz). */
export function getAtlasFinalLineUrls() {
  return [...getAtlasLineUrls("death"), ...getAtlasLineUrls("ending")];
}

/** Toplam satir sayisi (test: tablo manifestle ayni boyda). */
export const ATLAS_FINAL_LINE_COUNT = ATLAS_LINE_COUNTS.death + ATLAS_LINE_COUNTS.ending;

/** Calan satirin suresi (sn); bilinmiyorsa `undefined`. */
export function getAtlasLineSeconds(url: string | undefined) {
  return url === undefined ? undefined : ATLAS_FINAL_LINE_SECONDS[url];
}

/** Sahnenin boyu: satir caliyorsa onun suresi (sinirli), yoksa ~5 sn. */
export function getMatchEndDurationMs(lineSeconds: number | undefined) {
  if (lineSeconds === undefined || !Number.isFinite(lineSeconds) || lineSeconds <= 0) return MATCH_END_TIMING.fallbackMs;
  return Math.round(Math.min(MATCH_END_TIMING.maxDurationMs, Math.max(MATCH_END_TIMING.minDurationMs, lineSeconds * 1000)));
}

/**
 * Sira: yenilgide nexus'tan disari (yakin once), zaferde disaridan iceri
 * (uzak once). Esit uzaklikta kimlik sirasi: her istemcide ayni sira.
 */
export function orderMatchEndStructures(kind: MatchEndKind, structures: readonly MatchEndStructure[], nexus: MatchEndPoint) {
  const sign = kind === "defeat" ? 1 : -1;
  return structures
    .filter((structure) => Number.isFinite(structure.x) && Number.isFinite(structure.y))
    .map((structure) => ({ structure, distance: Math.hypot(structure.x - nexus.x, structure.y - nexus.y) }))
    .sort((a, b) => (a.distance - b.distance) * sign || (a.structure.id < b.structure.id ? -1 : a.structure.id > b.structure.id ? 1 : 0))
    .map((entry) => entry.structure);
}

export type MatchEndStepRole = "tower" | "walls" | "nexus";

/** Zamanlanmis tek an: bir kule, bir duvar grubu ya da nexus. */
export type MatchEndStep = {
  atMs: number;
  role: MatchEndStepRole;
  items: MatchEndStructure[];
};

export type MatchEndPlan = {
  kind: MatchEndKind;
  durationMs: number;
  /** Iki yapi adimi arasi (tek adimda 0). */
  gapMs: number;
  /** Nexus patlamasi (yenilgi) ya da isinin tepesi (zafer). */
  climaxMs: number;
  /** Raporun acildigi an. */
  reportAtMs: number;
  /** Zamana gore sirali; son adim hep nexus. */
  steps: MatchEndStep[];
};

/**
 * Zamanlama. Yapilar adimlara bolunuyor (her kule bir adim, ardisik duvarlar
 * dorderli); adimlar ilk andan nexus'a kadarki araliga yayiliyor, aralik
 * 80-450 ms. Yenilgide nexus son adimdan sonra ve satirin en az %60'inda;
 * zaferde isin satirin sonunda (cok kule tasarsa onlardan sonra) tepe
 * yapiyor. Rapor tepe noktasindan 0,8 sn sonra.
 */
export function planMatchEndSchedule(input: {
  kind: MatchEndKind;
  structures: readonly MatchEndStructure[];
  nexus: MatchEndPoint;
  durationMs: number;
}): MatchEndPlan {
  const timing = MATCH_END_TIMING;
  const durationMs = Math.max(1, input.durationMs);
  const ordered = orderMatchEndStructures(input.kind, input.structures, input.nexus);
  const groups: Array<{ role: MatchEndStepRole; items: MatchEndStructure[] }> = [];
  for (const structure of ordered) {
    const last = groups[groups.length - 1];
    if (structure.wall && last?.role === "walls" && last.items.length < timing.wallBatch) {
      last.items.push(structure);
      continue;
    }
    groups.push({ role: structure.wall ? "walls" : "tower", items: [structure] });
  }
  const span = durationMs - timing.startMs - timing.nexusLeadMs;
  const gapMs = groups.length > 1
    ? Math.min(timing.maxGapMs, Math.max(timing.minGapMs, span / (groups.length - 1)))
    : 0;
  const steps: MatchEndStep[] = groups.map((group, index) => ({ atMs: Math.round(timing.startMs + index * gapMs), role: group.role, items: group.items }));
  const lastAt = steps.length > 0 ? steps[steps.length - 1].atMs : timing.startMs;
  const afterStructures = steps.length > 0 ? lastAt + timing.nexusLeadMs : timing.startMs;
  const climaxMs = Math.round(input.kind === "defeat"
    ? Math.max(afterStructures, durationMs * timing.defeatNexusFloor)
    : Math.max(afterStructures, durationMs));
  steps.push({ atMs: climaxMs, role: "nexus", items: [] });
  return {
    kind: input.kind,
    durationMs,
    gapMs: Math.round(gapMs),
    climaxMs,
    reportAtMs: climaxMs + timing.holdMs,
    steps
  };
}

/**
 * Sahne oynanmali mi: istemci maci canli oynadi ve bu baglantida sonucu
 * canli gordu. Sonuctan sonra giren (ilk snapshot sonucu tasiyordu) ya da
 * sonuctan sonra yeniden baglanan (bu baglantida sonucsuz snapshot yok)
 * istemci raporu hemen goruyor.
 */
export function shouldPlayMatchEndSequence(input: { liveSnapshotSeen: boolean; liveSinceBind: boolean }) {
  return input.liveSnapshotSeen && input.liveSinceBind;
}

/** Sahnenin ses ornekleri (kayitli CC0 aileler; yeni dosya yok). */
export type MatchEndSoundFamily = "impact" | "ball" | "heft" | "focus" | "aura" | "wave";
export type MatchEndSoundCue = { family: MatchEndSoundFamily; rate: number; gain: number };

/** Ses yonetmeni: ust uste binen patlamalar kirpmasin. */
export const MATCH_END_SOUND_RULES = Object.freeze({
  /** Iki ses arasi en az. */
  minGapMs: 70,
  /** Bu pencerede en fazla bu kadar ses. */
  windowMs: 450,
  maxInWindow: 4,
  /** Pencere doldukca kazanc bu kadar iniyor (ses basina). */
  densityDuck: 0.14
});

/**
 * Patlama ve guc devri sesleri: perde kimlikten (her istemcide ayni), kazanc
 * yogunlukla iniyor. Nexus ve isin tepesi yonetmenden gecmiyor (tek an).
 */
export class MatchEndSoundGovernor {
  private readonly recent: number[] = [];

  /** Rolun sesi; yonetmen reddederse bos dizi. */
  admit(role: MatchEndStepRole | "power" | "beam" | "launch", now: number, key: string): MatchEndSoundCue[] {
    const roll = (salt: number) => {
      let hash = 0x811c9dc5 ^ salt;
      for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193) >>> 0;
      return (hash >>> 0) / 4294967296;
    };
    if (role === "nexus") return [{ family: "impact", rate: 0.48, gain: 1.35 }, { family: "heft", rate: 0.62, gain: 1 }];
    if (role === "launch") return [{ family: "wave", rate: 0.55, gain: 1 }];
    if (role === "beam") return [{ family: "aura", rate: 0.5, gain: 0.8 }];
    const rules = MATCH_END_SOUND_RULES;
    while (this.recent.length > 0 && now - this.recent[0] > rules.windowMs) this.recent.shift();
    const last = this.recent[this.recent.length - 1];
    if (last !== undefined && now - last < rules.minGapMs) return [];
    if (this.recent.length >= rules.maxInWindow) return [];
    const duck = 1 - rules.densityDuck * this.recent.length;
    this.recent.push(now);
    if (role === "walls") return [{ family: "ball", rate: 0.82 + roll(1) * 0.18, gain: 0.5 * duck }];
    if (role === "power") return [{ family: "focus", rate: 0.55 + roll(2) * 0.15, gain: 0.45 * duck }];
    return [{ family: "impact", rate: 0.6 + roll(3) * 0.22, gain: 0.95 * duck }];
  }

  reset() {
    this.recent.length = 0;
  }
}

/** Denetleyicinin dis dunyasi: ses, cizim, rapor. */
export type MatchEndPorts = {
  /** ATLAS'in son satiri; caldiysa suresi (sn), yoksa `undefined`. Tam bir kez cagriliyor. */
  speak(): number | undefined;
  /** Sahne basliyor: HUD karariyor, gec dugmesi, kamera. */
  begin(plan: MatchEndPlan): void;
  /** Zamani gelen adim (patlama, guc devri, nexus). */
  step(step: MatchEndStep, plan: MatchEndPlan): void;
  /** Sahne bitti ya da gecildi: HUD ve dugme eski haline. Rapordan once. */
  end(skipped: boolean): void;
  /** Kosu raporu: tam bir kez. */
  openReport(): void;
};

/**
 * Denetleyici. Saat disaridan (`start(now)`, `tick(now)`); zamanlayici yok,
 * yani galeri sanal saatle, testler sahte saatle suruyor. Rapor tek kapidan
 * (`finish`) ve tam bir kez aciliyor: sahnenin sonu, gecis ya da sahne
 * kapanirken.
 */
export class MatchEndSequence {
  private plan?: MatchEndPlan;
  private startedAt = 0;
  private next = 0;
  private finished = false;

  constructor(
    readonly kind: MatchEndKind,
    private readonly structures: readonly MatchEndStructure[],
    private readonly nexus: MatchEndPoint,
    private readonly ports: MatchEndPorts
  ) {}

  /** Satiri soyletir, plani kurar ve sahneyi baslatir; planla doner. */
  start(now: number): MatchEndPlan {
    if (this.plan) return this.plan;
    let seconds: number | undefined;
    try {
      seconds = this.ports.speak();
    } catch {
      seconds = undefined;
    }
    const plan = planMatchEndSchedule({ kind: this.kind, structures: this.structures, nexus: this.nexus, durationMs: getMatchEndDurationMs(seconds) });
    this.plan = plan;
    this.startedAt = now;
    this.safely(() => this.ports.begin(plan));
    return plan;
  }

  get started() {
    return this.plan !== undefined;
  }

  get done() {
    return this.finished;
  }

  get schedule() {
    return this.plan;
  }

  /** Sahnenin yasi (ms). */
  elapsed(now: number) {
    return this.plan ? Math.max(0, now - this.startedAt) : 0;
  }

  /** Zamani gelen adimlari atesler; rapor ani geldiyse bitirir. */
  tick(now: number) {
    const plan = this.plan;
    if (!plan || this.finished) return;
    const elapsed = now - this.startedAt;
    while (this.next < plan.steps.length && plan.steps[this.next].atMs <= elapsed) {
      const step = plan.steps[this.next];
      this.next += 1;
      this.safely(() => this.ports.step(step, plan));
    }
    if (elapsed >= plan.reportAtMs) this.finish(false);
  }

  /** Dokunus: dogrudan rapora. */
  skip() {
    this.finish(true);
  }

  /** Tek kapi: sahne biter, rapor bir kez acilir. Kozmetik hata raporu durdurmuyor. */
  finish(skipped = false) {
    if (this.finished) return;
    this.finished = true;
    this.safely(() => this.ports.end(skipped));
    this.ports.openReport();
  }

  private safely(action: () => void) {
    try {
      action();
    } catch (error) {
      // Sahne kozmetik: cizim ya da ses hatasi raporu engellemesin.
      console.warn(error);
    }
  }
}
