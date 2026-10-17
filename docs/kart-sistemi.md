# Kart ve Eşya Sistemi

Roguelike katmanının veri dili. Yeni içerik eklemek için sunucuya kod yazman
gerekmiyor; bu dosyadaki üç yoldan biriyle kartı tanımlaman yeterli.

## Neden üç yol var

Bir kart uzun süre yalnızca `Modifier` taşıyabiliyordu: otuz stattan birine düz
bir sayı. Bu, dilbilgisi gereği her kartı **"+%X şu stata"** cümlesine hapsetti.
Katalog büyüdükçe aynı cümlenin onlarca çeşitlemesi oluştu — bu derinlik değil
seyrelmedir.

Oysa kule motoru çok daha zengin konuşuyor. Artık kartlar da o dili konuşabiliyor.

| Yol | Ne yapar | Alan |
|---|---|---|
| Modifier | Bir statı büyütür veya küçültür | `effects` |
| Kilit | Sunucuda yazılı bir davranışı açar | `unlocks` |
| Motor eklentisi | Kulenin motoruna stack/aura/trigger/durum ekler | `grants` |
| Çevrim (yalnızca kart) | Bir statın gerçek bonusunu başka bir stata ekler | `conversions` |

İlk üçü hem kartlarda hem mağaza eşyalarında geçerli. Bir davranışın kaynağı
kart mı eşya mı olduğu sunucu için fark etmez.

## 1. Modifier

```ts
{ id: "namlu-asinmasi", …, effects: [effect("namlu-asinmasi", "damage", 0.25)] }
```

Aynı stata yazan modifierlar toplanır ve `1 + toplam` olarak çözülür. Yani iki
ayrı `+%25 hasar` kartı `%56` değil `%50` verir. Yeni bir stat gerekiyorsa
`ModifierStat` birleşimine ekle ve **okuyucusunu da yaz** — okunmayan stat ölü
içeriktir ve `catalog-coverage` testi bunu yakalar.

Hasar kartları ve takılı eşya bonusları tek havuzda toplanır; bu havuz karakter
pasifi ve motor etkileriyle hesaplanmış hasarı çarpar. Örneğin yalnız Takipçi
36 vururken tek bir `+%40 hasar` kartı sonucu 50,4 yapar. İkinci bir `+%25`
kartıyla toplam bonus %65 olur; kartlar birbirlerini çarpmaz. Takılı eşyanın
değiştiricisi yalnızca bir kez sayılır.

`fireRate` hem normal değiştiricide hem yığında saldırı hızı artışıdır.
Bonuslar toplanır ve aralık `aralık / (1 + toplam bonus)` olarak hesaplanır.
Focus ve aura etki aralıkları bu hız bonuslarını almaz. Ucube'nin özel ritmi
ayrı `fireIntervalReduction` yığın statıdır; mevcut aralık azaltma eğrisini
korur ve normal hız bonuslarıyla karıştırılmaz.

## 2. Kilit (`unlocks`)

Sayıyla ifade edilemeyen davranışlar. `Unlock` birleşimine ekle, `ALL_UNLOCKS`
listesine yaz, sunucuda `towerHasUnlock(tower, "…")` ile oku.

Mevcut eksenler: hedefleme modları, hava hedefi, durum etkileri, yığın türleri,
komşuluk/yalnızlık, ekonomi, ve ısı/enerji eğrisi.

Kilitler tele **bit maskesi** olarak gider (`encodeUnlocks` / `hasUnlockBit`).
Sıra `ALL_UNLOCKS` tarafından belirlenir, o yüzden yeni kilitler **listenin
sonuna** eklenir; ortaya eklemek eski istemcilerle uyumu bozar. Liste 53 kilidi
(`MAX_ENCODABLE_UNLOCKS`) aşamaz: kodlama bit işlemi değil `2 ** sıra` ile
toplama, yani tavan `Number.MAX_SAFE_INTEGER`'ın 53 biti. Şu an 50 kilit var;
geriye 3 yer kaldı. Sayıyla ifade edilebilen yeni bir davranış için kilit yerine
bir `ModifierStat` (örneğin `waveIncome`) tercih et.

## Çevrim (`conversions`, Epik kartlar)

```ts
conversions: [{ from: "turnRate", to: "fireRate", ratio: 0.2, cap: 0.3 }]
```

