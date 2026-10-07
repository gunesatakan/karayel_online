# Emeği geçenler ve varlık lisansları

Uzay Savunma'nın oyunla birlikte dağıtılan (ya da oyunun yüklediği) sanat, ses,
yazı tipi ve yazılım kaynakları. Bu dosya ile `apps/web/src/credits.ts` aynı
kaynak listesini taşır; oyundaki **Emeği geçenler** ekranı o modülden çizilir.
`tests/credits.test.mjs` modüldeki her kaynağın adını, yazarını, lisansını ve
bağlantısını burada arar. Yeni bir varlık eklerken ikisine de yazın.

Son denetim: 2026-10-07 (git geçmişi, dosya meta verisi, `docs/` ve `tools/`).

## Yapım

Tasarım ve geliştirme: gunesatakan.

Oyunun kendi kodunda üretilenler (üçüncü taraf kaynak yok):

- Prosedürel kule dokuları, oyuncu/mermi/drone dokuları, ışık ve parçacık
  efektleri (`apps/web/src/scenes/PreloaderScene.ts`, `apps/web/src/vfx/`).
- Operatör mühürleri (altıgen SVG çerçeve ve baş harfler, `apps/web/src/menu-ui.ts` `renderSigil`).
- Arayüz, ödül ve uyarı sesleri (Web Audio sentezi, `apps/web/src/feedback-director.ts`).
- Uygulama simgesi `apps/web/public/icon.svg` ve `apps/web/public/manifest.webmanifest`
  (elle yazılmış basit SVG şekilleri, 2026-06-11).

## Üçüncü taraf kaynaklar

### Ses efektleri

Vuruş, kritik, infaz ve öldürme sesleri (`apps/web/public/audio/sfx/*.mp3`).
`tools/build-sfx.mjs` bu paketlerden kesiyor; dosya dosya kaynak
`apps/web/public/audio/sfx/manifest.json`, lisans notu
`apps/web/public/audio/sfx/LICENSE.txt`.

| Eser | Yazar | Lisans | Bağlantı |
|---|---|---|---|
| Impact Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| Sci-Fi Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/sci-fi-sounds |
| Squish Sounds Effects | EZduzziteh | CC0 1.0 | https://opengameart.org/content/squish-sounds-effects |
| 80 CC0 creature SFX | rubberduck | CC0 1.0 | https://opengameart.org/content/80-cc0-creature-sfx |
| 80 CC0 creature SFX #2 | rubberduck | CC0 1.0 | https://opengameart.org/content/80-cc0-creture-sfx-2 |

CC0 1.0: http://creativecommons.org/publicdomain/zero/1.0/ . Atıf istemiyor;
yine de teşekkürler: Kenney, EZduzziteh ve rubberduck.

### Yazı tipleri

Google Fonts'tan yükleniyor (`apps/web/index.html`); pakette font dosyası yok.
CSS'teki `Inter`, `Exo 2`, `Segoe UI` vb. yalnızca yedek sistem yazı tipleri,
yüklenmiyor.

| Eser | Yazar | Lisans | Bağlantı |
|---|---|---|---|
| Cinzel | Natanael Gama | SIL OFL 1.1 | https://fonts.google.com/specimen/Cinzel |
| Rajdhani | Indian Type Foundry | SIL OFL 1.1 | https://fonts.google.com/specimen/Rajdhani |
| Share Tech Mono | Carrois Apostrophe | SIL OFL 1.1 | https://fonts.google.com/specimen/Share+Tech+Mono |

SIL Open Font License 1.1: https://openfontlicense.org

### Görsel üretim

| Eser | Yazar | Lisans | Bağlantı |
|---|---|---|---|
| gpt-image | OpenAI | OpenAI Terms of Use | https://openai.com/policies/terms-of-use |

Kanıt: `apps/web/public/images/melis-creepy-unstoppable.png` içinde imzalı bir
C2PA bildirimi var (üretici "OpenAI Media Service API", araç `gpt-image`,
`digitalSourceType: trainedAlgorithmicMedia`, 2026-06-23). itch.io sayfasında
"Generative AI disclosure" alanı, Steam'de içerik anketindeki yapay zekâ
beyanı bu yüzden "evet, grafik" olarak doldurulmalı.

### Yazılım

| Eser | Yazar | Lisans | Bağlantı |
|---|---|---|---|
| Phaser | Richard Davey, Phaser Studio Inc. | MIT | https://phaser.io |
| Colyseus | Endel Dreyer | MIT | https://colyseus.io |

