/**
 * Geri bildirim butcesi.
 *
 * 375 px'lik ekranda her efekt kendi kararini verirse dalga ortasi bir
 * gurultu duvarina donuyor: 4 oyunculu 12. dalgada saniyede 7-15 hasar
 * sayisi, 3-6 oldurme, altin ve seviye ayni anda geliyor. Bu modul tek bir
 * yerden "bu olay gorunsun mu, ses cikarsin mi, kamerayi oynatsin mi"
 * sorusunu cevapliyor; oncelik, butce ve hiz siniri hep ayni kuralla.
 *
 * Saf mantik: saat disaridan veriliyor, DOM ve ses yok. Istemcideki
 * yonetmen (apps/web/src/feedback-director.ts) bunu sarip sesi ve kamerayi
 * yurutuyor; testler de dogrudan bunu olcuyor.
 *
 * Oncelikler:
 * - P0: kendi kademe atlaman, ulti sonucu, serin.
 * - P1: kendi kritigin, son vurusun, dalga temizleme, kart acilisi, ulti hazir,
 *   dokunusunun sunucu onayi (alim, takma, onarim, gelisim), Execute infazi ve
 *   kulene baglanan / olgunlasan Sunucu bagi, sonucu degistiren kombo damgasi.
 * - P2: kendi vurusun, altinin, seviyen, yerlestirmen.
 * - P3: takim arkadasinin her olayi.
 *
 * P0/P1 hic dusurulmez, yalnizca birlestirilir: butce doluysa en eski canli
 * gorselin yerini alir, ayni yerde ust uste geliyorsa oncekine eklenir.
 */

export type FeedbackKind =
  | "hit"
  | "crit"
  | "lastHit"
  | "kill"
  | "coin"
  | "level"
  | "tier"
  | "place"
  | "cardFlip"
  | "cardPick"
  | "cardRare"
  | "waveClear"
  | "ultimateReady"
  | "ultimate"
  | "streak"
  | "purchase"
  | "equip"
  | "repair"
  | "upgrade"
  | "jackpot"
  | "reportWin"
  | "reportLoss"
  | "reportRecord"
  | "synergy"
  | "execute"
  | "linkJoined"
  | "linkMatured"
  | "combo"
  | "assist"
  | "champion"
  | "championDown";

export type FeedbackPriority = 0 | 1 | 2 | 3;

/**
 * Olayin ekranda kapladigi yer.
 *
 * "number" yuzen sayilar, "label" dunyadaki kisa etiketler ("SV 5",
 * "JACKPOT"). "none" butceye girmeyen seyler: olum patlamasi CombatVfx'in
 * kendi sinirli tamponunda, kart acilisi zaten bir duraklamada.
 */
export type FeedbackChannel = "number" | "label" | "none";

export type FeedbackKindRule = {
  /** Yerel oyuncunun olayi icin oncelik; takim arkadasininki her zaman P3. */
  ownPriority: 0 | 1 | 2;
  channel: FeedbackChannel;
  /** Gorselin canli sayildigi sure (ms); butce bununla doluyor ve bosaliyor. */
  visualMs: number;
  /** Ayni turden iki yeni gorsel arasi en kisa sure; arada gelen birlestirilir. */
  visualGapMs: number;
  /** Takim arkadasinin olayi gorsel acsin mi (altin acmaz, senin degil). */
  teammateVisual: boolean;
  /** Sesin ses butcesinde kapladigi sure; 0 ise bu turun sesi yok. */
  soundMs: number;
  /** Ayni turden iki ses arasi en kisa sure. */
  soundGapMs: number;
  /** Takim arkadasinin olayi (kisik) ses calsin mi. */
  teammateSound: boolean;
  /** Tam agirlikta kamera sarsintisi (css px); 0 ise hic sarsmaz. */
  shakePx: number;
  /** Titresim suresi (ms); 0 ise hic titretmez. */
  vibrateMs: number;
  /** Cagiran agirlik vermezse kullanilan deger (0-1). */
  defaultWeight: number;
};

/**
 * Tur basina kurallar.
 *
 * Ses ya kayitli ornek (oldurme, kritik; istemcide sfx-samples.ts) ya da
 * sentez; burasi yalnizca butcesini tutuyor. Sarsinti ve titresim yalnizca
 * seyrek ve oyuncunun kendi sectigi anlarda; oldurme ancak agirligi yuksekse
 * (kritik ya da agir dusman) dokunuyor, yoksa dakikada 22-30 kez sallardi.
 */
