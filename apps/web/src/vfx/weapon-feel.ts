/**
 * Silahin hissi: her saldiran kulenin kutlesi, atis sesi, geri tepmesi ve
 * vurusun dusmana etkisi. Efekt profilinin (`vfx-profiles`) yaninda tek tablo:
 * hangi kule ne kadar "agir" vuruyor buradan okunuyor.
 *
 * Kurallar (sahibin karari, 2026-10-20):
 * - Hepsi yalnizca istemcide, govdenin cizimi: sunucunun konumu, can cubugu
 *   ve isabeti degismiyor. Sunucuya yuk yok.
 * - Hafif silah sayiyla ve hizla hissettiriyor (itme, duraklama yok); agir
 *   silah tek vurusla (itme, kisa duraklama, ezilme, kendi vurusunda hafif
 *   sarsinti). Sarsinti yalnizca kendi agir vurusun (Sunucu, Obsesyon, Kin)
 *   ve kendi kritigin; takim arkadasi kamerana dokunmuyor.
 * - Itme, duraklama, ezilme, titreme ve sarsinti yalnizca kendi vurusunda;
 *   takim arkadasinin kulesi senin ekraninda dusmani oynatmiyor (co-op'ta
 *   ekran surekli titrerdi). Atis sesi ve geri tepme herkesin kulesinde
 *   (arkadasinki kisik).
 * - Hareket azaltmada itme, duraklama, ezilme, titreme ve sarsinti yok.
 * - Hasar sayilari silaha gore degismiyor ("sade kalsin").
 * - Parilti ya da muzikal ses yok: ates sesleri kayitli CC0 ornekler (Kenney).
 */
import { getVfxProfile, type VfxProfile } from "./vfx-profiles";
import { hashNoise } from "./kit";

/** Atis sesinin ailesi (sfx-samples, build-sfx.mjs). */
export type FireVoiceId = "fireLight" | "fireHeavy" | "fireHoming" | "fireCollapse" | "fireBolt" | "fireLance";

export const FIRE_VOICE_IDS: readonly FireVoiceId[] = Object.freeze([
  "fireLight",
  "fireHeavy",
  "fireHoming",
  "fireCollapse",
  "fireBolt",
  "fireLance"
] as FireVoiceId[]);

export type WeaponMass = "light" | "medium" | "heavy";

/**
 * Olum bicimi (oldurenin silahindan):
 * - "shards": kinetik -- parcalar vuran merminin yonunde savruluyor;
 * - "ash": enerji ve isin -- govde kul olup dagiliyor, korlar yukseliyor;
 * - "implode": cokus (Obsesyon) -- govde once ice cekiliyor, sonra dagiliyor.
 */
export type DeathStyle = "shards" | "ash" | "implode";

/**
 * Merminin sonu (sahibin karari, 2026-10-20: "tas atilmis gibi olmasin"):
 * - "sink": mermi dusmana degince durmuyor; ucus yonunde govdenin icine
 *   birkac birim daha girip kuculerek ve sonerek kayboluyor;
 * - "burst": carpma mermisi (Sunucu, Obsesyon, Ucube) degdigi anda
 *   kayboluyor, yerine dusmanin govdesini saran kisa bir carpma halkasi.
 */
export type ProjectileEnd = "sink" | "burst";

type PerTier = readonly [number, number, number];

export type WeaponFeel = {
  mass: WeaponMass;
  /** Atis sesi; yoksa sessiz (isinlarin kendi nabzi var, Abarti ates etmiyor). */
  fire?: FireVoiceId;
  /** Atis sesinin aile seviyesine carpan. */
  fireGain: number;
  /** Kulenin geri tepmesi (dunya px, kademe 1-3); 0 yok. */
  recoil: PerTier;
  /** Dusmanin kozmetik itmesi (px). */
  knock: PerTier;
  /** Vurulan dusmanin yerinde durmasi (ms); ekran donmuyor, yalnizca o dusman. */
  hitStopMs: PerTier;
  /** Ezilme: vurus ekseninde basilma orani (kademe 3'te; kademeyle olcekli). */
  squash: number;
  /** Elektrik titremesi (px); Ucube. */
  shiver: PerTier;
  /** Kendi vurusunda kamera sarsintisi (px); 0 yok. Yonetmenin araligi ve ust siniri gecerli. */
  shake: PerTier;
  death: DeathStyle;
  /** Merminin sonu: govdeye gomulme ya da govdenin cevresinde carpma. */
  end: ProjectileEnd;
};

