import { ULTIMATE_POWER_MAX_LEVEL, getUltimatePowerMultiplier } from "../balance/index.js";
import type { CardTowerProfile } from "../cards/index.js";
import { HIRABLE_WORKER_ROLES, WORKER_ROLE_LABELS, type HirableWorkerRole } from "../logistics/index.js";
import { MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER, canEquipShopItem, getShopItem, type EquipShopItemFailure, type ShopItem } from "../shop/index.js";
import { WORKER_DEVELOPMENT_CELLS } from "../worker-skills.js";
import type { FeedbackKind } from "./index.js";

/**
 * Sunucu onaylarinin karsiligi.
 *
 * Sunucu magaza alimini, esya takmayi, onarimi, ulti gucunu ve isci agaci
 * hucresini yapan oyuncuya zaten onayliyordu; istemcide bunlari dinleyen tek
 * satir yoktu. Altin gidiyor, cekmece yeniden kuruluyor, baska hicbir sey
 * olmuyordu -- harcanan altin bir seye donusmuyormus gibi. Kart secimi ayni
 * sorunu `card:applied` ile cozmustu (toast + kule atimi); bu modul ayni dili
 * bes onaya tasiyor.
 *
 * Saf: mesaj ve istemcinin bildigi baglam (kule adi, takilabilecek kule
 * sayisi) giriyor, toast metni, ses ve atim tarifi cikiyor. Testler metnin
 * sunucunun gercek yuklerinden kuruldugunu dogrudan olcebilsin diye burada.
 *
 * Yalnizca dogruyu soyluyor: sayi sisirilmiyor, ulti carpani sunucunun
 * kullandigi fonksiyondan, "N kulene takilabilir" sunucunun takma kuralindan.
 */

/** Sunucunun `shop:purchased` yuku (MatchRoom `buyShopItem`). */
export type ShopPurchasedMessage = { itemId?: string; price?: number; toInventory?: boolean };
/** `inventory:equipped` (MatchRoom `equipShopItem`). */
export type InventoryEquippedMessage = { itemId?: string; towerId?: string };
/** `inventory:equip-rejected` (MatchRoom `equipShopItem`, `creativeToggleItem`). */
export type InventoryEquipRejectedMessage = { itemId?: string; towerId?: string; reason?: EquipShopItemFailure };
/** `structure:repaired` (MatchRoom `repairStructure`). */
export type StructureRepairedMessage = { towerId?: string; cost?: number };
/** `ultimate:upgraded` (MatchRoom `upgradeUltimatePower`). */
export type UltimateUpgradedMessage = { level?: number; cost?: number };
/** `worker:development-unlocked` (MatchRoom `unlockWorkerDevelopment`). */
export type WorkerDevelopmentUnlockedMessage = { role?: string; skillId?: string; cost?: number };

/**
 * Kule atiminin dili.
 *
 * "equip" guclu atim: esya kuleye kalici baglaniyor, hedefli kartla ayni an.
 * "repair" hafif atim ve kulenin can cubuguyla birlikte oynuyor.
 */
export type ConfirmationPulseStyle = "equip" | "repair";

export type ConfirmationSfxKind = Extract<FeedbackKind, "purchase" | "equip" | "repair" | "upgrade">;

export type ServerConfirmationCue = {
  text: string;
  /** Toast suresi (ms). */
  durationMs: number;
  /** Yonetmenin sesi; yoksa sessiz (ret gibi). */
  sfx?: ConfirmationSfxKind;
  /** Perde basamagi: kademe buyudukce ses yukseliyor. */
  step: number;
  pulse?: { towerId: string; style: ConfirmationPulseStyle };
};

/** Toast'un varsayilan suresi; `showNotice` ile ayni. */
export const CONFIRMATION_NOTICE_MS = 3200;
/**
 * Talimat tasiyan toast daha uzun kaliyor: "bir yol karesi sec" okunup
 * uygulanacak bir sey, yalnizca bir haber degil.
 */
