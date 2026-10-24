# Karayel — bağımsız 3D varlık atölyesi

Canlı oyuna bağlanmayan yerel 3D önizleme. AttackLord'un altı ana kulesi, **1–4 / 5–9 / 10** seviye evreleriyle toplam **18 GLB** olarak hazırdır. Varsayılan görünüm yarı mat metal koleksiyonunun son seviye Takipçi modelidir. Oyunun beş orijinal zemin dokusu ve hücre ölçeği korunur.

## Metal koleksiyonu ve evrim

- İlk evrede pirinç, bakır ve boyalı metal; son evrede kullanıcının referansındaki koyu metal, camgöbeği ve magenta enerji dili kullanılır. Ara evre, ilk evrenin tabanı ve son evrenin çekirdeği/üst mekanizmasıyla hazırlanır.
- 11 yeni açılı görsel yerleşik `image_gen` ile üretildi. Tam girdiler `art-direction/evolution-prompts.json`, kaynak görseller aynı klasördedir. Takipçi başlangıç görseli aracın denetiminde reddedildiği için tekrar denenmedi; mevcut stilize Tripo kaynağı yeni metal malzemeyle işlendi.
- 11 yeni H3.1 tarayıcı üretimi **605 mevcut kredi** kullandı. Kaynak kimlikleri ve durumları `art-direction/evolution-sources.json` içindedir. API kullanılmadı.
- `inspect-evolution-model.py -- --key warrior-N-tier-T` ham modeli 40.000 üçgene ve 2K dokulara indirir; eski Takipçi kaynağı 50.000 üçgendir. `build-evolution-model.py` ölçülen yön/yüksekliklerle taban ve üst mekanizmayı ayırır. İzolasyon'un dik üretilen başlangıç tabanı `--flatten` ile zemine yatırılır. `build-evolution-hybrids.py` altı ara evreyi üretir.
- Metal için roughness 0,48, metallic 0,72 ve normal gücü 0,42; parlak enerji yüzeyleri ayrı emissive malzemeler kullanır. Renk ve normal haritaları GLB içine gömülüdür. Dosyalar yaklaşık 2,7–9,8 MB; ara evreler iki kaynağın dokularını içerir. Bütün modeller 60.000 üçgenin altındadır.
- Modeller yalnız seçildiğinde yüklenir; önbellek en fazla üç modeli tutar, eskilerin GPU kaynaklarını serbest bırakır. Bu bir görsel kalite önizlemesidir; çok sayıda eşzamanlı kule için LOD ve doku sıkıştırması ayrıca gerekir.
- `validation/warrior-N-tier-T.json` her çıktının hash, üçgen ve namlu bilgilerini kaydeder. 18 yeni geometri testi dönme/geri tepme boyunca hücre sınırını ve efekt çıkışını doğrular. Harita ve önceki testlerle birlikte **37 test** geçer.
- Ham GLB ve Blender ara dosyaları deponun kardeşindeki `asset-work/evolution/` içinde kalır. Canlı istemci, sunucu ve oyun kuralları değiştirilmez.

Tepeden bir görsel yükseklik ve yan yüz bilgisi içermez. Bu modellerde yan yüzler tasarım yorumudur; otomatik ve birebir 2D→3D rekonstrüksiyon iddiası yoktur.

## Önceki Takipçi kalite denemeleri

Görsel yön tercihi: **güçlü siluet ve zengin detay, beyazlamayan yumuşak renkler**. Ana parçalar ve renk grupları küçük ölçekte okunmalı; bakır platform, adaçayı yeşili mekanizma ve sıcak altın bağlantılar birbirinden ayrılmalı. Pastel ayarı doygunluğu ve parlaklığı dengelerken orta tonların rengini korumalı. Belirgin bevel'lar ve büyük plaka ayrımları korunur. Hücre ve harita ölçüsü bu sanat tercihinden bağımsızdır.

### Pastel örnek (önceki deneme)

- `build-pastel-model.py`, stilize GLB'nin geometrisini, UV'lerini ve hareket düğümlerini koruyarak ayrı `warrior-1-pastel.glb` üretir. Yeni Tripo üretimi veya kredi kullanımı yoktur.
- Orijinal albedo mesh'in köşe renklerine örneklenip yumuşak bakır, adaçayı yeşili, koyu mavi-yeşil ve sıcak altın paletine eşlenir; raster görsel düzenlenmez. Önceki fazla açık palet koyulaştırıldı ve gölge tonlarının beyaza doğru yükseltilmesi azaltıldı. Parlaklık azaltılır: metallic 0,22; roughness 0,76; normal strength 0,78. Yüzey detayı 2K normal haritasıyla korunur.
- 50.000 üçgen ve yaklaşık 5,0 MB. Kaynak/hash ve palet kaydı `validation/takipci-pastel.json`; güncel tarayıcı görüntüsü `validation/takipci-pastel-balanced.png`.
- **Model görünümü** menüsünden önceki canlı stilize, gerçekçi veya ilk taslak görünümüne dönülebilir. İndirilen GLB pastel renkleri içerir; tarayıcıya özel bir renk filtresi değildir.

### Canlı stilize örnek (karşılaştırma)