## Kaynağı doğrulanamayanlar

Aşağıdakilerin depoda lisansı, kaynak bağlantısı ya da yazar bilgisi yok.
Yayından önce her biri için kaynak ve lisans belgelenmeli, yoksa dosya
değiştirilmeli ya da kaldırılmalı. Hiçbiri oyundaki Emeği geçenler ekranında
listelenmiyor: atıf vermek lisans yerine geçmez.

### Müzik: ticari kayıtlar (kaldırıldı)

İki arka plan parçası lisanssız ticari kayıttı ve oyundan kaldırıldı; oyun
şimdilik müziksiz. Lisanslı ya da CC0 parça eklenince buraya kaynağıyla yazılır.

| Dosya | Bulgular | Durum |
|---|---|---|
| `apps/web/public/audio/background-theme.mp3` | ID3 etiketi: "Chipzel - Courtesy - Super Hexagon", sanatçı chipzel. Ticari oyun müziği. Eklendiği commit: bab486f (2026-06-12, "Update game audio tracks"). | Kaldırıldı |
| `apps/web/public/audio/zeynep-theme.mp3` | ID3 etiketi: "Zver", sanatçı "Dynoro - Topic" (YouTube otomatik kanal adı). Ticari şarkı. Commit: 8f9f5c8 (2026-06-15). | Kaldırıldı |

### Seri anonsları (orta)

| Dosya | Bulgular | Öneri |
|---|---|---|
| `apps/web/public/audio/streak-granted.mp3` | "LAME in FL Studio 20" ile dışa aktarılmış (2026), 130 BPM. Ses/vokal kaynağı belirtilmemiş. Commit b0483f6. | Kaynağa sor: kendi yapımıysa kullanılan örnek ve vokallerin lisansını yaz |
| `apps/web/public/audio/streak-legendary.mp3` | Aynı | Kaynağa sor |
| `apps/web/public/audio/streak-unstopable.mp3` | Aynı | Kaynağa sor |
| `apps/web/public/audio/kill-streak-deep.mp3` | İlk sürüm ffmpeg (Lavf) çıktısıydı, 7c52596'da FL Studio 20 dışa aktarımıyla değişti. Kaynak belirtilmemiş. | Kaynağa sor |

### Düşman sprite'ları (yüksek)

Altı ırkın 24 görseli, hepsi 512×512 PNG, meta veri yok (yalnızca IHDR/IDAT/IEND).
Eklendikleri commit'ler kaynak vermiyor; ilki "Add generated enemy sprite
assets" diyor. `docs/tower-sprite-prompts.md` bu setleri görsel üretici
promptları için "referans stil" sayıyor. Meka setinin farklı sanat
paketlerinden geldiği söyleniyor; depoda bunu doğrulayan ya da çürüten bir
kayıt yok.

| Irk | Dosyalar | Commit |
|---|---|---|
| Meka (`meka`) | `apps/web/public/images/enemies/enemy-grunt.png`, `enemy-brute.png`, `enemy-runner.png`, `enemy-shooter.png` | 5c64979 (2026-06-22) |
| Golem (`golem`) | `apps/web/public/images/enemies/enemy-golem-{grunt,brute,runner,shooter}.png` | 78e5ad1 (2026-06-23) |
| Uzay böceği (`spaceBug`) | `apps/web/public/images/enemies/enemy-spaceBug-{grunt,brute,runner,shooter}.png` | 78e5ad1 |
| Düşmüş (`fallen`) | `apps/web/public/images/enemies/enemy-fallen-{grunt,brute,runner,shooter}.png` | 78e5ad1 |
| Dördüncü boyut (`fourthDimensional`) | `apps/web/public/images/enemies/enemy-fourthDimensional-{grunt,brute,runner,shooter}.png` | 78e5ad1 |
| Kutsal koruyucu (`holyGuardian`) | `apps/web/public/images/enemies/enemy-holyGuardian-{grunt,brute,runner,shooter}.png` | 78e5ad1 |

Öneri: Meka için paketlerin adını, yazarını ve lisansını bul (bulunamazsa
değiştir). Diğer beş ırk için üretim aracını ve tarihini yaz; bilinmiyorsa
değiştir.

### Kule görselleri (yüksek)

