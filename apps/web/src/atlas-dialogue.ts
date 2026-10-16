/**
 * ATLAS ile VESAYET (dusman yapay zeka) arasindaki senaryolu konusmalar.
 *
 * Veri tablosu (`ATLAS_DIALOGUES`): her konusmanin kimligi, asamasi, tetigi,
 * kimin duydugu ve sirali satirlari (konusmaci + dosya). Asama/dalga her
 * konusmada tek sabit (`CONV_N`), degistirmesi kolay. Calma ATLAS
 * yonetmeninde (`AtlasVoice.playDialogue`): satirlar arasi 2 sn sessizlik,
 * konusma surerken baska hicbir anons yok, mac sonu konusmayi kesiyor;
 * konusma surerken tetiklenen ikinci konusma siraya giriyor ve ilki bitince
 * (2 sn sonra) basliyor.
 *
 * Tetikler (hepsi kosu basina bir kez; ogretici ve yaratici kosuda yok):
 *
 * - `mid-wave` (dalganin ortasi): o dalganin dusmanlarinin yarisi cozuldu
 *   (olduruldu ya da nexus'a ulasti). Snapshot'ta sunucunun iki takim alani
 *   var: `team.waveEnemyCount` (dalganin planlanan toplami) ve
 *   `team.enemiesLeft` (dogmamis + sahadaki). Ikisi de delta onbellegine,
 *   gorus alanina ya da istemci saatine bagli degil; yeniden baglanan ilk
 *   karede ayni degeri goruyor. Kosul: kurulum disinda,
 *   `0 < enemiesLeft <= toplam / 2`. Sure tabanli bir orta nokta istemcide
 *   yok (dalga suresi oyuncunun hizina bagli, sunucu ongoru yollamiyor).
 *   Bir pencere oldugu icin konusma baslayamazsa (ATLAS kapali, kilit) sonraki
 *   snapshot'ta yeniden deneniyor; kayit yalnizca basladiginda.
 * - `skill-combo`: YEREL oyuncu 5 sn icinde iki FARKLI beceri ve ultiyi
 *   kullandi. Sunucu onayi snapshot'tan: beceri yuvasinin sogumasi yukseldi
 *   (yalnizca kullanim sogumayi baslatiyor/yukseltiyor), ulti sarji dolu
 *   (>= 100) iken dustu (sunucu sarji yalnizca atista sifirliyor). Zaman
 *   `snapshot.serverTime`; kayan pencere. Yalnizca yapan duyuyor.
 * - `nexus-below`: takimin nexus cani ilk kez %X'in altina indi (ayni
 *   `team.health / team.maxHealth`, ATLAS'in nexus seviyeleri de bunu
 *   okuyor). Bir vurusla esigin altina dusus gorulmeli (yeniden baglanmada
 *   zaten dusuk can tetiklemiyor). Herkes duyuyor (ortak nexus).
 *
 * Olay tetikleri bir an: o an konusma baslayamazsa (ATLAS kapali...) olay
 * harcanmis sayiliyor, sonra gec calmiyor.
 *
 * Kosu: `<oda>:<asama>` (ATLAS'in mac anahtari); kayit `<kosu>:<konusma>`,
 * oturum deposunda (yeniden yukleme), depo yoksa bellekte.
 */

export type AtlasDialogueSpeaker = "atlas" | "vesayet";

export type AtlasDialogueLine = { speaker: AtlasDialogueSpeaker; url: string };

export type AtlasDialogueTrigger =
  | { kind: "mid-wave"; wave: number }
  | { kind: "skill-combo"; windowMs: number; distinctSkills: number }
  | { kind: "nexus-below"; percent: number };

export type AtlasDialogue = {
  id: string;
  /** Asama (1 tabanli, `snapshot.stage`). */
  stage: number;
  trigger: AtlasDialogueTrigger;
  /** Kim duyuyor: takim (her istemci kendi snapshot'iyla) ya da yalnizca yapan. */
  audience: "team" | "local";
  lines: readonly AtlasDialogueLine[];
};

/** Satirlar arasi sessizlik (sahibin karari: gercekci olsun). */
export const ATLAS_DIALOGUE_GAP_MS = 2_000;

const line = (dialogue: string, index: number, speaker: AtlasDialogueSpeaker): AtlasDialogueLine => ({
  speaker,
  url: `audio/dialogue/${dialogue}/${String(index).padStart(2, "0")}-${speaker}.mp3`
});

const script = (id: string, speakers: readonly AtlasDialogueSpeaker[]) => speakers.map((speaker, index) => line(id, index + 1, speaker));

