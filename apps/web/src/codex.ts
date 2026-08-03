import type { DamageType, HitType } from "@karayel/shared";

/**
 * Player-facing copy for the raw slugs the tower definitions carry.
 * Tower data stores mechanics as ids like "same-target-ramp"; the archive has
 * to explain what that actually does at the table, not echo the slug.
 */
export type CodexEntry = {
  name: string;
  text: string;
};

export const mechanicCodex: Record<string, CodexEntry> = {
  // --- Atakan ---
  "mark:tracking": {
    name: "Takipte İşareti",
    text: "Vurduğu düşmana bir işaret bırakır. İşaret üst üste binebilir ve kule seviyesi yükseldikçe taşıyabileceği yük sayısı artar."
  },
  "team-damage-amp": {
    name: "Takım Hasar Artışı",
    text: "İşaretli düşman sadece bu kuleden değil, sahadaki bütün kulelerden daha fazla hasar alır. Takım oyununda önce işaretlemek gerekir."
  },
  "anti-air-ready": {
    name: "Havaya Ateş",
    text: "Uçan düşmanları da hedefleyebilir. 5, 10, 15 ve 20. dalgalarda hava birimleri geldiği için bu kuleler zorunlu hale gelir."
  },
  "server-link-ready": {
    name: "Sunucu Bağlantısı",
    text: "İki dost kuleye bağlanır ve onların menzilini kendi hedefleme alanı olarak kullanır. Bağ ne kadar uzun sürerse o kadar güçlenir."
  },
  "electric-burst": {
    name: "Elektrik Topu",
    text: "Hedefe çarptığında küçük bir alanda elektrik hasarı patlatır. Meka ırkı elektriğe zayıftır."
  },
  slow: {
    name: "Yavaşlatma",
    text: "Vurduğu düşmanın hareket hızını süreli olarak düşürür. Koşucular yavaşlatmaya dirençlidir."
  },
  "solo-aura": {
    name: "Yalnızlık Aurası",
    text: "Çevresinde başka kule yoksa tek tek atış yapmayı bırakır ve sürekli açık, çok daha güçlü bir alan etkisine geçer."
  },
  "same-target-ramp": {
    name: "Israr",
    text: "Aynı hedefe vurmayı sürdürdükçe her vuruşta hasarı %20 artar. Hedef değişirse birikim sıfırlanır."
  },
  "prioritize-tank": {
    name: "Kalın Hedef Önceliği",
    text: "Menzilindeki en yüksek canlı düşmanı seçer. Israr birikimini boşa harcamamak için hedefini kolay kolay değiştirmez."
  },
  "laser-channel": {
    name: "Odak Lazeri",
    text: "Mermi atmaz, hedefe sürekli ışın bağlar. Vuruşları çok sık ve tek tek çok küçüktür; toplam hasarı süreye yayılır."
  },
  "prioritize-tracking": {
    name: "İşaretli Hedef Önceliği",
    text: "Menzilinde Takipte işaretli bir düşman varsa önce onu vurur."
  },
  "marked-kill-overdrive-ready": {
    name: "Aşırı Yükleme",
    text: "İşaretli bir hedefi öldürdüğünde kısa süreliğine atış hızı iki katına çıkar."
  },
  "wave-growth": {
    name: "Dalga Gelişimi",
    text: "Sahada durduğu sürece tamamlanan her 2 dalgada bir kalıcı güç kazanır. Son eşiği 16. dalgada açılır; geç kurulursa bu birikimi kaçırır."
  },
  "attack-speed-stack": {
    name: "Ritim Birikimi",
    text: "Aralıksız ateş ettikçe atış hızı kademeli artar. Hedefsiz kalıp durursa birikim sıfırlanır."
  },
  overheat: {
    name: "Aşırı Isınma",
    text: "Kesintisiz ateş süresi sınırlıdır. Sınırı dolduran kule bir süre tamamen susar; sürekli hedef beslemek her zaman iyi değildir."
  },

  // --- Zeynep ---
  "pierce-first-target": {
    name: "Delme",
    text: "Mermi ilk düşmanı delip aynı doğrultuda ilerler ve arkasındaki ikinci düşmana da tam hasar verir."
  },
  "showcase-line-blast": {
    name: "Hat Patlaması",
    text: "Tek hedef seçmez. Ateşlediği anda en çok düşmanı kesen doğru parçasını hesaplar ve o hat boyunca patlar."
  },
  "zeynep-synthesis-link": {
    name: "Sentez Bağı",
    text: "Kendi saldırısı yoktur. Üçgen dizilimde yanına gelen iki kulenin tipine göre farklı bir saldırı üretir."
  },
  "mixed-damage": {
    name: "Karışık Hasar",
    text: "Tek bir hasar türü taşımaz; sentezi oluşturan kulelerin hasar türlerini birleştirir. Irk dirençlerine karşı esnektir."
  },
  "mirror-beam": {
    name: "Sekme Işını",
    text: "Harita kenarına çarpan ışın seker ve yoluna devam eder. Dar koridorlarda aynı ışın hattı birden çok kez tarar."
  },
  "passive-synthesis-upgrade": {
    name: "Sentez Yükseltmesi",
    text: "Ateş etmez. Belirli seviyelere ulaştıkça Taht Mührü sentez kombinasyonlarına kalıcı bonus ekler."
  },
  "stacking-combo-buff": {
    name: "Biriken Kombo",
    text: "Sahadaki her kopyası bonusu üst üste bindirir. Tek bir tanesi yatırımı karşılamaz."
  },
  "moving-cone-wave": {
    name: "İlerleyen Koni",
    text: "Anlık vurmaz; yavaş ilerleyen 60 derecelik bir dalga yollar. Dalga yol boyunca temas ettiği herkesi etkiler."
  },
  "distance-scaled-slow": {
    name: "Mesafeli Yavaşlatma",
    text: "Dalgaya uzakta yakalanan düşman, yakında yakalanana göre 3 kata kadar daha güçlü yavaşlar. Menzil sınırı asıl etki bölgesidir."
  },
  "synthesis-combo": {
    name: "Sentez Uyumu",
    text: "Taht Mührü dizilimlerine girerek farklı sentez sonuçları üretebilir."
  },
  "edge-line-placement": {
    name: "Kenar Yerleşimi",
    text: "Kule karesi kaplamaz; karelerin kenarına çizgi olarak yerleşir. Yerleşim alanını harcamadan hatta eklenir."
  },
  "line-pass-through-buff": {
    name: "Geçiş Güçlendirmesi",
    text: "İçinden geçen dost atışlarını değiştirir. Kuleyi değil, atışın izlediği yolu güçlendirir."
  },
  "armor-break": {
    name: "Zırh Kırma",
    text: "Hedefin zırhını süreli olarak düşürür. Zırh düştükçe aynı vuruş daha çok hasar yazar."
  },
  "ray-amplifier": {
    name: "Işın Yükseltici",
    text: "İçinden geçen sentez ışınının rengini koyulaştırır ve deldiği her düşmandan sonrakine daha çok hasar aktarmasını sağlar."
  },

  // --- Melis ---
  "focus-lock": {
    name: "Odak Kilidi",
    text: "Bir hedefe kilitlenir. Onay baskınken hedef menzilden çıksa bile takibi sürer; stres veya dengede kilit kopar."
  },
  "underworld-priority": {
    name: "Ölüler Bağı Önceliği",
    text: "Ölüler Bağı'na bağlı bir düşman menziline girerse ona öncelik verir; infaz eşiğine birlikte daha hızlı iner."
  },
  "shared-focus-damage": {
    name: "Ortak Odak",
    text: "Aynı hedefe kilitlenen her ek Hedefçi hasarı büyütür. İkili üçlü kurulduğunda tek tek toplamlarından fazlasını verir."
  },
  "doubt-fire-rate": {
    name: "Şüphe Hızı",
    text: "Şüphe yüklü hedeflere vururken o hedefe özel atış hızı kazanır: 1 yükte %10, 2 yükte %20, 3 yükte %40."
  },
  "rage-wave-on-escape": {
    name: "Öfke Dalgası",
    text: "Hedeflediği düşmanı menzilinden çıkana kadar öldüremezse öfkelenir ve çevresine iki katı alan hasarı patlatır."
  },
  "kill-trigger-rage": {
    name: "Son Vuruş Dalgası",
    text: "Evrimliyken düz vuruşuyla son vuruşu yaptığında da öfke dalgasını tetikler."
  },
  "shield-break-wave": {
    name: "Kalkan Kırma",
    text: "Öfke dalgası kalkanlı hedefe denk gelirse kalkan katmanına iki kat hasar verir."
  },
  fear: {
    name: "Korku",
    text: "Etkilenen düşman kısa süre geri kaçar. Ezicilerin korkuya direnci vardır."
  },
  "stress-friendly-pause": {
    name: "Dost Ateşi Riski",
    text: "Stres baskınken patlaması kendi alanındaki dost kuleleri de yarım saniye durdurur. Gücün bedeli kontrol kaybıdır."
  },
  "stacking-curse": {
    name: "Biriken Lanet",
    text: "Lanet anında hasar vermez ve sınırsız birikir. Yük ne kadar yüksekse ölüm patlaması o kadar büyük olur."
  },
  "death-burst": {
    name: "Ölüm Patlaması",
    text: "Lanetli düşman öldüğünde biriken yük kadar çevresine psişik hasar patlatır. Asıl hasarı ölen düşman verir."
  },
  "curse-pool": {
    name: "Lanet Göleti",
    text: "Evrimliyken ölen hedefin altında süreli bir gölet bırakır; üstünden geçen düşmanlar da lanet yükü alır."
  },
  "approval-duration": {
    name: "Onay Süresi",
    text: "Onay baskınken lanetin süresi uzar, stres baskınken kısalır."
  },
  "stress-area": {
    name: "Stres Alanı",
    text: "Stres baskınken lanet uygulama alanı genişler; daha çok hedefe daha kısa süre lanet biner."
  },
  "bind-until-death": {
    name: "Ruh Bağı",
    text: "Bir düşmana bağlanır ve hedef ölene ya da nexusa ulaşana kadar bağı bırakmaz."
  },
  "execute-threshold": {
    name: "İnfaz Eşiği",
    text: "Hedefin canı eşiğin altına indiğinde kalan canı ne olursa olsun anında öldürülür. Bağ uzadıkça eşik yükselir."
  },
  "approval-stress-mode": {
    name: "Onay / Stres Modu",
    text: "Kulenin modu seçilebilir. Onay modunda çektiği her düşman +1 onay, stres modunda +1 stres kazandırır."
  },
  "digest-cooldown": {
    name: "Sindirme Süresi",
    text: "Bir infazdan sonra yeni hedefe bağlanana kadar beklemesi gerekir. Kule seviyesi yükseldikçe bu süre kısalır."
  },
  "underworld-pull-scaling": {
    name: "Çekim Birikimi",
    text: "Çektiği düşman sayısı arttıkça infaz gücü büyür; uzun süre ayakta kalan bir Ölüler Bağı katlanarak değerlenir."
  },
  "damage-storage": {
    name: "Hasar Deposu",
    text: "Komşu 8 karedeki Melis kulelerinin verdiği hasarın bir kısmını kendi içinde biriktirir. Çevresi güçlüyse deposu hızlı dolar."
  },
  "delayed-burst": {
    name: "Gecikmeli Patlama",
    text: "Deposu dolduğunda biriken hasarı seviyesine göre 1.10 ile 2.00 kat arası bir çarpanla tek seferde patlatır."
  },
  "approval-exit-target": {
    name: "Onay Hedeflemesi",
    text: "Onay baskınken çıkışa en yakın düşmanı, dengedeyken canı en yüksek düşmanı hedefler."
  },
  "stress-random-target": {
    name: "Stres Hedeflemesi",
    text: "Stres baskınken hedefini rastgele seçer. Daha çok hasar depolar ama nereye patlayacağı garanti değildir."
  },
  "evolution-true-damage": {
    name: "Gerçek Hasar Evrimi",
    text: "Evrimliyken patlamanın bir kısmı zırhı yok sayan gerçek hasara dönüşür."
  },
  "doubt-stacks": {
    name: "Şüphe Yükü",
    text: "Vurduğu düşmana Şüphe yükler. Yükler birikir ve düşmanın kararlarını bozar."
  },
  "stacking-slow": {
    name: "Biriken Yavaşlatma",
    text: "Her Şüphe yükü %10 yavaşlatma ekler. Yükler üst üste bindiği için dalga hatta çakılır."
  },
  hesitation: {
    name: "Duraksama",
    text: "Yeterince şüphe biriken düşman kısa süre tamamen durur ve hiç ilerlemez."
  },
  "fear-conversion": {
    name: "Korku Dönüşümü",
    text: "Korku altındaki bir düşmanda duraksama tetiklenirse etki taraf değiştirmeye dönüşür."
  },
  "temporary-turncoat": {
    name: "Taraf Değiştirme",
    text: "Dönüşen düşman 1 saniye boyunca kendi ırkına saldırır ve arkadan gelenler için fiziksel engel olur."
  },
  "suicide-burst": {
    name: "Son Patlama",
    text: "Taraf değiştiren düşmanın canı %10'un altına inerse kalan canı kadar fiziksel patlama yapar."
  }
};

