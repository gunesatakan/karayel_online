# Kule Sprite Promptları

Karayel kuleleri şu an prosedürel vektör olarak çiziliyor (`PreloaderScene.createTowerTexture`).
Bu doküman, onların yerine geçecek çizilmiş sprite'lar için üretim promptlarını tutar.

## Teknik çerçeve

Mevcut düşman sprite'ları referans stildir (`public/images/enemies/*.png`): şeffaf arka plan,
ortalanmış, yüksek kontrastlı boyalı 3B render.

| Kural | Değer | Neden |
|---|---|---|
| Üretim çözünürlüğü | 1024×1024 | Kırpma payı bırakır |
| Oyuna giren dosya | 128×128 WebP | Aşağıdaki Ölçek bölümü |
| Arka plan | Şeffaf | Kule zemin karesinin üstüne biner |
| Görüş açısı | Tam dik tepeden | Aşağıdaki Dik bakış bölümü — zorlaması gerekiyor |
| Kompozisyon | Daire ortada, çevresinde pay | Aşağıdaki Ölçek bölümü |
| Ekranda boyut | Disk = 1 hücre (34 px) | Daire kareyi taşmamalı |
| Zemin gölgesi | Yok | Gölgeyi oyun kendi çiziyor |

## Ölçek ve çerçeve

İki kural sprite'ın nasıl çerçeveleneceğini belirliyor.

**1. Daire hücreyi taşmaz.** Kulenin dairesi tam olarak durduğu karenin kenar
uzunluğu kadar çizilir, daha büyük değil. Namlu, mızrak, çıkıntı gibi parçalar
dairenin dışına taşabilir — taşması gereken de zaten onlardır.

Bunu mümkün kılmak için sprite karesinde daire **%70**'lik bir yer kaplar, kalan
pay çıkıntılara ayrılır (`TOWER_ART_DISC_RATIO`). Oyun sprite'ı bu orana göre
ölçekler, yani daire her zaman hücreye oturur, çıkıntı ne kadar uzun olursa olsun.
Pratikte: daireyi ortala, çevresinde her yönde dairenin yarıçapının ~%43'ü kadar
boşluk bırak, çıkıntılar o boşluğa taşsın.

**2. Dosya 128×128 gider.** Kule ekranda ~34 px çiziliyor. 512 veya 1024'lük bir
dokuyu oraya küçültmek aşırı örnekleme yapıp detayı gürültüye çeviriyordu —
"garip görüntü" bundan kaynaklanıyor. 128 hem 2'nin kuvveti (mipmap zinciri
kurulabiliyor, `mipmapFilter` açık) hem de yüksek yoğunluklu ekranlar için yeterli
pay bırakıyor. Üretimi 1024'te yapın, dosyaya 128 olarak inin.

**Saray Arşivi 2×2'dir.** Dört hücre kaplar, hücre köşesine oturur ve dairesi iki
hücre eninde çizilir. Çerçeve kuralı aynı; sadece daha büyük render edilir.

Silüet testi: sprite'ı 40 px'e küçültüp tek renk siyaha çevirdiğinde hangi kule olduğu
ayırt edilebilmeli. Detay değil, dış hat taşır.

**Dış kenarda tasma payı bırakın.** Kule seviyesi, sprite'ın dış kenarına oturan bir
halka ile gösteriliyor (aşağıdaki Seviye halkası bölümü). Sprite'ın en dıştaki
yaklaşık %10'luk bandı sade bir bilezik olmalı — oraya ince detay, çıkıntı veya
yazı koyulursa halkanın altında kalır.

Dosya adı `tower-<id>.webp` olmalı ve `apps/web/public/images/towers/` altına konmalı.
`PreloaderScene` içindeki `PAINTED_TOWER_IDS` listesine id eklenince devreye girer;
listede olmayan kuleler prosedürel çizimle çalışmaya devam eder.

## Dik bakış — tek başına "top-down" yazmak yetmiyor

Görsel üreticiler "top-down" ifadesini genellikle *yüksek açı* olarak yorumluyor ve
30-45 derece eğimli, perspektifli bir görüntü veriyor. Eğitim verisinde "top-down"
etiketli görsellerin çoğu gerçekten dik değil. Bu yüzden açıyı tek bir ifadeyle
istemek işe yaramıyor; **birbirini tekrarlayan birden fazla ifadeyle kuşatmak**
gerekiyor.

