# Enerji taşıyıcı uzmanlığı

Enerji taşıyıcı satın alındığında kapasitesi veya hızı değil, üç kademeli kalıcı uzmanlığı seçilir. Her kademede iki seçenek vardır; seçim sunucuda işçiye yazılır ve geri alınamaz. Seçim penceresi kapanırsa veya bağlantı koparsa, oda işçide eksik kalan kademeyi yeniden açar.

## Röle Mimarı / Yerel Akücü

Röle Mimarı bir kuleye enerji teslim ettiğinde o kulenin bir kare çevresindeki aynı sahiplikteki savaş kulelerini sekiz saniyeliğine teslim alan kulenin enerji havuzuna bağlar. Komşu kule kendi enerjisini tüketmez; atış maliyeti röle kaynağından düşer. Röle kaynağı boşalırsa komşu da çalışamaz. Bu seçim kule yerleşimini enerji ağına çevirir.

Yerel Akücü her başarılı teslimatta hedef kulede 18 birim yerel enerji bırakır. Bu rezerv yalnızca hedef kule tarafından tüketilir ve ana enerji hattı kesilse bile kullanılabilir. Rezerv kuleler arasında paylaşılmaz.

## Yük Kesici / Frekans Paylaştırıcı

Yük Kesici yalnızca enerji krizinde çalışır. Kriz, teslimat anında aynı sahibin ayakta duran savaş kulelerinden en az birinin kendi enerjisinin azami enerjisinin %25'inin altında olmasıdır (enerjisi tamamen bitmiş kule de bu eşiğin altındadır). Kriz varsa, sevkiyat önceliği **Düşük** olan kuleler beş saniyeliğine enerji kesme durumuna alınır ve bu sürede ateş etmez. Teslimatı alan kule ile önceliği **Kritik** veya **Normal** olan kuleler hiçbir koşulda kapanmaz; Düşük öncelikli kule yoksa hiçbir şey kapanmaz. Kriz yoksa teslimat hiçbir kuleyi kapatmaz. Oyuncu hangi kulelerin feda edileceğini öncelik seçimiyle belirler; bu bir hasar bonusu değil, kontrollü kapasite paylaşımıdır.

Frekans Paylaştırıcı teslimat anında enerjisi azami enerjisinin %50'sinin altında olan savaş kulelerine altı saniyelik dönüşümlü çalışma penceresi açar (teslimatı alan kule de teslimattan sonraki enerjisi bu eşiğin altındaysa dahildir). Bu kuleler 250 ms'lik fazlarla sırayla çalışır ve zamanın yarısında ateş etmez; enerjisi %50 ve üzerinde olan kuleler etkilenmez. Anlık hasar yoğunluğu azalabilir, fakat enerji hattı daha geç tükenir.

Eşikler (`LOAD_SHEDDER_CRISIS_ENERGY_RATIO`, `FREQUENCY_SHARE_ENERGY_RATIO`) ve süreler `packages/shared/src/worker-skills.ts` içinde tanımlıdır; oyun içi metin aynı sayıları yazar.

## Senaryo Şarjı / Acil Köprü

Senaryo Şarjı teslim edilen kuleye tek kullanımlık özel saldırı şarjı bırakır ve bekleyen döngüyü kısa saldırı penceresine çeker. Şarj, kule ateş ettiğinde tüketilir; aynı kulede birden fazla şarj birikmez.

Acil Köprü teslim edilen kuleyi dört saniyeliğine köprü durumuna alır. Kule enerjisi bittiğinde bu pencere içinde enerji harcamadan, yalnızca mühimmatla çalışmayı sürdürebilir. Pencere dolunca normal enerji kuralı geri gelir.

## Görünür sonuçlar

Kule durumu `Röle hattı`, `Yük kesildi`, `Frekans paylaşımı` veya `Acil Köprü` olarak gösterilir. Enerji taşıyıcının uzmanlık seçimi tamamlandığında oyuncuya kalıcı seçim uyarısı verilir. Enerji rölesi ve yerel rezerv snapshot’ta ayrı alanlar olarak taşınır; istemci bu alanları kendi formülüyle yeniden üretmez.

Beceriler taşıma kapasitesini değiştirmez. Bu bilinçli bir ayrımdır: oyuncunun tahmini “kaç enerji taşıyor?” değil, “hangi kuleler hangi enerji rejiminde çalışacak?” sorusuna cevap vermelidir.
