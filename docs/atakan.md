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
| Upgrade maliyeti | Satın alım maliyetine orantılı |
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
| Upgrade maliyeti | Satın alım maliyetine orantılı |
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
- Mevcut hasar egrisi:

```txt
Lv1-10 = 160 / 240 / 330 / 420 / 500 / 1000 / 1500 / 2000 / 3000 / 4000
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
| 5 dalga | Bagli kule `impact/carpma` vurus tipindeyse hasari Sunucu leveline gore artar: `+%12` - `+%30`. |
| 10 dalga | Bagli kulenin her vurusuna Sunucu leveline gore hedefin maksimum caninin `%0.5` - `%1.5` kadari ek hasar olarak eklenir. |

Notlar:

- 5 dalga buff'i sadece `impact` vurus tipini etkiler.
- Debug Lazer `focus` vurus tipinde oldugu icin 5 dalga buff'indan etkilenmez.
- 10 dalga buff'i vurus tipinden bagimsizdir. Bu nedenle Debug Lazer gibi sik tick atan kulelerde cok degerlidir; tick araligi dustukce saniye basina uygulanan max HP hasari da artar.
- 5 dalga impact buff formulu: `bonus = 0.10 + SunucuLevel * 0.02`. Lv1 `+%12`, Lv5 `+%20`, Lv10 `+%30`.
- 10 dalga max HP buff formulu: `oran = 0.005 + ((SunucuLevel - 1) / 9) * 0.01`. Lv1 `%0.5`, Lv5 `%0.94`, Lv10 `%1.5`.
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
| Upgrade maliyeti | Satın alım maliyetine orantılı |
| Menzil | 104 |
| Hasar | 0 |
| Atis araligi | 620 ms |
| Yavaslatma | 850 ms |

**Izolasyon mekanigi:**

- Menzilindeki dusmanlari yavaslatir.
- Kendi karesi ve etrafindaki 1 karelik 3x3 alanda baska kule yoksa izole sayilir.
- Bu alan secili Izolasyon Kulesi uzerinde kare grid overlay olarak gorunur.
- Izole haldeyken atis yapmak yerine aura gibi calisir.
- Izole aura, dusman alanin icindeyken anlik hiz carpani uygular. Dusman alandan ciktigi anda aura slow'u biter.
- Izole aura hiz carpani:

```txt
Hiz carpani = max(0.25, 0.48 - (kule seviyesi - 1) * 0.026)
```

| Level | Aura hiz carpani |
|---:|---:|
| 1 | 0.48x |
| 5 | 0.376x |
| 10 | 0.25x |

### 4. Obsesyon Kulesi

**Rol:** Hasar  
**Sinif:** Hasar  
**Hasar turu:** Psisik  
**Vurus turu:** Carpma

Obsesyon Kulesi ayni hedefe odaklandikca guclenir. Tank dusmanlara oncelik verir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 108 altin |
| Upgrade maliyeti | Satın alım maliyetine orantılı |
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
| Maliyet | 82 altin |
| Upgrade maliyeti | Satın alım maliyetine orantılı |
| Menzil | 134 |
| Hasar | 5 |
| Atis araligi | Lv1 0.20 sn, Lv5 0.16 sn, Lv10 0.12 sn |
| Overdrive tick araligi | Lv1 0.10 sn, Lv5 0.08 sn, Lv10 0.06 sn |
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
  - Tick araligi normal lazer araliginin yarisidir.
  - Tick hasari, DPS onceki dengeye yakin kalacak sekilde level bazli ayarlanir.
  - Lazer cizgisine temas eden dusmanlar hasar alir.

**Hararet:**

- 20 saniyelik pencere icinde 10 saniyeden fazla overdrive'da kalirsa hararet yapar.
- Hararet suresi 5 saniyedir.
- Hararet sirasinda kule calismaz.

### 6. Ucube

**Rol:** Gec oyun hasari  
**Sinif:** Hasar  
**Hasar turu:** Elektrik  
**Vurus turu:** Carpma

Ucube pahali ve zayif baslayan, fakat dalgalar ilerledikce buyuyen yatirim kulesidir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 160 altin |
| Upgrade maliyeti | Satın alım maliyetine orantılı |
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
- Dalga bonuslari Ucube sahadayken tamamlanan dalga sayisina gore acilir: bonus 1/2/3/4/5 icin 2/4/6/8/10 dalga, bonus 6 icin 14 dalga gerekir.

**Dalga sonu gelisimleri:**

| Dalga bonus seviyesi | Gerekli tamamlanan dalga | Etki |
|---:|---:|---|
| 1 | 2 | Elektrik arkadaki 2 hedefe seker. Seken hasar, kule leveline gore ana hasarin %42'sinden %100'une kadar buyur. |
| 2 | 4 | Vuruslar hedefi path uzerinde 18 birim geri iter. |
| 3 | 6 | Hasar %20 artar. |
| 4 | 8 | Max stack 10'dan 15'e cikar. |
| 5 | 10 | Menzil 2 katina cikar, cani 2 katina cikar. |
| 6 | 14 | Hararet yapmaz. |

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
Hasar = 1500
```

