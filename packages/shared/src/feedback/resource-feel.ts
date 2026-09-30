import { countsAsTower, towerCatalog } from "../characters/index.js";
import { getTowerLevelExpCost, getTowerLevelGoldCost, type TowerSnapshot } from "../index.js";

/**
 * Hissedilen altin ve XP, "yukseltme hazir" isareti.
 *
 * Altinin %86-92'si oldurme basina 17-27 g olarak geliyor ve HUD'daki sayi
 * eskiden yalnizca degisiyordu: ne pop, ne sayim, ne "+N". XP'nin bir kuleyi
 * yukseltmeye yettigi an da (dalga icinde, medyan 10-14 sn) hicbir yerde
 * gorunmuyordu; oyuncu kuleleri tek tek secip dugmeyi okumak zorundaydi.
 *
 * Buradaki kurallar saf -- saat disaridan veriliyor, cizim istemcide (HUD:
 * apps/web/src/game-control-ui.ts, dunya: GameScene) -- ki testler sayimin
 * gercek degeri hic asmadigini ve isaretin sunucunun yukseltme kuralina
 * uydugunu dogrudan olcebilsin.
 */

/** Altin cipinin sayarak yetistigi sure. */
export const GOLD_COUNT_UP_MS = 300;
/** Topluca gelen altinin (dalga bonusu, satis, beceri) cipin yanindaki "+N" suresi. */
export const GOLD_GAIN_LABEL_MS = 800;
/**
 * Dunyadaki altin sayisina eklenemeyen altin bir sonrakine bu kadar sure
 * tasiniyor. Daha eski bir tutari yeni bir oldurmenin ustune yazmak, o
 * oldurmenin getirdiginden fazlasini gostermek olurdu.
 */
export const COIN_CARRY_MS = 1000;
/** "Yukseltme hazir" isareti en fazla bu kadar kulede; fazlasi haritayi kaplardi. */
export const UPGRADE_READY_MARKER_LIMIT = 3;
/**
 * ★ cipinin iki parlamasi arasi en kisa sure.
 *
 * Hazir -> degil -> hazir gecisi gercek bir an (harcadin, yeniden biriktirdin)
 * ama altin bir satin almayla dusup bir oldurmeyle geri geldiginde bu
 * saniyeler icinde olabiliyor; o zaman cip yanip sonen bir lambaya donerdi.
 */
export const UPGRADE_READY_FLASH_GAP_MS = 2000;
/** Sunucunun kule seviye tavani (MatchRoom `MAX_TOWER_LEVEL`). */
const TOWER_MAX_LEVEL = 10;

/**
 * Sayarak artan gosterge.
 *
 * Artis `GOLD_COUNT_UP_MS` icinde yavaslayarak yetisiyor; azalis (harcama)
 * ve ilk deger aninda. Gosterilen deger hicbir zaman gercek degeri asmiyor:
 * oyuncu harcayamayacagi bir altini gormemeli. Sayim surerken gelen yeni artis
 * sayimi o anki gorunen degerden yeniden baslatiyor, geriye sicramiyor.
 */
export class CountUpValue {
  private from = 0;
  private to = 0;
  private startedAt = 0;
  private primed = false;

  constructor(private readonly durationMs = GOLD_COUNT_UP_MS) {}

  /**
   * Yeni gercek deger. Artis ise true: cagiran o zaman nabiz atiyor.
   *
   * Ilk deger artis sayilmiyor -- oyun basinda ya da yeniden baglanmada
   * baslangic altini sifirdan sayilarak "kazanilmis" gibi gorunmemeli.
   */
  set(target: number, now: number) {
    if (!Number.isFinite(target)) {
      return false;
    }
    if (!this.primed) {
      this.primed = true;
      this.snap(target, now);
      return false;
    }
    if (target === this.to) {
      return false;
    }
    const shown = this.valueAt(now);
    if (target <= shown) {
      // Harcama: gosterge beklemeden iner, bir an bile fazlasini gostermez.
      this.snap(target, now);
      return false;
    }
    const rising = target > this.to;
    this.from = shown;
    this.to = target;
    this.startedAt = now;
    return rising;
  }

  /** Gosterilecek deger; `to`yu hicbir kosulda asmaz. */
  valueAt(now: number) {
    if (this.durationMs <= 0 || this.from === this.to) {
      return this.to;
    }
    const progress = (now - this.startedAt) / this.durationMs;
    if (progress >= 1) {
      return this.to;
    }
    const eased = 1 - (1 - Math.max(0, progress)) ** 3;
    return Math.min(this.to, this.from + (this.to - this.from) * eased);
  }