Bizde bu estetik bir tercih değil, işlevsel zorunluluk: **kuleler dönüyor.**
Sprite'ta perspektif varsa kule döndükçe o sahte perspektif de dönüyor ve kamera
nesnenin etrafında dolanıyormuş gibi görünüyor. Eğik bir sprite sabitken kabul
edilebilir durur, dönerken bariz biçimde bozulur.

### Prompta konacak zorlama

Aşağıdaki ifadeler **promptun en başına** gelmeli; üreticiler baştaki kelimelere
daha çok ağırlık veriyor.

```
flat lay, shot from a camera mounted directly overhead pointing straight down,
90 degree bird's eye view, orthographic top projection, the object lies flat on
the ground like a coin on a table, only its top surface is visible, none of its
vertical sides or walls can be seen, a circular base must render as a perfect
circle and never as an ellipse, no perspective, no vanishing point, no horizon,
no camera tilt, not isometric, not a three quarter view, not an angled shot,
not a front view
```

Buradaki asıl iş üç ifadede:

- **`flat lay`** — ürün fotoğrafçılığından gelen bir terim ve neredeyse her zaman
  gerçek dik bakış üretiyor. Tek başına en güçlü ipucu.
- **`only its top surface is visible, none of its vertical sides`** — açıyı
  tarif etmek yerine *sonucunu* tarif ediyor. Nesnenin yan yüzü görünmüyorsa
  kamera dik demektir; model bunu geometrik olarak çözebiliyor.
- **`a circular base must render as a perfect circle and never as an ellipse`** —
  eğik kameranın en belirgin işareti dairenin elipse dönmesidir. Doğrudan yasaklamak
  modeli açıyı düzeltmeye zorluyor.

### Negatif prompt

Destekleyen araçlarda (Stable Diffusion, Midjourney `--no`) ayrıca:

```
isometric, 3/4 view, angled camera, perspective view, side view, front view,
eye level, horizon, tilted, dutch angle, depth of field, ellipse base
```

### Kabul kontrolü

Üretilen görseli şu üç soruyla eleyin; biri bile "evet" ise açı yanlıştır:

1. Nesnenin herhangi bir **yan yüzü** (duvar, gövde kenarı, silindir yanağı) görünüyor mu?
2. Yuvarlak olması gereken taban **elips** mi çıkmış?
3. Gölge nesnenin **yanına** mı düşmüş (altına değil)?

En hızlı test: görseli 90° döndürün. Gerçekten dikse döndürülmüş hali de doğal durur;
perspektif varsa ışık ve eğim anında yanlış görünür. Kule zaten oyunda dönecek,
yani bu testi her sprite'ın geçmesi şart.

### Referans görsel

Mevcut düşman sprite'ları arasında `enemy-spaceBug-runner.png` gerçek dik bakışın
iyi bir örneği. Aracınız stil/kompozisyon referansı alıyorsa (Midjourney `--sref`,
ChatGPT'ye görsel ekleme) onu referans vermek açıyı tutturmayı belirgin biçimde
kolaylaştırıyor.

## Yönelme — sprite'ı doğrudan etkiler

Kuleler artık ateş ettikleri düşmana **dönüyor**. Sunucu her tick hedefin açısını
hesaplayıp snapshot'a `facing` olarak koyuyor, istemci de sprite'ı o açıya
yumuşatarak çeviriyor (`GameScene.applyTowerFacing`).

18 kulenin 12'si dönüyor. Auralar, pasifler, global Sunucu ve alan lanetleri sabit
kalıyor — liste `packages/shared/src/index.ts` içindeki `AIMING_TOWER_IDS`.

Bunun sprite üretimine iki sonucu var:

**1. Dönen kulelerin namlusu sağa bakmalı.** Motor `Math.atan2` çıktısını doğrudan
rotasyon olarak uyguluyor; açı 0 = sağ (+X). Kaynak görselde namlu/göz/ağız sağa
bakıyorsa hiçbir ofset gerekmez. Yukarı bakan bir görsel 90° yanlış durur.

**2. Dönen kulelerin tabanı dairesel simetrik olmalı.** Şu an tek sprite dönüyor,
taban dahil. Taban asimetrikse (köşeli kaide, sancak, kablo) kule döndükçe zemin de
dönüyormuş gibi görünür. Dönen kulelerde taban yuvarlak bir disk olmalı; tüm
karakter üstteki parçada durmalı.

> İleride taban ve kafa iki ayrı sprite'a ayrılırsa (`tower-<id>-base.png` +
> `tower-<id>-head.png`) bu kısıt kalkar ve süslü kaideler serbest kalır.
> Şimdilik tek katman.

