# itch.io sayfa malzemeleri

| Dosya | İçerik |
| --- | --- |
| [tr.md](tr.md) | Türkçe kısa ve uzun açıklama, kontroller, gizlilik notu |
| [en.md](en.md) | Aynısının İngilizcesi |
| `screenshots/` | Dikey ekran görüntüleri, 405×720, İngilizce arayüz |
| `cover-630x500.png` | **Kapak görseli (kullanılan):** oyun içi savaş sahnesi ve logo |
| `cover-630x500-operators.png` | Seçilmeyen alternatif: iki operatörlü afiş (AttackLord ve ZentaX) |
| `cover-1260x1000-operators.png` | Alternatif afişin 2× kopyası |

## Ekran görüntüleri

| Dosya | Sahne |
| --- | --- |
| `01-mech-attacklord.jpg` | 2. aşama (Meka), 12. dalga, AttackLord; şampiyon ve seri bandı |
| `02-spacebug-zentax.jpg` | 3. aşama (Uzay Böceği), 14. dalga, ZentaX dizilimi |
| `03-fourthdim-dualitemp.jpg` | 5. aşama (Dördüncü Boyut), 16. dalga, DualiTemp lanetleri ve bağları |
| `04-card-draft.jpg` | Kart seçimi ve dalga karnesi |

Notlar:

- Görüntüler tarayıcıdan 1× alındı (405×720). Daha keskin görüntü için en iyi kaynak telefonun kendi ekran görüntüsü (3×).
- `04-card-draft.jpg` karnesinde "MVP Hiza Emri" kule adı Türkçe kalıyor; sunucu metinleri İngilizceye geçince yeniden çekilmeli.
- Kule paneli görüntüsü de aynı sebeple bekliyor: panelde sunucudan gelen durum satırları Türkçe.
- Sahneler yaratıcı modda kuruldu (kuleler 10. seviye); yaratıcı düğmesi görüntü için gizlendi.
- Oyun içi kapak (`cover-630x500.png`) aynı yöntemle 630×1120'de çekilip kırpılmıştı; HUD gizli, logo bandı sayfaya bindirilmişti.

## Kapak

Kullanılan kapak oyun içi sahne (`cover-630x500.png`); sahip onu daha iyi buldu. Aşağıdaki afiş alternatif olarak duruyor.

Oyun içi kapakta ad değişince (Nexhold) yalnızca başlık yenilendi. Kaynak, eski adı taşıyan ilk kapak (git geçmişinde, `070964b`): başlık şeridi silinip arka plan çevresinden dolduruldu, şeridi kesen iki ince camgöbeği çizgi aynı açı ve parlaklıkla yeniden çizildi. "NEXHOLD" eski başlıkla aynı yazı tipi, renk ve aralıkla (Cinzel 900, `#e8e3d6`, harf aralığı 0.06em, 2 px koyu alt gölge), aynı sol kenar ve taban çizgisinde; ad kısa olduğu için 46 yerine 50 px. Sahne, camgöbeği çizgi ve "CO-OP TOWER DEFENSE" özgün kapaktan.

`cover-630x500-operators.png` bir afiş: iki oynanabilir operatör, menüdeki altıgen mühürlerin büyük hâli içinde karşı karşıya.

- **Sol, AttackLord:** üç mor enerji bıçağı mühürden yukarı taşıyor; mühür ve hafif ışıma mor (`#8b5cf6`).
- **Sağ, ZentaX:** kukla ustasının elleri karanlıktan mühre uzanıyor, parmak uçlarından ince pembe ipler iniyor; mühür ve kenar ışığı ZentaX rengi (`#ec4899`). Görseldeki açık renkli "çıkartma" kenarı SVG filtresiyle kırpılıp yerine ince pembe kenar konuyor.
- **Zemin:** koyu uzay, sabit ve sönük yıldızlar (parıltı, lens yıldızı yok), ince camgöbeği HUD çizgileri (köşe parantezleri, ölçek, iki mühür arasında nişangâh), alt tarafta koyu bir gezegen ufku.
- **Başlık:** oyun içi kapakla aynı yazı: "NEXHOLD" Cinzel 900 `#e8e3d6` (49 px, ortalı), üstünde kısa camgöbeği çizgi, altında Share Tech Mono "CO-OP TOWER DEFENSE". 315×250 küçük resimde de okunuyor.
- Kenar payı 630 genişlikte en az 24 px.

Yeniden üretmek için (Chrome ya da Edge ve Google Fonts için ağ gerekir):

```sh
node tools/itch-cover/render.mjs                 # docs/itch-page/cover-630x500-operators.png ve cover-1260x1000-operators.png
node tools/itch-cover/render.mjs --out /tmp/x    # denemeler için başka klasöre
```

Kaynak `tools/itch-cover/cover.html` (630×500 CSS px; betik 1× ve 2× ekran görüntüsü alıyor). Görseller depodan göreli yolla geliyor: ZentaX `apps/web/public/images/zeynep-puppet-hands.png`, AttackLord tam çözünürlük kaynağı `tools/itch-cover/assets/attacklord-icon-source.webp` (1254×1254; oyundaki 256 px kopya 2× kapak için küçük kalıyor).

Paket ve sayfa ayarları için: [../itch-io.md](../itch-io.md).

## Beyanlar

- **AI disclosure: yes (graphics and music).** Bazı görseller (düşman ve kule sprite'ları, menü ve operatör görselleri) ve lobi müziği ("Last Stand", Suno) geliştirici tarafından üretken yapay zekâ araçlarıyla yapıldı; itch.io "Generative AI disclosure" alanı grafik ve müzik için işaretlenir. Ayrıntı: [../../CREDITS.md](../../CREDITS.md).
- **Pricing: "No payments".** Lobi müziği Suno ücretsiz planıyla üretildi ve yalnız ticari olmayan kullanıma açık; sayfada ödeme, bağış ve "istediğin kadar öde" kapalı kalmalı. Reklamlı ya da ücretli yayından önce müzik değiştirilmeli.
- **Müzik:** yalnızca lobi müziği var: ana menüde ve co-op bekleme odasında ilk dokunuştan sonra çalan tek parça ("Last Stand"). Maçın kendisi müziksiz, yalnızca efekt sesleri (lisanssız ticari parçalar kaldırıldı). Sayfa metnine ve etiketlere maç içi müzik ya da film müziği vaadi yazılmamalı.

## Sayfa düzeni önerisi

1. **Başlık:** Nexhold (marka adı, her dilde aynı).
2. **Açıklama:** üstte İngilizce, altta Türkçe. itch'in kitlesi çoğunlukla İngilizce okuyor; Türkçe metin "Türkçe" başlığı altında. Ekran görüntüleri sağ sütunda.
3. **Genre:** Strategy.
4. **Tags:** aşağıdaki listeden en fazla 10 tane.
5. **Community:** Comments açık; kapalı testte "Discussion board" da işe yarar.

## Etiket önerileri

itch'te en fazla 10 etiket var. Sıralama önem sırasına göre:

1. `tower-defense`
2. `co-op`
3. `multiplayer`
4. `sci-fi`
5. `deck-building` (koşu boyunca kart seçimi)
6. `roguelite`
7. `mobile`
8. `browser`
9. `strategy`
10. `turkish`

Yedekler: `real-time`, `space`, `aliens`, `online`, `singleplayer`.
