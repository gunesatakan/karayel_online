# 3D görünüm (deneme: aşama 1, 2a, 2b ve serbest kamera)

Canlı istemcide modeli olan kuleleri three.js ile çizen isteğe bağlı katman. Oyun kuralları, sunucu ve ağ trafiği değişmez; katman yalnızca anlık durumdaki kulelerin yerini, seviyesini ve yönünü okur.

## Açmak

- Oyun içi menü → **Görünüm → 3D görünüm (deneme)**: *2D*, *3D kuleler, tepeden* ya da *3D kuleler, açılı*. Tercih tarayıcıda saklanır.
- Test için adres: `?towers3d=on` (tepeden), `?towers3d=angled` (açılı), `?towers3d=off` (2D).
- Varsayılan **2D**. Cihazda WebGL2 yoksa ya da derlemede kapalıysa seçici hiç görünmez.

## Açılı görünüm (aşama 2a + 2b)

- Phaser'ın zemin karesi her karede doku olarak bir tahtaya serilir; 3D kuleler onun üstünde ayakta durur. Phaser tuvali görünmez (`opacity: 0`) ama girdiyi almaya devam eder.
- **Serbest kamera (önizlemedeki gibi):** açılışta 45°, kuzey yukarıda, harita genişliğe sığıyor. İki parmakla kıstırma yaklaştırır (0,5–5 kat), burma haritayı döndürür (her zaman haritanın merkezi çevresinde: merkez ekranda yerinde kalıyor), iki parmağı birlikte yukarı-aşağı kaydırmak eğer (15–70°), birlikte sürüklemek kaydırır. Farede tekerlek yaklaştırır, orta tuşla sürükleme döndürür ve eğer, Shift + orta tuş kaydırır. Tek parmak oyunun (kule seçme, sürükleme, beceri jestleri). İkinci parmak indiğinde birinci parmağın oyun jesti geri alınır; kamera jestinin olayları oyuna hiç ulaşmaz (`render3d/camera-gestures.ts`). Menüde **Kamerayı sıfırla** açılış haline döner.
- **Işık (ay yüzeyi):** kısık ortam ve gök ışığı, soğuk beyaz sert güneş (sol-önden, ~54°), zayıf mavi kenar ışığı, pozlama 0,95; kuleler tahtaya gölge düşürür (gölge düzlemi), arka plan önizlemenin zemin rengi. Önizlemenin parlama (bloom) geçişi yok: telefonda pahalı ve tahta saydam katmanla çakışıyor.
- Kule sürüklerken kule parmağın ekranda üstüne kalkar (harita dönükken de), dünyanın kuzeyine değil.
- **Arazi:** kurulum yasak bölgeler (turuncu çerçeveli) lekeler hâlinde dönüşümlü kayalık tepe ya da derin çukur; yükseklik yalnızca bölge karelerinin içinde, kenarda sıfır, kule kurulan komşu kareler düz (`render3d/terrain.ts`). Lekeler haritada sırayla tepe ve çukur. Bölgelerin yüzeyi haritanın zemin resmiyle kaplı, ışık alıyor ve gölge düşürüyor. Arenanın sağında ve solunda kayalık yamaçlar (24°'den yatık; 25°'nin üstündeki kamera arena kenarını kaybetmiyor); üst ve alt açık. Tepeler 1,5, çukurlar 1,9 hücre boyunda/derinliğinde (`ZONE_HILL_CELLS`, `ZONE_PIT_CELLS`). Düşmanlar tepeye tırmanır, çukura iner; geçerken yavaşlarlar (aşağıda, oyun kuralları).
- **Madenler 3D:** beş maden (enerji, barut, demir, mistik, plazma) Tripo modeli olarak çiziliyor; 2D ikonları gizli, kalan miktar yazısı zeminde. Tükenen maden kararıyor. Tasarım: oyunun ikonundan GPT Image 2.5 (`tools/3d-preview/art-direction/mines/`), model: Tripo H3.1 (5 × 55 kredi), oyun kopyası: `build-structure-lods.py -- mines` (düzeltilmiş, ortalanmış, 1 birim genişlik, ~8 bin üçgen, 512 px JPEG).
- **Binalar ve duvar 3D:** enerji kulesi, cephanelik, hammadde deposu ve tamir merkezi (AttackLord'unki dahil) iki kademe (seviye 1–4 ve 5+, 2D resimlerdeki gibi) ve duvar Tripo modeli. Duvar bir hücre kenarı boyunda, parçalar uç uca değiyor; açık kapı alçak. Tasarım: binanın o seviyedeki oyun ikonundan GPT Image 2.5 (`art-direction/buildings/`), model: Tripo H3.1 (9 × 55 kredi), oyun kopyası: `build-structure-lods.py -- buildings` / `-- wall`. Modeller tepeden 3D görünümde de çiziliyor.
- **İşçiler 3D:** tek ortak dron modeli (Tripo, `art-direction/workers/`), yerde ve hareket yönüne dönüyor; 2D'deki boyunun yarısı. Rol oyunda eklenen parçalardan okunuyor: rol renginde parlayan süzülme halkası (Toplayıcı mor, Taşıyıcı kehribar, Tamirci yeşil; AttackLord'un ulti dronları kırmızı ve camgöbeği), yük taşırken altında yükü (mor kristal ya da kehribar kutu), Tamircinin üstünde yeşil artı. Gelişmiş işçinin beşgeni ve can çubuğu zeminde kalıyor.
- **Ana karakter 3D:** ZentaX (`zeynep`) ve AttackLord (`warrior`) bedenleri Tripo modeli (`art-direction/operators/`, 2 × (20 + 55) kredi; oyun kopyası `build-structure-lods.py -- operators`). Yerde duruyor ve 2D'deki boyunun yarısı (`OPERATOR_SIZE_SCALE`); yüzü 2D resmin baktığı yöne dönüyor (modelde kollar -X'te, `OPERATOR_MODEL_YAW_OFFSET`); düşünce sönük. Gölgesi, izi, iş ışını ve can çubuğu zeminde kalıyor.
- **Haritalar 3D'de yeniden:** beş bölümün zemini sıfırdan, GPT Image 2.5 4K ile (`art-direction/maps/`), oyunda 2048 px (`models3d/terrain/stage-N.jpg`). Zemin 3D'de ışıklı ve gölgeli, eski 2D zeminin karanlığında (doku koyulaştırılıyor; kuleler ve madenler öne çıksın) çiziliyor, arenanın ötesine de uzanıyor; Phaser'ın zemin resmi gizli ve Phaser karesi (halkalar, çizgiler, bölge çerçeveleri) üstüne "ekran" karışımıyla biniyor. Bu yüzden Phaser'da koyu çizilen ayrıntılar (yanık izleri, koyu gölgeler) 3D'de görünmüyor. Maden miktarları 3D'de keskin yazı. 2D oyun ve itch.io eski zeminlerle.
- **Düşmanlar ayakta (2b):** panolar 2D sprite'ın yarı boyunda (`STANDEE_SIZE_SCALE`, yalnızca görünüş). düşman sprite'ları Phaser'da çizilmez (yalnızca kamera süzgeci; konum ve durumları değişmez). Her karede son halleri (doku, boy, dönüş, ton, vuruş flaşı, saydamlık) 3D sahnede kameraya dönük panolara kopyalanır; panonun alt kenarı ekranda ayağına değer, altında yumuşak bir gölge var. Uçan düşmanlar 0,45 hücre daha yukarıda. Kulelerle derinlik doğru: önündeki kule düşmanı örter.
- **Efektler kalkık (2b):** Phaser'ın ikinci kamerası (`air3d`) zemin alındıktan sonra aynı tuvale yalnızca ışın, mermi, iz, namlu/çarpma, kırıntı, nişangâh ve hasar sayılarını çizer (`ANGLED_AIR_DEPTH_BANDS`). Bu kare tahtanın bir piyade gövdesi yüksekliğindeki ikinci düzleme "ekran" karışımıyla serilir: mermiler ve vuruşlar ayakta duran düşmanın gövdesine denk gelir. Düşmanın işaretleri de bu düzlemde; can çubuğu 3D'de, panonun başının üstünde ve kameraya dönük.
- Haritanın bütün girdisi (DOM köprüsü `createBridgePointer`, kule sürükleme `getTowerDragPreviewPointFromClient`, Phaser işaretçisi `transformPointer`) `untiltClient` ile eğimden geri çözülür. Sunucuya giden koordinatlar ve dokunma kuralları değişmez; efekt kamerası girdi almaz.
- Bilinen sınırlar: harita döndürülünce Phaser'da çizilen yazılar (hasar sayıları, "3000" etiketleri, düşman işaretleri) de haritayla birlikte döner. Çok yakınlaşınca tahta dokusu (Phaser karesi) bulanıklaşır. Haritaya bağlı DOM pencereleri kameranın dönüşünü bilmez. Düşman çizimleri tepeden bakış; panoda da tepeden görünürler. Kalkan halkası, kanama/buz izleri ve ırk efektleri zeminde, ayağın çevresinde kalır. Efekt düzlemi her şeyin üstünde (2D'deki gibi): bir kulenin arkasından geçen mermi kulenin önünde görünür; ışınlar kule namlusundan değil gövdesinin ortasından çıkar. Phaser içinde çizilen kaynak paneli ve "Geri al" düğmesi de eğik basılır; uzun bir kulenin tepesine dokunmak zemindeki kuzeyindeki hücreye denk gelir.
- Maliyet: açılı görünümde Phaser tuvali her karede 3D'ye doku olarak kopyalanıyor (efekt varken iki kez). Bu yüzden açılı görünümde Phaser tuvali en çok 1,25 ölçekte çiziliyor (2D'de telefonda 2; `ANGLED_MAX_RENDER_SCALE`), 3D çizim en çok 1,5 (telefonda 1,25) piksel oranında, gölge haritası 1024 px ve yalnızca kuleler değişince en çok üç karede bir yenileniyor; havada efekt olmayan karelerde ikinci kopya atlanıyor. Görünüme girip çıkınca tuval yeniden boyutlanıyor; 2D ve tepeden 3D'de çözünürlük aynı.

