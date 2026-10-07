/**
 * Takimi etkileyen sessiz kararlarin sinyali.
 *
 * Sunucu (warrior-2) takim arkadasinin kulesine baglanabiliyor ve bag 5 ve
 * 10 dalgada olgunlasip o kuleye bonus veriyor; kulenin sahibi ne baglandigini
 * ne de olgunlastigini goruyordu.
 *
 * Burasi tel mesajlarinin sekli ve metinler. Sunucu tek seferlik mesaj
 * yolluyor (her tick'te veri degil).
 */

import { lt } from "../i18n/index.js";

/** `link:joined`: Sunucu senin kulene baglandi. Yalnizca hedef kulenin sahibine. */
export type ServerLinkJoinedMessage = {
  serverTowerId: string;
  targetTowerId: string;
  serverOwnerId: string;
};

/**
 * Bagin olgunlastigi dalga yaslari: 5'te carpma bonusu, 10'da azami can
 * hasari. Sunucunun `getStrongestServerLinkLevel(tower, 5 | 10)` esikleriyle
 * ayni; test ikisini birlikte tutuyor.
 */
export const SERVER_LINK_MATURITY_WAVES = [5, 10] as const;
export type ServerLinkMaturityWave = (typeof SERVER_LINK_MATURITY_WAVES)[number];

/** `link:matured`: bag 5 ya da 10 dalgaya ulasti. Iki sahibe de (ayni kisiyse bir kez). */
export type ServerLinkMaturedMessage = {
  serverTowerId: string;
  targetTowerId: string;
  serverOwnerId: string;
  targetOwnerId: string;
  waves: ServerLinkMaturityWave;
};

/** Yas bir dalgada `previous`tan `next`e cikti; bir olgunluk esigi gecildiyse o. */
export function getServerLinkMaturity(previousAge: number, nextAge: number): ServerLinkMaturityWave | undefined {
  for (const waves of SERVER_LINK_MATURITY_WAVES) {
    if (previousAge < waves && nextAge >= waves) {
      return waves;
    }
  }
  return undefined;
}

/**
 * Ayni Sunucu-kule cifti icin "baglandi" bildirimleri arasi en kisa sure.
 * Bag dokunusla acilip kapaniyor; ac-kapa yapan biri arkadasinin ekranini
 * bildirimle doldurmasin.
 */
export const SERVER_LINK_NOTICE_COOLDOWN_MS = 8000;

/** Iki satirlik takim bildirimi: ust satir kim/ne, alt satir sonucu. */
export type TeamSignalText = { title: string; detail: string };

/** "AttackLord'un Sunucusu" / "kulene bağlandı". */
export function getServerLinkJoinedText(ownerName: string | undefined): TeamSignalText {
  const name = ownerName?.trim();
  return {
    title: name ? lt(`${getTurkishGenitive(name)} Sunucusu`, `${name}'s Server`) : lt("Takım arkadaşının Sunucusu", "Your teammate's Server"),
    detail: lt("kulene bağlandı", "linked to your tower")
  };
}

/**
 * `shop:risky-investment`: bir oyuncu Riskli Yatirim aldi. Takimda dalga
 * basina bir kez alinabiliyor ve bedeli takimin nexusundan; herkese gidiyor,
 * alan kendi bildirimini gostermiyor.
 */
export type RiskyInvestmentMessage = { buyerId: string; nexusCost: number; gold: number };

/** "Atakan Riskli Yatırım aldı" / "nexus −10, +400 altın". */
export function getRiskyInvestmentNoticeText(buyerName: string | undefined, nexusCost: number, gold: number): TeamSignalText {
  const name = buyerName?.trim() || lt("Takım arkadaşın", "Your teammate");
  return {
    title: lt(`${name} Riskli Yatırım aldı`, `${name} bought Risky Investment`),
    detail: lt(`nexus −${nexusCost}, +${gold} altın`, `nexus −${nexusCost}, +${gold} gold`)
  };
}

/** "Bağ olgunlaştı · 5 dalga". */
export function getServerLinkMaturedText(waves: ServerLinkMaturityWave) {
  return lt(`Bağ olgunlaştı · ${waves} dalga`, `Link matured · ${waves} waves`);
}

const BACK_VOWELS = "aıou";
const FRONT_VOWELS = "eiöü";
const GENITIVE_VOWEL: Readonly<Record<string, string>> = { a: "ı", "ı": "ı", o: "u", u: "u", e: "i", i: "i", "ö": "ü", "ü": "ü" };

/**
 * Yabanci yazilan operator adlarinin okunusu. Ek yaziya degil okunusa
 * uyuyor: "Boosty" "busti" okunur, sonu unlu (Boosty'nin); "Bioside"
 * "bayosayd" okunur, sonu unsuz (Bioside'ın). Anahtar adin kucuk harfi.
 */
const NAME_PRONUNCIATIONS: Readonly<Record<string, string>> = {
  zentax: "zentaks",
  attacklord: "ataklord",
  dualitemp: "dualitemp",
  honour: "onur",
  zexceed: "zeksiid",
  boosty: "busti",
  bioside: "bayosayd"
};

/**
 * Ozel adin tamlayan eki: AttackLord'un, ZentaX'ın, DualiTemp'in, Boosty'nin.
 *
 * Unlu uyumu son unluden; adin sonu unluyse araya "n" giriyor. Operator
 * adlari yazilisa degil okunusa gore (NAME_PRONUNCIATIONS). Unlusu olmayan
 * ad (kisaltma) "'in" aliyor; yanlis bir ek bos birakmaktan iyi.
 */
export function getTurkishGenitive(name: string) {
  const trimmed = name.trim();
  const written = trimmed.toLocaleLowerCase("tr");
  const lower = NAME_PRONUNCIATIONS[written] ?? written;
  let vowel = "";
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    const character = lower[index];
    if (BACK_VOWELS.includes(character) || FRONT_VOWELS.includes(character)) {
      vowel = character;
      break;
    }
  }
  const suffixVowel = GENITIVE_VOWEL[vowel] ?? "i";
  const last = lower.at(-1) ?? "";
  const endsWithVowel = BACK_VOWELS.includes(last) || FRONT_VOWELS.includes(last);
  return `${trimmed}'${endsWithVowel ? "n" : ""}${suffixVowel}n`;
}
