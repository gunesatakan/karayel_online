# Enerji taşıyıcı uzmanlığı

Enerji taşıyıcı satın alındığında kapasitesi veya hızı değil, üç kademeli kalıcı uzmanlığı seçilir. Her kademede iki seçenek vardır; seçim sunucuda işçiye yazılır ve geri alınamaz. Seçim penceresi kapanırsa veya bağlantı koparsa, oda işçide eksik kalan kademeyi yeniden açar.

## Röle Mimarı / Yerel Akücü

Röle Mimarı bir kuleye enerji teslim ettiğinde o kulenin bir kare çevresindeki aynı sahiplikteki savaş kulelerini sekiz saniyeliğine teslim alan kulenin enerji havuzuna bağlar. Komşu kule kendi enerjisini tüketmez; atış maliyeti röle kaynağından düşer. Röle kaynağı boşalırsa komşu da çalışamaz. Bu seçim kule yerleşimini enerji ağına çevirir.

Yerel Akücü her başarılı teslimatta hedef kulede 18 birim yerel enerji bırakır. Bu rezerv yalnızca hedef kule tarafından tüketilir ve ana enerji hattı kesilse bile kullanılabilir. Rezerv kuleler arasında paylaşılmaz.

## Yük Kesici / Frekans Paylaştırıcı

Yük Kesici teslimattan sonra aynı sahibin diğer operasyon kulelerini beş saniyeliğine enerji kesme durumuna alır. Teslim alan kritik kule çalışır; oyuncu öncelikleriyle hangi kuleyi koruyacağını belirler. Bu bir hasar bonusu değil, kontrollü kapasite paylaşımıdır.

Frekans Paylaştırıcı teslimat sonrası altı saniyelik dönüşümlü çalışma penceresi açar. Aynı ağdaki kuleler 250 ms fazları paylaşır ve aynı anda enerji çekmez. Anlık hasar yoğunluğu azalabilir, fakat enerji hattı daha geç tükenir.

## Senaryo Şarjı / Acil Köprü

Senaryo Şarjı teslim edilen kuleye tek kullanımlık özel saldırı şarjı bırakır ve bekleyen döngüyü kısa saldırı penceresine çeker. Şarj, kule ateş ettiğinde tüketilir; aynı kulede birden fazla şarj birikmez.

Acil Köprü teslim edilen kuleyi dört saniyeliğine köprü durumuna alır. Kule enerjisi bittiğinde bu pencere içinde enerji harcamadan, yalnızca mühimmatla çalışmayı sürdürebilir. Pencere dolunca normal enerji kuralı geri gelir.

## Görünür sonuçlar

Kule durumu `Röle hattı`, `Yük kesildi`, `Frekans paylaşımı` veya `Acil Köprü` olarak gösterilir. Enerji taşıyıcının uzmanlık seçimi tamamlandığında oyuncuya kalıcı seçim uyarısı verilir. Enerji rölesi ve yerel rezerv snapshot’ta ayrı alanlar olarak taşınır; istemci bu alanları kendi formülüyle yeniden üretmez.

Beceriler taşıma kapasitesini değiştirmez. Bu bilinçli bir ayrımdır: oyuncunun tahmini “kaç enerji taşıyor?” değil, “hangi kuleler hangi enerji rejiminde çalışacak?” sorusuna cevap vermelidir.