"Dönüş hızın arttıkça atış hızın da artar": sunucu kulenin **gerçek** kaynak
bonusunu okur — kart ve eşya toplamı artı o anki koşullu paylar (Av Refleksi'nin
penceresi, soğuk namlunun isabeti) — ve hedefe `min(cap, max(0, kaynak - threshold) * ratio)`
kadar bir modifier ekler (`resolveStatConversions`, `getTowerRunModifiers`).
Kart kimliğine bakan bir sunucu dalı yok. Çevrimler zincirlenmez: kaynak çevrimlerden
önce okunur. `threshold` kaynağın yalnızca eşik üstünü saydırır (Balistik
Hesaplayıcı'da %30). Her epik kaynak statından bir taban bonus da verir (`effects`)
ve çevrim onu da okur: kart tek başına işler, yatırımla tavanına büyür. Açıklama "her %10'u … +%X ekler; en fazla +%Y" diye yazılır ve test
metni sayılarla karşılaştırır. Savaş Hazinesi'nin adımı %40: altın kartları dört katına
çıkınca oranı dörtte bire indi, hasar eğrisi aynı kaldı.

## 3. Motor eklentisi (`grants`)

En güçlü yol. Sunucu sabit tanımı değil **çözülmüş motoru** okuduğu için buraya
yazdığın şey yeni bir sunucu dalı gerektirmez.

```ts
grants: {
  stacks: [{ id: "card-sabir", trigger: "sameTarget", stat: "damage", perStack: 0.06, max: 10, resetOn: "targetChange" }],
  statusEffects: [{ type: "chill", magnitude: 0.15, durationMs: 2000, stacking: "refresh" }],
  triggers: [{ event: "escape", effect: "surge", cooldownMs: 6000 }],
  attack: { pierceCount: 1, bladeCount: 1, radiusMultiplier: 1.35, angleMultiplier: 1.5 }
}
```

Kurallar:

- **Stack kimlikleri benzersiz olmalı.** Çakışırsa temel tanım kazanır; bir kart
  kulenin imza mekaniğini ele geçiremez. Kart kimliklerini `card-` / `shop-`
  önekiyle yaz.
- **Motoru olmayan kuleye grant işlemez.** Genişletilecek bir saldırı şekli yoktur.
- **Toplamsal ve çarpımsal alanlar ayrı taşınır.** `pierceCount` ve `bladeCount`
  motora yazılır çünkü tabanları motorda durur. `radius`, `angle`, `width`,
  `length` çarpanları ayrı bir demette taşınır (`resolveTowerAttackMultipliers`);
  çünkü tabanları kimi kulede motorda, kimi kulede eski `aoeRadius` alanında,
  koni açısında ise sunucudaki bir sabitte duruyor. Çarpanı motora yazmaya
  çalışmak, tabanı tanımsız olan kulelerde onu sessizce düşürür.

Genel geçer tek trigger etkisi `surge`: kule 8 saniye `+%80` hasar verir. Özel
bir kule mekaniğine bağlı olmadığı için her olayla kullanılabilir.

## Kapsam

`scope` üç değer alır:

- `global` — oyuncunun bütün kulelerine işler.
- `targeted` — tek bir kuleye takılır, kule başına en fazla 3 tane.
- `tagged` — `axes`, `hitTypes`, `damageTypes`, `shapes`, `ammoTypes` filtreleri;
  ayrıca `hasAreaRadius` (etki alanı olan), `aims` (nişan alan, `towerAims`),
  `projectiles` (mermi hızının bir şey değiştirdiği, `towerFiresProjectiles`),
  `alongFacing` (atışı namlu yönünde giden nişan kulesi, `towerFiresAlongFacing`;
  isabet içeriğinin kapsamı) ve `combat` (hasar veren kule, `towerDealsDamage`;
  kritik ve öldürme eşyaları duvara ya da hasarsız aura binasına takılmasın).

`tagged` bir kart hiçbir kuleye uymuyorsa **ölü içeriktir** ve test onu reddeder.
Şekil filtresi her kulede dolu olduğu için en güvenli dar kapsam odur; vuruş ve
hasar türü kulelerin bir kısmında tanımsızdır.

## Nadirlik

`common: 6`, `uncommon: 3`, `rare: 1`, `epic: 1` — çekiliş ağırlıkları. `epic`
yalnızca çevrim kartlarında ve elle yazılır. Her epik kendi kaynak statını da
verir (Tork Aktarımı +%50 dönüş hızı): tek başına işler, yatırımla büyür. Sunucu
çekilişe kaynak bonuslarını verir (`sourceBonuses`): kaynağı ne kartın kendisinde
ne kuruluşta pozitif olan çevrim kartı (eşikli çevrimde eşiğin yarısı) ölü ağırlık
(0,15) alır; bugünkü dört epik kendi bonusunu taşıdığı için bu kural onlara
işlemiyor, yalnızca "uyan kule yok" kuralı işliyor. Kilidi oyuncunun eşyalarından
zaten gelen kart da öyle (`ownedUnlocks`, mağazadaki "zaten açık" kuralının
karşılığı). Yazılmazsa `global`
kartlar `common`, dar kapsamlılar `uncommon` sayılır. Geniş kapsamlı kart her
kuruluşta işe yarar, o yüzden sık çıkmalı; dar kapsamlı olan ancak doğru kuleyle
anlamlıdır, o yüzden daha seyrek ama daha güçlü.

`legendary: 0,3` — efsanevi vuruş etkileri (aşağıda). Epiğin üstünde ve çok
seyrek: 156 kartlık havuzda bir elde (3 kart) efsanevi görme ihtimali ~%1,5.
Hepsi `tagged` (`combat: true`) ve kendi ağırlığıyla elle yazılır.

### Efsanevi vuruş etkileri

Sekiz etki (`packages/shared/src/legendary`): zincirleme şimşek, vuruşta
patlama, dondurma, infaz, ölüm parçalanması, kronal iz, hasar bağı, kütle çekim
çapası. Her birinin bir kartı ve bir eşyası var.

- **İhtimal süre başına, vuruş başına değil.** Kule ile düşman temastayken her
  tam oyun saniyesinde etki başına zar atılır; tutarsa etki o çift için kurulur
  ve kulenin o düşmana **bir sonraki** vuruşunda uygulanır. Hızlı ve yavaş kule
  saniye başına aynı sıklıkta tetikler. Bir çiftte en fazla 2 kurulu hak birikir.
- **Temas:** kule düşmana doğrudan vuruyor (kendi vuruşu ve vuruşunun alanı;
  sıçrama, durum tiki ve efsanevi hasar sayılmaz). İki vuruş arası süre kulenin
  ısının izin verdiği sürekli tetik aralığının 1,5 katını (en az 1,5 oyun sn)
  geçmiyorsa temas sürer; geçerse kopar ve saat sıfırlanır. İlk vuruş saati
  başlatır. Saat düşmanın üzerinde kule başına bir kayıt; düşman ölünce silinir.
- **Kart / eşya:** kart hasar veren bütün kulelere saniyede %20, eşya takıldığı
  kuleye %35; aynı kulede toplanır, tavan %50. Etkinin büyüklüğü ikisinde aynı.
  (İlk ayar %10 / %20 / %30'du; ısıyla sınırlı kuleler dakikada 1–3 kez
  tetikliyordu. İhtimal yükseldi, büyüklükler indi.)
- **Sayılar:** zincir 3 sıçrama × 0,65 kule saniyesi; patlama 1,6 kare × 1 kule
  saniyesi; donma 0,4 sn (şampiyon 0,15), 3 sn bağışıklık; infaz %15 canın
  altında, infaz bağışıklığı (`isExecuteImmune`: brute, şampiyon, avcı) korunur;
  parçalanma 3 sn çatlak, azami canın %14'ü (şampiyon %6), zincir ×0,6, 2 halka;
  kronal iz 3 sn, %30 geri; bağ 4 sn, %35; çekim 2 sn, 2,5 kare, 1 kare/sn.
- **Olaylar:** istemciye tik başına tek `legendary:procs` dizisi (en fazla 48).
- **Kule saniyesi:** hasar veren etkilerin ölçüsü, kulenin vuruş hasarı ×
  ısının izin verdiği sürekli tetik hızı. Yavaş ve büyük vuran kule daha büyük
  patlama almıyor.
- Aynı kule aynı etkiyi 0,4 oyun sn'den sık uygulamaz (alan kulesinde ekran ve
  hasar taşmasın); bekleyen hak kaybolmaz.