export const classTypeCodex: Record<string, CodexEntry> = {
  damage: { name: "Hasar", text: "Ana işi düşman öldürmek." },
  control: { name: "Kontrol", text: "Hasardan çok yavaşlatma, korkutma ve durdurma yapar." },
  support: { name: "Destek", text: "Kendi ateş etmez; diğer kuleleri güçlendirir." },
  hybrid: { name: "Karma", text: "Duruma göre hem hasar hem destek görevi görür." }
};

export const damageTypeCodex: Record<DamageType, CodexEntry> = {
  physical: { name: "Fiziksel", text: "Golemler zayıf, 4. boyut yerlileri dirençlidir." },
  electric: { name: "Elektrik", text: "Mekalar zayıf, düşmüşler dirençlidir." },
  psychic: { name: "Psişik", text: "4. boyut yerlileri zayıf, mekalar dirençlidir." },
  fire: { name: "Ateş", text: "Kutsal koruyucular zayıf, uzay böcekleri dirençlidir." },
  light: { name: "Işık", text: "Düşmüşler zayıf, kutsal koruyucular dirençlidir." },
  cellular: { name: "Hücresel", text: "Uzay böcekleri zayıf, golemler dirençlidir." },
  true: { name: "Gerçek", text: "Zırhı ve dirençleri tamamen yok sayar." },
  none: { name: "Yok", text: "Hasar vermez; sadece etki uygular." }
};