- Yerleşik **image_gen** referansı: `art-direction/takipci-stylized-v3.png`; tam prompt: `art-direction/takipci-stylized-v3-prompt.txt`. Daha kalın namlular, iri bakır plakalar, turkuaz gövde ve altın bağlantılar içerir.
- Tripo H3.1 tarayıcı üretiminde **55 mevcut kredi** kullanıldı. Kaynak 1.913.178 üçgen / 67,5 MB; önizleme çıktısı **50.000 üçgen / 5,3 MB**. Üç PBR haritası 2K'ya indirildi; renk ve metallic/roughness JPEG, normal haritası PNG olarak gömülüdür. Çok sayıda kule için LOD ve ek sıkıştırma sonraki kapsamdır.
- Kaynak `asset-work/takipci-v3/source.glb`, ara Blender dosyaları aynı kardeş klasördedir. Yeniden işlemek için `inspect-quality-model.py` ve `build-quality-model.py` Blender'a `-- --variant stylized` ile verilir. Varsayılan argümansız çalışma gerçekçi örneği işler.
- Kaynak bağlantısı, hash'ler, parça sayıları ve namlu çıkışı `validation/takipci-stylized.json` içindedir. Tarayıcı kontrolleri: `validation/takipci-stylized-detail.png` ve `validation/takipci-stylized-map.png`.

### Gerçekçi örnek (karşılaştırma)

- Yerleşik **image_gen** ile orijinal sprite'a bağlı açılı referans üretildi: `art-direction/takipci-quality-v2.png`. Tam prompt: `art-direction/takipci-quality-v2-prompt.txt`.
- Referans, oturumu açık Tripo tarayıcısında **H3.1** ile mesh'e dönüştürüldü; **55 mevcut kredi** kullanıldı. Kaynak model bağlantısı ve SHA-256 kayıtları `validation/takipci-quality.json` içindedir.
- Kaynak 1.922.775 üçgen ve yaklaşık 73 MB idi. Blender'da 80.000 üçgene indirildi; 4K renk, metallic/roughness ve normal haritaları korundu. Önizleme GLB'si yaklaşık 20,4 MB. Bu dosya yakın kalite incelemesi içindir; canlı oyunda çok sayıda kule için LOD ve doku sıkıştırması hâlâ gerekir.
- Sabit bakır platform, dönen merkez ve namlular ayrı parçalara ayrıldı. Namlu çıkış bilgisi GLB içinde saklanır. Model, geri tepme ve efektlerle birlikte tek hücre sınırını korur.
- Takipçi seçiliyken **Model görünümü** menüsü eski pastel, canlı stilize ve gerçekçi denemeleri karşılaştırma için korur. Altı kulenin ilk taslakları da seçilebilir; Ucube 2 × 2 ölçüsünü korur.
- İşleme için ham kaynak, deponun kardeşindeki `asset-work/takipci-v2/source.glb` dosyasında saklanır. `inspect-quality-model.py` sadeleştirme ve kontrol görüntülerini, `build-quality-model.py` parça ayrımı ve GLB çıktısını üretir. Bunlar ayrı Blender arka plan sürecinde çalışır; açık kullanıcının belgesini değiştirmez.

## Çalıştırma

Node 24 ile bu klasörde:

```sh
npm ci
npm run dev
```

Adres: http://127.0.0.1:5184

- Üstteki altı karttan kule seçilir; sağda orijinal oyun görseli bulunur.
- **Görsel evre** menüsünden steampunk, geçiş ve ileri teknoloji seçilir. **Model görünümü** menüsü eski denemeleri karşılaştırmak içindir.
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

- 19 Node testi: oyun koordinat dönüşümü, Ucube'nin gerçek 2 × 2 yerleşim kuralı, modellerin hareket ve yerleşim sınırı, namlu/efekt hizası, gerçekçi/stilize/pastel modellerin malzemeleri ve hash'leri, farklı kare hızlarında temas zamanlaması ve destek kulelerinin hasarsızlığı.
- `npm run build`: yalnızca bu klasördeki `dist/` dizinine çıktı verir.
- Tarayıcıda altı kule, beş zemin, detay kamerası, ızgara ve duraklatma kontrol edilir.
- Blender 5.2.3 LTS arka plan içe aktarma kontrolü: `tests/blender_import.py`. Sonuç: `validation/blender-import.json`. Kullanıcının açık Blender belgesine dokunmaz; ayrı arka plan süreci kullanır.

## Canlı sürümden ayrım ve kalan kapsam

- Kendi `package.json` ve kilit dosyası vardır; kök workspaces kapsamına girmez.
- `apps/web`, `apps/server`, `packages/shared`, kök bağımlılıklar ve yayın ayarları değiştirilmez.
- Oda, WebSocket, Colyseus, telemetri, hesap veya canlı sunucu bağlantısı yoktur. Vite yalnızca 127.0.0.1 üzerinde çalışır.
- Üst seviye kule varyantları, diğer karakterlerin kuleleri, ikmal binaları, düşman varlıklarının aktarımı ve gerçek oyun sunum adaptörü sonraki kapsamdır.
- Takipçi'nin yeni örneği aşınma ve PBR dokuları içerir. Diğer beş kulenin kalite geçişi ve çok sayıda kule için çizim çağrısı optimizasyonu sonraki kapsamdır.
- Otomatik yayın veya push adımı yoktur.
