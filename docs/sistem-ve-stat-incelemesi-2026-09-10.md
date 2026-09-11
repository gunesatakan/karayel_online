# Kule, kart, eşya, işçi ve stat incelemesi

> Düzeltme notu: Aşağıdaki metin ilk incelemenin bulgularını korur. Sonraki
> uygulamada hız yığınlarının eksik uygulaması, bonuslu işçi başlangıç canı,
> hız formülleri ve hasar kartı havuzu düzeltildi. Focus etki aralığı istisnası
> ve Ucube'nin özel aralık eğrisi korundu. Takılı hasar eşyalarının çift sayılması
> da giderildi. 15 yeni regresyon testiyle 863 test ve TypeScript kontrolleri
> başarılı. Güncel hesap sözleşmesi `docs/kart-sistemi.md` içindedir.

Tarih: 10 Eylül 2026. Değerlendirme mevcut kaynak koduna, mevcut testlere ve derlenmiş gerçek `MatchRoom` üzerinde yapılan ek kontrollere dayanır. Oyun kodu değiştirilmedi. İnsan oyuncularla denge testi ve tarayıcı üzerinden oynanış testi yapılmadı.

## Genel değerlendirme

Stat altyapısına mühendislik değerlendirmem **6,5/10**. Ortak veri dili, sunucu otoritesi, ayrılmış savaş bileşenleri ve entegrasyon testleri güçlü. Ancak ortak motor ile karaktere özel yürütme yolları tam birleşmemiş. Bir kartın veride tanımlanması, ilgili bütün kulelerde etkisinin uygulanacağını henüz garanti etmiyor.

Bu puan ölçülmüş bir performans metriği değildir; doğruluk, tutarlılık, bakım maliyeti ve test güvencesinin birlikte değerlendirilmesidir. Oyun dengesi için ayrı bir sayısal kalite puanı vermek mevcut verilerle güvenilir olmaz.

Doğrulama: `npm test` **848/848 başarılı**, atlanan test yok. `npm run typecheck` başarılı. Buna rağmen aşağıdaki ek kontroller kapsam dışında kalan sorunlar buldu.

## Atakan

Karakter kodu `warrior`. Katalogda altı savaş/destek kulesi ve iki lojistik bina var.

| Kule | Güncel işlev ve stratejik karşılığı |
|---|---|
| Takipçi | Fiziksel tek hedef atışı, hava hedefleri ve Takipte işareti. Takımın diğer hasar kaynaklarını besler. |
| Sunucu | İki kuleye bağlantı, bağlı kulelerin menzilinden çıkan hedeflere elektrik atışı. Beş dalgalık bağ çarpma hasarını, on dalgalık bağ vuruş başına azami can hasarını destekler. |
| İzolasyon | Sıfır temel hasar; yalnızken sürekli yavaşlatma aurası. Yerleşim, hasardan daha belirleyici. |
| Obsesyon | Güçlü hedefe odaklanır. Aynı hedefte vuruş başına %20 hasar birikimi, temel motor tanımında 10 yığın sınırı. Hedef değiştirmek yatırımını sıfırlar. |
| Debug Lazer | İşaret öncelikli sık hasar, işaret tüketimi ve işaretli öldürmeye bağlı overdrive. Isı ve ikmal sürekliliği gerçek çıktıyı belirler. |
| Ucube | Ateş sürekliliğine bağlı hız birikimi ve 4/6/8/10. seviyelerde ikili özellik seçimleri. Eski metinlerdeki bütün bonusların dalgayla otomatik açılması artık doğru değil. |
| Cephane Merkezi / Enerji Reaktörü | Savaş kulelerinin kaynak zincirini besler. |

Yalnızlık pasifi güncel kodda hasar ve menzili **1,5 kat**, atış aralığını **1/1,5** yapıyor. Sınırlandırma, hedef bekleme ve kaynak kesintileri yokken yaklaşık **2,25 kat DPS** karşılığı var. Komşu kuleler pasifi bozar; duvarlar bozmaz. Sunucu kendisi bonus almaz.

Tasarımın güçlü tarafı, Takipçi–Lazer–Sunucu ilişkisiyle dağıtık yerleşimin farklı kararlar üretmesi. Denge riski, Sunucu'nun vuruş başına azami can hasarının çok sık vuran kaynaklarda büyümesi; bu birleşim yalnızca temel kule DPS tablosuyla değerlendirilemez.

Kaynaklar: `packages/shared/src/characters/atakan/`, `packages/shared/src/characters/common/engine.ts`, `packages/shared/src/index.ts:59`, `apps/server/src/rooms/MatchRoom.ts:10286`.

