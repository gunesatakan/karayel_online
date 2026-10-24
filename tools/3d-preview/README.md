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

## Harita ve hücre ölçeği

- Önizleme oyunun varsayılan açık arenasını kullanır: **12 × 18 hücre**, hücre başına **34 × 34 oyun birimi**, toplam **408 × 612**. Eski 16,8 × 12,5 serbest gösterim platformu kaldırılmıştır.
- `sync-map-contract.mjs` boyutları sunucunun `configureArenaForScale` kaydından okur; hücre boyutunu, başlangıç konumunu ve sınırları gerçek `shared/map.ts` fonksiyonlarıyla hesaplar. Canlı sunucuyu çalıştırmaz veya ona bağlanmaz.
- `src/game-map.json` yalnızca önizlemeye ait üretilmiş kayıttır. `predev`, `prebuild` ve `pretest` kaydın oyun kaynaklarıyla aynı kaldığını kontrol eder. Kaynaklar değişirse `npm run sync:map` sonrası farklar gözden geçirilmelidir. Bu script için Node 24 kullanılır.
- Her iki zemin ekseninde aynı dönüşüm kullanılır: **34 oyun birimi = 1 sahne birimi**. Kamera eğimi perspektifi değiştirir; harita/hücre/model oranlarını değiştirmez.
- Kule hücre merkezindedir; altın çerçeve 1 × 1 hücreyi gösterir. Dönen namlular ve en büyük namlu parlaması dahil tüm geometrisi hücre yarıçapından küçük bir çember içine sığar. Bu, ara dönüş açıları dahil komşu hücreye taşmayı engeller. Taban da aynı sınırın içindedir.
- Önceki büyük kule platformu, hücreleri kapatan dekoratif yaklaşım şeridi ve kablo kaldırılmıştır. Düşman, çıkış noktaları ve efektler de küçük modellerin ölçülerine uyarlanmıştır.

## Canlı sürümden ayrım

- Kendi `package.json` ve kilit dosyası vardır; kök workspaces kapsamına girmez.
- `apps/web`, `apps/server`, `packages/shared`, kök bağımlılıklar ve yayın ayarları değiştirilmez.
- Oda, WebSocket, Colyseus, telemetri, hesap veya canlı sunucu çağrısı yoktur.
- Vite yalnızca 127.0.0.1 üzerinde çalışır.
- Mevcut oyunun dengesini temsil etmeyen deterministik yerel gösterim verisi kullanır. 3D görünümün canlı simülasyonla eşdeğerliği bu prototipte henüz test edilmez.
- Hiçbir otomatik yayın veya push adımı yoktur.

## Sonraki entegrasyon sınırı

Bu sahne önce görsel yönü ve kamera okunurluğunu değerlendirmek içindir. Onaylanan modeller ayrı bir GLB varlık kaydına taşınabilir. Daha sonraki oyun entegrasyonu mevcut snapshot'ları okuyacak sunum adaptörü ve ekran→zemin girdi dönüşümü gerektirir; mevcut sunucu kuralları korunmalıdır.
