# Karayel — bağımsız 3D varlık atölyesi

Canlı oyuna bağlanmayan yerel 3D önizleme. İlk varlık geçişi AttackLord'un altı ana kulesinin **seviye 1–4** görünümlerini ve oyunun beş zemin dokusunu kapsar. Kuleler kaynak görsellerin renk, siluet ve parça düzenine göre Three.js geometrileriyle yeniden tasarlandı, GLB olarak dışa aktarıldı. Tarayıcı bu GLB dosyalarını yükler.

Tepeden bir görsel yükseklik ve yan yüz bilgisi içermez. Bu modellerde yan yüzler tasarım yorumudur; otomatik ve birebir 2D→3D rekonstrüksiyon iddiası yoktur. Tripo kredisi kullanılmadı.

## Çalıştırma

Node 24 ile bu klasörde:

```sh
npm ci
npm run dev
```

Adres: http://127.0.0.1:5184

- Üstteki altı karttan kule seçilir; sağda orijinal oyun görseli bulunur.
- **Harita / Yüksek** tüm alanı gösterir. **Kule detayı / Tepeden** yalnızca kamerayı yaklaştırır.
- Harita menüsü Taş Kuşatma, Çelik Hat, Sürü, Düşüş ve Katlanma dokularını değiştirir.
- Altın çerçeve yerleşim sınırıdır: **Ucube 2 × 2 (4 kare)**, diğer beş kule **1 × 1** hücre kaplar. Izgara açılıp kapatılabilir.
- **GLB modelini indir** seçilen modeli Blender veya başka bir glTF aracında düzenlemek için indirir.
- **Savaş efektlerini dene** görsel test modlarını açar. Kuleye göre modunda Sunucu ateş etmez, İzolasyon alan gösterir, Debug Lazer ışın kullanır. Bu yerel örnek gerçek savaş kurallarının eşdeğer uygulaması değildir.

## Aktarılan varlıklar

| Oyun kimliği | Ad | İlk 3D yorum |
| --- | --- | --- |
| warrior-1 | Takipçi | Bakır kiremitli disk, yeşil döner gövde, çift namlu |
| warrior-2 | Sunucu | İç içe halkalar, veri çekirdeği ve taşıyıcı çubuklar |
| warrior-3 | İzolasyon Kulesi | Dört bakır bobin, merkez çekirdeği |
| warrior-4 | Obsesyon Kulesi | Mor zırh dilimleri, altın çerçeve ve odak merceği |
| warrior-5 | Debug Lazer | Radyal mavi enerji tüpleri, lazer başlığı |
| warrior-6 | Ucube | 2 × 2 hücrelik bakır disk, ağır yeşil gövde, kalın namlu, üç bobin |

GLB dosyaları `public/game-assets/models/` içindedir. Her modelde `turret-yaw`, `barrels-recoil` ve `muzzle-socket` düğümleri bulunur; nişan, geri tepme ve efekt çıkış noktaları ayrı tutulur.

Harita için `apps/web/public/images/terrain/stage-1.jpg` … `stage-5.jpg` dosyaları birebir kopyalanmıştır. Zemin, orijinal görüntünün tamamını oyunla aynı oranlarda kullanan düz 3D yüzeydir; kayalıkların ayrı hacimli modelleri veya oynanışı etkileyen yükseklikler bu aşamada eklenmemiştir. Önceki dekoratif renkli giriş/çıkış satırları kaldırılmış, oyundaki üst/alt kenar renkleri korunmuştur.

## Kaynak eşleme ve üretim

```sh
npm run sync:map       # Salt okunur oyun kaynaklarından harita sözleşmesini yeniler
npm run sync:assets    # 6 referans görselini ve 5 zemini kopyalar; SHA-256 kaydı üretir
npm run models:export  # tower-models.js tasarımlarını GLB olarak üretir
npm test
npm run build
```

`predev`, `pretest` ve `prebuild` harita sözleşmesini, 11 kaynak görselin birebir eşliğini ve GLB dosyalarının model kaynaklarıyla güncel olduğunu doğrular. `public/game-assets/provenance.json` kaynak yolları ve hash değerlerini içerir. Kaynaklar değişirse ilgili eşleme komutu çalıştırılıp fark gözden geçirilir.

## Harita ve hücre ölçeği

- Varsayılan arena **12 × 18 hücre**, hücre başına **34 × 34 oyun birimi**, toplam **408 × 612** olarak korunur.
- `sync-map-contract.mjs` boyutları sunucunun `configureArenaForScale` kaydından okur; başlangıç ve sınırları gerçek `shared/map.ts` fonksiyonlarıyla hesaplar. Sunucuya bağlanmaz.
- Her iki zemin ekseninde **34 oyun birimi = 1 sahne birimi**. Kamera değişimi bu oranı değiştirmez.
- Ucube, oyunun `footprintSpan: 2` kuralına uygun olarak dört komşu hücrenin ortak köşesine merkezlenir. Model ve efekt çıkışları iki hücre genişliğine ölçeklenir; diğer kuleler tek hücre merkezinde kalır.
- GLB köşeleri, dönen namlular, geri tepme ve namlu parlaması dahil Ucube için yerleşim merkezine 0,985; diğer kulelerde 0,485 sahne biriminden yakındır. Dairesel sınır, ara nişan açılarını da kapsar.
- Zemin dokusu değişiminde geometri ve hücre koordinatları sabit kalır.

## Doğrulama

- 13 Node testi: oyun koordinat dönüşümü, Ucube'nin gerçek 2 × 2 yerleşim kuralı, altı dışa aktarılmış GLB'nin hareket ve yerleşim sınırı, namlu/efekt hizası, farklı kare hızlarında temas zamanlaması ve destek kulelerinin hasarsızlığı.
- `npm run build`: yalnızca bu klasördeki `dist/` dizinine çıktı verir.
- Tarayıcıda altı kule, beş zemin, detay kamerası, ızgara ve duraklatma kontrol edilir.
- Blender 5.2.3 LTS arka plan içe aktarma kontrolü: `tests/blender_import.py`. Sonuç: `validation/blender-import.json`. Kullanıcının açık Blender belgesine dokunmaz; ayrı arka plan süreci kullanır.

## Canlı sürümden ayrım ve kalan kapsam

- Kendi `package.json` ve kilit dosyası vardır; kök workspaces kapsamına girmez.
- `apps/web`, `apps/server`, `packages/shared`, kök bağımlılıklar ve yayın ayarları değiştirilmez.
- Oda, WebSocket, Colyseus, telemetri, hesap veya canlı sunucu bağlantısı yoktur. Vite yalnızca 127.0.0.1 üzerinde çalışır.
- Üst seviye kule varyantları, diğer karakterlerin kuleleri, ikmal binaları, düşman varlıklarının aktarımı ve gerçek oyun sunum adaptörü sonraki kapsamdır.
- Dokuların ilk görsel geçişi tamamlanmıştır; ayrıntılı yıpranma/PBR doku işi ve çok sayıda kule için çizim çağrısı optimizasyonu daha sonra yapılacaktır.
- Otomatik yayın veya push adımı yoktur.
