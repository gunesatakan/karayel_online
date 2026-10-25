# 3D görünüm (deneme: aşama 1, 2a, 2b ve serbest kamera)

Canlı istemcide modeli olan kuleleri three.js ile çizen isteğe bağlı katman. Oyun kuralları, sunucu ve ağ trafiği değişmez; katman yalnızca anlık durumdaki kulelerin yerini, seviyesini ve yönünü okur.

## Açmak

- Oyun içi menü → **Görünüm → 3D görünüm (deneme)**: *2D*, *3D kuleler, tepeden* ya da *3D kuleler, açılı*. Tercih tarayıcıda saklanır.
- Test için adres: `?towers3d=on` (tepeden), `?towers3d=angled` (açılı), `?towers3d=off` (2D).
- Varsayılan **2D**. Cihazda WebGL2 yoksa ya da derlemede kapalıysa seçici hiç görünmez.

## Açılı görünüm (aşama 2a + 2b)

- Phaser'ın zemin karesi her karede doku olarak bir tahtaya serilir; 3D kuleler onun üstünde ayakta durur. Phaser tuvali görünmez (`opacity: 0`) ama girdiyi almaya devam eder.
- **Serbest kamera (önizlemedeki gibi):** açılışta 45°, kuzey yukarıda, harita genişliğe sığıyor. İki parmakla kıstırma yaklaştırır (0,5–5 kat), burma haritayı döndürür, iki parmağı birlikte yukarı-aşağı kaydırmak eğer (15–70°), birlikte sürüklemek kaydırır. Farede tekerlek yaklaştırır, orta tuşla sürükleme döndürür ve eğer, Shift + orta tuş kaydırır. Tek parmak oyunun (kule seçme, sürükleme, beceri jestleri). İkinci parmak indiğinde birinci parmağın oyun jesti geri alınır; kamera jestinin olayları oyuna hiç ulaşmaz (`render3d/camera-gestures.ts`). Menüde **Kamerayı sıfırla** açılış haline döner.
- **Işık önizlemeden:** yarım küre, güneş (sol-önden, ~54°) ve mavi kenar ışığı, pozlama 0,95; kuleler tahtaya gölge düşürür (gölge düzlemi), arka plan önizlemenin zemin rengi. Önizlemenin parlama (bloom) geçişi yok: telefonda pahalı ve tahta saydam katmanla çakışıyor.
- Kule sürüklerken kule parmağın ekranda üstüne kalkar (harita dönükken de), dünyanın kuzeyine değil.
- **Düşmanlar ayakta (2b):** düşman sprite'ları Phaser'da çizilmez (yalnızca kamera süzgeci; konum ve durumları değişmez). Her karede son halleri (doku, boy, dönüş, ton, vuruş flaşı, saydamlık) 3D sahnede kameraya dönük panolara kopyalanır; panonun alt kenarı ekranda ayağına değer, altında yumuşak bir gölge var. Uçan düşmanlar 0,45 hücre daha yukarıda. Kulelerle derinlik doğru: önündeki kule düşmanı örter.
- **Efektler kalkık (2b):** Phaser'ın ikinci kamerası (`air3d`) zemin alındıktan sonra aynı tuvale yalnızca ışın, mermi, iz, namlu/çarpma, kırıntı, nişangâh ve hasar sayılarını çizer (`ANGLED_AIR_DEPTH_BANDS`). Bu kare tahtanın bir piyade gövdesi yüksekliğindeki ikinci düzleme "ekran" karışımıyla serilir: mermiler ve vuruşlar ayakta duran düşmanın gövdesine denk gelir. Düşmanın işaretleri de bu düzlemde; can çubuğu 3D'de, panonun başının üstünde ve kameraya dönük.
- Haritanın bütün girdisi (DOM köprüsü `createBridgePointer`, kule sürükleme `getTowerDragPreviewPointFromClient`, Phaser işaretçisi `transformPointer`) `untiltClient` ile eğimden geri çözülür. Sunucuya giden koordinatlar ve dokunma kuralları değişmez; efekt kamerası girdi almaz.
- Bilinen sınırlar: harita döndürülünce Phaser'da çizilen yazılar (hasar sayıları, "3000" etiketleri, düşman işaretleri) de haritayla birlikte döner. Çok yakınlaşınca tahta dokusu (Phaser karesi) bulanıklaşır. Haritaya bağlı DOM pencereleri kameranın dönüşünü bilmez. Düşman çizimleri tepeden bakış; panoda da tepeden görünürler. Kalkan halkası, kanama/buz izleri ve ırk efektleri zeminde, ayağın çevresinde kalır. Efekt düzlemi her şeyin üstünde (2D'deki gibi): bir kulenin arkasından geçen mermi kulenin önünde görünür; ışınlar kule namlusundan değil gövdesinin ortasından çıkar. Phaser içinde çizilen kaynak paneli ve "Geri al" düğmesi de eğik basılır; uzun bir kulenin tepesine dokunmak zemindeki kuzeyindeki hücreye denk gelir.
- Maliyet: açılı görünümde Phaser tuvali her karede 3D'ye doku olarak kopyalanıyor (efekt varken iki kez). Bu yüzden açılı görünümde Phaser tuvali en çok 1,25 ölçekte çiziliyor (2D'de telefonda 2; `ANGLED_MAX_RENDER_SCALE`), 3D çizim en çok 1,5 (telefonda 1,25) piksel oranında, gölge haritası 1024 px ve yalnızca kuleler değişince en çok üç karede bir yenileniyor; havada efekt olmayan karelerde ikinci kopya atlanıyor. Görünüme girip çıkınca tuval yeniden boyutlanıyor; 2D ve tepeden 3D'de çözünürlük aynı.

## Ne değişir

- AttackLord'un 6 ve ZentaX'ın 5 kulesi ile Abartı rayı, 1–4 / 5–9 / 10 kademesine göre 3D model olarak çizilir; 2D gövdeleri gizlenir.
- Kamera tam tepeden ve Phaser kamerasına kilitli: model 2D hücresine birebir oturur. Halka, menzil, can çubuğu, efektler, dokunma ve yerleştirme 2D'de kalır.
- Tükenmiş, devre dışı ya da yıkık kule ve modeli olmayan yapılar (duvar, ikmal binaları) 2D çizilir.
- three.js ayrı bir parça olarak yalnızca 3D açılınca yüklenir; 2D oyuncunun indirdiği paket aynı kalır.

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