export const CONFIRMATION_INSTRUCTION_MS = 4200;
/** Isci agacinda bir kademe ses perdesinde iki basamak: 3 / 6 / 9 hucreleri buyudukce yukseliyor. */
const WORKER_TIER_PITCH_STEPS = 2;

/**
 * Esyanin su an takilabilecegi kule sayisi.
 *
 * Sunucunun `equipShopItem` kurali (`canEquipShopItem`): uyumlu kule ve bos
 * yuva. Magaza bu sayiyi kartin "N kulene etki eder" satiri gibi soyluyor;
 * sayi sunucunun kabul edecegi takma sayisindan farkli olamaz.
 */
export function countEquippableTowers(
  item: ShopItem,
  towers: ReadonlyArray<{ definition: CardTowerProfile; equippedItemIds?: readonly string[] }>
) {
  let count = 0;
  for (const tower of towers) {
    if (canEquipShopItem(item, tower.definition, tower.equippedItemIds ?? []).ok) count += 1;
  }
  return count;
}

/**
 * Magaza alimi.
 *
 * Kuleye takilan esya artik envantere giriyor ve hicbir seye hemen etki
 * etmiyor; "3 kuleye etki etti" demek yalan olurdu. Dogrusu: nereye gittigi
 * ve kac kuleye takilabilecegi. Bariyer ve zift ayrica bir kare istiyor;
 * sunucu `shop:placement-required`'i onaydan hemen once yolluyor ve tek toast
 * yeri var, o yuzden talimat onayin icine tasiniyor, ezilmiyor.
 */
export function getShopPurchaseCue(
  message: ShopPurchasedMessage,
  context: { equippableTowers?: number; placementPending?: boolean } = {}
): ServerConfirmationCue | undefined {
  const item = message?.itemId ? getShopItem(message.itemId) : undefined;
  if (!item) return undefined;
  if (message.toInventory) {
    const count = Math.max(0, Math.floor(context.equippableTowers ?? 0));
    return {
      text: count > 0
        ? `${item.name} envantere eklendi · ${count} kulene takılabilir`
        : `${item.name} envantere eklendi · şu an takılabileceği kulen yok`,
      durationMs: CONFIRMATION_NOTICE_MS,
      sfx: "purchase",
      step: 0
    };
  }
  if (context.placementPending) {
    return {
      text: `${item.name} alındı · yerleştirmek için bir yol karesi seç`,
      durationMs: CONFIRMATION_INSTRUCTION_MS,
      sfx: "purchase",
      step: 0
    };
  }
  return { text: `${item.name} alındı`, durationMs: CONFIRMATION_NOTICE_MS, sfx: "purchase", step: 0 };
}

/** Esya kuleye takildi: hedefli kartla ayni an, guclu atim. */
export function getInventoryEquipCue(message: InventoryEquippedMessage, towerName?: string): ServerConfirmationCue | undefined {
  const item = message?.itemId ? getShopItem(message.itemId) : undefined;
  if (!item) return undefined;
  const name = towerName?.trim();
  return {
    text: name ? `${item.name} takıldı · ${name}` : `${item.name} kuleye takıldı`,
    durationMs: CONFIRMATION_NOTICE_MS,
    sfx: "equip",
    step: 0,
    pulse: message.towerId ? { towerId: message.towerId, style: "equip" } : undefined
  };
}

/**
 * Takma reddedildi.
 *
 * Istemci esyayi secimden dusurmustu; sessiz bir ret oyuncuya esyayi
 * kaybettigini dusundururdu. Sunucu esyayi envanterde birakiyor, toast da
 * bunu soyluyor. Yaratici modda envanter yok (esya listeden dogrudan
 * takiliyor); orada "envanterde kaldi" yanlis olurdu, ek dusuyor. Ses yok:
 * hata icin ayri bir ses dili yok ve bu an odul degil.
 */