### Menzil turu

Üç kart ve üç eşya (`packages/shared/src/range-mechanics`). Hiçbiri düz
"+%X menzil" değil; mevcut menzil içeriği (Uzun Namlu, Keskin Nişancı
Dürbünü, Kinetik Erim, Yalnız Nişancı / Yalnız Kurt, Lazer Telemetre, Genleşme
Odası, Gauss Bobini; bedel olarak Isı Perdesi, Takıntı, Karşı Batarya, Şans
Merceği) ya düz yüzde ya da komşusuzluk. Yeniler menzili başka bir şeye bağlıyor:

- **Kenetlenme** (seyrek, `focusRange` 0,05): kule aynı hedefe ateş ettiği her
  oyun saniyesi +%5, en fazla +%20 (4 sn). Hedef değişince, hedef ölünce ya da
  son atıştan beri 2,5 oyun sn geçince sıfır. Menzil büyüdükçe hedef menzilde
  daha uzun kalır (Takıntı ile uyumlu). Yalnızca hedefe ateş eden kulede.
- **Termal Mercek** (nadir, `heatRange` 0,2): 50 derecede 0, 100 derecede +%20,
  her 10 derece +%4 (basamaklı). Isı freninin bölgesine değer veriyor; Isı Perdesi'nin
  (soğuma karşılığı menzil) tersi.