**Gorsel davranis:**

- Saldiri drone'u kirmizi/altin renkte gorunur.
- Nexus onarim drone'u cyan/yesil renkte gorunur.
- Drone'lar hedeflerine dogru yavasca hareket eder; anlik hasar veya anlik heal olarak uygulanmaz.

**Tukenmislik:**

- Ulti bittikten sonra Atakan'in tum kuleleri 3 saniyeligine kapanir.
- Bu durum oyun icinde `Tukenmis` status'u olarak gorunur.

## Level ve Upgrade Formulleri

Kule seviyesi maksimum 10'dur.

### Upgrade maliyeti

Upgrade maliyeti ortak formulle hesaplanir:

```txt
hedef seviye = mevcut seviye + 1
maliyet = round(satinAlimMaliyeti * 0.72 * mevcutSeviye * 1.35 * indirim * 0.5)
```

Bu nedenle ayni hedef level icin daha pahali kulelerin upgrade ucreti her zaman daha ucuz kulelerden yuksektir.

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

Ozel kule denge carpimlari:

| Kule | Ek hasar carpani |
|---|---|
| Obsesyon | Level bazli denge egrisi: Lv6 `425 DPS`, Lv7 `600 DPS`, Lv8 `750 DPS`, Lv10 `1000 DPS` hedefler |
| Debug Lazer | DPS'i koruyan level bazli tick hasari: Lv1 `x1.3333`, Lv5 `x2.432`, Lv10 `x2.604` |
| Debug Lazer overdrive | DPS'i koruyan level bazli tick hasari: Lv1 `x1.92`, Lv5 `x2.3347`, Lv10 `x2.4998` |
| Ucube | Level bazli gec acilan egri: Lv1 `x0.45`, Lv3 `x0.34`, Lv6 `x0.42`, Lv8 `x0.25`, Lv10 `x1.05` |
| Ucube dalga 6+ | Lv7 `x1.6`, Lv8 `x1.5`, Lv9 `x1.4`, Lv10 `x1.3` gec oyun carpani |

### Atis hizi artisi

Genel olarak `projectile/mermi` kulelerin atis araligi seviye ile azalir:

```txt
Atis araligi = temelAtisAraligi * (1 - (seviye - 1) * 0.1)
```

`impact/carpma` kulelerde level kaynakli saldiri hizi artisi yoktur. Bu kulelerde atis araligi level 1'de neyse level 10'da da ayni kalir; eski DPS egri korunacak sekilde level gucu vurus hasarina tasinir.

Minimum atis araligi:

- Normal kuleler: 80 ms
- Debug Lazer overdrive: normal lazer araliginin yarisi

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
| 1 | 12.0 | 720 ms | 112 | 16.7 | 10 |
| 2 | 17.0 | 648 ms | 123 | 26.3 | 29 |
| 3 | 22.1 | 576 ms | 134 | 38.3 | 52 |
| 4 | 27.1 | 504 ms | 145 | 53.8 | 82 |
| 5 | 32.2 | 432 ms | 156 | 74.4 | 102 |
| 6 | 37.2 | 360 ms | 167 | 103.3 | 122 |
| 7 | 42.2 | 288 ms | 178 | 146.7 | 143 |
| 8 | 47.3 | 216 ms | 189 | 218.9 | 163 |
| 9 | 52.3 | 144 ms | 200 | 363.3 | 184 |
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
| 1 | 0.0 | 980 ms | Global | 0.0 | 24 |
| 2 | 0.0 | 882 ms | Global | 0.0 | 59 |
| 3 | 0.0 | 784 ms | Global | 0.0 | 93 |
| 4 | 0.0 | 686 ms | Global | 0.0 | 128 |
| 5 | 0.0 | 588 ms | Global | 0.0 | 162 |
| 6 | 0.0 | 490 ms | Global | 0.0 | 197 |
| 7 | 0.0 | 392 ms | Global | 0.0 | 231 |
| 8 | 0.0 | 294 ms | Global | 0.0 | 266 |
| 9 | 0.0 | 196 ms | Global | 0.0 | 300 |
| 10 | 0.0 | 98 ms | Global | 0.0 | - |

Sunucu upgrade maliyeti ozel bir yumusak artis egrisi kullanir:

```txt
Maliyet = round(24 + (MevcutLevel - 1) * ((300 - 24) / 8))
Lv1->2: 24g
Lv9->10: 300g
```

Elektrik topu level etkisi:

```txt
Hasar = Sunucu level tablosundan okunur.
AOE = 24 + SunucuSeviyesi * 5
Cooldown = max(520, 1100 - SunucuSeviyesi * 80) ms
```

| Sunucu Lv | Elektrik hasari | AOE | Link cooldown |
|---:|---:|---:|---:|
| 1 | 160 | 29 | 1020 ms |
| 2 | 240 | 34 | 940 ms |
| 3 | 330 | 39 | 860 ms |
| 4 | 420 | 44 | 780 ms |
| 5 | 500 | 49 | 700 ms |
| 6 | 1000 | 54 | 620 ms |
| 7 | 1500 | 59 | 540 ms |
| 8 | 2000 | 64 | 520 ms |
| 9 | 3000 | 69 | 520 ms |
| 10 | 4000 | 74 | 520 ms |

Uzun baglanti bufflari:

| Bagli kalinan dalga | Bagli kuleye etkisi |
|---:|---|
| 5 | Bagli kule `impact/carpma` vurus tipindeyse hasar Sunucu leveline gore `x1.12` - `x1.30` olur. |
| 10 | Bagli kulenin her hasar uygulamasina Sunucu leveline gore hedef max HP'sinin `%0.5` - `%1.5` kadari eklenir. |

### Izolasyon Kulesi - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | Normal slow | Izole aura slow | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.0 | 620 ms | 104 | 850 ms | 1500 ms | 14 |
| 2 | 0.0 | 558 ms | 115 | 940 ms | 1620 ms | 39 |
| 3 | 0.0 | 496 ms | 126 | 1030 ms | 1740 ms | 72 |
| 4 | 0.0 | 434 ms | 137 | 1120 ms | 1860 ms | 113 |
| 5 | 0.0 | 372 ms | 148 | 1210 ms | 1980 ms | 141 |
| 6 | 0.0 | 310 ms | 159 | 1300 ms | 2100 ms | 169 |
| 7 | 0.0 | 248 ms | 170 | 1390 ms | 2220 ms | 197 |
| 8 | 0.0 | 186 ms | 181 | 1480 ms | 2340 ms | 226 |
| 9 | 0.0 | 124 ms | 192 | 1570 ms | 2460 ms | 254 |
| 10 | 0.0 | 80 ms | 203 | 1660 ms | 2580 ms | - |

### Obsesyon Kulesi - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 18.0 | 760 ms (0.95 sn) | 118 | 18.9 | 26 |
| 2 | 31.3 | 760 ms (0.95 sn) | 129 | 33.0 | 73 |
| 3 | 52.0 | 760 ms (0.95 sn) | 140 | 54.7 | 134 |
| 4 | 87.5 | 760 ms (0.95 sn) | 151 | 92.1 | 210 |
| 5 | 161.6 | 760 ms (0.95 sn) | 162 | 170.1 | 262 |
| 6 | 403.8 | 760 ms (0.95 sn) | 173 | 425.0 | 315 |
| 7 | 570.0 | 760 ms (0.95 sn) | 184 | 600.0 | 367 |
| 8 | 712.5 | 760 ms (0.95 sn) | 195 | 750.0 | 420 |
| 9 | 852.9 | 760 ms (0.95 sn) | 206 | 897.8 | 472 |
| 10 | 949.8 | 760 ms (0.95 sn) | 217 | 999.8 | - |

