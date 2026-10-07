# Atakan

## Kisa Ozet

Atakan, adaptif savunma, kule sinerjisi ve kontrollu kaos uzerine kurulu moduler bir strateji karakteridir.

Ham gucu en yuksek karakter degildir. Asil gucu, kulelerini dogru konumlandirmaktan, yalniz calisan kulelerden verim almaktan, isaretleme ve baglanti mekanikleriyle takim hasarini buyutmekten gelir.

Atakan oyuncusu oyunu "tek tek kule koyup beklemek" yerine, kuleler arasindaki iliskiyi ve dalga temposunu yoneterek oynar.

## Karakter Kimligi

| Alan | Deger |
|---|---:|
| Karakter ID | `warrior` |
| Ad | Atakan |
| Rol | Moduler Stratejist |
| Tema | Adaptif savunma, kule sinerjisi, kontrollu kaos |

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
- Yalniz sayilmasi icin cevresindeki sekiz karenin bos olmasi gerekir. Olcum
  mesafe degil kare komsulugudur, bu yuzden harita olcegiyle birlikte buyur.
- Komsu sayimi kule sahibine bakmaz ve Sunucu'yu da komsu sayar; Sunucu yalnizca
  bonusu kendisi almaz.
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
| Ucan hedef | Vurabilir |

**Takipte mekanigi:**

- Takipci vurdugu hedefe `Takipte` uygular.
- Isaret suresi 6.5 saniyedir.
- Takipte olan dusmanlar, Takipci haricindeki kaynaklardan `x1.2` hasar alir.
- Takipci kendi isaretinden bonus hasar almaz.
- Debug Lazer, normal hedef seciminde Takipte dusmanlara oncelik verir.
- Atakan ultisindeki drone'lar, oyuncunun sectigi moda gore dusmana kamikaze saldirisi yapar veya nexusu tamir eder.

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
AOE = (24 + SunucuSeviyesi * 5) / 4
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
| 10 dalga | Bagli kulenin her vurusuna Sunucu leveline gore hedefin maksimum caninin `%0.1` - `%0.5` kadari ek hasar olarak eklenir. |

Notlar:

- 5 dalga buff'i sadece `impact` vurus tipini etkiler.
- Debug Lazer `focus` vurus tipinde oldugu icin 5 dalga buff'indan etkilenmez.
- 10 dalga buff'i vurus tipinden bagimsizdir. Bu nedenle Debug Lazer gibi sik tick atan kulelerde cok degerlidir; tick araligi dustukce saniye basina uygulanan max HP hasari da artar.
- 5 dalga impact buff formulu: `bonus = 0.10 + SunucuLevel * 0.02`. Lv1 `+%12`, Lv5 `+%20`, Lv10 `+%30`.
- 10 dalga max HP buff formulu: `oran = 0.001 + ((SunucuLevel - 1) / 9) * 0.004`. Lv1 `%0.1`, Lv5 `%0.28`, Lv10 `%0.5`.
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
- Vurus yavaslatmasi ve izole aura ayni seviye egrisini kullanir (`ISOLATION_SLOW_CURVE`, `packages/shared/src/tower-rules.ts`):

```txt
Yavaslatma(L) = 0.10 + (clamp(L, 1, 10) - 1) * 0.40 / 9
Hiz carpani   = 1 - Yavaslatma(L)
```

| Level | Yavaslatma | Hiz carpani |
|---:|---:|---:|
| 1 | %10.0 | 0.900x |
| 2 | %14.4 | 0.856x |
| 3 | %18.9 | 0.811x |
| 4 | %23.3 | 0.767x |
| 5 | %27.8 | 0.722x |
| 6 | %32.2 | 0.678x |
| 7 | %36.7 | 0.633x |
| 8 | %41.1 | 0.589x |
| 9 | %45.6 | 0.544x |
| 10 | %50.0 | 0.500x |