/** Asama/dalga her konusmada tek yerde. Dosyalar tools/build-dialogue-voice.mjs. */
const CONV_1 = { stage: 1, wave: 9 } as const;
const CONV_2 = { stage: 1, wave: 19 } as const;
const CONV_3 = { stage: 2, wave: 6 } as const;
const CONV_4 = { stage: 2, windowMs: 5_000, distinctSkills: 2 } as const;
const CONV_5 = { stage: 3, percent: 20 } as const;
const CONV_6 = { stage: 2, wave: 14 } as const;

export const ATLAS_DIALOGUES: readonly AtlasDialogue[] = Object.freeze([
  {
    id: "conv-1",
    stage: CONV_1.stage,
    trigger: { kind: "mid-wave", wave: CONV_1.wave },
    audience: "team",
    lines: script("conv-1", ["vesayet", "atlas", "vesayet", "atlas"])
  },
  {
    id: "conv-2",
    stage: CONV_2.stage,
    trigger: { kind: "mid-wave", wave: CONV_2.wave },
    audience: "team",
    lines: script("conv-2", ["vesayet", "atlas", "vesayet", "vesayet", "atlas"])
  },
  {
    id: "conv-3",
    stage: CONV_3.stage,
    trigger: { kind: "mid-wave", wave: CONV_3.wave },
    audience: "team",
    lines: script("conv-3", ["vesayet", "atlas", "vesayet"])
  },
  {
    id: "conv-4",
    stage: CONV_4.stage,
    trigger: { kind: "skill-combo", windowMs: CONV_4.windowMs, distinctSkills: CONV_4.distinctSkills },
    audience: "local",
    lines: script("conv-4", ["vesayet", "atlas", "vesayet"])
  },
  {
    id: "conv-5",
    stage: CONV_5.stage,
    trigger: { kind: "nexus-below", percent: CONV_5.percent },
    audience: "team",
    lines: script("conv-5", ["vesayet", "atlas"])
  },
  {
    id: "conv-6",
    stage: CONV_6.stage,
    trigger: { kind: "mid-wave", wave: CONV_6.wave },
    audience: "team",
    lines: script("conv-6", ["vesayet", "atlas", "vesayet"])
  }
] satisfies AtlasDialogue[]);

/** Tetiklerin okudugu snapshot olgulari (sahne her oynatilan snapshot'ta kuruyor). */
export type AtlasDialogueState = {
  stage?: number;
  wave: number;
  setupPhase: boolean;
  tutorial: boolean;
  creative: boolean;
  over: boolean;
  waveEnemyCount?: number;
  enemiesLeft: number;
  /** Yerel oyuncunun beceri kombosu bu snapshot'ta tamamlandi (`AtlasSkillComboWatch`). */
  skillCombo?: boolean;
  /** Bu snapshot'taki nexus dususu (`AtlasNexusDropWatch`); dusus yoksa yok. */
  nexusDrop?: AtlasNexusDrop;
};

export type AtlasNexusDrop = { from: number; to: number; max: number };

/** Dalganin ortasi: dusmanlarin yarisi cozuldu, dalga bitmedi. */
export function isMidWave(state: Pick<AtlasDialogueState, "setupPhase" | "waveEnemyCount" | "enemiesLeft">) {
  const total = state.waveEnemyCount;
  if (state.setupPhase || total === undefined || !Number.isFinite(total) || total <= 0) return false;
  if (!Number.isFinite(state.enemiesLeft)) return false;
  return state.enemiesLeft > 0 && state.enemiesLeft <= total / 2;
}

/** Dusus esigin (%) altina indi mi; can sifirsa mac bitti (yenilgi satiri onun). */
export function isNexusDropBelow(drop: AtlasNexusDrop | undefined, percent: number) {
  if (!drop || !(drop.max > 0) || !(drop.to < drop.from) || drop.to <= 0) return false;
  return (drop.to / drop.max) * 100 < percent;
}

/** Konusma tetiginin bu snapshot'ta gerceklesip gerceklesmedigi (kayit ve asama haric). */
export function isAtlasDialogueTriggered(dialogue: AtlasDialogue, state: AtlasDialogueState) {
  const trigger = dialogue.trigger;
  if (trigger.kind === "mid-wave") return state.wave === trigger.wave && isMidWave(state);
  if (trigger.kind === "skill-combo") return state.skillCombo === true;
  return isNexusDropBelow(state.nexusDrop, trigger.percent);
}

/** Olay mi (an), pencere mi (dalga ortasi; baslayamazsa yeniden deneniyor). */
export function isAtlasDialogueEvent(dialogue: AtlasDialogue) {
  return dialogue.trigger.kind !== "mid-wave";
}