## Ne değişir

- AttackLord'un 6 ve ZentaX'ın 5 kulesi ile Abartı rayı, 1–4 / 5–9 / 10 kademesine göre 3D model olarak çizilir; 2D gövdeleri gizlenir.
- Kamera tam tepeden ve Phaser kamerasına kilitli: model 2D hücresine birebir oturur. Halka, menzil, can çubuğu, efektler, dokunma ve yerleştirme 2D'de kalır.
- Tükenmiş, devre dışı ya da yıkık kule ve modeli olmayan yapılar (duvar, ikmal binaları) 2D çizilir.
- three.js ayrı bir parça olarak yalnızca 3D açılınca yüklenir; 2D oyuncunun indirdiği paket aynı kalır.

## Oyun kuralları (sunucu, 2D'de de geçerli)

- **Kaynak düğümleri yer kaplar:** kara düşmanı madenin hücresine girmez, çevresinden dolaşır; uçan düşman üstünden geçer. Özel düşmanların yol alanı düğüm hücresine maliyet yazar ama oradan genişlemez (düğüm üstünde doğan düşman çıkabilir); akış değişimi duyurusu düğümleri yok sayar (`MatchRoom.isResourceNodeCell`, `resourceNodesSolid`).
- **Tepe ve çukurdan geçiş yavaş:** kara düşmanı ve işçi kurulum yasak bölge hücresinde 0,66 hızla ilerler (`BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER`, `MatchRoom.getTerrainSpeedMultiplier`); uçanlar etkilenmez, oyuncu yavaşlatması sayılmaz.
- Testler: `tests/resource-node-terrain.test.mjs`. Bu kurallar kök `tests/`, `apps/server` ve `packages/shared` dosyalarına dokunduğu için o push sunucuyu yeniden yayınlar (onaylı).

