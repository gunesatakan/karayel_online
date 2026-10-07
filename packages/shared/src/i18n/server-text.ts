/**
 * Sunucunun istemciye yazdigi sabit metinler ve anahtarlari.
 *
 * Sunucu dili hic degistirmiyor: mesajdaki metin alani (`message`, `reason`,
 * `error`) eskisi gibi Turkce gidiyor, eski istemci ve testler onu okuyor.
 * Yanina kararli bir anahtar (`key`) ve gerekirse sayilar (`params`)
 * ekleniyor; istemci anahtari kendi sozlugunde (`server.<anahtar>`) secili
 * dilde yaziyor, anahtari tanimazsa Turkce metne dusuyor.
 *
 * Metin burada tek yerde duruyor: sunucu Turkceyi buradan okuyor, istemcinin
 * Turkce sozlugu ayni metni tasiyor (testte birebir karsilastiriliyor).
 */

/**
 * Sunucu ayni anda acik oda sinirina ulasinca oda kurma reddinin metni.
 *
 * Istemci hatayi bu metinle taniyor (menude oldugu gibi gosteriyor, oyun
 * cubugunda kisaltiyor); iki taraf ayni sabiti okuyor ki biri degisince
 * digeri sessizce tanimaz hale gelmesin.
 */
export const SERVER_FULL_MESSAGE = "Sunucu dolu, biraz sonra tekrar dene.";

export const SERVER_TEXT = {
  // Oda katilim/kurma redleri: Colyseus istemciye yalnizca hata metnini
  // tasiyor, anahtar yok; istemci metni bu tablodan geri cozuyor.
  "room.full": "Oda dolu.",
  "room.matchOver": "Maç bitti.",
  "room.serverFull": SERVER_FULL_MESSAGE,
  // `room:error`
  "room.serverError": "Sunucu hatası: maç sonlandırıldı.",
  // `lobby:error`
  "lobby.characterTaken": "Bu karakter zaten secildi.",
  "lobby.hostOnlyStart": "Sadece oda kurucusu baslatabilir.",
  "lobby.notAllReady": "Baslatmak icin herkes hazir olmali.",
  // `card:rejected`
  "card.noPendingChoice": "Bekleyen kart seçimi bulunamadı. Bağlantı yenileniyor olabilir.",
  "card.invalidChoice": "Bu kart artık geçerli bir seçenek değil.",
  "card.towerCannotTake": "Seçilen kule bu kartı alamıyor. Başka bir kule seç.",
  // `tower:preview` redleri (`errorKey`)
  "preview.tooSoon": "Biraz sonra tekrar dene.",
  "preview.invalidTarget": "Geçersiz hedef.",
  "preview.cardRejected": "Bu kule kartı alamıyor.",
  "preview.itemRejected": "Bu kule eşyayı alamıyor.",
  "preview.optionGone": "Seçenek artık mevcut değil.",
  // `tower:preview` aciklamasinin sabit kuyrugu ve satir etiketleri (`lineKeys`)
  "preview.disclaimer": "Anlık koşullar gösterilir; koşullu davranışlar ve gelecekte birikecek yükler açıklamaya tabidir.",
  "preview.stat.damage": "Hasar / etki",
  "preview.stat.interval": "Atış / etki aralığı (sn)",
  "preview.stat.range": "Menzil",
  "preview.stat.maxHp": "Azami can",
  "preview.stat.shots": "Mermi / tetikleme",
  "preview.stat.ammo": "Mühimmat / tetikleme",
  "preview.stat.energy": "Enerji / tetikleme",
  "preview.stat.heat": "Isı / tetikleme",
  "preview.stat.cooling": "Soğutma / sn",
  "preview.stat.sustained": "Sürekli tetikleme / sn"
} as const;

export type ServerTextKey = keyof typeof SERVER_TEXT;

/**
 * Onizlemede esya takilamiyor: metin `getInventoryEquipRejectedCue`den,
 * parametreler `{ itemId, reason }`. Istemci ayni fonksiyonu kendi dilinde
 * cagiriyor.
 */
export const PREVIEW_EQUIP_REJECTED_KEY = "preview.equipRejected";

export type ServerTextParams = Readonly<Record<string, string | number>>;

/** Anahtarli mesajin ortak alanlari; metin alaninin adi mesaja gore. */
export type ServerTextRef = { key?: string; params?: ServerTextParams };

/** Colyseus katilim/kurma hatasinin metninden anahtar; tanimadigi metinde `undefined`. */
export function getRoomRejectionKey(message: string): ServerTextKey | undefined {
  if (message.includes(SERVER_FULL_MESSAGE)) return "room.serverFull";
  if (message.includes(SERVER_TEXT["room.full"])) return "room.full";
  if (message.includes(SERVER_TEXT["room.matchOver"])) return "room.matchOver";
  return undefined;
}