## Zeynep

Katalogda sekiz aktif tanım var. `zeynep-4` ve `zeynep-5` tanım üretiminin sonunda filtreleniyor; isim listesinde bulunmaları oyunda kullanılabildikleri anlamına gelmiyor.

| Kule | Güncel işlev ve stratejik karşılığı |
|---|---|
| Hiza Emri | Aynı çizgide iki hedefi delen fiziksel atış. Yol doğrultusuna yerleşim önemli. |
| Gösteri Kulesi | Kalabalığı kesen ışık hattı; seyrek ve güçlü atış. Tek hedef DPS, kalabalıktaki değerini anlatmaz. |
| Taht Mührü | Üçlü dizilimin bileşimine göre saldırı biçimi değişir. Hiza, Gösteri, Kin ve ikinci mühür ile farklı sentezler üretir. |
| Kin | Mesafeyle güçlenen koni yavaşlatması; hasar tablosuyla değerlendirilmemeli. |
| Saray Arşivi | Sentezleri güçlendiren, kendi ateşi olmayan yatırım binası. |
| Abartı | Kenara yerleşir ve içinden geçen dost atışlarını değiştirir. Statı kuleye değil atış geometrisine bağlayan güçlü bir tasarım fikri. |
| Cephane Divanı / Enerji Ocağı | Ortak lojistik zincirinin Zeynep karşılıkları. |

İkili veya geçerli üçgen üçlü dizilim bonusu, grubun **en düşük seviyesine** bağlı. Dördüncü bağlantılı kule grubu geçersiz kılabilir. Onuncu seviye ikilide hasar ×1,20 ve aralık ×0,88; üçlüde ×1,45 ve ×0,76. Başka etkiler yokken yaklaşık ×1,36 ve ×1,91 DPS. Düşük seviyelerde bonuslar kademeli azalır.

İtibar ve komut zinciri takımın hız, menzil ve kontrolünü etkiliyor. Böylece Atakan dağıtmayı, Zeynep kontrollü gruplamayı ödüllendiriyor. Karakter kimlikleri belirgin. Buna karşılık Taht Mührü'nün çok sayıda modu, ortak stat uygulamasında istisna üretme riskini artırıyor.

Kaynaklar: `packages/shared/src/characters/zeynep/`, `apps/server/src/rooms/MatchRoom.ts:3534`, `:7575`, `:11617`.

## Kartlar ve eşyalar

Güncel katalog: **113 kart** ve **85 eşya**. Kartların 76'sı global, 12'si hedefli, 25'i etiketli. Eşyaların 15'i global, 70'i kuleye takılıyor. Hedefli kart sınırı kule başına 3, eşya sınırı 5.

Üç ortak etki yolu bulunuyor:

1. `effects`: stat değiştiricileri.
2. `unlocks`: davranış açılması; şu anda 42 kilit.
3. `grants`: saldırı geometrisi, durum etkisi, yığın, aura ve tetikleyici eklenmesi.

Bu ayrım başarılı: içerik sadece farklı büyüklükte hasar bonuslarından oluşmuyor. Isı, performans kolu, ikmal, tamir penceresi, kritik, direnç ve ekonomi arasında seçimler sunuyor. Ortak `CardScope` ve eşya uygunluk kontrolleri, kapsam yönetimini büyük ölçüde merkezileştiriyor.

Motor eklentileri nesil sayacıyla önbelleğe alınıyor. Temel yığın kimliklerinin grant tarafından ezilmemesi de karakter mekaniklerini koruyor. Ancak bu güvence statın son tüketildiği yürütme dalına kadar tamamlanmış değil.

Kaynaklar: `packages/shared/src/cards/index.ts`, `packages/shared/src/shop/index.ts`, `packages/shared/src/grants/index.ts`, `apps/server/src/rooms/MatchRoom.ts:10038`.

## İşçiler

Oyuncu dört temel rolle başlıyor: kristal toplama, enerji taşıma, mühimmat hammaddesi toplama ve mühimmat taşıma. Tamirci ayrıca alınabiliyor. Zincir; düğüm → depo/üretim binası → kule olarak çalışıyor. Enerji sevkiyatında yetersiz enerjili mühimmat fabrikasına öncelik verilmesi zincirin kilitlenmesini önlemeye yardımcı oluyor.

