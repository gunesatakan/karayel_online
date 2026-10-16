# Maç kaydedicisi ("uçuş kaydı")

Geç oyunda "kasıyor" şikâyetinin sebebini kesin bulmak için sunucu **her maçı** kaydeder: saniye saniye performans zaman çizelgesi ve maçı birebir yeniden oynatmaya yetecek girdiler. Kayıt yönetim panelinden (`/admin`) incelenir, indirilir; indirilen kayıt gerçek `MatchRoom` ile yeniden oynatılıp profil çıkarılır.

Sorunun üç adayı aynı zaman ekseninde görünür:

| Aday | Nerede görünür |
|---|---|
| Sunucu tick'i (oyun mantığı) | tick süresi ve bölümleri (kuleler, mermiler, düşmanlar, bedenler, efsanevi etkiler, snapshot, tel/gönderim...), takılma listesi (o anki düşman/mermi/hasar olayı sayılarıyla) |
| Sunucu süreci | tick aralığı (16,7 ms normal; uzarsa olay döngüsü tıkanmış), olay döngüsü gecikmesi, GC duraklamaları, CPU (bir çekirdeğin yüzdesi; Fly paylaşımlı CPU kısılması burada), bellek, aynı süreçteki oda sayısı, durum yaması (Colyseus şema) süresi |
| Ağ / serileştirme | istemci başına giden KB/s, gönderilen snapshot Hz'i, kuyruk dolduğu için atlanan kareler, istemcinin gönderim kuyruğu |
| İstemci çizimi (izinli oyuncu) | FPS ort./en düşük, kare süresi p50/p95/max, istemci bölümleri (`recordClientPerfSection`), efekt LOD seviyesi, snapshot tamponu/düşen kare/oynatılamayan kare, ping, JS yığını, cihaz sınıfı, sekme gizlenmesi, WebGL bağlam kaybı |

## Mimari

```
MatchRoom ──(saat/zar)── RoomRuntime          apps/server/src/debug/room-runtime.ts
    │                     live: Date.now/Math.random (testler, simülatör)
    │                     seeded: oda başına tohumlu üreteç + donmuş saat (üretim, yeniden oynatma)
    └──(kancalar)──── MatchRecorder           apps/server/src/debug/recorder.ts
                          │ bellekte: tick bandı, olaylar, saniye satırları
                          ▼ 30 sn'de bir / tampon dolunca, setImmediate ile tick dışında
                      DebugRecordingStore     apps/server/src/debug/store.ts
                          gzip (iş parçacığı havuzu) → /data/debug/<id>.ndjson.gz + <id>.json
ProcessSampler (süreç başına, saniyede bir)  apps/server/src/debug/process-sampler.ts
Panel + API (/admin)                          apps/server/src/debug/admin.ts, admin-panel.ts
Okuyucu (panel ve araçlar ortak)              apps/server/src/debug/reader.ts
İstemci örneği (izinli oyuncu)                apps/web/src/match-debug.ts → "debug:client"
Araçlar                                       tools/debug/{fetch,report,replay-profile}.mjs
```

### Belirlenimci oda

Üretimde her oda kendi tohumlu üretecini (`mulberry32`, tohum `crypto`dan) ve kendi saatini kullanır; sürecin ortak `Math.random`'ı **değiştirilmez** (aynı süreçte birden fazla maç var). `MatchRoom` içindeki bütün `Date.now()` ve `Math.random()` çağrıları `this.runtime.now()` / `this.runtime.random()` oldu; paylaşılan yardımcılara (kart eli, mağaza, hedef seçimi, koşu kimliği) zar açıkça veriliyor. Yayın zamanlaması (`performance.now`) odanın monoton saatine (`runtime.mono()`, tick sürelerinin toplamı) bağlandı; süre ölçümleri gerçek `performance.now` ile.

Saat her giriş noktasında **bir kez** okunur ve o iş bitene kadar sabittir: tick, mesaj, katılım, ayrılma, yeniden bağlanma. Tick süresi (`deltaTime`) mikrosaniyeye yuvarlanır. Odanın Colyseus'tan okuduğu tek dış sayı (ayrılmış koltuk sayısı, `hasPendingSeats`) değiştiğinde kaydedilir. Kayıt kapalıyken (`DEBUG_RECORDER=off`) ya da testlerde/simülatörde oda eski canlı kiptedir: davranış birebir eskisi gibi.