const NONE: PerTier = Object.freeze([0, 0, 0]) as PerTier;
const tiers = (a: number, b: number, c: number): PerTier => Object.freeze([a, b, c]) as PerTier;

const feel = (overrides: Partial<WeaponFeel> & Pick<WeaponFeel, "mass" | "death">): WeaponFeel => Object.freeze({
  end: "sink" as ProjectileEnd,
  fireGain: 1,
  recoil: NONE,
  knock: NONE,
  hitStopMs: NONE,
  squash: 0,
  shiver: NONE,
  shake: NONE,
  ...overrides
});

/**
 * Oynanan kulelerin hissi. Kimlik efekt profilinin kimligi (son ekler profile
 * iniyor: "zeynep-3-kin-projectile" -> "zeynep-3").
 */
export const WEAPON_FEELS: Readonly<Record<string, WeaponFeel>> = Object.freeze({
  // Takipci: hafif ve seri. Kuru tik, kucuk kivilcim; itme yok.
  "warrior-1": feel({ mass: "light", fire: "fireLight", fireGain: 0.85, recoil: tiers(0.6, 0.8, 1), death: "shards" }),
  // Sunucu: topcu. Tok gumbur, kule geri tepiyor; dusman itiliyor, kisa duruyor, eziliyor.
  "warrior-2": feel({
    mass: "heavy", fire: "fireHeavy", recoil: tiers(2, 2.5, 3), knock: tiers(2, 3, 4), hitStopMs: tiers(35, 45, 55),
    squash: 0.12, shake: tiers(1, 1.5, 2), death: "shards", end: "burst"
  }),
  // Izolasyon: kilitlenme. Gudum sesi; dusman kisa bir an tutuluyor, itilmiyor.
  "warrior-3": feel({ mass: "medium", fire: "fireHoming", recoil: tiers(0.8, 1, 1.2), hitStopMs: tiers(25, 30, 35), squash: 0.04, death: "ash" }),
  // Obsesyon: cokus. Ice cekme sesi; agir: itme, duraklama, sarsinti.
  "warrior-4": feel({
    mass: "heavy", fire: "fireCollapse", recoil: tiers(1.2, 1.5, 2), knock: tiers(1.5, 2, 2.5), hitStopMs: tiers(30, 40, 45),
    squash: 0.08, shake: tiers(1, 1.5, 2), death: "implode", end: "burst"
  }),
  // Debug Lazer: surekli isin. Atis sesi yok (nabzi isindikca kalinlasiyor); dusman isiniyor.
  "warrior-5": feel({ mass: "light", death: "ash" }),
  // Ucube: elektrik. Catirti; dusman elektrige tutulmus gibi titriyor.
  "warrior-6": feel({ mass: "medium", fire: "fireBolt", recoil: tiers(1, 1.2, 1.5), knock: tiers(0.5, 1, 1), shiver: tiers(1, 1.2, 1.5), death: "ash", end: "burst" }),
  // Hiza: delici mizrak. Metalik "sink"; deldigi her dusmanda kisa duraklama.
  "zeynep-1": feel({ mass: "medium", fire: "fireLance", recoil: tiers(1, 1.2, 1.5), knock: tiers(0.5, 1, 1.5), hitStopMs: tiers(15, 20, 25), squash: 0.03, death: "shards" }),
  // Gosteri: gosteri isini. Atis sesi yok (isinin akoru); ucundaki dusman kisa duruyor.
  "zeynep-2": feel({ mass: "medium", knock: tiers(0.5, 1, 1.5), hitStopMs: tiers(15, 20, 25), death: "ash" }),
  // Taht: dizilim mizragi. Hiza'dan biraz agir.
  "zeynep-3": feel({ mass: "medium", fire: "fireLance", fireGain: 1.1, recoil: tiers(1.2, 1.5, 1.8), knock: tiers(1, 1.5, 2), hitStopMs: tiers(20, 25, 30), squash: 0.05, death: "shards" }),
  // Kin: dalga. Dalganin kendisi itme: bantta kalan dusmanlar itiliyor, duruyor; sarsinti.
  "zeynep-6": feel({ mass: "heavy", knock: tiers(2, 3, 4), hitStopMs: tiers(30, 40, 50), squash: 0.08, shake: tiers(1, 1.5, 2), death: "shards" }),
  // Abarti ates etmiyor.
  "zeynep-8": feel({ mass: "light", death: "shards" })
});

const derived = new Map<string, WeaponFeel>();