Sabit kalan kulelerde bu kısıtların ikisi de yok; istendiği kadar asimetrik ve
yönlü olabilirler.

## Seviye halkası — merkezi boş bırakın

Seviye artık kulenin ortasındaki rakamla değil, dış kenarına oturan bir kadran
halkasıyla gösteriliyor (`GameScene.drawTowerLevelRing`). Halka saat yönünde
doluyor: seviye 1'de onda bir, seviye 10'da tam tur. Aynı anda kalınlaşıyor ve
rengi çelikten beyaza doğru ısınıyor — üç bağımsız ipucu, yani renk körlüğünde de
okunuyor.

Sprite açısından iki sonucu var:

- **Merkez tamamen serbest.** Eskiden ortada 12px'lik koyu bir rakam vardı ve
  sanatın odak noktasını kapatıyordu. Artık yok; gözü, lensi, namluyu ortaya
  koyabilirsiniz.
- **Dış bilezik sade olmalı.** Halka sprite'ın dış kenarında, üstünde çiziliyor.
  En dıştaki ince bant düz bir yüzey olarak bırakılmalı.

## Ortak stil bloğu

Her promptun başına bu blok eklenir; sonuna kule özel tarifi gelir.

**Dönen kuleler için:**

```
flat lay, shot from a camera mounted directly overhead pointing straight down,
90 degree bird's eye view, orthographic top projection, the object lies flat on
the ground like a coin on a table, only its top surface is visible, none of its
vertical sides or walls can be seen, the circular base renders as a perfect
circle and never as an ellipse, no perspective, no vanishing point, no horizon,
no camera tilt, not isometric, not a three quarter view, not an angled shot,
game asset centered on a circular radially symmetric base, the working end
clearly pointing to the right, dark fantasy techno-occult, painted 3D render
with crisp readable edges, obsidian and blackened steel construction, emissive
{RENK} energy glowing from within, light falling from directly above, strong
value contrast so the shape reads at 40 pixels, the outermost band of the base
left as a plain smooth collar, isolated on transparent background, square 1:1,
512x512, no cast shadow, no text, no watermark, no UI elements
```

**Sabit kuleler için:**

```
flat lay, shot from a camera mounted directly overhead pointing straight down,
90 degree bird's eye view, orthographic top projection, the object lies flat on
the ground like a coin on a table, only its top surface is visible, none of its
vertical sides or walls can be seen, a circular base renders as a perfect circle
and never as an ellipse, no perspective, no vanishing point, no horizon, no
camera tilt, not isometric, not a three quarter view, not an angled shot,
game asset centered and vertically symmetric, dark fantasy techno-occult,
painted 3D render with crisp readable edges, obsidian and blackened steel
construction, emissive {RENK} energy glowing from within, light falling from
directly above, strong value contrast so the shape reads at 40 pixels, the
outermost band left as a plain smooth collar, isolated on transparent
background, square 1:1, 512x512, no cast shadow, no text, no watermark,
no UI elements
```

`{RENK}` her kulenin oyundaki vurgu rengiyle değiştirilir; bu renk kule kartında,
menzil çemberinde ve mermide de kullanıldığı için sprite'ın ondan sapmaması gerekir.

---

## Zeynep — Saray otoritesi

Ortak dil: sekizgen taban, sarayı andıran oyma süsleme, sancak/flama detayları,
disiplinli ve simetrik geometri. Zeynep'in kuleleri "emir veren" nesneler gibi durmalı.

### 1. Hiza Emri — `tower-zeynep-1` — `#ec4899` — **döner**