Doğrulama: tohumlu oda, maç boyunca sürecin `Math.random`'ını ve `Date.now`'ını **hiç** okumuyor (test zehirli fonksiyonla sayıyor); aynı tohum aynı dünya, araya giren başka oda akışı kaydırmıyor.

## Ne kaydediliyor

**Başlık** (`hdr`): kayıt kimliği, oda kimliği, tohum, kuruluş saati, kurulum seçenekleri (aşama, harita, ölçek, operatör, kip), sunucu sürümü (`FLY_IMAGE_REF`), Node sürümü, Fly bölgesi/makinesi.

**Yeniden oynatma bandı:**
- `ev` olayları, gerçekleştikleri sırayla, tick numarası (`t`) ve oda saatiyle (`c`): `join` (odanın okuduğu anlamla düzeltilmiş seçenekler; harita yalnızca kurulumda, oda reddettiyse gövdesiz `rejected`), `leave` (kendi isteğiyle mi), `rc` (yeniden bağlanma başarılı/başarısız), `msg` (tür `y` + gövde `m`, odanın kendi kuralıyla düzeltilmiş hâli), `seats` (oda kendi tick'inde okuduğunda ayrılmış koltuk sayısı), `evict` (başka odanın kurulumu bu kimsesiz odayı yerinden etti).
- Hız sınırı: kova yalnızca **kabulde** yazılır (dolum tembel; kararlar eskisiyle aynı), reddedilen mesajın hiçbir yan etkisi yoktur (oda saati de geri alınır). Bu yüzden reddedilen mesajlar kayda girmez, yalnızca sayılır (`w.dropped`, özette `wire.droppedMessages`); kabul edilen ya da bekletilen (`latestWinsBy`) her mesaj gövdesiyle kayıttadır ve yeniden oynatmada aynı kova kararını verir. Mesaj seli kaydı dolduramaz; test: seli kaydedip birebir yeniden oynatıyor.
- `tk` satırları: 600 tick'lik dilimler; her tick'in süresi (µs, `dt`) ve oda saatinin bir önceki tick'e farkı (`c`).
- `fp` parmak izleri: 300 tick'te bir (60 Hz'de 5 sn) ve maç sonunda (`fin`): oyuncular (altın, deneyim, kartlar, eşyalar), her yapı (seviye, konum, can, mermi, enerji, hasar), her düşman (tür, can, kalkan, konum), işçiler, bedenler, sonuç/dalga/nexus — tam duyarlılık, FNV tabanlı 64 bit.

**Zaman çizelgesi:**
- `sec` (saniyede bir): tick ort./p50/p95/max, tick başına bölüm ortalamaları (`s`) ve en büyükleri (`sm`): `spawn, towers, projectiles, enemies` (bedenler ve efsanevi etkiler ayrıldı), `bodies, legendary, procs` (efsanevi vuruşlar), `cooldowns, ultimates, snapshot, wire` (delta + kodlama + gönderim + perf yayını), `latest` (kovayı aşan son değer mesajları), `perf` (eski perf penceresi hesabı), `other`; tick aralığı ort./max ve saniyedeki tick sayısı; sayaçlar (hedef arama/kontrol, alan, zincir, hasar olayı); varlık sayıları (türüne göre düşmanlar, hava, şampiyon, özel, kuleler, yapılar, mermiler, ışınlar, işçiler, bedenler, hasar/öldürme olayları, alanlar, kalkanlar, karşı ataklar, nexus, öldürme); tel (gönderilen kare Hz'i, delta/tam/eski kare sayısı ve baytı, istemci başına giden bayt — Colyseus'un her gönderimi —, atlanan kareler, gönderim kuyruğu); durum yaması süresi; süreç örneği (olay döngüsü ort./p99/max, GC ms/adet/max, CPU %, RSS/yığın/dış bellek, yük, oda sayısı); kaydedicinin kendi maliyeti (µs/tick).
- `wave`: dalga başına süre, tick ort./max, takılma sayısı, en fazla düşman/mermi, bölüm ortalamaları.
- `spike`: tick süresi eşiği (`DEBUG_RECORDER_SPIKE_MS`, 10 ms) ya da tick aralığı eşiği (`DEBUG_RECORDER_LOOP_STALL_MS`, 50 ms; olay döngüsü takılması) aşılınca: o tick'in bölümleri, baskın bölüm, sayaçlar, tel, **o anki** varlık sayıları ve süreç örneği. Maç başına 1500, saniyede 5 satır sınırı (sayı özette tam).
- `cli`: izinli istemcinin beş saniyelik örneği (alanlar `packages/shared/src/debug-sample.ts`).
- `end`: son bilgi (sonuç, dalga, operatörler), `trunc`: bant kesildiyse sebebi.