| Dosya | Bulgular | Öneri |
|---|---|---|
| `apps/web/public/images/towers/tower-zeynep-1.webp`, `-2`, `-3`, `-6`, `-7` | Commit 4cc7efe (2026-08-04 11:16): "Six sprites arrived at 1024x1024 RGBA". Aynı sabah 10:20'de `docs/tower-sprite-prompts.md` (görsel üretici promptları) eklenmiş; muhtemelen yapay zekâ üretimi, araç kayıtlı değil. WebP'de meta veri yok. | Kaynağa sor: aracı ve şartlarını yaz |
| `apps/web/public/images/towers/tower-warrior-1-levels-1-4.png`, `tower-warrior-1-levels-5-9.png`, `tower-warrior-1-level-10.png` | Commit 132910a (2026-08-09, "add level-based follower tower art"). 500×500 PNG, meta veri yok. | Kaynağa sor |

### Menü ve operatör görselleri

| Dosya | Bulgular | Risk | Öneri |
|---|---|---|---|
| `apps/web/public/images/splash-siege.webp`, `splash-siege-sm.webp` | Ana menü arka planı. Commit 903060f: "Source PNG was 2.74 MB"; kaynak PNG depoda yok, WebP'de meta veri yok. | Yüksek | Kaynağa sor |
| `apps/web/public/images/zeynep-puppet-hands.png` | Zeynep'in operatör mührü ve oyundaki kukla elleri. Üç sürüm (7b83a13, 5b29327 "Replace Zeynep hand asset with stylized reference", c5ab370); hiçbirinde meta veri yok. "Reference" ifadesi başka bir görselden alınmış olabileceğini düşündürüyor. | Orta | Kaynağa sor; şüphe varsa değiştir |
| `apps/web/public/images/melis-creepy.png`, `melis-creepy-legend.png` | Melis'in operatör mührü ve seri görseli. XMP: Canva dışa aktarımı ("Adsız tasarım - 1", 2026-06-22). İçindeki çizimin Canva öğesi mi, başka bir yerden mi geldiği bilinmiyor. | Orta | Kaynağa sor: Canva öğesiyse Canva İçerik Lisansı şartlarını kontrol et; bilinmiyorsa değiştir |
| `apps/web/public/images/melis-creepy-unstoppable.png` | OpenAI gpt-image (C2PA, yukarıda). Kaynak belli. | Düşük | Yapay zekâ beyanını yap |

## Notlar

- Yazı tipleri `fonts.googleapis.com` üzerinden yükleniyor; bu, oyuncunun IP
  adresini Google'a gönderir. AB'de bu konu dava konusu oldu; `PRIVACY.md`'de
  belirtmek ya da yazı tiplerini pakete koymak (OFL izin veriyor) düşünülebilir.
- `apps/web/dev/tower-sheet.html` yalnızca geliştirme sayfası; üretim paketine girmiyor.

---

## English summary

This file and `apps/web/src/credits.ts` carry the same source list; the in-game
**Credits** screen renders from that module, and `tests/credits.test.mjs`
checks that every source in the module appears here.

**Original / generated in-repo:** procedural tower, unit and VFX textures;
operator sigil frames; synthesized interface sounds; `icon.svg` and the web
manifest.

**Third-party, known licence:**

- Sound effects: Kenney "Impact Sounds" and "Sci-Fi Sounds"; EZduzziteh
  "Squish Sounds Effects"; rubberduck "80 CC0 creature SFX" and "#2". All
  CC0 1.0 (see `apps/web/public/audio/sfx/LICENSE.txt`).
- Typefaces (loaded from Google Fonts): Cinzel (Natanael Gama), Rajdhani
  (Indian Type Foundry), Share Tech Mono (Carrois Apostrophe). All SIL OFL 1.1.
- Image generation: OpenAI gpt-image, under the OpenAI Terms of Use
  (`melis-creepy-unstoppable.png` carries a C2PA manifest). Declare
  generative AI on itch.io and Steam.
- Software: Phaser (MIT), Colyseus (MIT).

**Unverified origin (must be resolved before publishing):** the two music
tracks are commercial recordings according to their ID3 tags (Chipzel
"Courtesy" from Super Hexagon; Dynoro "Zver") and should be removed. The five
streak/announcer clips, all 24 enemy sprites, all 9 tower sprites, the splash
art, the Zeynep hands and the two Canva-exported Melis images have no recorded
source or licence. See the Turkish section above for paths and
recommendations.
