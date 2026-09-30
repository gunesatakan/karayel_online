import type { CharacterId } from "../index.js";

/**
 * Ulti hazir sinyali ve ulti karnesi.
 *
 * Ulti oyuncunun kendi tetikledigi en buyuk an, ama sessizdi: hazir oldugunda
 * yalnizca bir kenar rengi degisiyordu (dugme de cekmecenin icinde, yani cogu
 * zaman gorunmuyordu), basildiginda 220 ms'lik soluk bir ekran tonu vardi.
 * Sonucu hic soylenmiyordu -- iyi nisanlanmis bir Zeynep sutunu olculen
 * verilerde kotu nisanin 3-4 kati dusman vuruyor ve bunu kimse fark etmiyordu.
 * Takim arkadaslari ise ultiyi hic duymuyordu.
 *
 * Sayilar sunucunun: kac dusmana indi, kac tanesini oldurdu, sutun icin o an
 * en kalabalik sutunun kac dusman yakalayacagi. Hicbir sey sisirilmiyor;
 * derece bu uc gercek sayinin orani. Buradaki kurallar saf ki testler metni ve
 * dereceyi sunucunun gercek yuklerinden dogrudan olcebilsin.
 */

/** Ultinin sonuc turu; karakterden (ve Atakan'in kipinden) cikiyor. */
export type UltimateResultKind =
  | "column"
  | "drones"
  | "repair"
  | "meteor"
  | "lock"
  | "heal"
  | "sympathy"
  | "nightmare"
  | "burst";

/**
 * Sunucunun `ultimate:result` yuku: yalnizca ultiyi atana, ulti sonuclaninca.
 *
 * Aninda sonuclanan ultilerde atis aninda; drone ve sureli ultilerde (Kabus,
 * Sempati) etki bitince. Mac basina birkac kez gidiyor, sicak yolda degil.
 */
export type UltimateResultMessage = {
  kind: UltimateResultKind;
  /** Ultinin gercekten indigi vurus (bagisik dusmana vurmak sayilmiyor). */
  hits: number;
  /** Ultinin kendi vurusuyla olen dusman. */
  kills: number;
  /** Yalnizca Zeynep sutunu: atis anindaki en kalabalik sutunun yakalayacagi dusman. */
  best?: number;
  /**
   * Yalnizca Zeynep sutunu: atis aninda secilen sutunda vurulabilecek dusman
   * (`best` ile ayni kural). Isabetten farkliysa gidiyor; zincir olumler
   * (Melis lanet patlamasi) sutundaki komsuyu vurus sirasi gelmeden
   * oldurunce isabet nisandan az kaliyor, derece nisandan okunuyor.
   */
  aim?: number;
  /** Tamir ve can dalgasi: usse gercekten donen can (tavanda kirpilmis). */
  heal?: number;
};

/** `ultimate:cast`: takim arkadaslarina tek satirlik cip icin; atana gitmiyor. */
export type UltimateCastMessage = {
  ownerId: string;
  kind: UltimateResultKind;
  hits: number;
  kills: number;
  heal?: number;
};

/** Karnedeki ultinin adi; karakter kartindaki adlarin kisasi. */
export const ULTIMATE_RESULT_LABELS: Readonly<Record<UltimateResultKind, string>> = {
  column: "SÜTUN",
  drones: "DRONLAR",
  repair: "TAMİR",
  meteor: "METEOR",
  lock: "KİLİT ALAN",
  heal: "CAN DALGASI",
  sympathy: "SEMPATİ",
  nightmare: "GOTİK KABUS",
  burst: "ULTİ"
};

/**
 * Karakterin ultisi hangi sonuc turunu uretiyor.
 *
 * Sunucu raporu bununla aciyor, istemci de atis efektinin seklini bununla
 * seciyor; ikisinin ayri ayri karar vermesi bir gun ayrisirdi.
 */
export function getUltimateResultKind(characterId: CharacterId | string | undefined, mode?: "attack" | "repair"): UltimateResultKind {
  switch (characterId) {
    case "zeynep": return "column";
    case "warrior": return mode === "repair" ? "repair" : "drones";
    case "mage": return "meteor";
    case "tank": return "lock";
    case "healer": return "heal";
    case "onur": return "sympathy";
    case "archer": return "nightmare";
    default: return "burst";
  }
}

/**
 * Sutunun dunya siniri.
 *
 * Sunucunun sutun ultisiyle ayni ifade (`sol = baslangic + sutun * kare`,
 * `sag = sol + kare`): en iyi sutunu sayan kural vurulani sayan kuralla ayni
 * kenarlari kullanmali, yoksa sinirdaki bir dusman bir yerde sayilip obur
 * yerde sayilmaz ve "tam isabet" hic cikmaz.
 */
