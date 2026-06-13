# Atakan

## Kisa Ozet

Atakan, aile hekimligi, SaaS projeleri ve kendi halinde uretkenlik temasina sahip moduler bir strateji karakteridir.

Ham gucu en yuksek karakter degildir. Asil gucu, kulelerini dogru konumlandirmaktan, yalniz calisan kulelerden verim almaktan, isaretleme ve baglanti mekanikleriyle takim hasarini buyutmekten gelir.

Atakan oyuncusu oyunu "tek tek kule koyup beklemek" yerine, kuleler arasindaki iliskiyi ve dalga temposunu yoneterek oynar.

## Karakter Kimligi

| Alan | Deger |
|---|---:|
| Karakter ID | `warrior` |
| Ad | Atakan |
| Rol | Moduler Stratejist |
| Tema | Aile hekimi, SaaS projeleri, kendi halinde uretkenlik |
| Maksimum Can | 90 |
| Hareket Hizi | 0.92 |
| Temel Hasar | 12 |
| Temel Atis Araligi | 760 ms |
| Mermi Hizi | 330 |

## Oynanis Felsefesi

Atakan'in oyun tarzi uc ana fikir uzerine kurulu:

1. **Moduler verimlilik**
   Kuleler tek basina veya dogru baglandiklarinda normal degerlerinin ustune cikar.

2. **Isaretleme ve takim hasari**
   Takipci kulesi dusmanlari isaretler. Isaretli dusmanlar Atakan'in diger kulelerinden ve takim arkadaslarindan daha fazla hasar alir.

3. **Gec oyun yatirimi**
   Ucube gibi kuleler erken oyunda pahali ve zayif baslar, fakat dalgalar ilerledikce buyuk bir yatirima donusur.

## Pasif: Kendi Halinde Uretkenlik

**Aciklama:**  
Tek basina duran Atakan kuleleri daha verimli calisir. Dogru moduler kurulumla Atakan, ham guc eksigini kapatir.

**Mevcut uygulama:**

- Atakan'a ait kule, Sunucu haricinde yalniz durumdaysa pasif aktif olur.
- Yalniz sayilmasi icin 76 birim yakininda baska kule olmamasi gerekir.
- Pasif aktifken:
  - Kule hasari `x1.12` olur.
  - Kule atis araligi `x0.9` olur, yani daha hizli ates eder.
- Sunucu kulesi pasiften etkilenmez.

## Kuleler

### 1. Takipci

**Rol:** Hasar, isaretleme  
**Sinif:** Hasar  
**Hasar turu:** Fiziksel  
**Vurus turu:** Mermi

Takipci, Atakan'in takim hasarini acan temel kulesidir. Dengeli tek hedef hasari verir ve vurdugu dusmana `Takipte` isareti koyar.

| Ozellik | Deger |
|---|---:|
| Maliyet | 42 altin |
| Upgrade maliyeti | 32 baz |
| Menzil | 112 |
| Hasar | 12 |
| Atis araligi | 720 ms |
| Mermi hizi | 340 |
| AOE | Yok |
| Yavaslatma | Yok |

**Takipte mekanigi:**

- Takipci vurdugu hedefe `Takipte` uygular.
- Isaret suresi 6.5 saniyedir.
- Takipte olan dusmanlar, Takipci haricindeki kaynaklardan `x1.2` hasar alir.
- Takipci kendi isaretinden bonus hasar almaz.
- Debug Lazer, normal hedef seciminde Takipte dusmanlara oncelik verir.
- Atakan ultisindeki drone'lar, nexus kritik degilse en yakin dusmana kamikaze saldirisi yapar.

### 2. Sunucu

**Rol:** Global destek  
**Sinif:** Hibrit  
**Hasar turu:** Elektrik  
**Vurus turu:** Carpma