- **Siper Gözcüsü** (yaygın, `wallRange` 0,05): kulenin kapladığı karelerin dış
  kenarlarına örülmüş ayakta her duvar +%5, en fazla 3 duvar (+%15; bir kenar
  ikmal için açık kalsın). Kimin duvarı olduğu fark etmez. Duvar komşu
  sayılmadığı için yalnızlıkla çakışmaz.
- **Teleskopik Namlu** (eşya, 95 g, `rangeFlat` 0,25): taban menzile +0,25 kare;
  karakter çarpanlarından sonra, yüzdelerden önce eklenir. Kısa menzilli kulede
  oranı büyük (1 karede +%25, 2,5 karede +%10), seviyeyle büyümez: AttackLord'un
  yarıya inen seviye büyümesi (`getTowerRangePerLevel`) değişmiyor. Menzili sıfır
  yapıya ve haritayı kaplayan menzile eklenmez (`boundedRange`).
- **Atış Haritası** (eşya, 85 g, `killRange` 0,03): kulenin bu dalgadaki her
  öldürmesi +%3, en fazla 5 öldürme (+%15); yeni dalgada sıfır.
- **Gözcü Direği** (eşya, 110 g, `neighborRange` 0,1): takıldığı yapının
  bitişiğindeki her dost kuleye +%10 (kendine değil); bir kule en fazla +%20
  alır. Rezonans Odası gibi ateş etmeyen yapıya da takılır.

Koşullu paylar (Teleskopik Namlu dışındakiler) kart ve eşyaların `range` payıyla
aynı toplamsal havuza girer; toplamları `RANGE_CONDITIONAL_CAP` = +%35 ile
sınırlı (tek tek tavanların toplamı +%90 olurdu). Sunucu `getTowerOwnRange`
hedefleme, vuruş kontrolü, istemcinin menzil halkası (`range` teli) ve kule
paneli aynı sayıyı okur; panelde koşullu paylar tek "Koşullu" kalemi, düz kare
eşyanın çarpanı. Yerleştirme önizlemesi kart ve eşya menzilini zaten
göstermiyor; bunlar da orada yok.

#### Menzil turu, ikinci kısım

- **Geniş Ufuk** (yaygın, 2 kez, `range` 0,08): tüm kulelere +%8. Katalogda
  bütün kulelere koşulsuz menzil veren tek kart (Uzun Namlu yalnız mermi).
- **Pusu Nöbeti** (seyrek, `ambushRange` 0,2): 3 oyun sn'dir doğrudan vurmayan
  hasar kulesine +%20; pusudan sonraki ilk vuruş 2 oyun sn'lik pencere açar,
  ardından kule vurmaya devam ettikçe pay yok. Kenetlenme'nin tersi: ilk temas.
  Koşullu tavana (+%35) girer.
