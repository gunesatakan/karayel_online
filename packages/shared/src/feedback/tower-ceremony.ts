import { getTowerTier, type TowerTier } from "../tower-stats/index.js";
import { FEEDBACK_KIND_RULES } from "./index.js";

/**
 * Seviye/kademe toreni ve dokunsal yerlestirme.
 *
 * Seviye atlamak oyuncunun sectigi ve odedigi an, ama 0.4-0.6 sn'lik sessiz
 * bir halkaydi; halka 28 slotluk ortak havuzda oldugu icin kalabalik bir
 * dalgada hic cizilmeyebiliyordu. 5 ve 10 (oyunun en pahali alimlari, insa
 * bedelinin 10 ve 40 kati altin) digerlerinden ayirt edilmiyordu. Kule
 * yerlestirmek ise -- kurulumun en sik bilincli hareketi -- hicbir tepki
 * vermiyordu: sprite yalnizca beliriyordu.
 *
 * Buradaki kurallar saf: saat disaridan veriliyor, cizim istemcide
 * (apps/web/src/vfx/combat-vfx.ts, GameScene) ki testler etiketi, sureleri
 * ve inis egrisini dogrudan olcebilsin.
 *
 * Kademe efektlerinin "buyume yok" kurali (GameScene `playMuzzleFlash`)
 * atislar icin; tek istisnasi bu an. Isik sutunu atisa degil, oyuncunun
 * satin aldigi ana ait ve saniyede bir degil, macta birkac kez geliyor.
 */

/** Kademe toreninin (isik sutunu ve kiymiklar) toplam suresi. */
export const TIER_CEREMONY_MS = 1000;
/** Kuleye dogru donerek akan kiymik sayisi. */
export const TIER_CEREMONY_SHARDS = 12;
/** Sutunun azami boyu, kulenin disk boyunun kati. */
export const TIER_COLUMN_HEIGHT_RATIO = 2.8;
/** Sutunun tam boyuna ulastigi an (surenin orani); sonrasi durus. */
const TIER_COLUMN_RISE_END = 0.18;
/** Sutunun sonmeye ve incelmeye basladigi an. */
const TIER_COLUMN_FADE_START = 0.55;
/** Kiymiklarin yola ciktigi ve kuleye vardigi an. */
const TIER_SHARD_START = 0.04;
const TIER_SHARD_END = 0.62;
/** Kiymigin baslangic ve varis yaricapi (disk boyunun kati): disaridan kulenin kenarina. */
export const TIER_SHARD_START_RADIUS = 1.75;
export const TIER_SHARD_END_RADIUS = 0.42;
/** Yol boyunca donus (radyan): kiymiklar duz degil, girdap gibi iceri akiyor. */
const TIER_SHARD_SPIN = 1.5;

/** Yerlestirme inisi: kule 1.25'ten 1'e 150 ms'de iner (Back.easeOut). */
export const TOWER_LANDING_MS = 150;
export const TOWER_LANDING_FROM_SCALE = 1.25;
/** Inisin toz halkasi; basmadan biraz uzun, yere yayilip soner. */
export const TOWER_LANDING_DUST_MS = 360;
/**
 * Sunucunun `tower:spawn` onayi ile kulenin oynatmada belirmesi arasi en
 * fazla bu kadar olabilir.
 *
 * Istemci 500 ms geriden oynatiyor; pay yavas bir baglantiya karsi. Daha eski
 * bir onay "az once kuruldu" sayilmiyor: sekmeye geri donen oyuncunun onunde
 * dakikalar once kurulmus kuleler inmesin.
 */
export const FRESH_TOWER_SPAWN_TTL_MS = 3000;
/** Ayni anda tutulan onay; 4 oyuncunun bir kurulumda koyabileceginin cok ustu. */
export const FRESH_TOWER_SPAWN_CAPACITY = 32;