Sunucu, kendi basina normal atis yapan bir kule gibi davranmaz. Iki kuleye baglanabilir. Bagli kulelerin menzilinden cikan dusmanlara Sunucu tarafindan guclu elektrik topu gonderilir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 74 altin |
| Upgrade maliyeti | 54 baz |
| Menzil | Global |
| Temel hasar | 0 |
| Atis araligi | 980 ms |
| Mermi hizi | 310 |
| AOE | 18 |

**Baglanti mekanigi:**

- Sunucu en fazla 2 kuleye baglanabilir.
- Bagli kulelerin menziline girip sonra menzilden cikan dusman tespit edilir.
- Elektrik topunu bagli kule degil, Sunucu gonderir.
- Sunucu ayni kuleye uzun sure bagli kalirsa o kuleye ek buff verir.
- Mevcut hasar formulu:

```txt
Hasar = 95 + SunucuSeviyesi * 32 + BagliKuleSeviyesi * 12
```

- AOE formulu:

```txt
AOE = 24 + SunucuSeviyesi * 5
```

- Bekleme suresi:

```txt
Cooldown = max(520, 1100 - SunucuSeviyesi * 80) ms
```

**Uzun baglanti bufflari:**

Bag suresi, Sunucu ile ayni kule arasinda link kopmadan gecen dalga sayisiyla olculur.

| Bagli kalinan dalga | Buff |
|---:|---|
| 5 dalga | Bagli kule `impact/carpma` vurus tipindeyse hasari %20 artar. |
| 10 dalga | Bagli kulenin her vurusuna hedefin maksimum caninin %1'i kadar ek hasar eklenir. |

Notlar:

- 5 dalga buff'i sadece `impact` vurus tipini etkiler.
- Debug Lazer `focus` vurus tipinde oldugu icin 5 dalga buff'indan etkilenmez.
- 10 dalga buff'i vurus tipinden bagimsizdir. Bu nedenle Debug Lazer gibi sik tick atan kulelerde cok degerlidir.
- Link koparsa veya Sunucu baska kuleye baglanirken eski link slot'tan duserse bag sayaci sifirlanir.
- 5 ve 10 dalga esigine ulasan bagli kulelerin sprite icinde Matrix benzeri kod akisi efekti gorunur. Efekt sprite'in icinde kalir, boylece kulenin tipi ayirt edilmeye devam eder.

### 3. Izolasyon Kulesi

**Rol:** Alan kontrolu  
**Sinif:** Kontrol  
**Hasar turu:** Yok  
**Vurus turu:** Aura

Izolasyon Kulesi hasar vermek icin degil, dusman temposunu bozmak icin kullanilir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 58 altin |
| Upgrade maliyeti | 42 baz |
| Menzil | 104 |
| Hasar | 0 |
| Atis araligi | 620 ms |
| Yavaslatma | 850 ms |

**Izolasyon mekanigi:**

- Menzilindeki dusmanlari yavaslatir.
- Etrafinda 76 birim icinde baska kule yoksa izole sayilir.
- Izole haldeyken atis yapmak yerine aura gibi calisir.
- Izole aura yavaslatmasi:

```txt
Yavaslatma = temel slow + 650 + (kule seviyesi - 1) * 120 ms
```

### 4. Obsesyon Kulesi

**Rol:** Hasar  
**Sinif:** Hasar  
**Hasar turu:** Psisik  
**Vurus turu:** Carpma

Obsesyon Kulesi ayni hedefe odaklandikca guclenir. Tank dusmanlara oncelik verir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 82 altin |
| Upgrade maliyeti | 60 baz |
| Menzil | 118 |
| Hasar | 18 |
| Atis araligi | 760 ms |
| Mermi hizi | 330 |

**Odak mekanigi:**

- Ayni hedefe vurdukca `focusStacks` artar.
- Her stack hasari `%20` artirir.
- Hedef degisirse stack sifirlanir.
- Tank dusmanlara oncelik verir.

**Korku mekanigi:**

- Korku etkisi kule seviye 3 ve sonrasinda acilir.
- Ayni hedefe 3. vurustan sonra hedefe `Korku` uygulanir.
- Korkan dusman 3 saniye boyunca yol uzerinde geri kacar.
- Ayni hedefe ek vuruslar korku suresini tazeleyebilir.