## Sunucuya dokunmamak

`main`e push, `.github/workflows/fly-server-deploy.yml` içindeki yollardan birine dokunursa canlı sunucu yeniden yayınlanır. Bu yüzden:

- three.js npm'den değil kopyadan gelir: `apps/web/vendor/three/` (kök `package-lock.json` değişmez).
- Katmanın testleri kök `tests/` yerine `apps/web/tests/` altında: `npm run test --workspace @karayel/web`.
- `node tools/check-client-only.mjs` dalın ve çalışma ağacının bu yollara dokunmadığını denetler; yerelde `.git/hooks/pre-commit` olarak da çalıştırılabilir (`--staged`).

## itch.io

`npm run build:itch` 3D'yi derlemede kapatır (`VITE_TOWERS_3D=off`) ve `models3d/` klasörünü pakete almaz. itch sürümü 2D kalır.

## Modeller

`apps/web/public/models3d/` altındaki 36 GLB, 3D önizlemenin (`tools/3d-preview`) modellerinin oyun kopyasıdır: ~6.000 üçgen, 512 px JPEG doku, toplam ~13 MB. Yeniden üretmek: `tools/3d-preview` içinde `blender --background --python build-game-lods.py`.

## Sonraki adımlar

- Işınları ve mermileri kule namlusunun (`muzzle-socket`) yüksekliğinden çıkarmak.
- Düşmanlara yandan görünen çizim ya da 3D model.
- Telefonda kare süresini ölçmek.