/** Tabloda olmayan kule (taslak karakterler, yeni kule): profilin kutlesinden. */
function deriveFeel(profile: VfxProfile): WeaponFeel {
  const energy = profile.matter === "energy";
  const beam = profile.delivery !== "ballistic" && profile.delivery !== "homing";
  if (profile.heavy) {
    // Eski agir tek vurus (Jackpot, Omer): kademe 2+ itme 1-2 px, kademe 3 sarsinti.
    return feel({
      mass: "heavy", fire: beam ? undefined : "fireHeavy", fireGain: 0.85, recoil: tiers(1.5, 2, 2.5), knock: tiers(0, 1, 2),
      hitStopMs: tiers(20, 30, 40), squash: 0.08, shake: tiers(0, 0, 1.5), death: energy ? "ash" : "shards",
      end: profile.aoe || energy ? "burst" : "sink"
    });
  }
  return feel({
    mass: "light",
    fire: beam ? undefined : energy ? "fireBolt" : "fireLight",
    fireGain: 0.7,
    recoil: beam ? NONE : tiers(0.6, 0.8, 1),
    death: energy ? "ash" : "shards",
    // Alan mermisi (Baransel) govdeye gomulmuyor, cevresinde patliyor.
    end: profile.aoe ? "burst" : "sink"
  });
}

export function getWeaponFeel(definitionId: string | undefined): WeaponFeel {
  const profile = getVfxProfile(definitionId);
  const explicit = WEAPON_FEELS[profile.id];
  if (explicit) return explicit;
  let entry = derived.get(profile.id);
  if (!entry) {
    entry = deriveFeel(profile);
    if (profile.character !== "unknown") derived.set(profile.id, entry);
  }
  return entry;
}