Taban toplama süresi 10.667 simülasyon ms (yarılamanın ardından 1,5 kat geri çekildi; ilk tabanın %75'i); kapasiteler enerji/kristalde 9, mühimmat taşımada 3, hammaddede 1,5. Normal işçinin canı 60; tamirci simülasyon saniyesi başına 4,5 can onarıyor. Ölüm yükü kaybettiriyor ve 20 saniyelik yeniden doğma beklemesi oluşturuyor. Kurulum evresi kadroyu ve canları tamamlıyor.

İşçiler yapı ve duvarları dikkate alan yol araması kullanıyor; yasak hücre ve teslimat erişimi kuralları mevcut. İşçi kapasitesi/toplama/hareket bonusları ile oyuncuya ait can/tamir bonuslarının ayrılması doğru bir sahiplik kararı.

Gelişmiş işçi fiyatı normalin dört katı; kapasite, toplama hızı, yürüme hızı ve canı üç kat. Buradaki açıklama matematiğine dikkat: kapasite ×3 ve sefer süresi yaklaşık ÷3 birlikte çalışırsa, tıkanmayan bir toplama hattında teorik debi **×9'a yaklaşabilir**. Dolayısıyla yorumlardaki “üç normal işçi” ifadesi genel bir üretim eşdeğerliği değil. Gerçek çıktı depo sınırına, üretime, yol uzunluğuna ve beklemeye bağlı.

Kaynaklar: `packages/shared/src/logistics/index.ts`, `apps/server/src/rooms/MatchRoom.ts:5163`, `:5602`, `:5878`.

## Doğrulanmış sorunlar ve tutarlılık açıkları

### 1. Genel hız yığını bazı kule dallarında uygulanmıyor — yüksek öncelik

Gerçek oda üzerinde `isinma-turu` kartı eklendi, on `activeSecond` tetiklemesi uygulandı. Motor hız aralığı çarpanını 0,7 olarak çözüyor:

| Kule | Önce → sonra, simülasyon ms |
|---|---:|
| Takipçi | 720 → 720 |
| Obsesyon | 760 → 532 |
| Hiza Emri | 1000 → 700 |
| Taht Mührü | 2350 → 2350 |

`getTowerRawFireInterval` yığın çarpanını hesaplıyor fakat Takipçi ve Taht Mührü dalları sonuçlarına dahil etmiyor. Mühür ölçümü nötr bileşimle yapıldı; aynı dalın sentez modu seçiminden sonraki ortak dönüşünde de çarpan yok. Bu, ortak grant dilinin bütün yürütücülerde aynı uygulanmadığını gösteriyor.

Debug Lazer ve Kin'de de ölçüm değişmedi. Ancak odak/aura kulelerinin etki aralığına ilişkin özel tasarım kuralları bulunduğundan, bunlar için kart uygunluğu ve beklenen davranış ayrıca netleştirilmeli.

Kaynak: `apps/server/src/rooms/MatchRoom.ts:9888`, `:9906`, `:9925`; kart: `packages/shared/src/cards/index.ts:452`.

### 2. Yeni/yeniden doğan işçi can bonusuyla tam can doğmuyor — yüksek öncelik

Oyuncuya +%100 `workerHealth` eklenip işçiler oluşturulduğunda gerçek `hp=60`, çözülen azami can `120` oldu. Oluşturma sırasında `getWorkerBaseMaxHp(worker.advanced)` çağrısına oyuncu kimliği verilmiyor. Hasar alma sırasında doğru azami can okunuyor fakat eksik başlangıç canı doldurulmuyor. Kurulumda mevcut işçilere uygulanan iyileşme bu hatayı bazı senaryolarda gizliyor.

Çözüm yönü: oluşturma/yeniden doğmada oyuncunun çözülmüş azami canını başlangıç canına uygulamak. Teste özellikle can bonusu bulunan yeniden doğma ve yeni işçi alımını eklemek.

Kaynak: `apps/server/src/rooms/MatchRoom.ts:5235`, `:5897`.

### 3. Aynı hız ifadesi iki ayrı matematik kullanıyor — orta öncelik

Normal `fireRate +0,30`, aralığı `1/1,30` yapıyor: gerçekten %30 fazla atış. Yığın motorundaki `fireRate` ise `1-0,30=0,70` aralık yapıyor: yaklaşık **%42,9 fazla atış**. Yığın kartında “atış hızı +%3” yazmasına rağmen on yığının karşılığı %30 değil.

Stat birimi açıklaştırılmalı: `attackSpeedBonus` ile `intervalReduction` ayrı tanımlanmalı veya tek hesap sözleşmesine geçilmeli.

Kaynak: `packages/shared/src/stacks/index.ts:69`, `apps/server/src/rooms/MatchRoom.ts:9867`.

### 4. Hasar bonuslarının tabanı oyuncuya açık değil — orta öncelik

Yalnız Takipçi üzerinde hasar 36 iken +%40 hasar değiştiricisi eklenince 45,6 oluyor; etkin artış **%26,7**. Sebebi karakter çarpanlarının önce toplamsal eşdeğere çevrilmesi, kartın daha sonra aynı temel hasar havuzuna eklenmesi.

Bu kendi başına kesin bir hesap hatası değil; seçilmiş toplama politikası olabilir. Fakat “+%40 hasar”ın mevcut hasarı mı, temel hasarı mı artırdığı görünür değil. Ayrıca bazı ara bonuslar daha sonraki çarpanlardan etkilenirken sonradan eklenen kartlar etkilenmiyor. Sonuçlar işlem sırasına bağımlı.

Kaynak: `packages/shared/src/modifiers/index.ts:143`, `apps/server/src/rooms/MatchRoom.ts:9950`.

### 5. Dokümanlar ve bazı içerik açıklamaları güncel oyunu anlatmıyor — orta öncelik

- `docs/atakan.md`: pasif ×1,12 / ×0,9; güncel kod ×1,5 / ÷1,5 ve menzil bonusu.
- Ucube'nin kule açıklaması ve eski doküman, dalgayla otomatik gelişim diyor; mevcut ilerleme 4/6/8/10 seviyelerinde seçim istiyor.
- `docs/kart-sistemi.md`: kilit sınırı 31; güncel uygulama 53 ve katalogda 42 kilit var.
- Aynı belge simülasyon zafer oranının %5–10 bandında test edildiğini söylüyor; mevcut test yalnızca 0–1 arasında olmasını denetliyor.

Özellikle Ucube açıklaması doğrudan oyuncu kararını yanlış yönlendirebilir. Stat ve seviye tabloları mümkün olduğunca güncel tanımlardan üretilmeli.

## Mimari kalite ve iyileştirme sırası

**Güçlü taraflar:** TypeScript ile sınırlı stat adları; hasar/direnç, aura, yığın, durum, hedefleme ve grant modülleri; sunucu otoritesi; kaynak isimli hasar dökümü; ortak temel kule statları; gerçek oda üzerinden testler. Künye–sunucu eşitliği testleri 1/5/10 seviyelerinde nötr koşulları karşılaştırıyor.

**Zayıf taraflar:** `MatchRoom.ts` 11 bin satırı aşıyor; stat ve karakter kuralları bu sınıfta birikmiş. `Modifier` yalnızca `source/scope/stat/add` taşıyor; birim, işlem türü, sıralama ve her statın alt/üst sınırı tek sözleşmede tanımlı değil. Bazı statlar için kaynak katalogları tekrar tekrar taranıyor; bunun maliyeti bu incelemede profillenmedi. Oyun zamanı ile `Date.now()` tabanlı süreler birlikte kullanılıyor; sürelerin birimi açıkça belirtilmediğinde denge ve deterministik testler zorlaşıyor.

Katalog kapsama testleri değerli fakat bütün kart × kule × durum birleşimlerini kanıtlamıyor. `catalog-coverage` içindeki stat listesi de elle tutuluyor. Simülatör davranışları kaba hasar karşılıklarına dönüştürüyor; bu yüzden gerçek işçi hattı, geometri ve karakter bileşimlerinin dengesi için yeterli kanıt sayılmaz.

Önerilen sıra:

1. Hız yığını ve işçi doğum canı hatalarını kapat; gerçek oda regresyon testleri ekle.
2. Stat birimlerini ve toplama/çarpma sırasını yazılı sözleşmeye bağla. Her stat için başlangıç değeri, kapsam ve sınır tanımla.
3. Kuleye özgü taban davranış seçildikten sonra ortak stat etkilerini tek aşamada uygula. Özel yürütücüler ortak aşamayı atlayamasın.
4. Temel hasar, kart katkısı, karakter katkısı ve etkin sonucu gösteren ortak stat dökümünü genişlet.
5. Mevcut oda testlerini kart × uygun kule × aktif durum matrisiyle genişlet; yalnızca etiket eşleşmesini değil gerçek sonucu doğrula.
6. Ucube başta olmak üzere oyuncu metinlerini yenile; dengeyi gerçek oda senaryolarında ikmal kesintisi, ısı, hedef sayısı ve etkin DPS ile ölç.

Temeli tamamen değiştirmek gerekmiyor. En değerli yatırım, var olan ortak motoru karaktere özel yolların da zorunlu olarak kullandığı hesaplama sınırı haline getirmek.