### 5. Debug Lazer

**Rol:** Hasar, AOE  
**Sinif:** Hasar  
**Hasar turu:** Ates  
**Vurus turu:** Odaklanma

Debug Lazer, dusmana mermi firlatmak yerine kule ile hedef arasinda lazer baglantisi kurar. Kucuk ama cok sik hasar vererek isaretli hedefleri eritmek icin tasarlanmistir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 108 altin |
| Upgrade maliyeti | 78 baz |
| Menzil | 134 |
| Hasar | 5 |
| Atis araligi | 120 ms |
| Overdrive tick araligi | 50 ms |
| Mermi hizi | 620 |
| AOE radius | 10 |

**Normal mod:**

- Takipte dusmanlara oncelik verir.
- Odak lazeri hedefe dogrudan hasar verir.

**Overdrive:**

- Debug Lazer, Takipte bir hedefi oldururse overdrive tetiklenir.
- Overdrive suresi 2 saniyedir.
- Lazer, oldurulen hedefin path mesafesinden gerideki dusmana dogru path acisina gore sweep yapar.
- Lazerin sweep donus hizi 30 derece/saniye ile sinirlidir.
- Overdrive sirasinda:
  - Menzil harita sonuna kadar uzar.
  - Tick araligi 50 ms olur.
  - Hasar `x1.2` olur.
  - Lazer cizgisine temas eden dusmanlar hasar alir.

**Hararet:**

- 20 saniyelik pencere icinde 10 saniyeden fazla overdrive'da kalirsa hararet yapar.
- Hararet suresi 5 saniyedir.
- Hararet sirasinda kule calismaz.

### 6. Ucube

**Rol:** Gec oyun hasari  
**Sinif:** Hasar  
**Hasar turu:** Elektrik  
**Vurus turu:** Mermi

Ucube pahali ve zayif baslayan, fakat dalgalar ilerledikce buyuyen yatirim kulesidir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 160 altin |
| Upgrade maliyeti | 115 baz |
| Menzil | 118 |
| Hasar | 9 |
| Atis araligi | 940 ms |
| Mermi hizi | 370 |

**Calisma ritmi:**

- Aktif olarak hedef vurabildigi her saniye saldiri hizi stack kazanir.
- Hedef bulamazsa aktif sure ve stackler sifirlanir.
- Stack basina atis araligi azalir.
- Stack etkisi:

```txt
Atis araligi carpani = max(0.35, 1 - stack * 0.055)
```

- Normal max stack 10'dur.
- Dalga gelisimiyle max stack 15'e cikabilir.
- 20 saniye araliksiz calisirsa hararet yapar.
- Hararet suresi 10 saniyedir.
- Dalga gelisimiyle hararet tamamen kalkabilir.

**Dalga sonu gelisimleri:**

| Dalga bonus seviyesi | Etki |
|---:|---|
| 1 | Elektrik arkadaki 2 hedefe seker. Seken hasar ana hasarin %42'sidir. |
| 2 | Vuruslar hedefi path uzerinde 18 birim geri iter. |
| 3 | Hasar %20 artar. |
| 4 | Max stack 10'dan 15'e cikar. |
| 5 | Menzil 2 katina cikar, cani 2 katina cikar. |
| 6 | Hararet yapmaz. |

## Beceriler

Atakan'in 3 aktif becerisi vardir.

### 1. Yonlendirme

**Cooldown:** 16 saniye  
**Sure:** 1 saniye

Haritada bir alan isaretlenir. Bu sure boyunca mermi ve carpma vuruslu kuleler menzil sinirina takilmadan o alandaki dusmanlara saldirabilir.

**Mevcut uygulama:**

- Alan koordinati oyuncudan gelir.
- Etki suresi 1000 ms.
- Etki yari capi yaklasik 78 birimdir.
- `projectile` ve `impact` vurus tipli kuleleri etkiler.
- Ham hasari degistirmez; kulelerin menzil disi hedeflere de uptime kazanmasini saglar.