/** Kademe 1-3'un dizini. */
export function getFeelTierIndex(tier: number | undefined): 0 | 1 | 2 {
  return tier !== undefined && tier >= 3 ? 2 : tier !== undefined && tier >= 2 ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Egriler: hepsi saf, kare basina nesne yok                             */
/* ------------------------------------------------------------------ */

/** Gomulmenin suresi ve derinligi (dunya birimi; govdenin yaricapinin yarisi kadar). */
export const SINK_MS = 90;
export const SINK_DEPTH = 7;

/**
 * Gomulmenin bu andaki hali: `depth` ucus yonunde ilerleme (birim), `size`
 * govdenin olcegi (1 -> 0); bitmisse `undefined`. Donen nesne yeniden kullaniliyor.
 */
const SINK_OUT = { depth: 0, size: 1 };
export function getSinkPose(elapsedMs: number) {
  if (!(elapsedMs >= 0) || elapsedMs >= SINK_MS) return undefined;
  const t = elapsedMs / SINK_MS;
  SINK_OUT.depth = SINK_DEPTH * (1 - (1 - t) * (1 - t));
  SINK_OUT.size = 1 - t;
  return SINK_OUT;
}

/** Geri tepmenin omru: hizli vurus (`RECOIL_KICK_MS`), sonra yerine donus. */
export const RECOIL_MS = 120;
export const RECOIL_KICK_MS = 22;

/** Geri tepmenin payi (0-1): hizli geri, yavas donus. */
export function getRecoilAmount(elapsedMs: number) {
  if (!(elapsedMs >= 0) || elapsedMs >= RECOIL_MS) return 0;
  if (elapsedMs < RECOIL_KICK_MS) return elapsedMs / RECOIL_KICK_MS;
  const back = (elapsedMs - RECOIL_KICK_MS) / (RECOIL_MS - RECOIL_KICK_MS);
  return (1 - back) * (1 - back);
}

/** Ezilmenin omru ve egrisi: hemen basiliyor, sonra yerine. */
export const SQUASH_MS = 110;

export function getSquashAmount(elapsedMs: number, amount: number) {
  if (!(elapsedMs >= 0) || elapsedMs >= SQUASH_MS || !(amount > 0)) return 0;
  const t = elapsedMs / SQUASH_MS;
  return amount * (1 - t) * (1 - t);
}

/**
 * Ezilmenin olcegi: vurus ekseni sprite'in yerel x'ine yakinsa x basiliyor,
 * degilse y; dik eksen hacmin bir kismini koruyacak kadar esniyor. Donen dizi
 * yeniden kullaniliyor.
 */
const SQUASH_OUT: [number, number] = [1, 1];
export function getSquashScale(amount: number, hitAngle: number, spriteRotation: number): readonly [number, number] {
  if (!(amount > 0)) {
    SQUASH_OUT[0] = 1;
    SQUASH_OUT[1] = 1;
    return SQUASH_OUT;
  }
  const relative = hitAngle - spriteRotation;
  const alongX = Math.abs(Math.cos(relative)) >= Math.abs(Math.sin(relative));
  const pressed = 1 - amount;
  const stretched = 1 + amount * 0.6;
  SQUASH_OUT[0] = alongX ? pressed : stretched;
  SQUASH_OUT[1] = alongX ? stretched : pressed;
  return SQUASH_OUT;
}

/** Elektrik titremesinin omru; 30 Hz'de yeniden tohumlaniyor, sonumlu. */
export const SHIVER_MS = 140;
const SHIVER_STEP_MS = 33;

/** Titremenin bu karedeki kaymasi (px); `axis` 0 x, 1 y. Deterministik. */
export function getShiverOffset(elapsedMs: number, px: number, seed: number, axis: 0 | 1) {
  if (!(elapsedMs >= 0) || elapsedMs >= SHIVER_MS || !(px > 0)) return 0;
  const step = Math.floor(elapsedMs / SHIVER_STEP_MS);
  const fade = 1 - elapsedMs / SHIVER_MS;
  return (hashNoise(seed * 31 + step * 7 + axis * 13) * 2 - 1) * px * fade;
}

/**
 * Dusmanin duraklamasi: ust sinir ve tekrar araligi. Ayni dusman art arda
 * vurulunca (Hiza saniyede ~6 delik) surekli donmasin: bir duraklama bitince
 * en az `HIT_STOP_GAP_MS` bekleniyor.
 */
export const HIT_STOP_MAX_MS = 60;
export const HIT_STOP_GAP_MS = 160;

/** Bu vurus yeni bir duraklama baslatsin mi. */
export function shouldStartHitStop(lastStopUntil: number | undefined, now: number, ms: number) {
  if (!(ms > 0)) return false;
  return lastStopUntil === undefined || now >= lastStopUntil + HIT_STOP_GAP_MS;
}

/** Kendi kritiginin vurusu: kisa duraklama ve 1 px sarsinti. */
export const CRIT_HIT_STOP_MS = 40;
export const CRIT_SHAKE_PX = 1;

/* ------------------------------------------------------------------ */
/* Isin isisi (Debug Lazer)                                              */
/* ------------------------------------------------------------------ */

/** Nabizlar arasi (190 ms) isinin dusmani birakmis sayilmamasi icin pay. */
const FOCUS_GRACE_MS = 240;
/** Isinin dusmani tam kizartmasi icin gereken sure (ms). */
export const BEAM_HEAT_FULL_MS = 1400;
/** Isin birakilinca isinin sogumasi (ms). */
export const BEAM_HEAT_COOL_MS = 600;
/** Kizgin rengi: koyu turuncu-kirmizi, yere indirilmis (parilti yok). */
export const BEAM_HEAT_COLOR = 0xff6a2a;
/** Kizginligin en fazla karisimi (govdenin kendi rengi okunur kalsin). */
export const BEAM_HEAT_MAX_MIX = 0.55;

/** Isinin dusmanda biriktirdigi isi (0-1): maruz kalma suresi, sonra soguma. */
export function getBeamHeat(exposureMs: number, sinceLastMs: number) {
  const exposure = Math.max(0, Math.min(1, exposureMs / BEAM_HEAT_FULL_MS));
  const cool = Math.max(0, 1 - Math.max(0, sinceLastMs - FOCUS_GRACE_MS) / BEAM_HEAT_COOL_MS);
  return exposure * cool;
}


/** Isinin nabzi isindikca biraz kalinlasiyor (yavas): perde muzikal degil, agirlik. */
export function getBeamPulseRate(heat: number) {
  return 1 - Math.max(0, Math.min(1, heat)) * 0.12;
}

/** Iki rengin karisimi (0 a, 1 b). */
export function mixColor(a: number, b: number, t: number) {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k);
  const g = Math.round(((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k);
  const bl = Math.round((a & 0xff) * (1 - k) + (b & 0xff) * k);
  return (r << 16) | (g << 8) | bl;
}

/* ------------------------------------------------------------------ */
/* Stereo                                                               */
/* ------------------------------------------------------------------ */

/**
 * Sesin sag-sol dagilimi: ekranin solundaki vurus soldan. Genislik sinirli
 * (0.55): kulaklikta da hoparlorde de rahatsiz etmesin; ortadaki ses ortada.
 */
export const STEREO_WIDTH = 0.55;

export function getStereoPan(x: number, viewLeft: number, viewWidth: number) {
  if (!Number.isFinite(x) || !(viewWidth > 0)) return 0;
  const unit = ((x - viewLeft) / viewWidth) * 2 - 1;
  return Math.max(-1, Math.min(1, unit)) * STEREO_WIDTH;
}