export type TowerLevelCeremony = {
  /** "level" siradan seviye, "tier" 5 ya da 10'u gecmek. */
  kind: "level" | "tier";
  level: number;
  tier: TowerTier;
  /** "SV 3" ya da "SV 5 · KADEME 2". */
  label: string;
  /** Etiketin ekranda kaldigi sure; yonetmenin etiket butcesiyle ayni ki ikisi birlikte bosalsin. */
  labelMs: number;
};

/** Seviye etiketi. Kademe yalnizca gecildigi anda yaziliyor; siradan seviyede gurultu olurdu. */
export function getTowerLevelLabel(level: number, crossedTier: boolean) {
  const shown = Math.round(level);
  return crossedTier ? `SV ${shown} · KADEME ${getTowerTier(shown)}` : `SV ${shown}`;
}

/**
 * Bu snapshot'ta kule seviye atladi mi, atladiysa hangi tor.
 *
 * Ilk gorulus (`previous` yok) bir yukseltme degil: mac ortasinda katilan
 * oyuncunun ekraninda butun kuleler birden parlamamali. Dusen seviye
 * (yaratici modda geri alma) de tor degil. Bir snapshot'ta birden fazla
 * seviye gelirse (yaratici mod 1'den 10'a) etiket varilan seviyeyi ve
 * kademeyi soyluyor; aradaki kademeler ayri ayri kutlanmiyor.
 */
export function getTowerLevelCeremony(previous: number | undefined, level: number): TowerLevelCeremony | undefined {
  if (previous === undefined || !Number.isFinite(previous) || !Number.isFinite(level) || level <= previous) {
    return undefined;
  }
  const tier = getTowerTier(level);
  const crossedTier = getTowerTier(previous) !== tier;
  const kind = crossedTier ? "tier" : "level";
  return {
    kind,
    level: Math.round(level),
    tier,
    label: getTowerLevelLabel(level, crossedTier),
    labelMs: FEEDBACK_KIND_RULES[kind].visualMs
  };
}

export type TierCeremonyPose = {
  /** Sutunun boyu, azami boyun orani (0-1). */
  columnHeight: number;
  /** Sutunun genisligi, azami genisligin orani (0-1); sonerken inceliyor. */
  columnWidth: number;
  /** Sutunun opakligi (0-1). */
  columnAlpha: number;
  /** Kiymiklarin yolu: 0 disarida, 1 kulenin kenarinda. */
  shardTravel: number;
  /** Kiymiklarin opakligi (0-1); hareket azaltmada hep 0. */
  shardAlpha: number;
};

/**
 * Torenin tek karesi; `progress` surenin orani (0-1).
 *
 * Sutun ilk %18'de yukselip duruyor, %55'ten sonra incelerek soner.
 * Kiymiklar ayni surede disaridan kuleye akiyor ve hizlanarak variyor --
 * "guc kuleye toplandi". Hareket azaltmada yukselme ve kiymik yok: sutun
 * tam boyuyla belirip yerinde soner, bilgi (kademe, renk, an) kaliyor.
 */
export function getTierCeremonyPose(progress: number, still: boolean): TierCeremonyPose {
  const t = clampUnit(progress);
  const fade = t <= TIER_COLUMN_FADE_START ? 0 : (t - TIER_COLUMN_FADE_START) / (1 - TIER_COLUMN_FADE_START);
  const fadeIn = Math.min(1, t / 0.08);
  const columnAlpha = fadeIn * (1 - fade) ** 1.5;
  if (still) {
    return { columnHeight: 1, columnWidth: 1, columnAlpha, shardTravel: 0, shardAlpha: 0 };
  }

  const rise = Math.min(1, t / TIER_COLUMN_RISE_END);
  const travel = clampUnit((t - TIER_SHARD_START) / (TIER_SHARD_END - TIER_SHARD_START));
  // Belirip varinca sonuyor; vardiktan sonra hic gorunmuyor.
  const shardAlpha = t <= TIER_SHARD_START || travel >= 1
    ? 0
    : Math.min(1, travel / 0.15) * Math.min(1, (1 - travel) / 0.15);
  return {
    columnHeight: 1 - (1 - rise) ** 3,
    columnWidth: 1 - 0.6 * fade,
    columnAlpha,
    // Karesel: yavas baslayip kuleye hizlanarak variyor.
    shardTravel: travel * travel,
    shardAlpha
  };
}