Obsesyon stackleri bu tablonun uzerine eklenir:

```txt
Efektif hasar = Level hasari * (1 + focusStack * 0.2)
```

Korku etkisi level 3 ve sonrasinda acilir.

### Debug Lazer - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 6.7 | 160 ms (0.20 sn) | 134 | 33.3 | 20 |
| 2 | 11.3 | 152 ms (0.19 sn) | 145 | 59.4 | 56 |
| 3 | 17.4 | 144 ms (0.18 sn) | 156 | 96.6 | 102 |
| 4 | 25.4 | 136 ms (0.17 sn) | 167 | 149.6 | 159 |
| 5 | 32.6 | 128 ms (0.16 sn) | 178 | 203.7 | 199 |
| 6 | 38.9 | 122 ms (0.15 sn) | 189 | 255.8 | 239 |
| 7 | 45.1 | 115 ms (0.14 sn) | 200 | 313.3 | 279 |
| 8 | 51.2 | 109 ms (0.14 sn) | 211 | 376.3 | 319 |
| 9 | 56.9 | 102 ms (0.13 sn) | 222 | 444.7 | 359 |
| 10 | 62.2 | 96 ms (0.12 sn) | 233 | 518.6 | - |

Overdrive sirasinda:

- Tick araligi normal lazer araliginin yarisidir.
- Tick hasari, DPS onceki dengeye yakin kalacak sekilde level bazli ayarlanir.
- Menzil harita sonuna kadar uzar.

Overdrive efektif DPS:

| Lv | Overdrive tick hasari | Overdrive araligi | Overdrive DPS |
|---:|---:|---:|---:|
| 1 | 9.6 | 0.10 sn | 96.0 |
| 2 | 14.6 | 0.10 sn | 154.0 |
| 3 | 20.0 | 0.09 sn | 222.6 |
| 4 | 25.6 | 0.09 sn | 301.6 |
| 5 | 31.3 | 0.08 sn | 391.1 |
| 6 | 37.3 | 0.08 sn | 491.0 |
| 7 | 43.3 | 0.07 sn | 601.5 |
| 8 | 49.1 | 0.07 sn | 722.4 |
| 9 | 54.6 | 0.06 sn | 853.9 |
| 10 | 59.7 | 0.06 sn | 995.8 |

### Ucube - Level Statlari

| Lv | Hasar | Atis araligi | Menzil | DPS | Sonraki upgrade |
|---:|---:|---:|---:|---:|---:|
| 1 | 4.0 | 940 ms (1.18 sn) | 118 | 3.4 | 39 |
| 2 | 5.7 | 940 ms (1.18 sn) | 129 | 4.8 | 109 |
| 3 | 7.0 | 940 ms (1.18 sn) | 140 | 6.0 | 198 |
| 4 | 9.9 | 940 ms (1.18 sn) | 151 | 8.4 | 311 |
| 5 | 14.1 | 940 ms (1.18 sn) | 162 | 12.0 | 389 |
| 6 | 23.4 | 940 ms (1.18 sn) | 173 | 19.9 | 467 |
| 7 | 19.0 | 940 ms (1.18 sn) | 184 | 16.2 | 544 |
| 8 | 29.6 | 940 ms (1.18 sn) | 195 | 25.1 | 622 |
| 9 | 125.6 | 940 ms (1.18 sn) | 206 | 106.9 | 700 |
| 10 | 451.7 | 940 ms (1.18 sn) | 217 | 384.4 | - |

Bu tablo Ucube'nin baz DPS'ini gosterir. Ucube'nin asil gec oyun gucu, dalga bonuslari, 15 aktif stack ve 2 chain dahil edildiginde ortaya cikar. Bu nedenle Lv10 baz tabloda `384.4 DPS` gorunurken, tam gec oyun kosulunda toplam DPS `2114.0` seviyesine cikar.