- Buz Kirigi: vurus yavaslatmasi kritik gelirse yavaslatma kesri 1.5 kat olur (%40 -> %60), en fazla %90. Aura kritik gelmez (220 ms'lik tikte zar atmak yavaslatmayi titretirdi); kart Izolasyon'a vurus yavaslatmasindan isler.
- Diger kulelerin vurus yavaslatmasi duz %52'dir (hiz 0.48x); Buz Kirigi kritigiyle %78.
- Derin Dondurma %60 ya da daha fazla yavaslayan (hizi 0.4x'e ya da altina inen) dusmani dondurur. Izolasyon (en fazla %50) ve duz vurus yavaslatmasi (%52) buna yalnizca Buz Kirigi kritigiyle ulasir: 8. seviyeden itibaren Izolasyon'un kritik yavaslatmasi (%61.7 ve ustu) dondurur, 7. seviyede kritikle %55, dondurmaz. Tavandaki Sogutma Kanali (%60) ve Zeynep'in en guclu yavaslatma komutu (zincirli buyuk komut, otorite ~8 ve ustunde tam 0.4x) kritiksiz de dondurur.

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
| Ucan hedef | Vurabilir |

**Odak mekanigi:**

- Ayni hedefe vurdukca `focusStacks` artar.
- Her stack hasari `%20` artirir.
- Hedef degisirse stack sifirlanir.
- Tank dusmanlara oncelik verir.

**Korku mekanigi:**

- Korku etkisi kule seviye 3 ve sonrasinda acilir.
- Ayni hedefe 3. vurustan sonra hedefe `Korku` uygulanir.
- Lv3-6 arasinda korku suresi 1.5 saniyedir.
- Lv7-9 arasinda korku suresi 3 saniyeye cikar.
- Lv10'da korku suresi 4 saniye olur.
- Korkan dusman sure boyunca yol uzerinde geri kacar.
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
| Overdrive tick araligi | Normal atis araligiyla ayni (Lv1 0.20 sn, Lv5 0.16 sn, Lv10 0.12 sn) |
| Mermi hizi | 620 |
| AOE radius | 10 |

**Normal mod:**

- Takipte dusmanlara oncelik verir.
- Odak lazeri hedefe dogrudan hasar verir.

**Overdrive:**

- Overdrive 5. seviyede acilir; altinda isaretli oldurme siradan bir oldurmedir.
- Debug Lazer (Lv5+), Takipte bir hedefi oldururse overdrive tetiklenir.
- Overdrive suresi 2 saniyedir (oyun hizi dahil gercek 2.5 sn).
- Zincir isini: kuleye en yakin dusmandan baslayip her dusmandan bir sonraki en yakina giden bir rota izler; surenin %75'inde geri doner ve ayni rotayi geri izler.
- Zincir isininin donus hizi 30 derece/saniye ile sinirlidir.
- Lv10: zincir isinina ek olarak iki ters donen isin. Ikisi de zincirin dogdugu acidan cikar; biri saat yonunde, digeri tersine, sabit hizla (tam tur / overdrive suresi, ~144 derece/sn) ve hedeflerden bagimsiz doner. Yarida baslangicin karsisinda kesisir, sonda baslangicta bulusur. Overdrive bitince son dilim (baslangic acisi) bir kapanis vurusuyla kapatilir.
- Overdrive sirasinda:
  - Menzil harita sonuna kadar uzar.
  - Tick araligi normal lazer araligiyla aynidir (atis hizi carpanlari dahil).
  - Tick hasari normal vurustan yuksektir: Lv1 x1.44, Lv5 x1.30, Lv10 x1.20 (bkz. carpim tablosu).
  - Son vurustan bu yana isinlarin taradigi yaydaki dusmanlar hasar alir; birden fazla isinin altindaki dusman atis basina bir kez vurulur.
  - Kaynak ve isi kule basina: atis basina bir tuketim, isin basina degil.
  - Hava hedeflerini overdrive'da da vuramaz.

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
| Maliyet | 240 altin |
| Upgrade maliyeti | Satın alım maliyetine orantılı |
| Menzil | 118 |
| Hasar | 9 |
| Atis araligi | 940 ms |
| Mermi hizi | 370 |
| Ucan hedef | Vurabilir |

**Calisma ritmi:**

- Aktif olarak hedef vurabildigi her saniye saldiri hizi stack kazanir.
- Hedef bulamazsa aktif sure ve stackler sifirlanir.
- Stack basina atis araligi azalir.
- Stack etkisi:

```txt
Atis araligi carpani = 1 - stack * 0.04539
```

- Normal max stack 10'dur.
- Dalga gelisimiyle max stack 15'e cikabilir.
- 15 stackte atis araligi 300 ms olur.
- 20 saniye araliksiz calisirsa hararet yapar.
- Hararet suresi 10 saniyedir.
- Dalga gelisimiyle hararet tamamen kalkabilir.
- Dalga bonuslari Ucube sahadayken tamamlanan dalga sayisina gore acilir: bonus 1/2/3/4/5 icin 2/4/6/8/10 dalga, bonus 6 icin 14 dalga, bonus 7 icin 16 dalga gerekir.

**Dalga sonu gelisimleri:**

| Dalga bonus seviyesi | Gerekli tamamlanan dalga | Etki |
|---:|---:|---|
| 1 | 2 | Elektrik arkadaki 2 hedefe seker. Seken hasar, kule leveline gore ana hasarin %42'sinden %100'une kadar buyur. |
| 2 | 4 | Vuruslar hedefi path uzerinde 18 birim geri iter. |
| 3 | 6 | Hasar %20 artar. |
| 4 | 8 | Max stack 10'dan 15'e cikar. |
| 5 | 10 | Menzil 2 katina cikar, cani 2 katina cikar. |
| 6 | 14 | Hararet yapmaz. |
| 7 | 16 | Hasar %100 artar. |

## Beceriler

Atakan'in 3 aktif becerisi vardir.

### 1. Yonlendirme

**Cooldown:** 16 saniye  
**Sure:** 1 saniye

Oyuncu haritada basili tutup surukleyerek bir alan secer. Bu sure boyunca mermi ve carpma vuruslu kuleler menzil sinirina takilmadan o alandaki dusmanlara saldirabilir; alandaki dusmanlar ayni sure boyunca %30 fazla hasar alir.

**Mevcut uygulama:**

- Alan koordinati oyuncunun basili tutup surukledigi hedef noktadan gelir.
- Etki suresi 1000 ms.
- Etki yari capi yaklasik 78 birimdir.
- `projectile` ve `impact` vurus tipli kuleleri etkiler.
- Alandaki dusmanlar tum hasar kaynaklarindan `x1.3` hasar alir.
- Kulelerin menzil disi hedeflere de uptime kazanmasini saglar.

### 2. Refactor

**Cooldown:** 24 saniye

Secili kuleyi cezasiz sekilde baska bir uygun kareye tasir.

**Mevcut uygulama:**

- Oyuncu once kendi kulesini secer.
- Sonra yeni konuma dokunur.
- Yeni konum uygunsa kule oraya tasinir.
- Kule cooldown'u en fazla 150 ms olacak sekilde dengelenir.
- Sunucu link hafizasi gibi menzil gecmisleri sifirlanir.

### 3. Execute

**Cooldown:** 32 saniye (oyun suresi; diger beceriler gibi `gameDeltaTime` ile akar ve bekleme kartlariyla kisalir)

Secilen tek bir dusmani aninda infaz eder. Ezicilere (brute) ve sampiyonlara etkisizdir.

**Mevcut uygulama:**

- Oyuncu beceriye basar ("Bir düşmana dokun"), sonra haritada bir dusmana dokunur. Bos zemine dokunmak ya da beceriye tekrar basmak hedeflemeyi iptal eder.
- Istemci dokunulan dusmanin kimligini `useSkill { slot: 2, enemyId }` ile yollar. Konum degil kimlik: istemci dunyayi sunucunun yarim saniye gerisinden ciziyor.
- Hedef Ezici (brute) ya da sampiyonsa istek gitmez ve "Etkisiz" yazar; sunucu da ayni kurali (`isExecuteImmune`) yeniden sorar ve `skill:rejected { reason: "immune" }` yollar.
- Hedef yoksa, olmusse, hukmedilmisse (Zorba), olumsuzsa ya da cevrilmisse `skill:rejected { reason: "invalid" }` gelir ("Hedef geçersiz").
- Iki red durumunda da bekleme suresi harcanmaz.
- Kusatma, piyade, kosucu, nisanci ve ucan dusmanlar infaz edilebilir.
- Oldurme normal yoldan gecer (`damageEnemy` -> `finishEnemyKill`, kaynak `warrior-skill-execute`): normal altin ve XP, seri, asist, kosu defteri. Oldurme atana yazilir.
- Hasar yapay oldugu icin tasan hasar primi odenmez (`SYNTHETIC_KILL_SOURCES`).
- Basarili infaz herkese `skill:execute` olarak gider: hedefin uzerinde nisangah kilidi ve sert beyaz flas (~320 ms), kuru bir kilit tiki ve agir bir darbe sesi (kayitli CC0 ornek, Kenney Impact Sounds; `execute` ailesi). Takim arkadasi gorseli soluk gorur, sesi duymaz.

## Ulti: Tam Otomasyon

Atakan'in ultisi, kulelerinden mini-drone cikarma fikrine dayanir.

**Kullanim sarti:** Ulti charge 100 olmalidir.  
**Kullanimdan sonra:** Ulti charge hemen 0'a iner.
**Dolum hizi:** Atakan ultisi normal ulti dolum hizinin ucte biriyle dolar; kill'den gelen ulti puani da ucte bire iner.

Her Atakan kulesi ulti basildiginda bir mini-drone uretir. Drone'lar gercek oyun nesnesi olarak haritada hareket eder.

Kullanici ultiye bastiginda modu kendisi secer:

1. `Saldiri`: Drone'lar dusmana gider.
2. `Tamir`: Drone'lar nexusa gider.

**Onarim davranisi:**

- Drone nexus'a ulasinca takim canini 3 artirir.
- Her drone ayri ayri 3 can yeniler.
- Takim cani maksimum can degerini asamaz.

**Saldiri davranisi:**

- Drone, kendisine en yakin mevcut dusmani hedefler.
- Kule ulti aninda yakin hedef bulamazsa o kuleden saldiri drone'u cikmaz; buna ragmen ulti enerjisi harcanmis olur.
- Hedefe dogru ilerler ve temas ettiginde kamikaze saldirisi yapar.
- Drone hasari:

```txt
Hasar = mevcut dalga ^ 3
```

**Gorsel davranis:**

- Saldiri drone'u kirmizi/altin renkte gorunur.
- Nexus onarim drone'u cyan/yesil renkte gorunur.
- Drone'lar hedeflerine dogru yavasca hareket eder; anlik hasar veya anlik heal olarak uygulanmaz.

**Tukenmislik:**

- Drone'lar cikarildiktan hemen sonra Atakan'in tum kuleleri 3 saniyeligine kapanir.
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
| Debug Lazer | Level bazli tick hasari (`1.3333 * (1 + 0.74 * levelOrani)`): Lv1 `x1.3333`, Lv5 `x1.772`, Lv10 `x2.320` |
| Debug Lazer overdrive | Level bazli tick hasari (`1.92 * (1 + 0.45 * levelOrani)`): Lv1 `x1.92`, Lv5 `x2.304`, Lv10 `x2.784` |
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
- Takipci ozel egri kullanir; Lv10'da 333 ms olur.
- Debug Lazer overdrive: normal lazer araligiyla ayni

### Menzil artisi

Sunucu haricindeki kulelerde seviye basina menzil artar:

```txt
Menzil = temelMenzil + (seviye - 1) * 11
```

Atakan pasifi aktifse menzil de `x1.12` pasif carpaniyla etkilenir.

## Kule Level Stat Tablolari

Bu tablolardaki degerler pasif, Takipte bonusu, Obsesyon stacki, Ucube aktif stacki gibi gecici carpimlar olmadan hesaplanan baz degerlerdir.

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
| 2 | 17.0 | 677 ms | 123 | 25.2 | 29 |
| 3 | 22.1 | 634 ms | 134 | 34.8 | 52 |
| 4 | 27.1 | 591 ms | 145 | 45.9 | 82 |
| 5 | 32.2 | 548 ms | 156 | 58.7 | 102 |
| 6 | 37.2 | 505 ms | 167 | 73.7 | 122 |
| 7 | 42.2 | 462 ms | 178 | 91.4 | 143 |
| 8 | 47.3 | 419 ms | 189 | 112.8 | 163 |
| 9 | 52.3 | 376 ms | 200 | 139.1 | 184 |
| 10 | 57.4 | 333 ms | 211 | 172.3 | - |

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
| 1 | 0.0 | 980 ms | Global | 0.0 | 20 |
| 2 | 0.0 | 882 ms | Global | 0.0 | 43 |
| 3 | 0.0 | 784 ms | Global | 0.0 | 65 |
| 4 | 0.0 | 686 ms | Global | 0.0 | 88 |
| 5 | 0.0 | 588 ms | Global | 0.0 | 110 |
| 6 | 0.0 | 490 ms | Global | 0.0 | 133 |
| 7 | 0.0 | 392 ms | Global | 0.0 | 155 |
| 8 | 0.0 | 294 ms | Global | 0.0 | 178 |
| 9 | 0.0 | 196 ms | Global | 0.0 | 200 |
| 10 | 0.0 | 98 ms | Global | 0.0 | - |

Sunucu upgrade maliyeti ozel bir yumusak artis egrisi kullanir:

```txt
Maliyet = round(20 + (MevcutLevel - 1) * ((200 - 20) / 8))
Lv1->2: 20g
Lv9->10: 200g
```

Elektrik topu level etkisi:

```txt
Hasar = Sunucu level tablosundan okunur.
AOE = (24 + SunucuSeviyesi * 5) / 4
Cooldown = max(520, 1100 - SunucuSeviyesi * 80) ms
```

| Sunucu Lv | Elektrik hasari | AOE | Link cooldown |
|---:|---:|---:|---:|
| 1 | 160 | 7.3 | 1020 ms |
| 2 | 240 | 8.5 | 940 ms |
| 3 | 330 | 9.8 | 860 ms |
| 4 | 420 | 11.0 | 780 ms |
| 5 | 500 | 12.3 | 700 ms |
| 6 | 1000 | 13.5 | 620 ms |
| 7 | 1500 | 14.8 | 540 ms |
| 8 | 2000 | 16.0 | 520 ms |
| 9 | 3000 | 17.3 | 520 ms |
| 10 | 4000 | 18.5 | 520 ms |

Uzun baglanti bufflari:

| Bagli kalinan dalga | Bagli kuleye etkisi |
|---:|---|
| 5 | Bagli kule `impact/carpma` vurus tipindeyse hasar Sunucu leveline gore `x1.12` - `x1.30` olur. |
| 10 | Bagli kulenin her hasar uygulamasina Sunucu leveline gore hedef max HP'sinin `%0.1` - `%0.5` kadari eklenir. |

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
| 4 | 25.4 | 136 ms (0.17 sn) | 167 | 149.6 | 300 |
| 5 | 32.6 | 128 ms (0.16 sn) | 178 | 203.7 | 350 |
| 6 | 38.9 | 122 ms (0.15 sn) | 189 | 255.8 | 400 |
| 7 | 45.1 | 115 ms (0.14 sn) | 200 | 313.3 | 450 |
| 8 | 51.2 | 109 ms (0.14 sn) | 211 | 376.3 | 500 |
| 9 | 56.9 | 102 ms (0.13 sn) | 222 | 444.7 | 900 |
| 10 | 62.2 | 96 ms (0.12 sn) | 233 | 518.6 | - |

Debug Lazer'in Lv5 ve Lv10 esiklerinde aldigi atis araligi gucu nedeniyle Lv5 sonrasi upgrade maliyeti ozel tablodan gelir. Lv2-Lv4 maliyetleri genel kule formuluyle ayni kalir.

Overdrive sirasinda (yalnizca Lv5+):

- Tick araligi normal lazer araligiyla aynidir; araligin yarilanmasi yoktur.
- Tick hasari normal vurusun `getDebugLaserDamageMultiplier(level, true) / getDebugLaserDamageMultiplier(level, false)` kati: Lv1 x1.44, Lv5 x1.30, Lv10 x1.20.
- Menzil harita sonuna kadar uzar.

Kirisin altinda tutulan tek hedefe overdrive DPS'i bu yuzden normal DPS'in ayni katidir (Lv5 ~x1.30, Lv9 ~x1.22, Lv10 ~x1.20). Lv10'un iki ters donen isini zincir isinina eklenir: tek hedefte Lv9'dan asagi dusmez, kalabalikta cevredeki herkesi her overdrive'da en az iki kez tarar.

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

Bu tablo Ucube'nin baz DPS'ini gosterir. Ucube'nin asil gec oyun gucu, 16 tamamlanan dalga bonuslari, 15 aktif stack ve 2 chain dahil edildiginde ortaya cikar. Bu nedenle Lv10 baz tabloda `384.4 DPS` gorunurken, tam gec oyun kosulunda toplam DPS `2114.0` seviyesine cikar.

Ucube aktif stackleri bu tablodaki atis araligini ayrica dusurur:

```txt
Stack carpani = 1 - stack * 0.04539
Efektif atis araligi = level atis araligi * stack carpani
```

Lv10 Ucube icin 15 stackte efektif atis araligi 300 ms olur.

Dalga bonuslari Ucube sahadayken tamamlanan dalga sayisina gore acilir:

- Bonus 1, 2 tamamlanan dalgada: Elektrik arkadaki 2 hedefe seker. Chain hasar carpani level ile artar: Lv1-3 `%42`, Lv4 `%46`, Lv5 `%48`, Lv6 `%50`, Lv7 `%72`, Lv8 `%85`, Lv9 `%93`, Lv10 `%100`.
- Bonus 2, 4 tamamlanan dalgada: Hedefi 18 path birimi geri iter.
- Bonus 3, 6 tamamlanan dalgada: Hasar %20 artar.
- Bonus 4, 8 tamamlanan dalgada: Max stack 15 olur.
- Bonus 5, 10 tamamlanan dalgada: Menzil 2 katina cikar.
- Bonus 6, 14 tamamlanan dalgada: Hararet yapmaz.
- Bonus 7, 16 tamamlanan dalgada: Hasar %100 artar.

## Guncel Denge Hedefleri

Asagidaki degerler oyun hizinin `%20` yavaslatilmis hali dahil edilerek, gercek saniye DPS olarak hesaplanir.

| Lv | Obsesyon DPS | Debug Lazer DPS | Debug Lazer overdrive DPS (tek hedef, Lv5+) | Ucube ana DPS (`16 dalga`, `15 stack`) | Ucube toplam DPS (`16 dalga`, `15 stack`, `2 chain`) |
|---:|---:|---:|---:|---:|---:|
| 1 | 18.9 | 33.3 | - | 11.8 | 21.7 |
| 2 | 33.0 | 59.4 | - | 16.6 | 30.5 |
| 3 | 54.7 | 96.6 | - | 20.5 | 37.8 |
| 4 | 92.1 | 149.6 | - | 28.8 | 55.3 |
| 5 | 170.1 | 203.7 | 264.9 | 41.1 | 80.5 |
| 6 | 425.0 | 255.8 | 326.3 | 68.4 | 136.8 |
| 7 | 600.0 | 313.3 | 392.8 | 88.7 | 216.5 |
| 8 | 750.0 | 376.3 | 464.3 | 129.3 | 349.2 |
| 9 | 897.8 | 444.7 | 540.8 | 421.9 | 1206.7 |
| 10 | 999.8 | 518.6 | 622.3 | 704.7 | 2114.0 |

Bu tabloya gore:

- Debug Lazer early oyunda onde kalir; Lv3'te yaklasik `97 DPS`.
- Obsesyon midgame'de daha sert sivrilir; Lv6'da yaklasik `425 DPS`, Lv7'de `600 DPS`, Lv8'de `750 DPS`, Lv10'da yaklasik `1000 DPS`.
- Ucube Lv8 dahil hem Obsesyonun hem de Debug Lazerin belirgin altinda kalir, Lv9'da acilir, Lv10 + 16 dalga + 15 stack + 2 chain durumunda `2000 DPS` ustune cikar.

## Durum Etkileri ve Etiketler

### Kill Streak Bufflari

Kill streak anonslari sadece ses/gorsel degildir; streak'i yapan oyuncunun mevcut tum turretlerine 3 saniyelik buff verir.

| Streak | Esik | Turret buff'i |
|---|---|---|
| Granted | 2 saniyede 5 kill | Tum turretlerde +%10 hasar |
| Unstoppable | 5 saniyede 10 kill | Tum turretlerde +%20 hasar |
| Rampage | 8 saniyede 16 kill | Tum turretlerde +%20 hasar ve odaklanma haric +%20 saldiri hizi |
| Legendary | 11 saniyede 22 kill | Tum turretlerde +%20 hasar, odaklanma haric +%20 saldiri hizi, tum dusmanlara 2 saniye Korku |

Her streak tetiklendikten sonra ayni dalgada 60 saniye tekrar tetiklenemez. Dalga degisirse bu kilit acilir. Daha yuksek bir streak tetiklenirse alttaki streakler de ayni dalgada kilitlenir.

### Takipte

- Kaynak: Takipci.
- Sure: 6.5 saniye.
- Etki: Stack basina Takipci haricindeki hasar kaynaklarindan %20 daha fazla hasar.
- Stack limitleri: Lv1-4 en fazla 1, Lv5-9 en fazla 2, Lv10 en fazla 3.
- Debug Lazer hedef seciminde Takipte dusmanlari onceliklendirir.
- Atakan saldiri drone'lari Takipte onceligi kullanmaz; kendilerine en yakin dusmana saldirir.

### Korku

- Kaynak: Obsesyon Kulesi, seviye 3+.
- Kosul: Ayni hedefe 3. vurus.
- Sure: Lv3-6 `1.5 saniye`, Lv7-9 `3 saniye`, Lv10 `4 saniye`.
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
- Execute hangi dusmana harcanmali: kacan bir kosucuya mi, nexusa dayanan bir kusatmaya mi?
- Tam Otomasyon savunma tamiri icin mi, kamikaze hasar icin mi saklanmali?