/**
 * `index`. kiymigin yeri: aci (radyan) ve yaricap (disk boyunun kati).
 *
 * Kiymiklar cemberde esit aralikli basliyor; yol boyunca hepsi ayni yone
 * donerken yaricap kulenin kenarina iniyor.
 */
export function getTierShardOrbit(index: number, count: number, travel: number) {
  const t = clampUnit(travel);
  const safeCount = Math.max(1, Math.floor(count));
  return {
    angle: (index / safeCount) * Math.PI * 2 + t * TIER_SHARD_SPIN,
    radius: TIER_SHARD_START_RADIUS + (TIER_SHARD_END_RADIUS - TIER_SHARD_START_RADIUS) * t
  };
}

/**
 * Inis basmasinin olcek carpani; `elapsedMs` inisin baslangicindan.
 *
 * Back.easeOut (Phaser'in egrisiyle ayni, s = 1.70158): kule 1.25'ten iner,
 * 1'in hafifce altina basip (~0.975) yerine oturuyor -- "tok" hissi o kisa
 * basmadan geliyor. Hareket azaltmada hic basma yok.
 */
export function getTowerLandingScale(elapsedMs: number, still = false) {
  if (still || !Number.isFinite(elapsedMs)) {
    return 1;
  }
  const t = clampUnit(elapsedMs / TOWER_LANDING_MS);
  return TOWER_LANDING_FROM_SCALE + (1 - TOWER_LANDING_FROM_SCALE) * backOut(t);
}

/**
 * Sunucunun yeni kule onaylari (`tower:spawn`).
 *
 * Inis ancak sunucu yerlestirmeyi kabul edince oynuyor: reddedilen istek
 * `tower:spawn` yollamiyor, hayalet de zaman asiminda sessizce kalkiyor.
 * Onay oynatmadan once geliyor; kule oynatmada ilk kez cizildiginde onay
 * burada bekliyorsa kule iniyor. `tower:spawn` kuleyi tasimada (Refactor) ve
 * yeniden baglanan oyuncunun kulelerinde de geliyor; o kuleler istemcide
 * zaten cizili oldugu icin cagiran onlari hic yazmiyor.
 */
export class FreshTowerSpawns {
  private readonly spawns = new Map<string, number>();

  constructor(
    private readonly ttlMs = FRESH_TOWER_SPAWN_TTL_MS,
    private readonly capacity = FRESH_TOWER_SPAWN_CAPACITY
  ) {}

  get size() {
    return this.spawns.size;
  }

  note(id: string, now: number) {
    this.prune(now);
    // Silip yeniden yazmak sirayi zamana gore tutuyor; `prune` buna dayaniyor.
    this.spawns.delete(id);
    this.spawns.set(id, now);
    while (this.spawns.size > this.capacity) {
      const oldest = this.spawns.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.spawns.delete(oldest);
    }
  }

  /** Tek kullanimlik: ayni kule ikinci kez inmez. Bayat onay yok sayilir. */
  take(id: string, now: number) {
    const at = this.spawns.get(id);
    if (at === undefined) {
      return false;
    }
    this.spawns.delete(id);
    return now - at <= this.ttlMs;
  }

  forget(id: string) {
    this.spawns.delete(id);
  }

  prune(now: number) {
    for (const [id, at] of this.spawns) {
      if (now - at <= this.ttlMs) {
        break;
      }
      this.spawns.delete(id);
    }
  }

  clear() {
    this.spawns.clear();
  }
}

function backOut(t: number) {
  const overshoot = 1.70158;
  const u = t - 1;
  return u * u * ((overshoot + 1) * u + overshoot) + 1;
}

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