export const FEEDBACK_KIND_RULES: Readonly<Record<FeedbackKind, FeedbackKindRule>> = {
  hit: { ownPriority: 2, channel: "number", visualMs: 720, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.3 },
  crit: { ownPriority: 1, channel: "number", visualMs: 900, visualGapMs: 0, teammateVisual: true, soundMs: 70, soundGapMs: 90, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Son vurusun sayisi: "kill" olayindan ayri, cunku o ses ve sarsinti tasiyor
  // ve oldurme olayina bagli; bu yalnizca sayi. Sessiz ama P1: kalabalik bir
  // dalgada senin oldurdugun dusmanin sayisi siradan vuruslar icin dusmemeli.
  lastHit: { ownPriority: 1, channel: "number", visualMs: 800, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.3 },
  // Oldurme sesi kayitli bir "portal" sesi (kucuk ~370 ms, agir ~600 ms,
  // sampiyon ~870 ms); yonetmen ornegin gercek suresini veriyor
  // (`FeedbackInput.soundMs`). Buradaki 120 ms yalnizca ornek yokken calan
  // kisa sentez icin. Saniyedeki sayisi istemcide (`KillSoundLimiter`), ayni
  // anda calan sayisi burada (`FEEDBACK_LIMITS.killSounds`).
  kill: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: true, soundMs: 120, soundGapMs: 70, teammateSound: true, shakePx: 1.5, vibrateMs: 12, defaultWeight: 0.3 },
  // Altin sayisi saniyede en fazla 3: arasi birlesiyor. Sesi yok: her
  // oldurmede ikinci bir tini (eskiden kombo ile tirmanan G6-C7) savas sesini
  // maskeliyor ve oyunu bir sekerleme oyununa benzetiyordu. Altin gorunuyor
  // ("+N" ve HUD sayaci), duyulmuyor.
  coin: { ownPriority: 2, channel: "number", visualMs: 800, visualGapMs: 334, teammateVisual: false, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.3 },
  level: { ownPriority: 2, channel: "label", visualMs: 900, visualGapMs: 0, teammateVisual: true, soundMs: 300, soundGapMs: 150, teammateSound: true, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  tier: { ownPriority: 0, channel: "label", visualMs: 1100, visualGapMs: 0, teammateVisual: true, soundMs: 600, soundGapMs: 0, teammateSound: true, shakePx: 3, vibrateMs: 15, defaultWeight: 1 },
  place: { ownPriority: 2, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: true, soundMs: 130, soundGapMs: 80, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  cardFlip: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 60, soundGapMs: 60, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  cardPick: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 160, soundGapMs: 150, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Nadir kartin kendi tinisi: elde nadir varsa bir kez; iki nadir ayni haberi iki kez vermesin.
  cardRare: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 650, soundGapMs: 1000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  waveClear: { ownPriority: 1, channel: "label", visualMs: 1300, visualGapMs: 0, teammateVisual: true, soundMs: 1050, soundGapMs: 1000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  ultimateReady: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 400, soundGapMs: 1000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  ultimate: { ownPriority: 0, channel: "label", visualMs: 1000, visualGapMs: 0, teammateVisual: true, soundMs: 400, soundGapMs: 300, teammateSound: true, shakePx: 2, vibrateMs: 0, defaultWeight: 1 },
  // Serinin kendi ses klibi var; burada yalnizca dokunus ve sarsinti butcesi.
  streak: { ownPriority: 0, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 2, vibrateMs: 15, defaultWeight: 1 },
  // Oyuncunun kendi dokunusunun sunucu onayi: magaza alimi (kasa), esya takma,
  // onarim, ulti gucu ve isci agaci. Sunucu bunlari yalnizca yapana yolluyor,
  // yani takim arkadasi hic duymuyor. P1, cunku dokunusun cevabi kalabalik bir
  // dalgada ses butcesi doldu diye dusmemeli; her biri altin ya da XP harcadigi
  // icin kendiliginden seyrek. Kamera ve titresim yok: harcama bir darbe degil.
  purchase: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 400, soundGapMs: 120, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  equip: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 350, soundGapMs: 150, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  repair: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 470, soundGapMs: 150, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  upgrade: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 550, soundGapMs: 200, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Onur jackpot damgasi ("JACKPOT ×1.9"): kendi kritiginin ustunde kisa bir
  // dunya etiketi. Sayiyi sisirmek yerine zarin buyuk geldigini soyluyor.
  // Sesi yok (kritik citirtisi zaten caliyor), takim arkadasinda hic yok.
  jackpot: { ownPriority: 1, channel: "label", visualMs: 1000, visualGapMs: 0, teammateVisual: false, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Kosu raporunun acilisi: sonuc tinisi ve rekor rozetinin tinisi. Macta bir
  // kez, oyuncunun kendi ekraninda; dalga bittigi icin butcede rakip yok.
  // Aralik uzun: rapor yeniden cizilse de (rapor ekrandan sonra geldi) ikinci
  // kez calmasin. Sarsinti ve titresim yok -- ekran zaten durdu.
  reportWin: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 1100, soundGapMs: 5000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  reportLoss: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 900, soundGapMs: 5000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  reportRecord: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 700, soundGapMs: 5000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Yerlesim sinerjisi damgasi ("Yalnız ×2,25", "Dizilim bozuldu"): kurulum,
  // satis ya da yukseltmeden sonra bir kez. P2 ve sessiz: yerlestirmenin tok
  // sesi zaten caliyor, ikinci bir ses ayni dokunusu iki kez anlatirdi. Takim
  // arkadasininki soluk; etiket butcesi kalabalik bir kurulum aninda dusuruyor.
  synergy: { ownPriority: 2, channel: "label", visualMs: 1300, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Execute (AttackLord): tek dusmani infaz eden beceri. Gorsel dunyada,
  // hedefin ustunde (nisangah kilidi + sert beyaz flas); CombatVfx degil, kendi
  // kisa cizimi, etiket butcesine girmiyor. Ses kisa ve kuru bir kilit tiki ve
  // agir bir darbe -- parilti yok. Oldurme sesi de ayrica caliyor; bu onun
  // onunde, "infaz edildi" anini isaretliyor. Takim arkadasi gorseli soluk
  // goruyor (sahada ne oldugunu bilsin), sesi duymuyor. Sarsinti hafif ve
  // yalnizca atanin ekraninda: kendi sectigi bir an.
  execute: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: true, soundMs: 260, soundGapMs: 120, teammateSound: false, shakePx: 2, vibrateMs: 12, defaultWeight: 1 },
  // Takim arkadasinin Sunucusu kulene baglandi: yalnizca kulenin sahibine
  // gidiyor, yani hep "senin". Bildirim yiginda, kulede nabiz. Arasi uzun:
  // bag dokunusla acilip kapaniyor, ac-kapa ekrani bildirime bogmasin.
  linkJoined: { ownPriority: 1, channel: "none", visualMs: 0, visualGapMs: 2000, teammateVisual: false, soundMs: 320, soundGapMs: 2000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Bag olgunlasti (5 / 10 dalga): kulenin ustunde kisa bir etiket. Dalga
  // sonunda birkac bag ayni anda olgunlasabiliyor; etiket butcesi ve tek
  // tini (hiz siniri) onlari tek ana topluyor.
  linkMatured: { ownPriority: 1, channel: "label", visualMs: 1600, visualGapMs: 0, teammateVisual: true, soundMs: 380, soundGapMs: 1000, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Kombo damgasi ("İŞARET → OVERDRIVE", "Tarama: 3 öldü", "ŞANS PENCERESİ
  // 10 sn"): yalnizca sonucu degistiren uc etkilesim. Hiz siniri ve "ekranda
  // en fazla iki" kurali `ComboStampGate`te (tur + sahip basina 4 sn); burasi
  // etiket butcesi. Sessiz: supurmenin ve sans zarinin kendi sesi/isigi var,
  // damga onlarin ne demek oldugunu yaziyor. Takim arkadasininki soluk.
  combo: { ownPriority: 1, channel: "label", visualMs: 1600, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  // Co-op asisti ("Atakan işaretledi → Zeynep bitirdi"): yalnizca iki tarafin
  // ekraninda, HUD yigininda soluk bir satir. P2, sessiz, sarsintisiz: oldurmenin
  // kendi sesi zaten caldi, bu onun dipnotu. Cift basina 5 sn siniri
  // `AssistToastGate`te; takim arkadasinin asisti hic gorsel acmiyor.
  assist: { ownPriority: 2, channel: "none", visualMs: 0, visualGapMs: 0, teammateVisual: false, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.3 },
  // Sampiyon dogdu ("ŞAMPİYON") ve devrildi ("ŞAMPİYON DEVRİLDİ · 10,6 sn
  // (önceki 12,1)"). Takimin ortak ani, yani herkeste "kendi" olay (P1):
  // kalabalik dalgada etiket butcesi doldu diye dusmemeli. Dogus etiketinin
  // arasi 3 sn: dalgada bir sampiyon var, ama yeniden baglanma ya da ust uste
  // gelen kare ayni haberi iki kez acmasin. Devrilme damgasi ayri tur, cunku
  // hizli bir oldurmede dogus etiketinin araligina takilip dusmemeli; sampiyon
  // basina tek mesaj geldigi icin araligi yok. Ikisi de sessiz ve sarsintisiz:
  // oldurme sesi zaten caliyor, etiket onun ne demek oldugunu yaziyor.
  champion: { ownPriority: 1, channel: "label", visualMs: 1400, visualGapMs: 3000, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 },
  championDown: { ownPriority: 1, channel: "label", visualMs: 2400, visualGapMs: 0, teammateVisual: true, soundMs: 0, soundGapMs: 0, teammateSound: false, shakePx: 0, vibrateMs: 0, defaultWeight: 0.5 }
};

export const FEEDBACK_LIMITS = {
  /** Ekranda ayni anda canli yuzen sayi. */
  numbers: 12,
  /** Takim arkadasinin sayisi yalnizca ekranda bundan az sayi varken cikar. */
  teammateNumbers: 6,
  /** Dunyadaki kisa etiketler ("SV 5", "JACKPOT"). */
  labels: 3,
  teammateLabels: 1,
  /** Ayni anda calan efekt sesi. */
  sounds: 6,
  teammateSounds: 3,
  /**
   * Bunlardan en fazla kaci oldurme sesi. Portal sesi uzun (0.4-0.9 sn);
   * kalabalik dalgada butcenin hepsini tutmasin, kritik ve arayuz onaylarina
   * en az iki yer kalsin. Dolunca yeni oldurme en eski oldurme sesinin yerini
   * aliyor (kendi) ya da dusuyor (takim arkadasi).
   */
  killSounds: 4,
  /** Takim arkadasi sesi kendi turunun araliginin bu kati kadar seyrek. */
  teammateSoundGapFactor: 2,
  /** Kamera sarsintisinin ust siniri (css px). */
  maxShakePx: 3,
  shakeGapMs: 400,
  /** Titresim 10-15 ms: daha uzunu telefonda bildirim gibi hissettiriyor. */
  minVibrateMs: 10,
  maxVibrateMs: 15,
  vibrateGapMs: 300,
  /** Sarsinti ve titresim yalnizca bu agirligin ustunde. */
  impactMinWeight: 0.75,
  /** Ayni yerde bu kadar yakin gelen ayni tur olay oncekine eklenir. */
  mergeRadius: 18,
  mergeWindowMs: 140,
  /** Oldurme perdesinin geri dustugu sessizlik. */
  chainResetMs: 1500
} as const;

/**
 * Perde basamaklari: major pentatonik. Yalnizca arayuz onaylari (gelisim
 * kademesi) kullaniyor.
 *
 * Oldurme ve altin artik perde tirmanmiyor: kombo ile yukselen pentatonik
 * savasi bir sekerleme oyununa ceviriyordu. Oldurme zinciri (`step`) yine
 * sayiliyor; istemci onu perde degil hafif bir seviye artisi olarak
 * kullaniyor. Iki oktavda duruyor, daha yukarisi telefonda cizirti.
 */
const PITCH_STEPS_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;
export const FEEDBACK_MAX_PITCH_STEP = PITCH_STEPS_SEMITONES.length - 1;

export function getFeedbackPitchRatio(step: number) {
  const index = Math.max(0, Math.min(FEEDBACK_MAX_PITCH_STEP, Math.floor(Number.isFinite(step) ? step : 0)));
  return 2 ** (PITCH_STEPS_SEMITONES[index] / 12);
}

export function getFeedbackPriority(kind: FeedbackKind, own: boolean): FeedbackPriority {
  return own ? FEEDBACK_KIND_RULES[kind].ownPriority : 3;
}

/**
 * Hasar sayisinin boyut kovasi: vurusun dusmanin toplam canina (can + kalkan)
 * orani.
 *
 * Istemci sayiyi eskiden sabit bir esikle (100) buyutuyordu. Esik mutlak
 * oldugu icin ilk dalgalarda hic buyuk sayi yoktu, son dalgalarda hepsi
 * buyuktu; "iyi vurus" bilgisini hicbir dalgada tasimadi. Oran ayni vurusu
 * kucuk dusmanda buyuk, dev dusmanda kucuk gosteriyor, cunku gercekte de oyle.
 *
 * Sunucu hesapliyor: hasar olayi dusmanin kimligini tasimiyor ve son vurusta
 * dusman istemciden coktan silinmis oluyor. Kova tek hane, kimlik bir dizi
 * karakter olurdu; olay telde saniyede 15 kez yeniden gidiyor.
 */
export const DAMAGE_SIZE_BUCKET_RATIOS = [0.15, 0.4] as const;

export type DamageSizeBucket = 0 | 1 | 2;

export function getDamageSizeBucket(amount: number, maxEffectiveHp: number): DamageSizeBucket {
  if (!(amount > 0) || !(maxEffectiveHp > 0)) {
    return 0;
  }
  const ratio = amount / maxEffectiveHp;
  if (ratio >= DAMAGE_SIZE_BUCKET_RATIOS[1]) {
    return 2;
  }
  return ratio >= DAMAGE_SIZE_BUCKET_RATIOS[0] ? 1 : 0;
}

/**
 * Hasar olayinin `o` alaninda "sahibi yok".
 *
 * Yuva 0 varsayilan oldugu icin telde yazilmiyor; sahipsiz vurus (satilmis
 * kulenin havadaki mermisi gibi) o yuzden ayri bir deger istiyor. Yoksa
 * 0. yuvadaki oyuncu kimsenin olmayan vurusu kendi vurusu gibi gorurdu.
 */
export const DAMAGE_EVENT_NO_OWNER = -1;

/** Olayi vuranin oyuncu yuvasi; alan yoksa 0. yuva. */
export function getDamageEventOwnerSlot(event: { o?: number }) {
  return event.o ?? 0;
}

export type FeedbackInput = {
  /** Olay yerel oyuncunun mu; takim arkadasininki soluk ve sessiz kalir. */
  own: boolean;
  /** Dunya konumu; ayni yerde ust uste gelenleri birlestirmek icin. */
  x?: number;
  y?: number;
  /** Tur icindeki onem (0-1): agir dusman ya da kritik oldurme 1. */
  weight?: number;
  /** Kombo basamagi; verilmezse oldurmede yonetmen kendisi sayar. Perde degil: oldurme sesi tirmanmiyor. */
  step?: number;
  /** Gorselin gercek omru; kuraldakinden farkliysa. */
  lifetimeMs?: number;
  /** Yalnizca gorsel butce; ses calinmasin. */
  silent?: boolean;
  /**
   * Calacak sesin gercek suresi (ms). Verilirse ses butcesinde kuraldaki
   * `soundMs` yerine bu tutuluyor (ornekli sesler: agir oldurme ~600 ms).
   */
  soundMs?: number;
  /**
   * Ses her durumda calsin (sampiyon oldurmesi): turun araligina takilmiyor,
   * dolu butcede (takim arkadasininki dahil) bir sesin yerini aliyor.
   */
  essential?: boolean;
};

export type FeedbackDecision = {
  kind: FeedbackKind;
  priority: FeedbackPriority;
  own: boolean;
  /** Yeni gorsel ac. */
  show: boolean;
  /**
   * Butce dolu ama olay dusurulemez (P0/P1): yeni gorsel acilirken en eski
   * canli gorsel geri donusturulmeli, sayi butceyi asmasin.
   */
  recycle: boolean;
  /**
   * Yeni gorsel acma, degeri onceki ya da bekleyen gorsele ekle. Ayni yerde
   * ust uste gelen olayda ya da hiz sinirinda. Eklenecek yer yoksa olay
   * dusurulebilir; sayinin kendisi yine dogru kalir.
   */
  merge: boolean;
  /** Ses calinacak (yonetmen caldi). */
  sound: boolean;
  /** Ses butcesi doluydu; en eski ses kisilip yer acildi. */
  stealVoice: boolean;
  /** Kamera sarsintisi (css px); 0 ise yok. */
  shakePx: number;
  /** Titresim (ms); 0 ise yok. */
  vibrateMs: number;
  /** Kullanici hareketi azaltmayi istiyor: pop, zoom ve ucus yerine sabit goster. */
  reducedMotion: boolean;
  /** Kombo basamagi (oldurme zinciri); arayuz onaylarinda perde basamagi. */
  step: number;
};

type LiveVisual = { until: number };
type LastVisual = { at: number; x?: number; y?: number };
type Voice = { until: number; own: boolean; kill: boolean };

export class FeedbackGovernor {
  private reducedMotion = false;
  private vibration = true;
  private readonly live: Record<"number" | "label", LiveVisual[]> = { number: [], label: [] };
  private readonly lastVisual = new Map<string, LastVisual>();
  private readonly lastSound = new Map<string, number>();
  private voices: Voice[] = [];
  private lastShakeAt = Number.NEGATIVE_INFINITY;
  private lastVibrateAt = Number.NEGATIVE_INFINITY;
  private killChain = { count: -1, lastAt: Number.NEGATIVE_INFINITY };

  constructor(options: { reducedMotion?: boolean; vibration?: boolean } = {}) {
    this.reducedMotion = Boolean(options.reducedMotion);
    this.vibration = options.vibration ?? true;
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
  }

  isReducedMotion() {
    return this.reducedMotion;
  }

  setVibration(on: boolean) {
    this.vibration = on;
  }

  isVibrationEnabled() {
    return this.vibration;
  }

  /** Canli gorsel sayisi; tani ve testler icin. */
  liveCount(channel: "number" | "label", now: number) {
    this.pruneLive(channel, now);
    return this.live[channel].length;
  }

  /** Su an calan efekt sesi sayisi. */
  activeVoices(now: number) {
    this.pruneVoices(now);
    return this.voices.length;
  }

  /** Oda degisince eski sayaclar yeni oyunu etkilemesin. */
  reset() {
    this.live.number = [];
    this.live.label = [];
    this.lastVisual.clear();
    this.lastSound.clear();
    this.voices = [];
    this.lastShakeAt = Number.NEGATIVE_INFINITY;
    this.lastVibrateAt = Number.NEGATIVE_INFINITY;
    this.killChain = { count: -1, lastAt: Number.NEGATIVE_INFINITY };
  }

  /**
   * Tek olayin tum karari: gorsel, ses, sarsinti, titresim.
   *
   * Kaydi da yapiyor: "gosterildi" denen olay butceden yer tutuyor. Cagiran
   * karari uygulamazsa butce kisa bir sure bos yere dolu kalir; omur kisa
   * oldugu icin kendiliginden bosaliyor.
   */
  decide(kind: FeedbackKind, input: FeedbackInput, now: number): FeedbackDecision {
    const rule = FEEDBACK_KIND_RULES[kind];
    const own = Boolean(input.own);
    const priority = getFeedbackPriority(kind, own);
    const weight = clampUnit(input.weight ?? rule.defaultWeight);
    const visual = this.admitVisual(kind, rule, priority, own, input, now);
    const sound = input.silent ? { play: false, steal: false } : this.admitSound(kind, own, now, input.soundMs, input.essential);
    const shakePx = rule.shakePx > 0 && weight >= FEEDBACK_LIMITS.impactMinWeight
      ? this.admitShake(own, priority, rule.shakePx * weight, now)
      : 0;
    const vibrateMs = own && rule.vibrateMs > 0 && weight >= FEEDBACK_LIMITS.impactMinWeight
      ? this.admitVibrate(rule.vibrateMs, now)
      : 0;

    return {
      kind,
      priority,
      own,
      show: visual.show,
      recycle: visual.recycle,
      merge: visual.merge,
      sound: sound.play,
      stealVoice: sound.steal,
      shakePx,
      vibrateMs,
      reducedMotion: this.reducedMotion,
      step: this.resolveStep(kind, own, input.step, now)
    };
  }

  /**
   * Yalnizca ses: dogrudan `playSfx` cagrilari da ayni butceden geciyor.
   *
   * `durationMs` sesin gercek suresi (ornekli ses); verilmezse kuraldaki.
   *
   * Takim arkadasinin sesi kendi anahtarinda sayiliyor. Ayni anahtari
   * paylassalar arkadasin oldurmesi senin oldurme sesini hiz sinirina
   * takardi -- baskasinin olayi senin sesini kesmemeli.
   *
   * Yer acarken once en erken bitecek oldurme sesi kisiliyor; oldurme sesi
   * yoksa en erken bitecek ses. Oldurme sesi yalnizca baska bir oldurme
   * sesinin yerini alabiliyor (kritik, infaz ve arayuz onaylari oldurmeye
   * kurban gitmiyor); ayni anda en fazla `killSounds` oldurme sesi caliyor.
   * `essential` (sampiyon) araliga takilmiyor ve gerekirse herhangi bir sesin
   * yerini aliyor. Vurus sesleri ve uyari tonlari bu butcede degil.
   */
  admitSound(kind: FeedbackKind, own: boolean, now: number, durationMs?: number, essential = false): { play: boolean; steal: boolean } {
    const rule = FEEDBACK_KIND_RULES[kind];
    if (rule.soundMs <= 0 || (!own && !rule.teammateSound)) {
      return { play: false, steal: false };
    }

    const key = own ? kind : `${kind}:team`;
    const gap = rule.soundGapMs * (own ? 1 : FEEDBACK_LIMITS.teammateSoundGapFactor);
    const last = this.lastSound.get(key);
    // Hiz sinirinda dusen ses birlesmis sayiliyor: onceki ses bu olayi da anlatiyor.
    if (!essential && last !== undefined && now - last < gap) {
      return { play: false, steal: false };
    }

    this.pruneVoices(now);
    const priority = getFeedbackPriority(kind, own);
    const cap = priority === 3 ? FEEDBACK_LIMITS.teammateSounds : FEEDBACK_LIMITS.sounds;
    const kill = kind === "kill";
    const killFull = kill && this.voices.filter((voice) => voice.kill).length >= FEEDBACK_LIMITS.killSounds;
    let steal = false;
    if (this.voices.length >= cap || killFull) {
      if (priority > 1 && !essential) {
        return { play: false, steal: false };
      }
      // P0/P1 dusmez: en once bitecek (oldurme) sesi kisip yerini aliyor.
      const victim = this.pickVictim(kill && !essential);
      if (victim < 0) {
        return { play: false, steal: false };
      }
      this.voices.splice(victim, 1);
      steal = true;
    }

    const length = durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0 ? durationMs : rule.soundMs;
    this.voices.push({ until: now + length, own, kill });
    this.lastSound.set(key, now);
    return { play: true, steal };
  }

  /**
   * Yeri alinacak ses: en erken bitecek oldurme sesi, yoksa (`killOnly`
   * degilse) en erken bitecek ses; uygun ses yoksa -1. Yonetmen
   * (`fadeOutOldestVoice`) ayni kuralla kisiyor.
   */
  private pickVictim(killOnly: boolean) {
    const anyKill = this.voices.some((voice) => voice.kill);
    if (killOnly && !anyKill) {
      return -1;
    }
    let victim = -1;
    for (let index = 0; index < this.voices.length; index += 1) {
      if (anyKill && !this.voices[index].kill) continue;
      if (victim < 0 || this.voices[index].until < this.voices[victim].until) {
        victim = index;
      }
    }
    return victim;
  }

  /**
   * Kamera sarsintisi.
   *
   * Yalnizca yerel oyuncunun P0/P1 olayinda ve en fazla 3 px. Takim
   * arkadasinin olayi senin kamerani oynatmiyor; hareket azaltma aciksa hic.
   * Ard arda gelen sarsintilar birbirine eklenmiyor, aralikla seyreltiliyor.
   */
  admitShake(own: boolean, priority: FeedbackPriority, px: number, now: number) {
    if (this.reducedMotion || !own || priority > 1 || !(px > 0)) {
      return 0;
    }
    if (now - this.lastShakeAt < FEEDBACK_LIMITS.shakeGapMs) {
      return 0;
    }
    this.lastShakeAt = now;
    return Math.min(FEEDBACK_LIMITS.maxShakePx, px);
  }

  /** Titresim: kullanici kapattiysa hic, acikken 10-15 ms ve seyrek. */
  admitVibrate(ms: number, now: number) {
    if (!this.vibration || !(ms > 0)) {
      return 0;
    }
    if (now - this.lastVibrateAt < FEEDBACK_LIMITS.vibrateGapMs) {
      return 0;
    }
    this.lastVibrateAt = now;
    return Math.round(Math.max(FEEDBACK_LIMITS.minVibrateMs, Math.min(FEEDBACK_LIMITS.maxVibrateMs, ms)));
  }

  private admitVisual(
    kind: FeedbackKind,
    rule: FeedbackKindRule,
    priority: FeedbackPriority,
    own: boolean,
    input: FeedbackInput,
    now: number
  ) {
    if (!own && !rule.teammateVisual) {
      return { show: false, recycle: false, merge: false };
    }
    const key = own ? kind : `${kind}:team`;
    const last = this.lastVisual.get(key);
    if (rule.channel === "none") {
      // Butcesiz turler yine de kendi araligina uyuyor (bildirim yigini gibi):
      // araligi 0 olanlar (oldurme, kart) eskisi gibi hep gecer, kayit da tutulmaz.
      if (rule.visualGapMs <= 0) {
        return { show: true, recycle: false, merge: false };
      }
      if (last && now - last.at < rule.visualGapMs) {
        return { show: false, recycle: false, merge: true };
      }
      this.lastVisual.set(key, { at: now, x: input.x, y: input.y });
      return { show: true, recycle: false, merge: false };
    }

    if (last && now - last.at < FEEDBACK_LIMITS.mergeWindowMs && isNear(last, input)) {
      return { show: false, recycle: false, merge: true };
    }
    if (last && rule.visualGapMs > 0 && now - last.at < rule.visualGapMs) {
      return { show: false, recycle: false, merge: true };
    }

    const channel = rule.channel;
    this.pruneLive(channel, now);
    const live = this.live[channel];
    const cap = channel === "number"
      ? (priority === 3 ? FEEDBACK_LIMITS.teammateNumbers : FEEDBACK_LIMITS.numbers)
      : (priority === 3 ? FEEDBACK_LIMITS.teammateLabels : FEEDBACK_LIMITS.labels);
    const until = now + Math.max(0, input.lifetimeMs ?? rule.visualMs);
    let recycle = false;
    if (live.length >= cap) {
      if (priority > 1) {
        return { show: false, recycle: false, merge: false };
      }
      // Tam butcede bile P0/P1 gorunuyor; en once bitecek gorselin yerini aliyor.
      // P0/P1 hep yerel oyuncunun oldugu icin buradaki sinir tam butce.
      live.sort((a, b) => a.until - b.until);
      live.shift();
      recycle = true;
    }
    live.push({ until });
    this.lastVisual.set(key, { at: now, x: input.x, y: input.y });
    return { show: true, recycle, merge: false };
  }

  /**
   * Kombo basamagi.
   *
   * Cagiran kombo sayiyorsa onunki. Saymiyorsa kendi oldurmelerin icin kisa
   * bir zincir: 1.5 sn sessizlikte basa donuyor. Takim arkadasinin oldurmesi
   * zinciri ilerletmiyor -- senin zincirin senin isin.
   */
  private resolveStep(kind: FeedbackKind, own: boolean, step: number | undefined, now: number) {
    if (step !== undefined && Number.isFinite(step)) {
      return Math.max(0, Math.floor(step));
    }
    if (kind !== "kill" || !own) {
      return 0;
    }
    const chain = this.killChain;
    chain.count = now - chain.lastAt <= FEEDBACK_LIMITS.chainResetMs ? chain.count + 1 : 0;
    chain.lastAt = now;
    return Math.min(FEEDBACK_MAX_PITCH_STEP, chain.count);
  }

  private pruneLive(channel: "number" | "label", now: number) {
    const live = this.live[channel];
    if (live.length > 0 && live.some((entry) => entry.until <= now)) {
      this.live[channel] = live.filter((entry) => entry.until > now);
    }
  }

  private pruneVoices(now: number) {
    if (this.voices.length > 0 && this.voices.some((voice) => voice.until <= now)) {
      this.voices = this.voices.filter((voice) => voice.until > now);
    }
  }
}

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function isNear(last: LastVisual, input: FeedbackInput) {
  if (last.x === undefined || last.y === undefined || input.x === undefined || input.y === undefined) {
    return false;
  }
  return Math.hypot(last.x - input.x, last.y - input.y) <= FEEDBACK_LIMITS.mergeRadius;
}