```
circular command dais of black basalt with engraved parade-ground lines, a
single long slender rail-lance barrel lying flat across the top, magenta
#ec4899 energy running down an open channel in the barrel like a drawn bowstring,
brass filigree edging on a round dais
```

Delici mermi atar: namlu uzun, ince ve tek olmalı — çift namlu mekaniği yanlış anlatır.

### 2. Gösteri Kulesi — `tower-zeynep-2` — `#f9a8d4` — **döner**

```
circular theatre-light emitter, a ring of eight faceted crystal lenses angled
outward around a center prism at the hub, pale rose #f9a8d4 light beams caught in
the lenses, polished dark chrome housing with ornate scalloped rim, faint
lens-flare bloom on the crystal tips
```

Tek hedefe değil, bir hat boyunca patlar: lenslerin dışa dönük halkası bunu anlatır.

### 3. Taht Mührü — `tower-zeynep-3` — `#f0abfc` — **döner**

```
floating royal seal disc hovering above a low throne-shaped plinth, three
socket nodes set at triangle points on the disc rim, fuchsia #f0abfc arcane
light bridging between the sockets, wax-seal relief carved into the disc face,
no barrel, no muzzle
```

Sağ tarafındaki namlu yüzünden bu kule dönüyor: namlu hedefe çevrilir, gövde
sabit bir disk olarak kalır.

### 4. Zirve Oku — `tower-zeynep-4` — `#ec4899` *(veride tanımlı, şu an devre dışı)* — **döner**

```
narrow ballista frame lying flat, a single long arrow shaft
locked in a drawn firing groove, tapered needle silhouette, magenta #ec4899
charge crawling up the shaft toward the tip, minimal footprint, sharp
elongated form
```

### 5. Emir Kulesi — `tower-zeynep-5` — `#ec4899` *(veride tanımlı, şu an devre dışı)* — sabit

```
command post whose speaking horn opens straight up toward the camera, read as
concentric circles nested into the base, pressure rings radiating outward, magenta #ec4899 pulse rendered
as a faint expanding ring, heavy armored collar around the base, no barrel
```

### 6. Kin Kulesi — `tower-zeynep-6` — `#991b1b` — **döner**

```
wide-mouthed grudge horn, a 60 degree wedge aperture cut into a heavy dark
crimson block, deep red #991b1b ember light banked in the throat of the wedge,
scorched and cracked stone, iron reinforcement bands, the aperture clearly
asymmetric and directional unlike the other towers
```

Tek yönlü koni dalgası atar: burası bilerek simetrik **değil**, ağzın yönü okunmalı.

### 7. Saray Arşivi — `tower-zeynep-7` — `#facc15` — sabit — **2×2**

```
palace archive vault, concentric tiers of gilded scroll cases and ledger drawers
nested one inside the next so the steps read as rings, warm gold #facc15 light
leaking from the seams between tiers, ornate crown molding on the top tier, completely sealed with
no opening, no barrel, no aperture
```

Hiç ateş etmez, pasif güçlendirir: tamamen kapalı ve ağır durmalı.
Dört hücre kapladığı için diğerlerinin iki katı boyutta çizilir; detay yoğunluğu
ona göre artırılabilir.

### 8. Abartı — `tower-zeynep-8` — `#7c3aed` — **format farklı** — sabit

```
long slender conduit bar laid horizontally, two tile lengths, a spine of five
linked lens segments along its length, violet #7c3aed light running through the
bar end to end like current in a wire, blackened metal casing with heat fins,
flat low profile, rendered as a rail not a tower
```

Bu kule kareye değil, **kare kenarına** yerleşir ve 2 çizgi uzunluğundadır.
Sprite'ı kare değil **1024×512 (2:1 yatay)** üretilmeli; oyun dikey varyantı döndürerek alır.

---

## Atakan — Yeşil terminal donanımı

Ortak dil: kasa/rack estetiği, havalandırma delikleri, kablo portları, devre izleri,
terminal yeşili. Süsleme yok; her parça bir işlev gibi görünmeli.

Hepsinin vurgu rengi `#22c55e`.

### 1. Takipçi — `tower-warrior-1` — **döner**