export function getInventoryEquipRejectedCue(
  message: InventoryEquipRejectedMessage,
  context: { creative?: boolean } = {}
): ServerConfirmationCue | undefined {
  const item = message?.itemId ? getShopItem(message.itemId) : undefined;
  if (!item) return undefined;
  const kept = context.creative ? "" : " · envanterde kaldı";
  const text = message.reason === "towerFull"
    ? `Bu kulede boş yuva yok · en fazla ${MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER} eşya`
    : message.reason === "incompatibleTower"
      ? `${item.name} bu kuleye takılamaz${kept}`
      : `${item.name} takılamadı${kept}`;
  return { text, durationMs: CONFIRMATION_NOTICE_MS, step: 0 };
}

/** Onarim: kule tam cana dondu. Bedel toast'ta, cunku altin cipi yalnizca dususu gosteriyor. */
export function getStructureRepairCue(message: StructureRepairedMessage, towerName?: string): ServerConfirmationCue | undefined {
  if (!message?.towerId) return undefined;
  const name = towerName?.trim() || "Yapı";
  const cost = Math.round(Number(message.cost));
  return {
    text: Number.isFinite(cost) && cost > 0 ? `${name} onarıldı (${cost}g)` : `${name} onarıldı`,
    durationMs: CONFIRMATION_NOTICE_MS,
    sfx: "repair",
    step: 0,
    pulse: { towerId: message.towerId, style: "repair" }
  };
}

/**
 * Ulti gucu kademesi.
 *
 * Carpan sunucunun ulti hasarinda kullandigi fonksiyondan, dugmedeki
 * "Ulti Gücü ×N" yazisiyla ayni dilde. Kademe buyudukce ses yukseliyor:
 * yatirimin buyudugu kulakla da duyulsun.
 */
export function getUltimateUpgradeCue(message: UltimateUpgradedMessage): ServerConfirmationCue | undefined {
  const level = Math.floor(Number(message?.level));
  if (!Number.isFinite(level) || level < 1) return undefined;
  const clamped = Math.min(ULTIMATE_POWER_MAX_LEVEL, level);
  return {
    text: `Ulti Gücü ×${getUltimatePowerMultiplier(clamped)}! · kademe ${clamped}/${ULTIMATE_POWER_MAX_LEVEL}`,
    durationMs: CONFIRMATION_NOTICE_MS,
    sfx: "upgrade",
    step: clamped - 1
  };
}

/**
 * Isci agaci hucresi.
 *
 * Hucrenin adi ve kademesi agacin kendi tablosundan, sunucunun kademe
 * hesabiyla ayni (`floor(hucre / 3)`). Bedel XP; altin degil.
 */
export function getWorkerDevelopmentCue(message: WorkerDevelopmentUnlockedMessage): ServerConfirmationCue | undefined {
  const role = message?.role;
  if (!role || !(HIRABLE_WORKER_ROLES as readonly string[]).includes(role)) return undefined;
  const cells = WORKER_DEVELOPMENT_CELLS[role as HirableWorkerRole];
  const cellIndex = cells.findIndex((cell) => cell.options?.some((option) => option.id === message.skillId));
  const skill = cellIndex < 0 ? undefined : cells[cellIndex].options?.find((option) => option.id === message.skillId);
  if (!skill) return undefined;
  const tier = Math.floor(cellIndex / 3);
  const cost = Math.round(Number(message.cost));
  const label = WORKER_ROLE_LABELS[role as HirableWorkerRole];
  return {
    text: Number.isFinite(cost) && cost > 0
      ? `${label} · ${skill.name} açıldı (${cost} XP)`
      : `${label} · ${skill.name} açıldı`,
    durationMs: CONFIRMATION_NOTICE_MS,
    sfx: "upgrade",
    step: tier * WORKER_TIER_PITCH_STEPS
  };
}