- **Av Kayıt Defteri** (eşya, 130 g): menzil −%5; dalgadaki her öldürme +%1,5,
  en fazla 16 (+%24, net +%19). Atış Haritası'nın (85 g, +%3 × 5) uzun soluklu
  eşi: aynı sayaç, **aynı kuleye takılmazlar** (`EXCLUSIVE_SHOP_ITEMS`). Ayrı
  stat (`killRangeLong`) olduğu için takılsalardı tavanları ayrı toplanırdı;
  karşıtlık bunu baştan kapatıyor. Koşullu tavana girer.
- **Erim Pompası** (eşya, 100 g, mermi kuleleri): menzil +%8; menzil bonusunun
  her %10'u mermi hızına +%15, en fazla +%60.
- **Kinetik Uzatıcı** (eşya, 110 g, mermi kuleleri): mermi hızı +%25; mermi hızı
  bonusunun her %10'u menzile +%3, en fazla +%15.
  Erim Pompası ile Kinetik Uzatıcı **aynı kuleye takılmaz** (sahibin kararı).
- **Tork Radyatörü** (eşya, 90 g, nişan alan ve ısınan kuleler): dönüş hızı +%20;
  dönüş hızı bonusunun her %10'u soğumaya +%6, en fazla +%30 (Tork Aktarımı'nın
  soğuma eşi).
- **Uzatma Halkası** (eşya, 45 g, 3 kez, ×1,3 fiyat): menzil +%6 (üçü +%18).
- **Uzun Erim Optiği** (eşya, 120 g): menzil +%18, atış hızı −%8.

Eşya çevrimleri (`ShopItem.conversions`) kartlarınkiyle aynı yoldan
(`collectTowerGrants` → `resolveStatConversions`) çözülür; çıktının kaynağı
`shop:<kimlik>`, panelde eşyanın adıyla görünür. Kaynak her zaman çevrimlerden
**önce** okunur (kart ve eşya toplamı + koşullu paylar): Kinetik Erim kartı ile
Erim Pompası aynı kulede birbirinin çıktısını görmez, geri besleme yok. Çevrimden
gelen menzil düz `range` payıdır; koşullu tavana girmez, kendi tavanı var.
Uyumluluk çevrimin iki ucunun ihtiyacını da sorar (`getShopItemNeeds`).
Önizleme mermi hızına dokunan değişiklikte "Mermi hızı" satırını ekler.

#### Dayanıklılık turu

Katalogda can uzun süre tek sayıydı (`towerHealth`, +%X azami can; Kalın Zırh,
Takviyeli Temel, Zırhlı Gövde, Çelik Döküm, Tampon Katman, Zırh Plakası). Bu
tur ona bir yüzde daha eklemiyor; her biri yapının ayakta kalmasını sahadaki
başka bir şeye bağlıyor. Sabitler `packages/shared/src/durability-mechanics`,
sunucuda `damageTower`, dalga sonu (`advanceWaveGrowth`) ve `updateTowers`;
testler `tests/durability-round.test.mjs`.

- **Sertleşen Gövde** (seyrek, `veteranHealth` 0,08): dalga sonunda ayakta
  duran her yapının azami canı +%8, en fazla 8 dalga (+%64). Sayaç yapıya ait
  (`veteranWaves`) ve kart alındıktan sonra işler; sonradan kurulan yapı
  sıfırdan başlar. Çarpan `towerHealth` toplamından **ayrı** çarpılır, can
  oranlı büyür (yarım canlı yapı yarım canlı kalır); esya takma, seviye ve
  yaratıcı yeniden kurulum çarpanı korur.
- **İnatçı Siper** (yaygın, `woundedDamageReduction` 0,4): canı %50'nin altındaki
  yapı %40 az hasar alır. Vuruştan önceki cana bakar, zırhtan önce uygulanır;
  tavan %60.
- **Son Nefes** (nadir, `lastStand` 3): dalga başına yapı başına bir kez öldürücü
  vuruş yapıyı 1 canla bırakır, ardından 3 oyun sn hasar almaz. Kara Kutu ve
  acil yeniden inşadan önce çalışır; enerji yiyicinin yıkımı (`destroyStructure`)
  onu atlar.
