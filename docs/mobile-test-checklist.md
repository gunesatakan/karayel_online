# Gerçek cihaz test listesi

Tarayıcı emülasyonu dokunmatiği, ses kilidini, tam ekranı ve iOS araç çubuğunu tam taklit etmiyor. Yayından önce bu listeyi en az iki gerçek cihazda geç:

- **iPhone, Safari:** iOS 16 ya da üstü.
- **Android, Chrome:** orta segment bir telefon yeterli.

Her maddenin sonuna ✅ / ❌ ve kısa bir not yaz. ❌ için cihaz modelini, tarayıcıyı, dili ve mümkünse ekran görüntüsünü ekle.

## 1. Açılış

- [ ] Oyun 10 saniyeden kısa sürede menüye geliyor.
- [ ] İlk açılışta üstte veri bildirimi çıkıyor.
  - "Ayrıntılar" açılıp kapanıyor.
  - "Tamam" ve "Kapat" bildirimi kaldırıyor.
  - Sayfa yenilenince bildirim bir daha gelmiyor.
- [ ] Menüde yatay kaydırma yok; hiçbir yazı ekran dışına taşmıyor.
- [ ] Alt çubukta TR | EN değiştirilince menü anında o dile geçiyor; yenileyince seçim korunuyor.

## 2. Ses

- [ ] Menüde ilk dokunuştan sonra lobi müziği çalıyor (bekleme odasında da sürüyor); alt çubuktaki ♪ düğmesi onu kapatıp açıyor ve seçim yenilemede korunuyor. Maç başlayınca müzik kısa bir geçişle susuyor; maçta yalnızca efekt sesleri var. iOS'ta sessiz mod anahtarı kapalıyken dene.
- [ ] Uygulama arka plana alınıp geri dönülünce ses geri geliyor.
- [ ] Maç içi menü (☰) panelinde ses ayarları çalışıyor; titreşim yalnızca Android'de görünüyor. Panelin en üstündeki "Menüye dön" onay sorup ana menüye dönüyor.

## 3. Ekran

- [ ] **Android:** ilk dokunuşta tam ekrana geçiyor.
- [ ] **iPhone:** tam ekran yok (Safari desteklemiyor). Araç çubuğu açılıp kapanınca dokunuşlar yine doğru kareye düşüyor; harita kaymıyor.
- [ ] Telefon yatay çevrilince oyun bozulmuyor; dikeye dönünce eski düzene geliyor.
- [ ] Çentikli ekranda (notch, Dynamic Island) HUD ve alt çubuk kesilmiyor.

## 4. Bir maç (Türkçe, sonra İngilizce)

- [ ] **Savaşa Gir:** maç açılıyor, brifing 1/6 görünüyor.
- [ ] **Kule kurma:**
  - Kuleler'i aç ve bir kuleyi parmakla haritaya sürükle.
  - Kule doğru kareye konuyor; kötü bir kareye bırakınca uyarı çıkıyor.
- [ ] **Kule paneli:** bir kuleye dokunup paneli aç.
  - Sayılar okunuyor; paneli büyütüp küçültmek çalışıyor.
  - Bir satıra dokununca döküm açılıyor.
- [ ] **Dalga:** Devam'a bas. Dalga sırasında takılma ya da ani yavaşlama var mı? Varsa hangi dalgada?
- [ ] **Kart seçimi:**
  - Üç kart da tam görünüyor.
  - Hedefli kartta kule seçimi çalışıyor.
- [ ] **Mağaza:**
  - Kaydırma çalışıyor ve "Mağazayı Kapat" görünüyor.
  - Eşya alınıyor; Envanter'den bir kuleye takılıyor.
- [ ] **İşçi:**
  - Envanter › İşçi Al ile işçi alınıyor.
  - Uzmanlık penceresi çıkıyor ve seçilebiliyor.
  - İşçi Ağacı parmakla kaydırılabiliyor.
- [ ] **Brifing:** altı adımın hepsi sırayla geliyor; ATLA çalışıyor.
- [ ] **Maç sonu:** birkaç dalga sonra kaybet ya da kazan; maç raporu tam görünüyor. Ana menü, Tekrar ve Sonraki aşama düğmeleri çalışıyor.
- [ ] **İngilizce maç:** aynı akışı EN ile tekrarla; kesilen ya da taşan yazı var mı?

## 5. Kesintiler

- [ ] Dalga sırasında ekranı kilitle, 10 saniye bekle, aç: maç devam ediyor ya da yeniden bağlanıyor.
- [ ] Dalga sırasında uçak modunu 5 saniye aç, sonra kapat: "yeniden bağlanıyor" görünüp oyun geri geliyor.
- [ ] Başka bir uygulamaya geçip geri dön.
- [ ] Gelen arama ya da bildirim maçı bozmuyor.

## 6. itch.io üzerinden

Gizli bağlantıyla aç.

- [ ] "Run game" düğmesi oyunu başlatıyor.
- [ ] Oyun iframe'e sığıyor; kenarda kesik yok.
- [ ] Mobilde itch'in tam ekranı çalışıyor.
- [ ] İlerleme (aşama, nişan, dil, brifing) yenilemeden sonra duruyor.
  - Safari'de ilerleme itch'e ayrı tutulabilir; Vercel sürümüyle paylaşılmaması normal.
- [ ] **Gizli sekme (Safari gizli gezinme ya da Chrome gizli):** oyun açılıyor ve oynanıyor; ilerlemenin kaydedilmemesi normal.

## 7. Performans

- [ ] 15. dalga ve sonrasında, 10 kuleden fazla varken akıcılık. "i" düğmesindeki FPS değerini not et.
- [ ] Pil tasarrufu modu açıkken oynanabiliyor mu?
- [ ] 20 dakikalık maçtan sonra telefon aşırı ısınıyor mu?

## Hata bildirimi şablonu

```
Cihaz / tarayıcı / dil:
Adım (yukarıdaki madde):
Beklenen:
Olan:
Ekran görüntüsü / video:
```