**Gizlilik:** oyuncu adı, oda adı ve solo oda sırrı takma adla yazılır (`P1`, `replay-owner-secret-0001`; eşitlik korunur, yeniden bağlanma ve sahiplik aynı çalışır). IP, kurulum kimliği, tam tarayıcı dizesi yok. İstemci örneği yalnızca anonim veri ayarı açıkken (`isTelemetryActive`) toplanır ve gider; sunucu gövdeyi düz alanlara indirir, oyun kovasına/kayda/saate dokunmaz (`outOfBand`) ve oturum başına ~3 sn'de birden sık örneği atar. Ayrıntı: `PRIVACY.md`.

## Dosya biçimi

`<id>.ndjson.gz`: her yazımda bir gzip üyesi; art arda eklenmiş üyeler tek geçerli gzip akışıdır (`zcat` açar). Her satır `{"k":"<tür>",...}` JSON'u. Süreç yazarken çökerse son yarım üye atılır, geri kalan okunur (`reader.ts`, `Z_SYNC_FLUSH`). Kapanışta (`exit`) bellekteki satırlar, sıkıştırılmakta olan parça ve henüz yazılmamış özet eşzamanlı yazılır (özet yalnızca başarılı yazımdan sonra bekleyenden düşer). `<id>.json`: panel listesinin özeti (atomik yazım). Kimlik `YYYYMMDD-HHMMSS-<oda>` (UTC).

Ölçülen boyutlar (bu makine, 60 Hz):

| Maç | Süre | Olay | Dosya |
|---|---:|---:|---:|
| Bot, Zeynep solo, 8 dalga | 7,5 oyun dk | 212 | 129 KB (17 KB/dk) |
| Bot, Atakan + Zeynep co-op, 8 dalga | 7,1 oyun dk | 2 211 | 141 KB (19 KB/dk) |
| Tarayıcıdan gerçek maç (yerel sunucu), 2 dalga | 3,2 dk | 11 | 38 KB |

Tam 20 dalgalık bir maç (~25 dk) ≈ 0,5–0,6 MB; izinli istemci başına ~1,5 KB/dk eklenir. Tek kaydın üst sınırı `DEBUG_RECORDER_MATCH_MAX_MB` (40); aşılırsa yeniden oynatma bandı durur (`trunc`), zaman çizelgesi sürer. Olay sınırı maç başına 400 000.

## Maliyet (ölçüldü)

- Kaydedici, tick başına: sentetik 0,6–0,8 µs (testte, saniye satırı ve parmak izi dahil); gerçek bot maçında ort. 2 µs, gerçek sunucuda (Windows, yerel) ort. 8 µs. Bütçe ≪ 100 µs.
- Geç oyun (`tools/bench-late-game.mjs`, 4 oyuncu, dalga 20, 130 düşman, 38 kule): ortalama tick 0,94–0,95 ms → kayıtla 0,95–0,96 ms (gürültü düzeyinde). Parmak izi bu durumda 38 µs (5 sn'de bir → tick başına 0,13 µs), sayım 8,5 µs (saniyede bir).
- Disk yazımı tick'te değil: satır birleştirme `setImmediate` ile sonraki turda, sıkıştırma iş parçacığı havuzunda, ekleme `fs/promises`.

## Ortam değişkenleri

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `DEBUG_RECORDER` | açık | `off`/`0`/`false`: kayıt tamamen kapalı, oda eski canlı kipte |
| `DEBUG_ADMIN_TOKEN` | — | panel/API jetonu; yoksa `TELEMETRY_ADMIN_TOKEN`; ikisi de yoksa `/admin` 404 |
| `DEBUG_RECORDER_DIR` | `/data/debug` (yoksa `data/debug`) | kayıt dizini |
| `DEBUG_RECORDER_RETENTION_DAYS` | 30 | saklama |
| `DEBUG_RECORDER_MAX_MB` | 600 | toplam boyut; aşılınca en eski bitmiş kayıt silinir (2 GB'lık diskte telemetrinin 500 MB'ıyla birlikte ~1,1 GB) |
| `DEBUG_RECORDER_MIN_FREE_MB` | 128 | diskte bırakılacak boş yer; altına inince en eskiler silinir, yetmezse yeni parça atılır |
| `DEBUG_RECORDER_MATCH_MAX_MB` | 40 | tek kayıt sınırı |
| `DEBUG_RECORDER_SPIKE_MS` | 10 | takılma eşiği (tick süresi) |
| `DEBUG_RECORDER_LOOP_STALL_MS` | 50 | olay döngüsü takılma eşiği (tick aralığı) |

Fly'da jeton (çalıştırmadan önce uzun, rastgele bir değer üretin; **bu komut belgede, çalıştırılmadı**):

```
fly secrets set DEBUG_ADMIN_TOKEN=<uzun-rastgele-jeton> -a karayel-online
```

`TELEMETRY_ADMIN_TOKEN` zaten tanımlıysa ayrı jeton gerekmez; panel onunla da açılır. Ayrı jeton, telemetri özetini paylaşmadan kayıtları paylaşmayı sağlar.

## Disk bütçesi (Fly volume)

Kayıtlar telemetriyle aynı diskte (`telemetry_data` → `/data`): telemetri `/data/telemetry` (90 gün, toplam ≤ 500 MB, günlük ≤ 50 MB), kaydedici `/data/debug` (30 gün, toplam ≤ 600 MB, ≈ 1 000 tam maç). İkisi birden en kötü durumda **~1,1 GB** ister; kaydedici ayrıca diskte 128 MB boş yer bırakır (telemetri ve oyun diski doldurmasın).

Disk (`telemetry_data`, `vol_vxm9qgdnxd2wwnj4`, fra) 2026-10-16'da 1 GB'tan **2 GB**'a büyütüldü (Fly'da geri alınamaz). Daha fazla yer gerekirse:

```
fly volumes list -a karayel-online
fly volumes extend <volume-id> --size <GB> -a karayel-online
```

Disk büyüdükçe kayıt sınırı da büyütülebilir (`DEBUG_RECORDER_MAX_MB`, örn. 1000 ≈ 1 700 tam maç).

## Panel

`https://<sunucu>/admin` → jeton (yalnızca o sekmede, `sessionStorage`). Dış kaynak yok (CDN, yazı tipi), CSP `default-src 'none'`, mobilde tek sütun. Türkçe/İngilizce.

- **Maçlar:** tarih, süre, aşama, kip, operatörler, oyuncu, dalga, sonuç, tick max/p99, en düşük istemci FPS'i, takılma sayısı, boyut, durum (`live` suren, `ended`, `interrupted` süreç kesildi). Sütuna tıklayınca sıralanır; metin süzgeci; "yalnızca takılanlar" (tick ≥ 16,7 ms, FPS < 40 ya da tick aralığı ≥ 50 ms). Süren maç da açılır (bellekteki satırlar önce diske yazılır).
- **Ayrıştırma ayrı iş parçacığında** (`timeline-worker.ts`, aynı anda tek): 25 dakikalık bir kayıt (619 KB) ana iş parçacığını 23–27 ms yerine 0,7–1,6 ms meşgul ediyor (ölçüldü, `eventLoopUtilization`); sonuç metin olarak dönüyor, ana iş parçacığı yeniden ayrıştırmıyor.
- **Maç ayrıntısı:** özet kartları, otomatik teşhis (sunucu bütçesi, olay döngüsü, GC, CPU, ağ kuyruğu, istemci FPS'i), grafikler: sunucu tick'i (bölümler yığılı + p95/max, takılma işaretleri), tick aralığı, varlıklar, ağ (istemci başına KB/s, snapshot Hz, atlanan, durum yaması), süreç, bellek; izinli istemci varsa FPS, kare süresi p95 (tek istemcide bölümler yığılı), LOD, ping. Grafikler ortak imleçle bağlı; dalga sınırları işaretli. Takılma tablosu (sıralanabilir; satıra tıklayınca o saniye), dalga özetleri, istemciler (cihaz sınıfı, düşen/boş kare, gizlenme, WebGL kaybı). İndirme: zaman çizelgesi (JSON) ve yeniden oynatma kaydı (`.ndjson.gz`).

API (hepsi `Authorization: Bearer <jeton>`): `GET /admin/api/status`, `GET /admin/api/matches`, `GET /admin/api/matches/:id`, `GET /admin/api/matches/:id/timeline[?download=1]`, `GET /admin/api/matches/:id/replay`. Jeton yoksa 404, yanlış jeton 401, IP başına dakikada 20 hatalı denemeden sonra bir dakika 429.

## Araçlar

Önce `npm run build:server` (araçlar `dist`i okur).

```
# indir
DEBUG_ADMIN_TOKEN=... node tools/debug/fetch.mjs --server https://karayel-online.fly.dev --list
node tools/debug/fetch.mjs --server <url> --id <kayit> --timeline --out debug-recordings
node tools/debug/fetch.mjs --server <url> --worst 3 --by tick      # ya da --by fps, --by loop; --latest N

# metin özeti
node tools/debug/report.mjs debug-recordings/<kayit>.ndjson.gz [--top 15] [--json]

# yeniden oynat, belirlenimciliği doğrula, dalga başına bölüm profili
node tools/debug/replay-profile.mjs debug-recordings/<kayit>.ndjson.gz
node tools/debug/replay-profile.mjs <kayit> --cpu-prof                    # en kötü takılmanın dalgası
node tools/debug/replay-profile.mjs <kayit> --cpu-prof --window wave:12-14 --out prof/
```

`replay-profile` kaydı gerçek `MatchRoom` ile oynatır: aynı tohum, kayıttaki saatler, mesajlar Colyseus'un tel yolundan (msgpack → `_onMessage`), katılım/ayrılma/yeniden bağlanma aynı sırada, tick'ler kayıttaki sürelerle. Her parmak izi aynı tick'te karşılaştırılır; fark varsa ilk farkın tick'ini ve dalgasını yazar, çıkış kodu 2. Ardından bu makinede dalga başına tick bölümlerini ve üretimdeki ortalamayı yan yana basar; `--cpu-prof` istenen pencerede V8 profili (`.cpuprofile`, Chrome DevTools > Performance ya da VS Code ile açılır) üretir. Yeniden oynatma 20 dakikalık bir maçı saniyeler içinde oynatır.

Simülatörün yeniden oynatmasıyla (`tools/sim/replay.mjs`) ilişkisi: o, kendi bot günlüğünü canlı kipte ve sanal dünyada (`withSeededWorld`) oynatır; `tools/debug/replay-lib.mjs` üretimde kaydedilmiş maçı üretimin kendi saat/zar kaynağıyla oynatır. Aynı tel yolu (`getMessageBytes` → `_onMessage`). `tools/debug/bot-match.mjs` simülatörün botlarını üretim yolundan (tohumlu oda + gerçek kaydedici, tel mesajları, beden kısayolu yok, titreşimli tick süresi) oynatır; testler bunun kaydını yeniden oynatıp parmak izlerini karşılaştırır.

## Doğrulama (16 Ekim 2026, bu makine)

- Testler: `tests/debug-recorder.test.mjs` (depo: çok üyeli gzip, yarım dosya, saklama/sınır/boş yer; zaman çizelgesi toplama, takılma, olay döngüsü takılması, istemci hız sınırı, kayıt sınırı; oda başına zar yalıtımı; tohumlu odanın süreç zarına/saatine dokunmaması; kayıt kapalıyken eski kip; üretim yolundan solo ve co-op + kopma/yeniden bağlanma bot maçının birebir yeniden oynatılması ve değiştirilmiş kaydın yakalanması; panel 404/401/429, sayfanın kendi kendine yetmesi ve betiğin sözdizimi; istemci izin kapısı ve gizli sekme; sunucunun istemci örneğini oyun dışı tutması; kaydedici maliyeti) ve `tests/debug-recorder-e2e.test.mjs` (gerçek Colyseus sunucusu + `colyseus.js` istemcisi + gerçek saat: kayıt, panel API'si, indirme, birebir yeniden oynatma).
- Uçtan uca: yerel sunucu + tarayıcıdan gerçek maç (anonim veri kapalı) → panelde canlı ve bitmiş maç, grafikler → `fetch.mjs` ile indirme → `replay-profile.mjs`: 25 parmak izi, 0 fark; CPU profili üretildi. İstemci örneği gelmedi (ayar kapalıydı; beklenen).
- Not: Windows'ta Colyseus'un `setInterval(16,6)` döngüsü zamanlayıcı çözünürlüğü yüzünden ~38 Hz'de dönüyor (tick aralığı ort. 25 ms, max 32 ms; panelde "tick aralığı" grafiği). Fly (Linux) üzerinde 16,7 ms beklenir; üretimde bu grafik doğrudan doğrulanabilir.
