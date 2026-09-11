# Savunma kararlarının görünürlüğü ve lojistik

## Oyuncunun gördükleri

- Seçili kule paneli Atakan yalnızlığının açık/kapalı nedenini ve engelleyen komşuları gösterir. Zeynep'te geçerli dizilim ve seviyesini sınırlayan üyeler görünür.
- Hedefli kartı veya takılacak eşyayı bir kuleye bağlamadan önce sunucudan önizleme alınır. Hasar, atış/etki aralığı, menzil, azami can, mühimmat, enerji, ısı ve soğutma önce → sonra biçiminde gösterilir. Koşullu davranışlar açıklamada kalır; henüz kazanılmamış yükler varsayılmaz. Önizleme kuleyi veya envanteri değiştirmez. Uygulama sırasında mevcut sahiplik ve uygunluk kontrolleri tekrar çalışır.
- Her kulenin sevkiyat önceliği Kritik / Normal / Düşük olarak ayarlanabilir. Ayar yalnızca sahibince değiştirilebilir. Kaynak binası yok, depo boş, yol kapalı, taşıyıcı yok, taşıma sırası ve yoldaki yük ayrılır.
- Dalga bittiğinde **Savunma Özeti** düğmesi açılır. Önceki dalganın özeti yeni dalgada da okunabilir ve yeniden bağlanmada geri alınır. Yenilgi de özet üretir.

## Ölçümlerin anlamı

Hasar, gerçekten indirilen can ve kalkanın toplamıdır; fazla vuruş hasarı sayılmaz. Satılmış kulelerin dalga içi kaydı korunur. Onarım, tamir işçisinin gerçekten eklediği canı alıcı kulenin satırına yazar.

Saldırı döngüsü nişan alma ve atış aralığını içerir; kesintisiz isabet süresi değildir. Hedef bekleme, mühimmat bekleme, enerji bekleme, soğuma ve devre dışı süreleri ayrı sınıflardır. Menzilde vurulabilir hedef yoksa eksik mühimmat kaynak beklemesi sayılmaz. Kaynak ve özel destek yapıları destek döngüsü olarak ayrılır. Bu sınıflandırma 250 ms örneklemeli bir işletim göstergesidir; gerçek DPS'nin yerine geçmez. Aura etkinliğini ayrıca temas ölçümü gösterir.

Takip katkısı, aynı vuruşu aynı kritik sonucu, direnç, kalkan ve canla fakat takip işareti olmadan hesaplayıp farkını alır. Katkı son takip yenileyen kuleye yazılır; vuran kulenin hasarına zaten dahildir ve toplam hasara tekrar eklenmez. Birden fazla takipçi aynı işareti sürdürüyorsa bu, katkı paylaşımı için açıkça seçilmiş bir atıf kuralıdır. Aura teması düşman·saniye birimindedir; örtüşebilir ve ilave hasar veya önlenmiş hareket mesafesi anlamına gelmez. Sunucu patlamaları kendi gerçek hasar satırında yer alır.

Ölçümler sunucuda toplanır. Panel açıklaması saniyede en fazla bir kez hesaplanır ve mevcut snapshot/delta akışında taşınır; her vuruş için yeni bir telemetri mesajı üretilmez. Tam özet yalnızca dalga sonunda veya yeniden bağlanma isteğinde oyuncuya gönderilir. Önizleme isteği sahiplik, kart teklifi, envanter ve kapasite doğrulamasından geçer; istemci başına 40 ms hız sınırı vardır.

## Sevkiyat kuralları

Hedef seçiminde öncelik, doluluk, bekleme yaşı, mesafe ve ulaşılabilirlik kullanılır. Aynı kaynak için yoldaki işçilerin yükü ihtiyaçtan düşülür. Yeni yükleme kalan rezerve edilmemiş ihtiyacı aşmaz. 20 oyun saniyesinden uzun bekleyen bir ihtiyaç, normal öncelik sıralamasının önüne geçer. Dolu hedeflerin bekleme yaşı temizlenir.

Öncelik değiştirmek yoldaki teslimatı kesmez. Hedef yıkılırsa, dolar, kapanır veya yolu engellenirse uygun yeni hedef seçilir. Teslim edilmeyen yük işçide kalır; kısmi teslimattan sonra başka alıcı aranır. Uygun alıcı yoksa yük silinmez. Mühimmat türü uyumluluğu korunur. İşçi hâlâ hedef kulenin içine girerek teslim eder; kapalı hedef hücresinin yanından boşaltamaz.

## Karşılaştırma ve sınırlar

`npm run compare:builds` gerçek MatchRoom döngüsünde beş kuruluşu, beş tehdit profilini, üç bütçe kademesini ve üç tohumu çalıştırır: 225 koşu. Altın ve deneyim bütçeleri eşittir; kurulum, gerçek yükseltme maliyetleri ve iki ek taşıyıcı dahildir. **Eşit bütçe, birebir eşit harcama demek değildir:** kalan kaynak ve deneyim harcaması sonuçlarda açıkça tutulur. Hasar/harcanan altın ayrıca raporlanır.

850 / 6.500 / 26.000 altın kademeleri erken yatırım ile 5. ve 10. seviye eşiklerini kapsar. Sunucu bağlantıları sırasıyla 0 / 5 / 10 dalga yaşında kontrollü başlangıç durumlarıdır. Ucube için her eşikte ilk özellik seçilir; bu tüm Ucube dallarının testi değildir. Yerleşimler sabittir, Hiza üçlüsü ve yalnızlık başlangıçta doğrulanır. Savaş sırasında hedef seçimi, kaynak tüketimi, işçiler, düşman hareketi ve hasar gerçek oyundan gelir. Ağ yayını kapalıdır; bu bir ağ yük testi değildir.

`build-comparison.md` özet, `build-comparison-results.json` koşu bazında seviyeler, harcamalar, öldürmeler, nexus kaybı, süre, kaynak beklemesi ve hasar verimi içerir. Süre sınırı veya yenilgi, temizlenmiş dalga olarak sunulmaz. Tohumlar, saat ve RNG geri yüklenerek deterministik tekrar testi yapılır.

Mevcut koşularda 6.500 altın kademesinde Hiza, bütün diğer sabit kuruluşlara nexus kaybı ve öldürme ölçütlerinde üstün geldi. 850 ve 26.000 altın kademelerinde böyle tek bir seçenek çıkmadı. Bu nedenle rapor oyunun dengeli olduğu sonucuna varmaz. Sayısal güç/maliyet ayarı yapılmadı: önce alternatif yerleşimler, kalan bütçenin yeniden yatırılması ve farklı Ucube dallarıyla bulgunun doğrulanması gerekir. İnsanların kararları ne kadar tatmin edici bulduğunu otomatik simülasyon ölçemez.
