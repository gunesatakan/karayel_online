# Karayel — bağımsız 3D savaş önizlemesi

Canlı oyuna bağlanmayan, bir kule / bir mekanik düşman / kinetik mermi / enerji ışını içeren yerel görsel prototip. Modeller Three.js geometrilerinden bu örnek için üretildi; Tripo çıktısı veya tamamlanmış oyun varlığı değildir.

## Çalıştırma

Bu klasörde:

```sh
npm ci
npm run dev
```

Adres: http://127.0.0.1:5184

`npm run build` yalnızca bu klasördeki `dist/` dizinine çıktı verir. `npm test` görsel senaryonun zamanlama ve hareketli hedefe temas hesaplarını denetler.

## Kontroller

- Sol fare / tek parmak sürükleme: kamera dönüşü.
- Tekerlek / iki parmak: yakınlaştırma.
- Taktik 45°, yakın 30°, yüksek 65° kamera önayarları.
- Döngü: altışar saniye mermi ve ışın. İstenirse bir silaha sabitlenebilir.
- Duraklat, yavaş çekim, menzil göstergesi ve yeniden başlat.

## Canlı sürümden ayrım

- Kendi `package.json` ve kilit dosyası vardır; kök workspaces kapsamına girmez.
- `apps/web`, `apps/server`, `packages/shared`, kök bağımlılıklar ve yayın ayarları değiştirilmez.
- Oda, WebSocket, Colyseus, telemetri, hesap veya canlı sunucu çağrısı yoktur.
- Vite yalnızca 127.0.0.1 üzerinde çalışır.
- Mevcut oyunun dengesini temsil etmeyen deterministik yerel gösterim verisi kullanır. 3D görünümün canlı simülasyonla eşdeğerliği bu prototipte henüz test edilmez.
- Hiçbir otomatik yayın veya push adımı yoktur.

## Sonraki entegrasyon sınırı

Bu sahne önce görsel yönü ve kamera okunurluğunu değerlendirmek içindir. Onaylanan modeller ayrı bir GLB varlık kaydına taşınabilir. Daha sonraki oyun entegrasyonu mevcut snapshot'ları okuyacak sunum adaptörü ve ekran→zemin girdi dönüşümü gerektirir; mevcut sunucu kuralları korunmalıdır.
