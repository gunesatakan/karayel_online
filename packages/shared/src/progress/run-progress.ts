import { characters } from "../characters/index.js";
import { lt } from "../i18n/index.js";
import type { CharacterId } from "../index.js";
import { countSignatureBadges, type BadgeBook } from "./badges.js";
import { findNewCosmetics, type CosmeticFacts } from "./cosmetics.js";
import {
  MASTERY_POINTS,
  buildMasteryReportView,
  getMasteryLevel,
  getMasteryPoints,
  type MasteryBook,
  type MasteryGain,
  type MasteryReportView
} from "./mastery.js";

/**
 * Kosunun nisan, ustalik ve kozmetik ozeti: raporun "once -> sonra"si.
 *
 * Saf mantik; depo istemcide (apps/web/src/progress-store.ts). "Once" kosunun
 * basindaki hal olmali: dalga sonunda acilan nisanlar kosu bitmeden depoya
 * yazildi, mac sonunda okunan defter onlari zaten tasiyor. Cagiran onlari
 * cikarip (`withoutBadges`) veriyor; yoksa imza nisaninin puani, onun getirdigi
 * seviye ve actigi kozmetik raporda hic gorunmezdi.
 */

/** Operatorun ustalik puani: ham olgular ve imza nisanlari. */
export function getOperatorMasteryPoints(mastery: MasteryBook, badges: BadgeBook, characterId: CharacterId) {
  return getMasteryPoints(mastery.operators[characterId], countSignatureBadges(badges, characterId));
}

/** Operator basina ustalik seviyesi; kozmetik acilislari bundan. */
export function getMasteryLevels(mastery: MasteryBook, badges: BadgeBook): Partial<Record<CharacterId, number>> {
  const levels: Partial<Record<CharacterId, number>> = {};
  for (const character of characters) {
    levels[character.id] = getMasteryLevel(getOperatorMasteryPoints(mastery, badges, character.id));
  }
  return levels;
}

export function getCosmeticFactsFor(mastery: MasteryBook, badges: BadgeBook): CosmeticFacts {
  return { masteryLevels: getMasteryLevels(mastery, badges), badges };
}

export type RunProgressSummary = {
  mastery?: MasteryReportView;
  /** Bu kosuyla acilan kozmetikler ("Unvan: Hava Muhafızı", "Taç süsü"). */
  cosmetics: string[];
};

export function summarizeRunProgress(input: {
  characterId: CharacterId;
  /** Kosunun basindaki nisanlar: depodaki defter eksi bu kosuda yazilanlar. */
  badgesAtStart: BadgeBook;
  badgesAfter: BadgeBook;
  masteryBefore: MasteryBook;
  masteryAfter: MasteryBook;
  /** Ustalik islendiyse kosunun kazanci; islenmediyse ustalik satiri yok. */
  gained?: MasteryGain;
}): RunProgressSummary {
  const summary: RunProgressSummary = {
    cosmetics: findNewCosmetics(
      getCosmeticFactsFor(input.masteryBefore, input.badgesAtStart),
      getCosmeticFactsFor(input.masteryAfter, input.badgesAfter)
    )
  };
  if (input.gained) {
    const { characterId } = input;
    const operator = characters.find((character) => character.id === characterId)?.displayName ?? lt("Operatör", "Operator");
    const badgeCount = countSignatureBadges(input.badgesAfter, characterId) - countSignatureBadges(input.badgesAtStart, characterId);
    summary.mastery = buildMasteryReportView({
      characterId,
      operator,
      beforePoints: getOperatorMasteryPoints(input.masteryBefore, input.badgesAtStart, characterId),
      afterPoints: getOperatorMasteryPoints(input.masteryAfter, input.badgesAfter, characterId),
      gained: input.gained,
      badgePoints: Math.max(0, badgeCount) * MASTERY_POINTS.signatureBadge
    });
  }
  return summary;
}