- **Yük Dağıtıcı Kiriş** (eşya, 110 g, `damageShare` 0,35): takılı yapı
  bitişiğindeki (merkezler arası yarım kare + iki yapının yarı boyu, köşegen
  dahil) dost yapıların (kule, duvar, kaynak binası) aldığı hasarın %35'ini
  üstlenir. Bir vuruşu en çok bir kiriş (en yüksek paylı) paylaşır; pay kirişe
  zırhsız gider (zırh hedefte bir kez düşülür) ve yeniden paylaşılmaz; Son
  Nefes penceresindeki kiriş paylaşmaz. Tavan %50.
- **Öz Onarım Çekirdeği** (eşya, 120 g, `idleRegen` 0,03): 4 oyun sn hasar
  almayan yapı saniyede azami canının %3'ünü yeniler; yalnızca dalga sırasında
  (hazırlıkta altınla ya da tamirciyle onarılıyor).
- **Perçinli Kaplama** (eşya, 75 g, `armorFlat` 4): yapının zırhı 3 → 7. Zırh
  her vuruştan düşülür (vuruş en az 1): 12'lik piyade vuruşu 9 → 5, 96'lık
  kuşatma vuruşu 93 → 89. Karşı atak ve yıkım zırhı deler. Snapshot'taki `armor`
  ve önizlemenin "Zırh" satırı (`preview.stat.armor`) bu sayıyı okur.

Can kurallarıyla birlikte: altınla onarım bedeli eksik canın **oranına** bakar
(`getStructureRepairCost`), azami can büyüyünce onarım pahalılaşmaz; tamirci
parça başına sabit can yazar, büyük can daha çok parça ister. Üç eşya da can
eşyaları gibi kapsamsız: her kuleye ve duvara takılır, kaynak binasına takılmaz
(kaynak binası yalnız ekonomi eşyası alıyor). Kartlar genel; her yapıya, duvara
ve kaynak binasına işler (`structure` erişimi).

Kataloğun yaklaşık yarısı düz stat, yarısı davranış olmalı. Düz stat tarafı
şişerse oyuncu üç seçenek görürken kuruluşunu taşıyan kartı hiç göremez.

## Denge

Yeni içerik eklemek oyunu kolaylaştırır. `tools/simulate.mjs` bot zafer oranını
ölçer ve `tests/simulation.test.mjs` bunu **%5-%10** bandına sabitler.

```bash
npm run simulate -- --runs 200 --seed 1000
```

Simülatör kilitleri ve motor eklentilerini kaba bir hasar karşılığıyla modeller
(`UNLOCK_DAMAGE_ADD`, `grantDamageAdd`). Yeni bir kilit eklerken oraya da bir
değer yaz, yoksa bot o kartı değersiz sanır ve denge ölçümü bozulur.

Band dışına çıkıldığında ayar düğmesi `PLAYER_POWER_COMPENSATION`: oyuncu
tarafında kazanılan güç düşman canına geri verilir. Amaç içeriği güçlendirmek
değil ilginçleştirmek.

Kartlar tek başına değerlendirilemez; güç bütçesi üç kaynağa bölünür:

| Kaynak | Büyüklük |
|---|---|
| Kule seviyesi (1→10) | ×12 |
| Kart katmanının tamamı | ×2-3 |
| Karakter imza mekaniği | ×1,24 (Atakan) — ×4,1 (Melis) |

Seviye eğrisi bir dönem ×48'di ve diğer ikisini anlamsızlaştırıyordu. `wave-balance`
testi hem bu üst sınırı hem de "hiçbir kule seviye atlayınca zayıflamaz" kuralını
koruyor.

## Kontrol listesi

Yeni bir kart eklerken:

- [ ] Açıklamada sayı var mı? (test zorunlu tutuyor)
- [ ] `effects`, `unlocks` veya `grants` üçünden en az biri dolu mu?
- [ ] Kilit eklediysen sunucuda okuyucusu var mı?
- [ ] `tagged` ise uyduğu en az bir kule var mı?
- [ ] Simülatörde karşılığı tanımlı mı?
- [ ] Katalog sayısını sabitleyen testleri güncelledin mi?
- [ ] Yeni nadirlik ya da nadirlik ağırlığı: `CARD_RARITY_ORDER`, istemcinin
  nadirlik etiketleri ve çerçeveleri (kart seçimi, arşiv, deste, rapor), kart
  açılış tınısı (`getCardRevealCues`) güncel mi?
- [ ] `npm test` ve `npm run typecheck` temiz mi?