  /** Sayim bitti mi; bittiyse cagiran kare dongusunu durdurabilir. */
  isSettled(now: number) {
    return this.from === this.to || now - this.startedAt >= this.durationMs;
  }

  /** Gercek deger. */
  target() {
    return this.to;
  }

  /** Sayimi bitir: gosterge gercek degere otursun (magaza acildiginda). */
  settle() {
    this.from = this.to;
  }

  /** Yeni mac: bir sonraki deger yine ilk deger sayilsin. */
  reset() {
    this.primed = false;
    this.from = 0;
    this.to = 0;
    this.startedAt = 0;
  }

  private snap(target: number, now: number) {
    this.from = target;
    this.to = target;
    this.startedAt = now;
  }
}

/**
 * Cipin yanindaki "+N": oldurmeyle gelmeyen altin.
 *
 * Oldurme altini dunyada (kendi oldurmende "+18") ve HUD sayiminda zaten
 * goruluyor; ustune bir de cipte "+18" yazmak ayni altini iki kez
 * kutlamak olurdu. Dalga bonusu, faiz, satis iadesi ve beceri altini ise
 * dunyada hicbir yerden cikmiyor; onlar topluca geliyor ve etiket onlar icin.
 *
 * Ayirt etmenin yolu ayni snapshot: oldurme altini ile oldurme olayi ayni
 * sunucu adiminda yaziliyor ve ayni snapshotta geliyor. Yeni oldurme olayi
 * olmayan bir snapshottaki artis topluca gelmistir. Dalga bonusu dalga temiz
 * olduktan 2 sn sonra geldigi icin hicbir oldurmeyle cakismiyor. Nadiren bir
 * beceri altini bir oldurmeyle ayni 60 ms'ye duserse etiket cikmiyor; sayim
 * yine dogru.
 *
 * Sayilar HUD'un gosterdigi gibi tabana yuvarli: etiket cipteki artisla
 * birebir ayni olmali.
 */
export function getLumpGoldGain(previousGold: number | undefined, gold: number, newKillEvents: number) {
  if (previousGold === undefined || !Number.isFinite(previousGold) || !Number.isFinite(gold) || newKillEvents > 0) {
    return 0;
  }
  const gain = Math.floor(gold) - Math.floor(previousGold);
  return gain > 0 ? gain : 0;
}

export type UpgradeReadyTower = Pick<TowerSnapshot, "id" | "ownerId" | "characterId" | "definitionId" | "level">;

export type UpgradeReadyWallet = { gold: number; experience: number };

/**
 * Sonraki seviyesi su an odenebilen en ucuz yerel kuleler.
 *
 * Kural sunucudaki `upgradeTower`in aynisi: kule senin, seviye tavanda degil,
 * XP ve (5. ve 10. seviyede) altin yetiyor. Bedel paylasilan fonksiyonlardan,
 * yani dugmenin yazdigi bedelle ayni.
 *
 * Duvarlar isaret almiyor: kalinlastirma gercek ama ucuz ve cok sayida; en
 * ucuz uc yer hep duvarlara gider ve asil haber -- bir kulenin guclenmesi --
 * gorunmez olurdu. Siralama once XP, sonra altin, sonra kimlik: isaret altin
 * her oldurmede degistiginde kuleler arasinda ziplamasin.
 */
export function getUpgradeReadyTowerIds(
  towers: Iterable<UpgradeReadyTower>,
  ownerId: string | undefined,
  wallet: UpgradeReadyWallet,
  limit = UPGRADE_READY_MARKER_LIMIT
) {
  if (!ownerId || limit <= 0) {
    return [];
  }
  const ready: Array<{ id: string; exp: number; gold: number }> = [];
  for (const tower of towers) {
    if (tower.ownerId !== ownerId || !(tower.level < TOWER_MAX_LEVEL)) {
      continue;
    }
    const definition = towerCatalog[tower.characterId]?.find((candidate) => candidate.id === tower.definitionId);
    if (!definition || !countsAsTower(definition)) {
      continue;
    }
    const exp = getTowerLevelExpCost(definition.cost, tower.level);
    const gold = getTowerLevelGoldCost(definition.cost, tower.level);
    if (wallet.experience >= exp && wallet.gold >= gold) {
      ready.push({ id: tower.id, exp, gold });
    }
  }
  ready.sort((a, b) => a.exp - b.exp || a.gold - b.gold || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ready.slice(0, limit).map((entry) => entry.id);
}