export function getUltimateColumnSpan(originX: number, gridSize: number, column: number) {
  const left = originX + column * gridSize;
  return { left, right: left + gridSize };
}

/**
 * Atis aninda en kalabalik sutunun yakalayacagi dusman sayisi.
 *
 * `xs` vurulabilecek dusmanlarin x'i (bagisik olan disarida). Sutun basina
 * dusman sayisini sunucunun sol <= x < sag kuraliyla sayiyor; harita disindaki
 * dusman hicbir sutuna girmiyor. Ulti basina bir kez, sutun x dusman kadar.
 */
export function getBestUltimateColumnHits(xs: Iterable<number>, originX: number, gridSize: number, cols: number) {
  const points = [...xs].filter((x) => Number.isFinite(x));
  let best = 0;
  for (let column = 0; column < cols; column += 1) {
    const { left, right } = getUltimateColumnSpan(originX, gridSize, column);
    let count = 0;
    for (const x of points) {
      if (x >= left && x < right) count += 1;
    }
    best = Math.max(best, count);
  }
  return best;
}

/** Tam isabet icin en az bu kadar dusman: tek dusmanli sutunu "mukemmel" saymak ucuz olurdu. */
export const ULTIMATE_PERFECT_MIN_HITS = 3;
/** En iyi sutunun bu oranina ulasan nisan "iyi". */
export const ULTIMATE_GOOD_AIM_RATIO = 0.6;

export type UltimateAimTier = "perfect" | "good" | "neutral";

/**
 * Sutun nisaninin derecesi.
 *
 * En kalabalik sutunu yakaladiysan (ve en az 3 dusman) mukemmel; onun
 * %60'ina ulastiysan iyi; degilse notr -- yalnizca en kalabalik sutunun sayisi,
 * azarlama yok. Sahada vurulacak dusman yoksa derece de yok.
 */
export function getUltimateAimTier(hits: number, best: number | undefined): UltimateAimTier | undefined {
  const target = toCount(best);
  if (target <= 0) {
    return undefined;
  }
  const landed = toCount(hits);
  if (landed >= target && landed >= ULTIMATE_PERFECT_MIN_HITS) {
    return "perfect";
  }
  return landed / target >= ULTIMATE_GOOD_AIM_RATIO ? "good" : "neutral";
}

export type UltimateStampText = {
  /** Tek satir: "SÜTUN · 6 isabet · 4 öldü". */
  title: string;
  /** Yalnizca sutun: nisanin derecesi. */
  grade?: { tier: UltimateAimTier; text: string };
};

/**
 * Karnenin metni.
 *
 * Sayilar sunucunun gonderdigi; yuvarlaniyor ama buyutulmuyor. Vurus yoksa
 * "isabet yok" diyor, sifir yazmiyor -- bos bir atis da oldugu gibi soylenmeli.
 */
export function getUltimateStampText(result: UltimateResultMessage): UltimateStampText {
  const label = ULTIMATE_RESULT_LABELS[result.kind] ?? ULTIMATE_RESULT_LABELS.burst;
  const hits = toCount(result.hits);
  const kills = toCount(result.kills);
  const heal = toCount(result.heal);
  const parts = [label];

  if (result.kind === "repair") {
    parts.push(heal > 0 ? `+${heal} üs canı` : "üs canı değişmedi");
  } else if (result.kind === "heal") {
    if (heal > 0) parts.push(`+${heal} üs canı`);
    parts.push(hits > 0 ? `${hits} yavaşladı` : "yavaşlayan yok");
  } else if (result.kind === "sympathy") {
    parts.push(hits > 0 ? `${hits} bağlandı · ${kills} öldü` : "bağa takılan yok");
  } else {
    parts.push(hits > 0 ? `${hits} isabet · ${kills} öldü` : "isabet yok");
  }

  const stamp: UltimateStampText = { title: parts.join(" · ") };
  if (result.kind === "column") {
    // Derece nisandan: secilen sutunda atis anindaki dusman, en kalabalik
    // sutunla ayni kuralla sayilmis. Zincir olumde isabet ondan az kalabiliyor;
    // baslik yine gercek isabet ve olumu soyluyor, hicbir sey sisirilmiyor.
    const aimed = result.aim !== undefined ? toCount(result.aim) : hits;
    const tier = getUltimateAimTier(aimed, result.best);
    const best = toCount(result.best);
    if (tier === "perfect") {
      stamp.grade = { tier, text: "MÜKEMMEL NİŞAN" };
    } else if (tier === "good") {
      stamp.grade = { tier, text: `İyi nişan · ${aimed}/${best}` };
    } else if (tier === "neutral") {
      stamp.grade = { tier, text: `En kalabalık sütun: ${best}` };
    }
  }
  return stamp;
}

