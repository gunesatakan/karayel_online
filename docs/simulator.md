# Simülatör

Denge simülatörü artık oyunun **gerçek sunucu odasını** (`MatchRoom`) oynatır. Eski soyut ekonomi/DPS modeli oyundan kopmuştu (başlangıç altını 360 sanıyordu, seviye altın bedelini, isabeti, dönüş hızını, menzili, kontrolü, yerleşimi, ırkları ve lojistiği görmüyordu). Yeni simülatörde kural kopyası yok: her kural odanın kendisinden gelir, oyun değiştikçe simülatör kendiliğinden günceldir.

## Nasıl çalışır

`tools/sim/` altında:

| Dosya | Görevi |
|---|---|
| `world.mjs` | Tohumlu dünya: maç süresince `Date.now`, `performance.now` sanal saat, `Math.random` tohumlu üreteç; maç bitince eski hallerine döner. |
| `match.mjs` | Bot maçı sürücüsü. Odayı sunucunun kendi yoluyla kurar (`setupRoom` → `onJoin` → solo için doğrudan başlatma, co-op için lobi hazır + başlat), tick'i 60 Hz (`1000/60` ms, Colyseus varsayılanı) doğrudan çağırır, ölçümleri toplar. |
| `policies.mjs` | Botlar ve kuruluş tarifleri. Bot odaya **yalnızca istemci mesajlarıyla** dokunur; mesajlar odanın kayıtlı işleyicilerinden (`onMessageHandlers`) geçer: gövde düzeltme, hız sınırı ve aşama kapısı gerçek oyundaki gibi. |
| `layout.mjs` | Botun harita okuması: huni planı (duvar hattı + geçit + koridor), kule yuvaları, kara yolunun açık kalıp kalmadığı (BFS). Yerleştirme geçerliliğini odanın `canPlaceTower`ına sorar. |
| `scoring.mjs` | Kart/eşya seçim puanı (karar sezgisi; etkiyi oda uygular). |
| `jobs.mjs`, `worker.mjs` | İş tanımı → maç; işleri çekirdeklere dağıtan iş parçacığı havuzu. |
| `replay.mjs` | Bağımsız yeniden oynatma: kaydedilen mesajları botsuz, msgpack ile kodlayıp odanın `_onMessage`ına (Colyseus'un soketten gelen mesajı işlediği yer) ham bayt olarak verir. |
| `validate.mjs` | Doğrulama: kimlik, belirlenimcilik, snapshot, hızlı kip hatası, performans. |
| `quick.mjs` | Eski soyut model (**yaklaşık**), `--mode quick`. |

Değişen yalnızca dış dünya: saat sanal, zar tohumlu, ağ yayını kapalı (`broadcast` boş, snapshot/perf yayını tetiklenmiyor; bunun sonucu değiştirmediği ölçüldü, aşağıda). **Mermi ve enerji yapay olarak doldurulmaz**: işçiler, reaktör, fabrika, depo, taşıma gerçek oyundaki gibi çalışır. Tek kolaylık `--unsafe-free-logistics` bayrağıdır (varsayılan kapalı; açılırsa her tick mermi/enerji dolar ve rapor `unsafe: ["freeLogistics"]` ile işaretlenir). Yalnızca "lojistik olmasa ne olurdu" karşılaştırması içindir.

## Kullanım

Önce derleme (simülatör `apps/server/dist` ve `packages/shared/dist` okur):

```
npm run build:server
```

Tek operatör, aşama, tohumlar:

```
node tools/simulate.mjs --operator warrior --stage 1 --seeds 20 --policy standard
node tools/simulate.mjs --operator zeynep --stage 3 --seeds 50 --build hiza --json sonuc.jsonl
node tools/simulate.mjs --operator warrior --players 2 --partner-build hiza --seeds 10
node tools/simulate.mjs --operator warrior --stage 1 --seeds 20 --waves 5          (5. dalgada dur)
node tools/simulate.mjs --mode quick --operator warrior --stage 1 --seeds 1000     (YAKLAŞIK)
```

Seçenekler: `--seed N` (ilk tohum), `--policy` (aşağıda), `--build` (kuruluş), `--cards greedy|random|worst|focus:<eksen>`, `--shop greedy|random|none`, `--spacing isolated|trio|cluster`, `--no-walls`, `--no-skills`, `--no-hire`, `--players 2` (ikinci oyuncu diğer operatör), `--workers N` (iş parçacığı; varsayılan çekirdek−1), `--json dosya` (koşu başına bir satır JSON), `--help`.

Çıktı: tohumlar üzerinden özet tablo (ortalama / medyan / p10 / p90 / min / max) — ulaşılan dalga, nexus canı, sızıntı, öldürme, son DPS, kazanılan/harcanan/kalan altın, kalan deneyim, kayıp yapı, duvar, alınan işçi, maç süresi; kule türüne göre hasar payı, sık kartlar ve eşyalar, dalga başına ortalama sızıntı.

Koşu raporu (`--json`) alanları: `status` (`victory` / `defeat` / `stalled` / `capped`), `result` (`win`/`loss`), `waveReached` (temizlenen son dalga), `nexusHp`, `kills`, `leaks`, `leaksPerWave`, `waves[]` (dalga başına sızıntı, can kaybı, öldürme, nexus, kule/duvar sayısı, kule hasarı, savaş saniyesi, DPS), `dpsFinal` (son üç dalganın kule hasarı / savaş saniyesi, duvar saati), `damageByTower`, `towersLost` (yıkılan yapılar, tür kırılımıyla), `wallsBuilt`, `wallsEnd`, `towersEnd`, `players[]` (altın kazanılan/harcanan/kalan, deneyim, kartlar, eşyalar, alınan işçi), `builds`, `decisions` (botun kararları: kur, yükselt, kart, satın al, işçi), `ticks`, `gameSeconds`, `wallSeconds`, `stall` (donmuş düşman bilgisi).

Kuruluş karşılaştırması aynı sürücüyü kullanır: `npm run compare:builds` (bkz. `docs/build-comparison.md`).

Doğrulama: `node tools/sim/validate.mjs` (hepsi) ya da `--identity`, `--determinism`, `--snapshots`, `--quick 20`, `--perf`.

## Botlar

Bir bot her kurulum evresinde sırayla: kart seçer (elde bir yenileme), yıkık yapıları satar, eksik duvarı kurar, kaynak binalarını kurar/yükseltir, işçi alır, onarır, mağazadan alır ve eşyaları takar, kule yükseltir/kurar, sonra "devam" der. Savaşta 0,1 sn'de bir becerileri, 2 sn'de bir acil işleri (duvar, onarım, bol altında kule) yapar.

- **Yerleşim (huni):** haritanın üst üçte birine yakın tam genişlikte yatay duvar hattı; uçanların indiği nexus köşesine yakın tek karelik geçit; geçitten nexus satırına inen koridor boş kalır. Savaş kuleleri koridor ve geçit çevresinde, menzildeki yol ağırlığına göre sıralanan yuvalara; hava vurabilen kuleler uçan yoluna da bakar. Atakan kuleleri yalnız (Chebyshev ≥ 2, yalnızlık ×1,5), Zeynep kuleleri üçgen üçlüler (dizilim). Kaynak binaları hattın altında, koridordan ve harita kenarından uzak. Her yerleştirmeden önce kara yolu açık mı diye bakılır. `--no-walls` duvarsız yayılım.
- **Ekonomi:** reaktör, (mermi kulesi varsa) hammadde deposu + mühimmat fabrikası + hammadde taşıyıcısı. İşçi hedefi kulelerin tahmini enerji/mermi ihtiyacından; geçen dalganın kıtlığı ve bina stokları darboğazı söyler (bina doluyken kule açsa taşıyıcı, bina boşsa toplayıcı). Fabrika üretim hızı ihtiyacın altındaysa önce seviye. Altın yetiyorsa gelişmiş işçi. Toplayıcılar hattın altındaki düğümlere.
- **Kartlar:** `greedy` (kapsamı da sayan kaba puan; zayıf elde bir yenileme), `random`, `worst`, `focus:<eksen>`. Hedefli kart en çok hasar veren uygun kuleye.
- **Mağaza:** `greedy` (puan/fiyat), `random`, `none`; bütçe altının %35'i. Kule eşyası en iyi uygun kuleye takılır.
- **Beceriler:** Atakan: Execute en öndeki bağışık olmayan düşmana, Metal Kalkan nexus'a yaklaşan kara düşmanının önüne yatay, Yönlendirme en kalabalık noktaya; Zeynep: itibar yettikçe komutlar (hız/yavaşlatma/menzil); ultiler şarj dolunca (Zeynep: en kalabalık sütun).
- **Operatör bedeni:** ZentaX ve AttackLord'un bedeni işi vardığında yapar (kurulum, duvar, onarım, AttackLord becerileri, ultiler). Sürücü her bot mesajından hemen sonra bedenin kuyruğunu bitirir (`settleOperatorBody`: beden hedefe ışınlanır, iş aynı kuralla yapılır); uçuş 1 sn'nin altında ve botun karar aralığına göre önemsiz. Bedenin temas hasarı ve düşerse yenilgi kuralı tick'te aynen işler (rapor `defeat`). Yeniden oynatma (`replay.mjs`) aynı kısayolu kullanır.
- **Donmuş düşman:** 20 sn kımıldamayan düşmanın yanına en ucuz savaş kulesi (gerekirse uzaktaki ucuz kule satılarak).

Adlı politikalar: `standard` (= `greedy`), `random-cards`, `worst-cards`, `no-shop`, `random-shop`, `no-skills`, `no-walls`, `cluster`, `passive`. Kuruluşlar: `node tools/simulate.mjs --help`.

## Doğrulama

`node tools/sim/validate.mjs` dört şeyi ölçer (bu makinede, 14 Ekim 2026):

**1. Kimlik — bot maçı = bağımsız yeniden oynatma.** Botun gönderdiği her mesaj tick numarasıyla kaydedilir; `replay.mjs` aynı tohumla, botsuz, mesajları Colyseus'un soket yolundan (msgpack baytları → `_onMessage`) aynı tick'lerde verir. Maç sonu odanın parmak izi (oyuncu altını/deneyimi/kartları/eşyaları, her yapının seviyesi, konumu, canı, mermisi, enerjisi, verdiği hasar; her düşmanın canı ve konumu; her işçinin konumu ve yükü; sonuç, dalga, nexus canı, öldürme) ve dalga başına sızıntı karşılaştırılır.

| Durum | Mesaj | Tick | Sonuç | Parmak izi |
|---|---:|---:|---|---|
| Atakan / aşama 1 / tohum 1 / standard / balanced | 188 | 31 889 | yenilgi, dalga 8 | birebir aynı |
| Zeynep / aşama 3 / tohum 2 / standard / hiza | 182 | 47 122 | donmuş düşman, dalga 7 | birebir aynı |
| Atakan / aşama 5 / tohum 3 / random-cards / obsession | 58 | 12 091 | yenilgi, dalga 2 | birebir aynı |
| Zeynep / aşama 2 / tohum 4 / random-shop / balanced | 111 | 23 317 | yenilgi, dalga 5 | birebir aynı |
| Atakan + Zeynep (co-op) / aşama 4 / tohum 5 | 373 | 31 035 | yenilgi, dalga 7 | birebir aynı |

Beşinde de sonuç farkı **sıfır**. Bu, (a) botun odayı mesaj dışında hiçbir yolla değiştirmediğini, (b) karar dizisinin maçı tamamen belirlediğini, (c) mesajların gerçek istemci yolundan da aynı etkiyi yaptığını gösterir. Kurgu gereği beklenen sonuç budur: simülatör oyunu taklit etmiyor, oyunu oynuyor.

**2. Belirlenimcilik.** Aynı tohum + politika: aynı süreçte farklı sırayla iki kez ve iş parçacığında bir kez; raporlar (`wallSeconds` hariç) birebir aynı (3/3). Test: `tests/bot-simulator.test.mjs`.

**3. Ağ yayını.** Snapshot/perf yayını açık (oda gerçek `broadcast` ve snapshot kodlamasıyla) ve kapalı iki maçın parmak izi birebir aynı (2/2); aynı maç kapalıyken 5,6 sn, açıkken 9,1 sn sürüyor.

**4. Hızlı kipin hatası** aşağıda.

## Performans

Ryzen 7 9800X3D (8 çekirdek/16 iş parçacığı), Node 24, tick 1000/60 ms (sunucuyla aynı; tick büyütülmüyor, sonuç değişirdi):

- Tipik bot maçı (botun ulaştığı 3–12 dalga): tek iş parçacığında **1–5 sn**, tick başına 0,10–0,18 ms.
- Tam 20 dalgalık maç (Zeynep/hiza, `--unsafe-free-logistics` ile 20. dalgaya ulaşan koşu; geç dalgalarda 140 düşman): tek iş parçacığında **16,7 sn** (65 708 tick, 0,25 ms/tick, 18 dakikalık oyun).
- Havuz (15 iş parçacığı): 30 maç 24,6 sn → **maç başına 0,8 sn**. 50–100 tohumluk tarama 1–2 dakika; `compare-builds` (960 maç) ~6 dakika.
- Zamanın %98'i odanın kendi tick'inde (`MatchRoom` %72, modifier çözümleme %15); bot %1,4. Güvenli hızlandırmalar uygulandı: duvar saati beklenmiyor (tick doğrudan çağrılıyor), ağ yayını ve snapshot kodlaması kapalı (sonucu değiştirmediği ölçüldü), işler çekirdeklere dağıtılıyor.

## Hızlı kip (yaklaşık)

`--mode quick` eski haritasız modeldir; sabitleri artık paylaşılan paketten ve sunucudan okur: başlangıç altını (`getPlayerStartGold`, 750), seviye altın bedeli (`getTowerLevelGoldCost`), ırk zaafı/direnci (`enemyRaceDefinitions`, ±%40), Atakan yalnızlık çarpanı, arena dalga sayısı, kart/eşya değerleri katalogdan (yarıya inen kritik hasar ve yüzde altın kartları dahil). Lojistik, yerleşim, isabet, dönüş hızı, menzil, kontrol, özel düşmanlar, karşı ataklar ve ırk mekanikleri **yok**. Sonuç gerçek odaya göre çok iyimser:

| Operatör | Aşama | Gerçek oda: ort. dalga | Hızlı kip: ort. dalga | Hata (dalga) | Gerçek zafer | Hızlı zafer |
|---|---:|---:|---:|---:|---:|---:|
| Atakan | 1 | 7,3 | 20,0 | +12,7 | %0 | %100 |
| Atakan | 3 | 2,5 | 20,0 | +17,5 | %0 | %100 |
| Atakan | 5 | 2,4 | 20,0 | +17,7 | %0 | %100 |
| Zeynep | 1 | 8,0 | 20,0 | +12,1 | %0 | %100 |
| Zeynep | 3 | 2,6 | 20,0 | +17,4 | %0 | %100 |
| Zeynep | 5 | 1,4 | 20,0 | +18,6 | %0 | %98,5 |

Ortalama mutlak hata **16,0 dalga** (gerçek: 20 tohum, `standard` politika, varsayılan kuruluş; hızlı: 200 tohum). Hızlı kip gerçek odaya göre kalibre edilmedi: tek bir çarpanla düzeltmek aşamalar arası farkı (ırk mekanikleri, özel düşmanlar, lojistik) yine kaçırırdı.

Bu yüzden hızlı kip yalnızca bir içerik değişikliğinin yönünü kabaca görmek için; denge kararları gerçek kiple verilmeli.

## Sınırlar

- Botlar sezgiseldir, usta oyuncu değildir: tek bir yerleşim kalıbı (labirent ve kıvrım yok), kaba kart/eşya puanı, işçi gelişim ağacı ve uzmanlık seçimleri kullanılmaz, yerleştirmeli eşyalar (Bariyer, Ziftli Zemin) ve Riskli Yatırım alınmaz, ulti gücü yükseltilmez, tamir merkezi kurulmaz (onarım altınla). Mutlak dalga sayıları iyi bir oyuncunun altındadır; asıl değer aynı bot altında karşılaştırmadır.
- Bot odanın durumunu sunucu tarafından okur (snapshot'ın gösterdiğinden fazlası değil: kuleler, düşmanlar, işçiler, stoklar, teklifler).
- Bir dalga 6 oyun dakikasını aşarsa maç `stalled` olarak kesilir.

## Simülasyonda görülen oyun davranışları

Bunlar simülatörün değil oyunun davranışı; botlar gerçek odayı oynadığı için görünür oldular.

- **Lojistik baskın kısıt.** Aynı bot `--unsafe-free-logistics` ile Atakan aşama 1'de ortalama 7,9 yerine 11,4 dalgaya, Zeynep/hiza 11,9 yerine 13,0 dalgaya (%27 zafer) ulaşıyor. Bir toplayıcı 7,1 oyun saniyesinde 13,5 enerji topluyor; bir Debug Lazer ateş ederken saniyede ~8,5 enerji, her kule işletme için 0,6–1,4 enerji/sn yakıyor; L1 fabrika 0,5 mermi/sn üretiyor. İşçi alımı (+1,9 dalga) ve beceriler (+1,3 dalga) ölçülebilir fark yaratıyor.
- **Donmuş düşman.** Kör gezinme (`stepBlindNavigator`) duvar takip ederken döngü kapandığını görüp "kır" kararı veriyor; takip ettiği yapı yıkılmış ya da satılmışsa `breakThrough` kıracak komşu yapı bulamıyor, `findEnemyRoute` yalnızca bulunduğu kareyi döndürüyor ve gezgin durumu sıfırlanmadığı için düşman her tick aynı kararı vererek o karede sonsuza kadar duruyor; dalga, bir kule ona yetişene kadar bitmiyor. Örnek: aşama 1, tohum 1, Zeynep/balanced, 4. dalga, (1,10) karesinde bir ezici (bot yanına kule kurarak çözer). Kör gezgin "kır" sonucunda hedef bulamazsa `seek` kipine dönmeli.
- **Abartı (zeynep-8) arenada kurulamıyor.** Kenar yapısı, yanında `tower` karesi istiyor (`isValidAbartiEdgeSegment`; duvar bu şarttan muaf tutulmuş). Açık arenada hiç `tower` karesi yok: 494 kenarın 0'ında kurulabiliyor (duvar 440'ında). `abarti-hiza` kuruluşu bu yüzden fiilen `hiza`.
- **Uçanlar sol alt köşeye iniyor.** Uçan düşmanın hedefi `activePaths[0]`ın son noktası, yani (0, son satır); nexus satırının ortası ya da en yakın nexus karesi değil. Bütün hava dalgaları haritanın sol alt köşesine akıyor; bot bunu kullanıyor (geçit ve hava kuleleri o köşeye yakın).
- **Yıkık yapı yerinde kalıyor.** Canı sıfıra inen kule haritada can 0 ile kalıyor, kontenjan tutuyor ve onarılamıyor; satılıp yeniden kurulması gerekiyor (bot satıyor). Kasıtlıysa arayüzde açıkça görünmeli.
- **Saf destek kuruluşları.** Taht Mührü tek başına hasar vermiyor (üçgen dizilim istiyor); tek başına Taht kuruluşu ilk dalgada düşüyor. Karşılaştırmada Taht yalnızca karışımlarda.
