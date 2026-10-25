# 3D kuleler (deneme, aşama 1)

Canlı istemcide modeli olan kuleleri three.js ile çizen isteğe bağlı katman. Oyun kuralları, sunucu ve ağ trafiği değişmez; katman yalnızca anlık durumdaki kulelerin yerini, seviyesini ve yönünü okur.

## Açmak

- Oyun içi menü → **Görünüm → 3D kuleler (deneme)**. Tercih tarayıcıda saklanır.
- Test için adres: `?towers3d=on` (kapatmak için `?towers3d=off`).
- Varsayılan **kapalı**. Cihazda WebGL2 yoksa ya da derlemede kapalıysa anahtar hiç görünmez.

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

## Sonraki aşama

Açılı kamera: zemin, düşmanlar, mermiler ve ışınların da 3D sahneye taşınması ve dokunmanın zemine izdüşürülmesi.