```
compact targeting scanner, a free-spinning reticle ring mounted over a squat
armored housing, crosshair etched across the ring, single short barrel offset
to one side, green #22c55e scan line sweeping the ring, exposed cable loom
running into the base
```

### 2. Sunucu — `tower-warrior-2` — sabit

```
server rack seen from above, four blade units slotted into a vented chassis,
dense port array with two thick fiber cables leaving opposite edges, green
#22c55e status LEDs in a vertical row, mesh grille top panel, no barrel,
no weapon
```

Kendi ateş etmez, iki kuleye bağlanır: iki kalın kablonun zıt kenarlardan çıkması bunu anlatır.

### 3. İzolasyon Kulesi — `tower-warrior-3` — sabit

```
containment field emitter, three curved pylons arranged around an empty center
with their tips converging, green #22c55e field arcing between the tips, heavy
grounded base with warning chevrons, no barrel, the empty center reading as the active part
```

### 4. Obsesyon Kulesi — `tower-warrior-4` — **döner**

```
mechanical fixation lens, a large iris aperture filling most of the top face,
stacked focus rings tightening toward the pupil, green #22c55e glow deep in the
iris throat, brass focus actuators around the rim, the whole object reading as
one unblinking eye
```

### 5. Debug Lazer — `tower-warrior-5` — **döner**

```
prism laser emitter, a triangular cut crystal held in a gimbal cradle, green
#22c55e beam splitting inside the prism, four large radiator fins spread around
the base glowing faint orange with heat, scorch marks near the fins, thin
precise muzzle
```

Aşırı ısınma mekaniği var: kızarmış radyatör kanatları bunu görünür kılar.

### 6. Ucube — `tower-warrior-6` — **döner**

```
unstable overgrown core, a matte black irregular mass that has burst out of its
containment frame, cyan and green #22c55e cracks glowing through the shell,
bent structural ribs still clinging to the sides, asymmetric lumpy silhouette,
clearly larger and heavier than the other towers
```

Geç oyun kulesi: diğerlerinden belirgin biçimde büyük ve düzensiz durmalı.

### 7. Derleyici — `tower-warrior-7` — **öneri, veride yok** — sabit

Kitte ekonomi kulesi yok. Önerilen rol: ateş etmez; her dalga sonunda sahadaki
**yalnız duran** Atakan kulesi sayısına göre altın üretir, yani pasifi ödüle çevirir.

```
compiler unit seen from above, a squat vented chassis with a build-progress bar
of eight segment lights across the top face filling left to right, green #22c55e
glow under the segment strip, coiled ribbon cable feeding in from one edge,
small stamped output tray on the opposite edge, no barrel, no weapon
```

Üretim yapan bir cihaz gibi durmalı; ilerleme çubuğu "her dalga bir şey teslim ediyor"
hissini taşır.

### 8. Güvenlik Duvarı — `tower-warrior-8` — **öneri, veride yok** — sabit

Kitte fiziksel engel yok. Önerilen rol: yol karesini kapatır, düşmanı yeniden
yönlendirir; kırılana kadar canı vardır ve üstünden geçmeye çalışan düşmana hasar verir.

```
firewall barrier segment, a heavy armored bulkhead slab spanning the tile edge to
edge, thick riveted top plating with a central seam, green #22c55e energy curtain
flickering in the seam gap, scorch and impact dents across the face, low and wide,
built to be hit rather than to shoot
```

Bariyer kulesi: Abartı gibi **1024×512 (2:1 yatay)** üretilmeli, kare değil.

---

## Melis — Psişik gotik

Ortak dil: göz, ağız, zincir, kırık cam, mühür. Organik ve rahatsız edici;
Atakan'ın aksine mühendislik ürünü gibi görünmemeli.

### 1. Hedefçi — `tower-archer-1` — `#8b5cf6` — **döner**

```
single fixated eye set in a ring of dark bone plates, pupil narrowed to a
vertical slit, violet #8b5cf6 glow behind the iris, thin needle spines around
the socket all angled inward toward the pupil, wet obsidian sheen
```

### 2. Parlama — `tower-archer-2` — `#db2777` — **döner**

```
swelling flare heart, a cracked dark shell straining around a bright core,
crimson pink #db2777 light forcing through widening fractures, shell plates
visibly pushed apart and about to burst, no barrel, tension in the silhouette
```

