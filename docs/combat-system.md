# Karayel Combat Sistemi

Bu dokuman, dusman, hasar ve vurus siniflandirmalarinin ortak sozlugudur.

## Dusman Statlari

Her dusman artik yalnizca HP ve hizdan olusmaz. Temel alanlar:

| Stat | Anlam |
|---|---|
| HP | Dusmanin asil cani. 0'a inince dusman olur. |
| Zirh | Alinan hasari LoL benzeri armor formuluyle azaltir veya negatifse artirir. |
| Can yenileme | Saniye basina yenilenen HP. Maksimum HP'yi gecmez. |
| Hareket hizi | Yol uzerinde saniye basina ilerleme degeri. |
| Kalkan | HP'den once hasar yiyen ek bariyer. |
| Hareket tipi | `ground` veya `air`. `ground` dusmanlar yolu izler, `air` dusmanlar nexus koordinatina en uzak harita kosesinden nexusa direkt ucar. |
| Hasar direncleri | Hasar turu bazinda gelen hasari azaltir veya zayiflik olarak artirir. |
| Durum direncleri | Slow, fear, tracking gibi etkilerin suresini azaltir. |
| Beceriler | Dusmanin ozel davranis etiketleri. |

## Hasar Turleri

| Tur | Kullanim |
|---|---|
| `physical` | Mermi, takipci gibi fiziksel hasarlar. |
| `electric` | Sunucu, Ucube ve elektrik zinciri. |
| `psychic` | Obsesyon ve zihinsel/CC temali hasarlar. |
| `fire` | Debug Lazer ve yanma/enerji temali hasarlar. |
| `true` | Zirh yok sayan saf hasar. Skill ve ulti hasarlari simdilik varsayilan olarak bu gruptadir. |
| `none` | Hasar vermeyen kontrol kuleleri. |

## Vurus Tipleri

| Tip | Anlam |
|---|---|
| `projectile` | Hedefe dogru takip eden mermi. |
| `impact` | Carpisma/patlama tipi vurus. |
| `focus` | Kanal/laser/tick hasari. |
| `aura` | Alan etkisi, genellikle kontrol. |

## Armor Formulu

Alinan hasar LoL mantigiyla hesaplanir.

Pozitif veya sifir armor:

```txt
carpan = 100 / (100 + armor)
```

Negatif armor:

```txt
carpan = 2 - 100 / (100 - armor)
```

Ardindan hasar turu direnci uygulanir:

```txt
direnc_carpani = 1 - hasar_direnci
```

Ornekler:

```txt
armor 50  => hasar x0.666
armor 100 => hasar x0.5
armor -25 => hasar x1.2
physical direnc 0.10 => fiziksel hasar %10 azalir
fire direnc -0.08 => fire hasari %8 artar
```

Kalkan varsa hesaplanan hasar once kalkana gider. Kalkan bittikten sonra kalan hasar HP'ye uygulanir.

## Max HP Oranli Hasar

Sunucu'nun 10 dalga uzun baglanti buff'i gibi `max HP yuzdesi` uzerinden calisan ek hasarlar kalkan varken tetiklenmez. Bu hasar tipi dusmanin canina saplanan ek hasar olarak kabul edilir.

Uygulama sirasi:

1. Normal hasar armor, hasar direnci ve kalkan hesabindan gecer.
2. Kalkan 0'a inmis durumdaysa max HP oranli bonus HP'ye ek hasar olarak uygulanir.
3. Kalkan hala varsa max HP oranli bonus o vurus icin uygulanmaz.

## Mevcut Dusman Tanimlari

| Dusman | HP | Zirh | Regen/sn | Kalkan | Hiz | Tip | Not |
|---|---:|---:|---:|---:|---:|---|---|
| Grunt | 46 | 5 | 0 | 0 | 50 | ground | Standart dusman. |
| Brute | 76 | 34 | 0.35 | 18 | 34 | ground | Fiziksele direncli, fire'a zayif, slow/fear direncli. |
| Runner | 30 | 0 | 0 | 0 | 78 | ground | Hizli, slow direncli, elektrige zayif. |
| Shooter | 42 | 10 | 0.18 | 10 | 44 | ground | Kalkanli, psychic hasara direncli, ranged-shot etiketi tasir. |

HP ve kalkan dalga HP carpaniyla buyur. Zirh, direncler ve hareket tipi dusman kimligi olarak sabit kalir.

## Ucan Dalga Kurallari

| Dalga | Kural |
|---:|---|
| 5 | Tum dusmanlar `air` gelir. |
| 10 | Tum dusmanlar `air` gelir. |
| 15 | Kara ve ucan dusmanlar karisik gelir. |
| 20 | Kara ve ucan dusmanlar karisik gelir. |

Ucan dusmanlar path spawn noktasindan dogmaz. Hedef nexus koordinatina en uzak harita kosesinden baslar ve nexus'a dogru en kisa cizgide ilerler; yol karelerini takip etmezler. Ucan dusmanlar ayni dusman tipinin kara versiyonuna gore %50 HP ve %50 kalkanla gelir. Tamamen ucan dalgalarda toplam dusman sayisi normal dalga sayisinin yarisi kadardir. Karisik dalgalarda her 4 spawn'dan 1'i ucan dusman olur. Su an Atakan tarafinda sadece Obsesyon Kulesi ve Ucube ucan hedefleri vurabilir. Takipci, Sunucu, Izolasyon ve Debug Lazer ucan hedef secmez.