Ucube aktif stackleri bu tablodaki atis araligini ayrica dusurur:

```txt
Stack carpani = max(0.35, 1 - stack * 0.055)
Efektif atis araligi = level atis araligi * stack carpani
```

Dalga bonuslari Ucube sahadayken tamamlanan dalga sayisina gore acilir:

- Bonus 1, 2 tamamlanan dalgada: Elektrik arkadaki 2 hedefe seker. Chain hasar carpani level ile artar: Lv1-3 `%42`, Lv4 `%46`, Lv5 `%48`, Lv6 `%50`, Lv7 `%72`, Lv8 `%85`, Lv9 `%93`, Lv10 `%100`.
- Bonus 2, 4 tamamlanan dalgada: Hedefi 18 path birimi geri iter.
- Bonus 3, 6 tamamlanan dalgada: Hasar %20 artar.
- Bonus 4, 8 tamamlanan dalgada: Max stack 15 olur.
- Bonus 5, 10 tamamlanan dalgada: Menzil 2 katina cikar.
- Bonus 6, 14 tamamlanan dalgada: Hararet yapmaz.

## Guncel Denge Hedefleri

Asagidaki degerler oyun hizinin `%20` yavaslatilmis hali dahil edilerek, gercek saniye DPS olarak hesaplanir.

| Lv | Obsesyon DPS | Debug Lazer DPS | Debug Lazer overdrive DPS | Ucube ana DPS (`14 dalga`, `15 stack`) | Ucube toplam DPS (`14 dalga`, `15 stack`, `2 chain`) |
|---:|---:|---:|---:|---:|---:|
| 1 | 18.9 | 33.3 | 96.0 | 11.8 | 21.7 |
| 2 | 33.0 | 59.4 | 154.0 | 16.6 | 30.5 |
| 3 | 54.7 | 96.6 | 222.6 | 20.5 | 37.8 |
| 4 | 92.1 | 149.6 | 301.6 | 28.8 | 55.3 |
| 5 | 170.1 | 203.7 | 391.1 | 41.1 | 80.5 |
| 6 | 425.0 | 255.8 | 491.0 | 68.4 | 136.8 |
| 7 | 600.0 | 313.3 | 601.5 | 88.7 | 216.5 |
| 8 | 750.0 | 376.3 | 722.4 | 129.3 | 349.2 |
| 9 | 897.8 | 444.7 | 853.9 | 421.9 | 1206.7 |
| 10 | 999.8 | 518.6 | 995.8 | 704.7 | 2114.0 |

Bu tabloya gore:

- Debug Lazer early oyunda onde kalir; Lv3'te yaklasik `97 DPS`.
- Obsesyon midgame'de daha sert sivrilir; Lv6'da yaklasik `425 DPS`, Lv7'de `600 DPS`, Lv8'de `750 DPS`, Lv10'da yaklasik `1000 DPS`.
- Ucube Lv8 dahil hem Obsesyonun hem de Debug Lazerin belirgin altinda kalir, Lv9'da acilir, Lv10 + 14 dalga + 15 stack + 2 chain durumunda `2000 DPS` ustune cikar.

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
- Etki: Atakan kuleleri 3 saniyeligine kapanir.

## Tasarim Notu

Atakan, dogru kurulumla guclenen bir karakter olarak tasarlanmistir. Onun gucu tek bir kulede degil; Takipci isareti, Sunucu linkleri, izole kule pasifi, Debug Lazer overdrive ve Ucube gec oyun yatiriminin birlikte calismasindadir.

Oyuncu icin ana karar sorulari:

- Hangi dusmanlar Takipte tutulacak?
- Hangi kuleler Sunucu'ya baglanacak?
- Izolasyon Kulesi gercekten yalniz kalabilecek mi?
- Ucube'ye erken yatirim yapmaya deger mi?
- Sessiz Mod ne zaman kullanilirsa kaybedilen 5 saniyeyi telafi eder?
- Tam Otomasyon savunma tamiri icin mi, kamikaze hasar icin mi saklanmali?
