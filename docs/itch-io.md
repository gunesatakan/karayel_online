# itch.io yayını

## Paketi üretmek

```bash
npm run build:itch
```

Çıktı `dist/itch/nexhold-web.zip`. Zip'in kökünde `index.html` var; itch'e bu dosya olduğu gibi yüklenir.

Oyun sunucusu derleme anında gömülür. Varsayılan üretim sunucusudur (`wss://karayel-online.fly.dev`). Başka bir sunucu için:

```bash
npm run build:itch -- --server wss://baska-sunucu.fly.dev
```

`VITE_GAME_SERVER_URL` ortam değişkeni de aynı işi görür.

Betik paketi yüklemeden önce denetler. Kökte `index.html` olmalı, dosya sayısı 1000'i geçmemeli (itch sınırı) ve kök mutlak bir varlık yolu (`"/images/…"`) kalmamalı. Bu koşullardan biri tutmazsa zip yazılmaz. Paket şu an yaklaşık 120 dosya ve 18 MB.

## Neden göreli yollar

itch oyunu `https://html.itch.zone/html/<id>/index.html` gibi bir alt yoldan, kendi sayfasında bir iframe içinde sunar. `/images/…` gibi kök mutlak bir yol orada alan adının köküne gider ve 404 verir. Bu yüzden Vite paketi `base: "./"` ile üretilir ve `public/` dosyaları kodda `assetUrl()` ile istenir (`apps/web/src/asset-url.ts`). Vercel'de oyun kökten sunulduğu için aynı paket orada da çalışır.

## itch.io sayfa ayarları

**Edit game** ekranında:

| Ayar | Değer |
| --- | --- |
| Kind of project | HTML |
| Uploads | `nexhold-web.zip`, "This file will be played in the browser" işaretli |
| Viewport dimensions | 405 × 720 (dikey) |
| Mobile friendly | Açık; Orientation: **Portrait** |
| Automatically start on page load | Kapalı (ses tarayıcıda ilk dokunuşla açılıyor; "Run game" düğmesi bu dokunuşu sağlıyor) |
| Fullscreen button | Açık |
| Scrollbars | Kapalı |
| SharedArrayBuffer support | Kapalı (gerekmiyor) |
| Visibility & access | **Restricted** (yalnızca davetliler) ya da **Draft** + gizli bağlantı |

Kapalı test için:

- **Restricted** seçilirse itch kullanıcı hesabıyla davet edilen kişiler oyunu görür.
- Hesapsız test için sayfa **Draft** bırakılır ve **Secret URL** paylaşılır. Bağlantıyı alan herkes oyunu açabilir.

## Bilinen noktalar

- **Depolama.** Oyun itch'te başka kökenli bir iframe'de çalışır. Üçüncü taraf çerezleri kapalı tarayıcılarda (Chrome'da bu ayar, Safari'nin varsayılanı) `localStorage` erişimi hata verebilir ya da itch.io sitesine bölünmüş ayrı bir depoya yazar. Bu durumda ilerleme Vercel sürümüyle paylaşılmaz. Depolama okuma ve yazmaları `try/catch` içinde; oyun depolama olmadan da açılır, yalnızca ilerleme kaydedilmez.
- **Tam ekran.** Oyun ilk dokunuşta tam ekran istiyor. itch'te iframe "Fullscreen button" açıkken buna izin verir, yani masaüstünde de ilk tıklamada tam ekrana geçer. İstenmezse gömülü sürümde bu yalnızca dokunmatik cihazlarla sınırlandırılabilir (karar bekliyor).
- **Service worker.** Kaydı alt yolun kapsamıyla yapılıyor. Tarayıcı iframe içinde reddederse sessizce geçiliyor; oyunun çalışmasına etkisi yok.

## Sunucu tarafı

İstemci itch'ten üretim sunucusuna üç yoldan bağlanır:

- WebSocket (Colyseus odası);
- `GET /rooms` ve `GET /health`;
- Colyseus'un eşleştirme isteği (`POST /matchmake/...`).

Express `cors()` her kökene açık; Colyseus eşleştirmesi de varsayılan olarak her kökene izin veriyor. Bu yüzden bugün ek ayar gerekmiyor.

Telemetri uç noktası köken listesiyle kısıtlanırsa, listeye itch kökenleri eklenmeli:

- `https://html.itch.zone`
- `https://html-classic.itch.zone`
- eski oyunlar için `https://v6p9d9t4.ssl.hwcdn.net`
