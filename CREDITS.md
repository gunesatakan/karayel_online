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

## Geliştirici yapımı varlıklar

Aşağıdaki görsel ve ses varlıklarını geliştirici (gunesatakan) kendisi üretti.
Bazı görseller üretken yapay zekâ araçlarıyla yapıldı. Üçüncü taraf lisans
gerektiren kaynaklar yukarıdaki bölümlerde ayrıca listelendi. Aşağıdaki liste
kaydın eksiksiz olması için dosya yollarını gruplar hâlinde tutuyor.

### Yapay zekâ beyanı

Oyunun bazı görselleri (düşman ve kule sprite'ları, menü ve operatör görselleri)
üretken yapay zekâ araçlarıyla oluşturuldu; bunlardan biri yukarıda belirtilen
OpenAI gpt-image. Mağaza sayfalarındaki yapay zekâ beyanı (itch.io "Generative
AI disclosure", Steam içerik anketi) "evet, grafik" olarak doldurulur.

### Müzik: ticari kayıtlar (kaldırıldı)

İki arka plan parçası lisanssız ticari kayıttı ve oyundan kaldırıldı; oyun
şimdilik müziksiz. Lisanslı ya da CC0 parça eklenince buraya kaynağıyla yazılır.

| Dosya | Not | Durum |
|---|---|---|
| `apps/web/public/audio/background-theme.mp3` | Ticari oyun müziği (ID3: Chipzel, "Courtesy"). | Kaldırıldı |
| `apps/web/public/audio/zeynep-theme.mp3` | Ticari şarkı (ID3: Dynoro, "Zver"). | Kaldırıldı |

### Seri anonsları

Geliştirici yapımı ses kayıtları:

- `apps/web/public/audio/streak-granted.mp3`
- `apps/web/public/audio/streak-legendary.mp3`
- `apps/web/public/audio/streak-unstopable.mp3`
- `apps/web/public/audio/kill-streak-deep.mp3`

### Düşman sprite'ları

Altı ırkın 24 görseli, 512×512 PNG; geliştirici yapımı.

| Irk | Dosyalar |
|---|---|
| Meka (`meka`) | `apps/web/public/images/enemies/enemy-grunt.png`, `enemy-brute.png`, `enemy-runner.png`, `enemy-shooter.png` |
| Golem (`golem`) | `apps/web/public/images/enemies/enemy-golem-{grunt,brute,runner,shooter}.png` |
| Uzay böceği (`spaceBug`) | `apps/web/public/images/enemies/enemy-spaceBug-{grunt,brute,runner,shooter}.png` |
| Düşmüş (`fallen`) | `apps/web/public/images/enemies/enemy-fallen-{grunt,brute,runner,shooter}.png` |
| Dördüncü boyut (`fourthDimensional`) | `apps/web/public/images/enemies/enemy-fourthDimensional-{grunt,brute,runner,shooter}.png` |
| Kutsal koruyucu (`holyGuardian`) | `apps/web/public/images/enemies/enemy-holyGuardian-{grunt,brute,runner,shooter}.png` |

### Kule görselleri

- `apps/web/public/images/towers/tower-zeynep-1.webp`, `tower-zeynep-2.webp`, `tower-zeynep-3.webp`, `tower-zeynep-6.webp`, `tower-zeynep-7.webp`
- `apps/web/public/images/towers/tower-warrior-1-levels-1-4.png`, `apps/web/public/images/towers/tower-warrior-1-levels-5-9.png`, `apps/web/public/images/towers/tower-warrior-1-level-10.png`

### Menü ve operatör görselleri

- `apps/web/public/images/splash-siege.webp`, `splash-siege-sm.webp` (ana menü arka planı)
- `apps/web/public/images/zeynep-puppet-hands.png` (Zeynep'in operatör mührü ve kukla elleri)
- `apps/web/public/images/melis-creepy.png`, `melis-creepy-legend.png` (Melis'in operatör mührü ve seri görseli)
- `apps/web/public/images/melis-creepy-unstoppable.png` (OpenAI gpt-image; yukarıdaki "Görsel üretim" bölümüne bakın)

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

**Created by the developer (gunesatakan):** the streak/announcer clips, all 24
enemy sprites, the tower sprites, the splash art, the Zeynep hands and the
Melis portraits were made by the developer. Some of the visuals were made with
generative AI tools. The Turkish section above keeps the full file lists.

**Removed:** the two commercial music tracks (Chipzel "Courtesy"; Dynoro
"Zver") are no longer shipped; the game currently has no music.

**AI disclosure:** some of the game's artwork (enemy and tower sprites, menu
and operator images) was created with generative AI tools, including OpenAI
gpt-image. Store-page AI disclosures (itch.io "Generative AI disclosure",
Steam content survey) are answered "yes, graphics".