export const hitTypeCodex: Record<HitType, CodexEntry> = {
  projectile: { name: "Mermi", text: "Hedefe doğru ilerleyen atış; yolda vakit kaybeder." },
  impact: { name: "Çarpma", text: "Patlama tipi vuruş. Seviye ile atış hızı değil hasarı büyür." },
  focus: { name: "Odak", text: "Kanal veya lazer; sık ve küçük vuruşlar." },
  aura: { name: "Aura", text: "Alan etkisi; genellikle hedef seçmez." },
  contamination: { name: "Bulaşma", text: "Düşmandan düşmana yayılan etki." },
  curse: { name: "Lanet", text: "Anında hasar vermez, hedefte birikir." },
  wave: { name: "Dalga", text: "Yayılarak ilerleyen etki; yol boyunca temas eder." }
};

/**
 * Some mechanics only exist once the tower has been evolved. The dossier lists
 * evolutions separately, so repeating them under "Mekanik" reads as duplication.
 */
const evolutionGatedMechanics: Record<string, string[]> = {
  "archer-1": ["underworld-priority", "shared-focus-damage", "doubt-fire-rate"],
  "archer-2": ["kill-trigger-rage", "shield-break-wave"],
  "archer-3": ["curse-pool"],
  "archer-5": ["evolution-true-damage"],
  "archer-6": ["fear-conversion", "temporary-turncoat", "suicide-burst"]
};

export function getBaseMechanics(towerId: string, mechanics: readonly string[]): string[] {
  const gated = evolutionGatedMechanics[towerId] ?? [];
  return mechanics.filter((slug) => !gated.includes(slug));
}

export function lookupMechanic(slug: string): CodexEntry {
  return mechanicCodex[slug] ?? { name: prettifySlug(slug), text: "" };
}

function prettifySlug(slug: string) {
  return slug
    .replace(/[:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