### 2. Refactor

**Cooldown:** 24 saniye

Secili kuleyi cezasiz sekilde baska bir uygun kareye tasir.

**Mevcut uygulama:**

- Oyuncu once kendi kulesini secer.
- Sonra yeni konuma dokunur.
- Yeni konum uygunsa kule oraya tasinir.
- Kule cooldown'u en fazla 150 ms olacak sekilde dengelenir.
- Sunucu link hafizasi gibi menzil gecmisleri sifirlanir.

### 3. Sessiz Mod

**Cooldown:** 32 saniye  
**Susma suresi:** 5 saniye  
**Hizlanma penceresi:** 10 saniyeye kadar server tarafinda aktif tutulur

Tum kuleler kisa sure susar. Ardindan hasar sinifli kuleler cok hizli calisir.

**Mevcut uygulama:**

- `silentModeUntil`: 5 saniye.
- `damageHasteUntil`: 10 saniye.
- Hasar sinifli kulelerin atis araligi `1/3` carpani alir.
- Yani hasar kuleleri bu pencerede yaklasik 3 kat daha sik ates eder.

## Ulti: Tam Otomasyon

Atakan'in ultisi, kulelerinden mini-drone cikarma fikrine dayanir.

**Kullanim sarti:** Ulti charge 100 olmalidir.  
**Kullanimdan sonra:** Ulti charge 0'a iner.

Her Atakan kulesi ulti basildiginda bir mini-drone uretir. Drone'lar gercek oyun nesnesi olarak haritada hareket eder.

Karar once nexus canina gore verilir:

1. Nexus cani 30'un altindaysa drone'lar nexus'a dogru ilerler.
2. Nexus cani 30 veya ustundeyse drone'lar dusmana saldirir.

**Onarim davranisi:**

- Drone nexus'a ulasinca takim canini 1 artirir.
- Her drone ayri ayri 1 can yeniler.
- Takim cani maksimum can degerini asamaz.

**Saldiri davranisi:**

- Drone, kendisine en yakin mevcut dusmani hedefler.
- Hedefe dogru ilerler ve temas ettiginde kamikaze saldirisi yapar.
- Drone hasari:

```txt
Hasar = 200
```

**Gorsel davranis:**

- Saldiri drone'u kirmizi/altin renkte gorunur.
- Nexus onarim drone'u cyan/yesil renkte gorunur.
- Drone'lar hedeflerine dogru hareket eder; anlik hasar veya anlik heal olarak uygulanmaz.

**Tukenmislik:**

- Ulti bittikten sonra Atakan'in tum kuleleri 5 saniyeligine kapanir.
- Bu durum oyun icinde `Tukenmis` status'u olarak gorunur.

## Level ve Upgrade Formulleri

Kule seviyesi maksimum 10'dur.

### Upgrade maliyeti

Upgrade maliyeti ortak formulle hesaplanir:

```txt
hedef seviye = mevcut seviye + 1
maliyet = round(baseUpgradeCost * mevcutSeviye * 1.35 * indirim)
```

Indirimler:

| Hedef seviye | Indirim carpani |
|---:|---:|
| 2 | 0.50 |
| 3 | 0.70 |
| 4 | 0.85 |
| 5+ | 1.00 |

### Hasar artisi

Genel kule hasari seviye ile artar:

```txt
Hasar = temelHasar * (1 + (seviye - 1) * 0.42)
```

Pasif, Obsesyon stackleri, Debug Lazer overdrive ve Ucube dalga bonuslari bu degerin uzerine ek carpim olarak uygulanabilir.

### Atis hizi artisi

Genel atis araligi seviye ile azalir:

```txt
Atis araligi = temelAtisAraligi * (1 - (seviye - 1) * 0.1)
```

Minimum atis araligi:

- Normal kuleler: 80 ms
- Debug Lazer overdrive: 50 ms

### Menzil artisi

Sunucu haricindeki kulelerde seviye basina menzil artar:

```txt
Menzil = temelMenzil + (seviye - 1) * 11
```

Atakan pasifi aktifse menzil de `x1.12` pasif carpaniyla etkilenir.

## Kule Level Stat Tablolari

Bu tablolardaki degerler pasif, Sessiz Mod, Takipte bonusu, Obsesyon stacki, Ucube aktif stacki gibi gecici carpimlar olmadan hesaplanan baz degerlerdir.

Tablo notlari:

- `Sonraki upgrade`, o levelden bir sonraki levele gecis maliyetidir.
- Level 10 maksimum level oldugu icin sonraki upgrade yoktur.
- DPS, baz hasar ve baz atis araligina gore hesaplanmistir.
- Sunucu normal kule gibi hasar vermedigi icin ana hasar degeri 0'dır; asil hasari elektrik topu formulunden gelir.
- Izolasyon Kulesi hasar vermez; seviye ile menzili, atis araligi ve yavaslatma degerleri degisir.

### Takipci - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 12.0 | 720 ms | 112 | 16.7 | 22 |
| 2 | 17.0 | 648 ms | 123 | 26.3 | 60 |
| 3 | 22.1 | 576 ms | 134 | 38.3 | 110 |
| 4 | 27.1 | 504 ms | 145 | 53.8 | 173 |
| 5 | 32.2 | 432 ms | 156 | 74.4 | 216 |
| 6 | 37.2 | 360 ms | 167 | 103.3 | 259 |
| 7 | 42.2 | 288 ms | 178 | 146.7 | 302 |
| 8 | 47.3 | 216 ms | 189 | 218.9 | 346 |
| 9 | 52.3 | 144 ms | 200 | 363.3 | 389 |
| 10 | 57.4 | 80 ms | 211 | 717.0 | - |

Takipci'nin isaret mekanigi level esiklerine gore stacklenir:

- Takipte suresi: 6.5 saniye.
- Lv1-4: En fazla 1 stack uygular. Takipci haricindeki kaynaklar hedefe x1.2 hasar verir.
- Lv5-9: En fazla 2 stack uygular. Takipci haricindeki kaynaklar hedefe x1.4 hasar verir.
- Lv10: En fazla 3 stack uygular. Takipci haricindeki kaynaklar hedefe x1.6 hasar verir.
- Dusuk level Takipci, daha yuksek stacklerin suresini yenileyemez. Ornegin Lv4 Takipci 2. stacki, Lv9 Takipci 3. stacki uzatamaz.
- Gorsel isaret: 1 stack sari `T`, 2 stack cyan `T2`, 3 stack mor `T3`.

### Sunucu - Level Statlari

Sunucu'nun kendi normal atisi yoktur. Bu nedenle baz hasar ve DPS degeri 0'dır. Level ile asil degisen sey, bagli kulelerin menzilinden cikan dusmanlara gonderdigi elektrik topudur.

| Lv | Baz hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.0 | 980 ms | Global | 0.0 | 36 |
| 2 | 0.0 | 882 ms | Global | 0.0 | 102 |
| 3 | 0.0 | 784 ms | Global | 0.0 | 186 |
| 4 | 0.0 | 686 ms | Global | 0.0 | 292 |
| 5 | 0.0 | 588 ms | Global | 0.0 | 365 |
| 6 | 0.0 | 490 ms | Global | 0.0 | 437 |
| 7 | 0.0 | 392 ms | Global | 0.0 | 510 |
| 8 | 0.0 | 294 ms | Global | 0.0 | 583 |
| 9 | 0.0 | 196 ms | Global | 0.0 | 656 |
| 10 | 0.0 | 98 ms | Global | 0.0 | - |

Elektrik topu level etkisi:

```txt
Hasar = 95 + SunucuSeviyesi * 32 + BagliKuleSeviyesi * 12
AOE = 24 + SunucuSeviyesi * 5
Cooldown = max(520, 1100 - SunucuSeviyesi * 80) ms
```

Bagli kule level 1 varsayimiyla:

| Sunucu Lv | Elektrik hasari | AOE | Link cooldown |
|---:|---:|---:|---:|
| 1 | 139 | 29 | 1020 ms |
| 2 | 171 | 34 | 940 ms |
| 3 | 203 | 39 | 860 ms |
| 4 | 235 | 44 | 780 ms |
| 5 | 267 | 49 | 700 ms |
| 6 | 299 | 54 | 620 ms |
| 7 | 331 | 59 | 540 ms |
| 8 | 363 | 64 | 520 ms |
| 9 | 395 | 69 | 520 ms |
| 10 | 427 | 74 | 520 ms |

Uzun baglanti bufflari:

| Bagli kalinan dalga | Bagli kuleye etkisi |
|---:|---|
| 5 | Bagli kule `impact/carpma` vurus tipindeyse hasar `x1.2` olur. |
| 10 | Bagli kulenin her hasar uygulamasina hedef max HP'sinin %1'i eklenir. |

### Izolasyon Kulesi - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | Normal slow | Izole aura slow | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.0 | 620 ms | 104 | 850 ms | 1500 ms | 28 |
| 2 | 0.0 | 558 ms | 115 | 940 ms | 1620 ms | 79 |
| 3 | 0.0 | 496 ms | 126 | 1030 ms | 1740 ms | 145 |
| 4 | 0.0 | 434 ms | 137 | 1120 ms | 1860 ms | 227 |
| 5 | 0.0 | 372 ms | 148 | 1210 ms | 1980 ms | 284 |
| 6 | 0.0 | 310 ms | 159 | 1300 ms | 2100 ms | 340 |
| 7 | 0.0 | 248 ms | 170 | 1390 ms | 2220 ms | 397 |
| 8 | 0.0 | 186 ms | 181 | 1480 ms | 2340 ms | 454 |
| 9 | 0.0 | 124 ms | 192 | 1570 ms | 2460 ms | 510 |
| 10 | 0.0 | 80 ms | 203 | 1660 ms | 2580 ms | - |

### Obsesyon Kulesi - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 18.0 | 760 ms | 118 | 23.7 | 41 |
| 2 | 25.6 | 684 ms | 129 | 37.4 | 113 |
| 3 | 33.1 | 608 ms | 140 | 54.5 | 207 |
| 4 | 40.7 | 532 ms | 151 | 76.5 | 324 |
| 5 | 48.2 | 456 ms | 162 | 105.8 | 405 |
| 6 | 55.8 | 380 ms | 173 | 146.8 | 486 |
| 7 | 63.4 | 304 ms | 184 | 208.4 | 567 |
| 8 | 70.9 | 228 ms | 195 | 311.1 | 648 |
| 9 | 78.5 | 152 ms | 206 | 516.3 | 729 |
| 10 | 86.0 | 80 ms | 217 | 1075.5 | - |

Obsesyon stackleri bu tablonun uzerine eklenir:

```txt
Efektif hasar = Level hasari * (1 + focusStack * 0.2)
```

Korku etkisi level 3 ve sonrasinda acilir.

### Debug Lazer - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 5.0 | 120 ms | 134 | 41.7 | 53 |
| 2 | 7.1 | 108 ms | 145 | 65.7 | 147 |
| 3 | 9.2 | 96 ms | 156 | 95.8 | 269 |
| 4 | 11.3 | 84 ms | 167 | 134.5 | 421 |
| 5 | 13.4 | 80 ms | 178 | 167.5 | 527 |
| 6 | 15.5 | 80 ms | 189 | 193.8 | 632 |
| 7 | 17.6 | 80 ms | 200 | 220.0 | 737 |
| 8 | 19.7 | 80 ms | 211 | 246.3 | 842 |
| 9 | 21.8 | 80 ms | 222 | 272.5 | 948 |
| 10 | 23.9 | 80 ms | 233 | 298.8 | - |

Overdrive sirasinda:

- Hasar `x1.2` olur.
- Atis araligi 50 ms olur.
- Menzil harita sonuna kadar uzar.

Overdrive efektif DPS:

