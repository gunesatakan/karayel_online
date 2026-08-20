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

Üçü de hem kartlarda hem mağaza eşyalarında geçerli. Bir davranışın kaynağı
kart mı eşya mı olduğu sunucu için fark etmez.

## 1. Modifier

```ts
{ id: "namlu-asinmasi", …, effects: [effect("namlu-asinmasi", "damage", 0.25)] }
```

Aynı stata yazan modifierlar toplanır ve `1 + toplam` olarak çözülür. Yani iki
ayrı `+%25 hasar` kartı `%56` değil `%50` verir. Yeni bir stat gerekiyorsa
`ModifierStat` birleşimine ekle ve **okuyucusunu da yaz** — okunmayan stat ölü
içeriktir ve `catalog-coverage` testi bunu yakalar.

## 2. Kilit (`unlocks`)

Sayıyla ifade edilemeyen davranışlar. `Unlock` birleşimine ekle, `ALL_UNLOCKS`
listesine yaz, sunucuda `towerHasUnlock(tower, "…")` ile oku.

Mevcut eksenler: hedefleme modları, hava hedefi, durum etkileri, yığın türleri,
komşuluk/yalnızlık, ekonomi, ve ısı/enerji eğrisi.

Kilitler tele **bit maskesi** olarak gider (`encodeUnlocks` / `hasUnlockBit`).
Sıra `ALL_UNLOCKS` tarafından belirlenir, o yüzden yeni kilitler **listenin
sonuna** eklenir; ortaya eklemek eski istemcilerle uyumu bozar. Liste 31 kilidi
aşamaz.

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
- `tagged` — `axes`, `hitTypes`, `damageTypes`, `shapes`, `ammoTypes` filtreleri.

`tagged` bir kart hiçbir kuleye uymuyorsa **ölü içeriktir** ve test onu reddeder.
Şekil filtresi her kulede dolu olduğu için en güvenli dar kapsam odur; vuruş ve
hasar türü kulelerin bir kısmında tanımsızdır.

## Nadirlik

`common: 6`, `uncommon: 3`, `rare: 1` — çekiliş ağırlıkları. Yazılmazsa `global`
kartlar `common`, dar kapsamlılar `uncommon` sayılır. Geniş kapsamlı kart her
kuruluşta işe yarar, o yüzden sık çıkmalı; dar kapsamlı olan ancak doğru kuleyle
anlamlıdır, o yüzden daha seyrek ama daha güçlü.

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
- [ ] `npm test` ve `npm run typecheck` temiz mi?