/**
 * Takim arkadasinin cipi: "Zeynep ULTİ · 4 öldü".
 *
 * Tek satir ve tek sayi: once olum, yoksa donen can, yoksa isabet. Senin
 * ekranin, sesin ve kameran onun ultisine ait degil; cip kenardan haber veriyor.
 */
export function getUltimateTeamChipText(name: string, cast: Pick<UltimateCastMessage, "kind" | "hits" | "kills" | "heal">) {
  const head = `${name} ULTİ`;
  const kills = toCount(cast.kills);
  const hits = toCount(cast.hits);
  const heal = toCount(cast.heal);
  if (kills > 0) return `${head} · ${kills} öldü`;
  if (heal > 0) return `${head} · +${heal} üs canı`;
  if (hits > 0) {
    const unit = cast.kind === "sympathy" ? "bağlandı" : cast.kind === "heal" ? "yavaşladı" : "isabet";
    return `${head} · ${hits} ${unit}`;
  }
  return head;
}

/** Ulti sarjinin dolu sayildigi deger; sunucu sarji 100'de kirpiyor. */
export const ULTIMATE_READY_CHARGE = 100;
/** Dugmenin hazir atimi: bir kez, bu surede. */
export const ULTIMATE_READY_PULSE_MS = 900;

/**
 * "Ulti hazir" gecisi.
 *
 * Yalnizca dolmamistan dolmusa geciste bir kez. Ilk gozlem gecis sayilmiyor:
 * maca yeni giren ya da sayfayi yenileyip geri donen oyuncunun dugmesi aninda
 * atmasin. Ayni sahnede kopup donen oyuncunun sarji arada dolduysa atiyor --
 * bu onun icin gercekten yeni bir haber. Mac bittiyse (sonuc ekrani) sinyal yok.
 */
export class UltimateReadyWatch {
  private last?: number;

  observe(charge: number, options: { over?: boolean } = {}) {
    const previous = this.last;
    this.last = Number.isFinite(charge) ? charge : 0;
    return previous !== undefined
      && previous < ULTIMATE_READY_CHARGE
      && this.last >= ULTIMATE_READY_CHARGE
      && !options.over;
  }

  reset() {
    this.last = undefined;
  }
}

/** Atisin yerel zoomu: 1.03, 120 ms. Gercek hit-stop degil; oyun saati durmuyor. */
export const ULTIMATE_CAST_ZOOM = 1.03;
export const ULTIMATE_CAST_ZOOM_MS = 120;

/**
 * Zoom carpani: 1'den 1.03'e ve geri, yarim sinus. Sure bitince tam 1 --
 * kameranin kendi yakinlastirmasina hic iz birakmamali.
 */
export function getUltimateCastZoom(elapsedMs: number) {
  if (!(elapsedMs > 0) || elapsedMs >= ULTIMATE_CAST_ZOOM_MS) {
    return 1;
  }
  return 1 + (ULTIMATE_CAST_ZOOM - 1) * Math.sin(Math.PI * (elapsedMs / ULTIMATE_CAST_ZOOM_MS));
}

/** Karakter renginde sok dalgasinin suresi. */
export const ULTIMATE_SHOCKWAVE_MS = 460;

export type UltimateShockwavePose = {
  /** Azami yaricapin (ya da sutun boyunun) orani. */
  reach: number;
  alpha: number;
  /** Cizgi kalinligi carpani; on kenar ilk anda kalin, sonra inceliyor. */
  width: number;
};

/**
 * Sok dalgasinin t anindaki hali (0-1).
 *
 * Hizli cikip yavaslayan bir halka (kubik yumusama), sonerek inceliyor.
 * Hareket azaltmada yayilma yok: dalga son boyunda belirip yerinde soner.
 */
export function getUltimateShockwavePose(t: number, still: boolean): UltimateShockwavePose {
  const time = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
  if (still) {
    return { reach: 1, alpha: 0.6 * (1 - time), width: 1 };
  }
  return {
    reach: 1 - (1 - time) ** 3,
    alpha: (1 - time) ** 1.5,
    width: 1.8 - 1.2 * time
  };
}

/**
 * Karnenin gecikmesi, oynatma gecikmesinin ustune.
 *
 * Sonuc mesaji sahnedeki patlamadan once geliyor (istemci 500 ms geriden
 * oynatiyor). Karne patlama gorundukten kisa sure sonra inmeli: toplamda
 * atistan ~600 ms sonra.
 */
export const ULTIMATE_STAMP_LAG_MS = 100;
/** Karnenin ekranda kaldigi sure. */
export const ULTIMATE_STAMP_MS = 1600;

function toCount(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0;
}