| Lv | Overdrive tick hasari | Overdrive DPS |
|---:|---:|---:|
| 1 | 6.0 | 120.0 |
| 2 | 8.5 | 170.4 |
| 3 | 11.0 | 220.8 |
| 4 | 13.5 | 271.2 |
| 5 | 16.1 | 321.6 |
| 6 | 18.6 | 372.0 |
| 7 | 21.1 | 422.4 |
| 8 | 23.6 | 472.8 |
| 9 | 26.2 | 523.2 |
| 10 | 28.7 | 573.6 |

### Ucube - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 9.0 | 940 ms | 118 | 9.6 | 78 |
| 2 | 12.8 | 846 ms | 129 | 15.1 | 217 |
| 3 | 16.6 | 752 ms | 140 | 22.0 | 396 |
| 4 | 20.3 | 658 ms | 151 | 30.9 | 621 |
| 5 | 24.1 | 564 ms | 162 | 42.8 | 776 |
| 6 | 27.9 | 470 ms | 173 | 59.4 | 932 |
| 7 | 31.7 | 376 ms | 184 | 84.3 | 1087 |
| 8 | 35.5 | 282 ms | 195 | 125.7 | 1242 |
| 9 | 39.2 | 188 ms | 206 | 208.7 | 1397 |
| 10 | 43.0 | 94 ms | 217 | 457.7 | - |

Ucube aktif stackleri bu tablodaki atis araligini ayrica dusurur:

```txt
Stack carpani = max(0.35, 1 - stack * 0.055)
Efektif atis araligi = level atis araligi * stack carpani
```

Dalga bonuslari:

- Bonus 1: Elektrik arkadaki 2 hedefe seker, seken hasar ana hasarin %42'si.
- Bonus 2: Hedefi 18 path birimi geri iter.
- Bonus 3: Hasar %20 artar.
- Bonus 4: Max stack 15 olur.
- Bonus 5: Menzil 2 katina cikar.
- Bonus 6: Hararet yapmaz.

## Durum Etkileri ve Etiketler

### Takipte

- Kaynak: Takipci.
- Sure: 6.5 saniye.
- Etki: Stack basina Takipci haricindeki hasar kaynaklarindan %20 daha fazla hasar.
- Stack limitleri: Lv1-4 en fazla 1, Lv5-9 en fazla 2, Lv10 en fazla 3.
- Debug Lazer hedef seciminde Takipte dusmanlari onceliklendirir.
- Atakan drone'lari mevcut uygulamada Takipte onceligi kullanmaz; nexus kritik degilse kendilerine en yakin dusmana saldirir.

### Korku

- Kaynak: Obsesyon Kulesi, seviye 3+.
- Kosul: Ayni hedefe 3. vurus.
- Sure: 3 saniye.
- Etki: Dusman path uzerinde geri kacar.

### Hararet

- Kaynak: Debug Lazer ve Ucube.
- Etki: Kule gecici olarak calismaz.
- Debug Lazer harareti: 5 saniye.
- Ucube harareti: 10 saniye.

### Tukenmis

- Kaynak: Tam Otomasyon ultisi.
- Etki: Atakan kuleleri 5 saniyeligine kapanir.

## Tasarim Notu

Atakan, dogru kurulumla guclenen bir karakter olarak tasarlanmistir. Onun gucu tek bir kulede degil; Takipci isareti, Sunucu linkleri, izole kule pasifi, Debug Lazer overdrive ve Ucube gec oyun yatiriminin birlikte calismasindadir.

Oyuncu icin ana karar sorulari:

- Hangi dusmanlar Takipte tutulacak?
- Hangi kuleler Sunucu'ya baglanacak?
- Izolasyon Kulesi gercekten yalniz kalabilecek mi?
- Ucube'ye erken yatirim yapmaya deger mi?
- Sessiz Mod ne zaman kullanilirsa kaybedilen 5 saniyeyi telafi eder?
- Tam Otomasyon savunma tamiri icin mi, kamikaze hasar icin mi saklanmali?
