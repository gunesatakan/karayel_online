# Bounty Board Arcade yayını

## Paket

itch.io ile aynı paket yüklenir:

```bash
npm run build:itch
```

Çıktı `dist/itch/nexhold-web.zip`. Bounty Board'a yüklenen şey bu derlenmiş pakettir; depo, kaynak kod ve sunucu kodu yüklenmez.

## İlerleme neden kaydedilmiyordu

Bounty Board yüklenen oyunu saydam olmayan kökenli (opaque origin) bir çerçevede çalıştırır. Orada `localStorage`, `sessionStorage`, IndexedDB ve çerezler boş değildir; erişildiklerinde `SecurityError` fırlatırlar. Oyunun bütün ilerlemesi (aşamalar, operatör ustalığı, nişanlar, rekorlar, kart arşivi) `localStorage`'da durduğu için hiçbir şey kaydedilmiyor, rapor "Kayıt bu tarayıcıda saklanamadı" diyor ve operatörlerin ve aşamaların çoğu kilitli kalıyordu.

## Çözüm: Arcade SDK'nın depolama katmanı

`@bountyboard/arcade-sdk` (sürüm sabit, `apps/web/package.json`) oyunla birlikte paketlenir. Köprü `apps/web/src/arcade.ts`:

- **Depolama.** `BBArcade.storage.install()` fırlatan `localStorage`'ın yerine oyuncunun Bounty Board bulut kaydına yazan bir kopya koyar. Oyunun depo kodu değişmedi. Gerçek depolama çalışan yerde (Vercel, itch.io) katman hiçbir şeye dokunmaz.
- **Açılış sırası.** Giriş noktası `apps/web/src/boot.ts`. Önce köprü yüklenir ve katman kurulur; oyunun kendisi (`main.ts`) ancak bulut okuması indikten sonra yüklenir. Yoksa menü ilk karede ilerlemeyi boş okurdu. Bekleme en fazla 8 saniye (`ARCADE_STORAGE_WAIT_MS`); barındırıcı cevap vermezse oyun yine açılır.
- **Misafir.** Bounty Board'a giriş yapmamış oyuncuda katman bellek kipindedir: ilerleme oturum boyunca tutulur, sayfa kapanınca gider. Uyarı gösterilmiyor (bilinçli karar).
- **Sinyaller.** `init`, menü hazır olunca `gameLoadingFinished`, canlı maçta `gameplayStart`, sonuç ekranında ve menüye dönüşte `gameplayStop`.
- **Skor.** Koşu raporu açılırken bir kez `gameOver(skor)`. Skor aşamalar boyunca ulaşılan toplam dalga: `(aşama − 1) × 20 + dalga` (`apps/web/src/arcade-score.ts`). Yaratıcı koşu 0 yollar; maç bittikten sonra katılan istemci hiçbir şey yollamaz. Skorun sayılması için başvuruda Liderlik Tablosu ayrıca beyan edilmelidir.
- **Reklam.** Ödüllü reklam kapalı (`rewardedAds.enabled: false`); reklam betiği hiç yüklenmez.

SDK hiçbir zaman yük taşımaz: her çağrı `try/catch` içindedir ve barındırıcı yokken oyun aynen çalışır.

## Barındırıcıya gidenler

SDK'nın kendi ağ isteği yoktur; üst sayfaya `postMessage` ile konuşur.

- Yaşam döngüsü sinyalleri ve koşu sonu skoru.
- Giriş yapmış oyuncuda `localStorage` içeriği (tek kayıt, yaklaşık 1 MB sınır): ilerleme, ayarlar, oyuncu adı, dil ve anonim telemetri kurulum kimliği.

Kayıt isteği yalnızca oyun Bounty Board'a (ya da yerelde `localhost`'a) gömülüyken yapılır; başka bir sitede SDK isteği hemen reddeder.

## Yerelde denemek

```bash
npm run build --workspace @karayel/web
node tools/bounty-fake-host.mjs
```

`http://localhost:4599` oyunu Bounty Board'daki gibi depolaması engelli bir çerçevede açar ve SDK'nın `load` / `save` isteklerini cevaplar. Kipler: `?mode=player` (varsayılan), `?mode=guest`, `?mode=silent`; `&reset=1` sahte kaydı siler.

Doğrulanan durumlar (2026-10-14, başsız Edge):

| Durum | Sonuç |
| --- | --- |
| Giriş yapmış oyuncu, boş kayıt | Oyun açılıyor, yazılanlar barındırıcıya gidiyor |
| Sayfa yenileme | Yazılan değer buluttan geri geliyor |
| Misafir | Oyun açılıyor, depolama oturum içinde çalışıyor, kayıt gitmiyor |
| Cevap vermeyen barındırıcı | Oyun yaklaşık 8 saniye sonra açılıyor |
| Çerçevesiz açılış | Gerçek depolama, bekleme yok |

## Bilinen noktalar

- **Tek kayıt.** İlerleme tarayıcıya değil Bounty Board hesabına bağlıdır; oyuncu başka cihazda da aynı ilerlemeyi görür. Vercel ya da itch.io'daki ilerlemeyle paylaşılmaz.
- **Geç gelen bulut okuması.** Barındırıcı 8 saniyeden geç cevap verirse oyun boş ilerlemeyle açılır. SDK, okuma başarılana kadar hiçbir şeyi buluta yazmaz, yani var olan kayıt silinmez; ama o oturumda ilerleme boş görünür.