Öldüremezse patlar: kabuğun çatlayıp ayrılması bu gerilimi taşımalı.

### 3. Lanet Kulesi — `tower-archer-3` — `#7f1dff` — sabit

```
stacked curse seal, three concentric carved stone rings each engraved with
different sigils, deep purple #7f1dff residue pooling in the carved grooves and
overflowing the rim, thick tarry drips over the outer edge, no mechanism,
no barrel
```

Sınırsız biriken lanet: taşan, damlayan bir kap gibi durmalı.

### 4. Ölüler Bağı — `tower-archer-4` — `#14b8a6` — **döner**

```
underworld gate ring set flush into the ground around a black circular opening,
four heavy chains laid across the opening and hooked over the ring rim, teal
#14b8a6 spectral light welling up out of the hole, bone and iron gate frame, the
opening a flat disc that darkens toward its middle
```

### 5. Kırık Ayna — `tower-archer-5` — `#e879f9` — **döner**

```
shattered mirror disc held in a dark ornate frame, glass broken into large
angular shards still seated in place, orchid #e879f9 stored light trapped and
building behind the cracks, brightest at the fracture lines, faint reflection
of something not present in the shards
```

Hasar depolar sonra patlatır: çatlaklarda biriken ışık bunu anlatır.

### 6. Fısıltı Korosu — `tower-archer-6` — `#14b8a6` — sabit

```
choir of small open mouths arranged in a ring on a dark stone drum, all mouths
open mid-whisper, faint teal #14b8a6 sound rings rippling outward from the
cluster, worn carved stone, unsettling rather than mechanical, no barrel
```

### 7. Ağıt — `tower-archer-7` — `#a21caf` — **öneri, veride yok** — sabit

Kitte doğrudan alan hasarı yok; Melis'in tüm hasarı tekil hedef, lanet veya gecikmeli
patlama üzerinden geliyor. Önerilen rol: menzilindeki tüm düşmanlara sürekli, küçük
psişik alan hasarı veren bir ağıt.

```
mourning bell set into a cracked stone yoke and seen from straight above, so only
its crown and the concentric rings of its body are visible, dark magenta #a21caf
grief light bleeding outward from under the rim in rings, verdigris staining
spreading across the bronze, weathered black stone, no barrel
```

Sürekli alan hasarı: çan sallanır halde ve dalgalar dışa doğru okunmalı.

### 8. Yas Sunağı — `tower-archer-8` — `#2dd4bf` — **öneri, veride yok** — sabit

Melis'in stres biriktirmekten başka çıkışı yok. Önerilen rol: ateş etmez; biriken
stresi harcayarak nexusa can döndürür, yani baskıyı tahliye vanası olarak kullanır.

```
mourning altar seen from above, a low black stone slab with a shallow carved basin
in the center, pale teal #2dd4bf light pooling in the basin like still water, four
burnt candle stubs at the corners with thin smoke, folded cloth and small offerings
around the rim, completely passive, no mechanism, no barrel
```

Diğer Melis kuleleri saldırgan ve gergin; bu tek sakin nesne olmalı, karşıtlık kasıtlı.

---

## Durum

3×8 = 24 prompt tamam.

| Karakter | Oyunda aktif | Veride kapalı | Öneri |
|---|---:|---:|---:|
| Zeynep | 6 | 2 | 0 |
| Atakan | 6 | 0 | 2 |
| Melis | 6 | 0 | 2 |

**Öneri** işaretli 4 kule oyun verisinde yok. Sprite'ın neyi anlatacağı belli olsun diye
her birine bir rol yazıldı, ama maliyet, menzil, hasar ve denge değerleri
belirlenmedi — bunlar ayrı bir karar. Sadece görsel üretilecekse promptlar olduğu
gibi kullanılabilir; kuleler gerçekten eklenecekse önce `packages/shared` tarafında
tanımlanmaları gerekir.

Zeynep'in **Zirve Oku** ve **Emir Kulesi** kuleleri veride tanımlı fakat
`zeynep/turrets/index.ts` sonundaki `.filter()` ile listeden çıkarılıyor; o satır
kaldırılırsa ikisi de doğrudan oyuna girer.