/** Bu snapshot'ta baslamasi gereken konusmalar, tablo sirasiyla. `played`: bu kosuda calanlar. */
export function findDueAtlasDialogues(state: AtlasDialogueState, played: (id: string) => boolean): AtlasDialogue[] {
  if (state.over || state.tutorial || state.creative) return [];
  return ATLAS_DIALOGUES.filter((dialogue) => dialogue.stage === state.stage && !played(dialogue.id) && isAtlasDialogueTriggered(dialogue, state));
}

export function getAtlasDialogueUrls(dialogues: readonly AtlasDialogue[] = ATLAS_DIALOGUES): string[] {
  return dialogues.flatMap((entry) => entry.lines.map((item) => item.url));
}

/** Asamanin konusmalari (macin basinda onceden indirmek icin). */
export function getStageDialogues(stage: number | undefined) {
  return ATLAS_DIALOGUES.filter((dialogue) => dialogue.stage === stage);
}

// --- Izciler ---------------------------------------------------------------

/** Nexus cani izci: bir onceki snapshot'tan bu snapshot'a dusus. Ilk deger yalnizca kaydediliyor. */
export class AtlasNexusDropWatch {
  private last?: number;

  observe(health: number, maxHealth: number): AtlasNexusDrop | undefined {
    if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) return undefined;
    const previous = this.last;
    this.last = health;
    if (previous === undefined || health >= previous) return undefined;
    return { from: previous, to: health, max: maxHealth };
  }

  reset() {
    this.last = undefined;
  }
}

export type AtlasCasterFacts = { skillCooldowns?: readonly number[]; ultimateCharge?: number };

/** Ulti sarjinin "hazir" esigi (sunucu 100'de kirpiyor, telde taban). */
export const ATLAS_ULTIMATE_READY_CHARGE = 100;

/**
 * Yerel oyuncunun sunucu onayli kullanimlari (snapshot) ve kayan pencere:
 * pencerede `distinctSkills` farkli beceri yuvasi ve en az bir ulti varsa
 * kombo. Ilk gorulen deger yalnizca kaydediliyor (yeniden baglanma).
 */
export class AtlasSkillComboWatch {
  private cooldowns?: number[];
  private charge?: number;
  private casts: Array<{ kind: "skill" | "ultimate"; slot: number; at: number }> = [];

  constructor(private readonly windowMs = CONV_4.windowMs, private readonly distinctSkills = CONV_4.distinctSkills) {}

  observe(player: AtlasCasterFacts, at: number): boolean {
    if (!Number.isFinite(at)) return false;
    const cooldowns = Array.isArray(player.skillCooldowns) ? player.skillCooldowns.map((value) => (Number.isFinite(value) ? value : 0)) : undefined;
    const charge = Number.isFinite(player.ultimateCharge) ? player.ultimateCharge! : undefined;
    let cast = false;
    if (cooldowns && this.cooldowns) {
      cooldowns.forEach((value, slot) => {
        if (value > (this.cooldowns![slot] ?? 0)) {
          this.casts.push({ kind: "skill", slot, at });
          cast = true;
        }
      });
    }
    if (charge !== undefined && this.charge !== undefined && this.charge >= ATLAS_ULTIMATE_READY_CHARGE && charge < this.charge) {
      this.casts.push({ kind: "ultimate", slot: -1, at });
      cast = true;
    }
    if (cooldowns) this.cooldowns = cooldowns;
    if (charge !== undefined) this.charge = charge;
    this.casts = this.casts.filter((entry) => at - entry.at <= this.windowMs);
    if (!cast) return false;
    const skills = new Set(this.casts.filter((entry) => entry.kind === "skill").map((entry) => entry.slot));
    return skills.size >= this.distinctSkills && this.casts.some((entry) => entry.kind === "ultimate");
  }

  reset() {
    this.cooldowns = undefined;
    this.charge = undefined;
    this.casts = [];
  }
}

// --- Kosu basina bir kez (yeniden yukleme) ---------------------------------

const PLAYED_STORAGE_KEY = "karayel.atlasDialogues";
const playedInMemory = new Set<string>();

/** `runKey`: ATLAS'in mac anahtari (oda:asama). */
export function readAtlasDialoguePlayed(runKey: string, dialogueId: string) {
  const key = `${runKey}:${dialogueId}`;
  if (playedInMemory.has(key)) return true;
  try {
    const raw = window.sessionStorage.getItem(PLAYED_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(key);
  } catch {
    return false;
  }
}

export function writeAtlasDialoguePlayed(runKey: string, dialogueId: string) {
  const key = `${runKey}:${dialogueId}`;
  playedInMemory.add(key);
  try {
    const raw = window.sessionStorage.getItem(PLAYED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: string[] = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    if (!list.includes(key)) list.push(key);
    window.sessionStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify(list.slice(-32)));
  } catch {
    // Depo yoksa bellek yetiyor.
  }
}
