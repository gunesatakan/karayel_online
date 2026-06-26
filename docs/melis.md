# Melis

## Kisa Ozet

Melis, onay ihtiyaci ve stres baskisi arasinda gidip gelen gotik bir kontrol/tempo karakteridir.

Melis'in gucu yalnizca kule DPS'inden gelmez. Asil oyun plani, kill streaklerle onay toplamak, onayi favori kulelere verim olarak yansitmak, stres biriktirip kule evrimlerine harcamak ve stres/onay spektrumunu dogru anda dogru tarafa itmektir.

Melis oyuncusu iyi oynadiginda haritayi psikolojik bir baski alanina cevirir. Kotu oynadiginda ise stres tarafina fazla kayip kulelerinin davranislarini daha riskli ve dengesiz hale getirir.

## Karakter Kimligi

| Alan | Deger |
|---|---:|
| Karakter ID | `archer` |
| Ad | Melis |
| Rol | Gotik Zihin |
| Tema | Ani ofke, onay ihtiyaci, kararsizlik, gotik zihin |
| Baslangic onay | 6 |
| Baslangic stres | 6 |

## Oynanis Felsefesi

Melis'in oyun tarzi uc ana fikir uzerine kurulu:

1. **Onay/stres spektrumu**
   Onay ve stres iki ayri bar gibi degil, ayni psikolojik spektrumun iki ucu gibi calisir. Hangi taraf baskinsa Melis'in bazi kuleleri farkli davranir.

2. **Streak ile buyume**
   Melis kill streak yaptikca onay toplar. Onay, favori kulelerini guclendirir ve daha stabil bir oyun kurmasini saglar.

3. **Stres ile evrim**
   Stres, kuleleri evriltmek icin harcanir. Evrim kuleleri kalici olarak guclendirir, fakat stres baskinligi bazi kulelerde riskli yan etkiler yaratir.

## Spektrum: Onay ve Stres

Melis oyuna `6 onay` ve `6 stres` ile baslar. Bu sayede ilk kazanilan puan spektrumu hemen tek tarafa tamamen devirmemelidir.

UI tarafinda spektrum, beceri panelinin ustunde turkuazdan kirmiziya giden HTML/CSS tabanli bir bar olarak gosterilir. Uzerinde yalnizca onay sayisi, stres sayisi ve oran bulunur.

**Baskinlik kurallari:**

- Onay > Stres ise Melis `onay baskin` sayilir.
- Stres > Onay ise Melis `stres baskin` sayilir.
- Degerler esit veya yakin oldugunda Melis dengededir.

## Pasif: Supersin

**Aciklama:**  
Melis streak yaptikca onay puani toplar. Ilk 3 favori kulesi onay seviyesine gore guclenir. Dalga boyunca onay alamazsa veya gecen dalgaya gore daha az onay alirsa stres kazanir.

### Onay Kazanimi

Kill streak seviyesi Melis'e onay verir:

| Streak | Kosul | Onay |
|---|---:|---:|
| Granted | 2 saniyede 5 kill | +1 |
| Unstoppable | 5 saniyede 10 kill | +2 |
| Rampage | 8 saniyede 16 kill | +3 |
| Legendary | 11 saniyede 22 kill | +4 |

Her streak tetiklendikten sonra ayni dalgada 1 dakika boyunca tekrar tetiklenemez. Dalga degisirse kilit erken acilabilir.

### Stres Kazanimi

Her dalga sonunda Melis'in o dalgada topladigi onay kontrol edilir:

| Durum | Stres |
|---|---:|
| Dalga boyunca hic onay alinmazsa | +4 |
| Bu dalgada alinan onay, onceki dalgadan azsa | +2 |
| Iki dalga ust uste ayni miktarda onay alinirse | +1 |

### Favori Kuleler

Melis'in kurdugu ilk 3 kulesi favori kule olur. Favori kuleler onay miktarina gore guclenir.

| Etki | Formul |
|---|---:|
| Hasar carpani | `1 + min(onay, 40) x 0.04` |
| Atis araligi carpani | `max(0.48, 1 - min(onay, 40) x 0.018)` |

Yani onay arttikca favori kulelerin hasari artar ve atis araligi kisalir. Bonuslar 40 onaydan sonra daha fazla buyumez.

## Evrim Sistemi

Melis, `Olumcul Stres` becerisiyle stres/onay oranini kullanarak kendi kulesini sirayla evriltir.

| Ozellik | Deger |
|---|---:|
| Evrim 1 kosulu | Stres/Onay >= 3/2 |
| Evrim 2 kosulu | Stres/Onay >= 2/1 |
| Evrim 3 kosulu | Stres/Onay >= 3/1 |
| Basarili evrim sonrasi | Stres puani onay puanina esitlenir |
| Maksimum evrim | 3 |

Her evrim seviyesi Melis kulesine kalici bonus verir:

| Bonus | Formul |
|---|---:|
| Hasar | `1 + evrim x 0.28` |
| Atis araligi | `max(0.68, 1 - evrim x 0.1)` |
| Menzil | `1 + evrim x 0.1` |

Evrimler sirayla acilir; evrim 1 yapilmadan evrim 2, evrim 2 yapilmadan evrim 3 yapilamaz. Evrim, Melis'in stres tarafini sadece ceza degil, planli bir yatirim kaynagi yapar; fakat her basarili evrimden sonra stres onaya esitlenerek spektrum tekrar 1/1'e cekilir.

## Beceriler

### 1. Zorba

**Aciklama:**  
Secilen dairesel alandaki bir tank dusmani sabitler, taraf degistirir ve yakinindaki dusmanlara hasar vermesini saglar.

| Ozellik | Deger |
|---|---:|
| Cooldown | 22 saniye |
| Secim yaricapi | 78 |
| Etki suresi | 7 saniye |
| Hasar alani | 70 |
| Hasar | Saniyede hedefin max caninin %5'i |
| Hasar turu | Gercek hasar |

**Notlar:**

- Sadece `brute` tipindeki tank dusmanlari hedefler.
- En yuksek max cana sahip uygun tank onceliklenir.
- Etki altindaki dusman korku ve yavaslama etkilerinden temizlenir.

### 2. Olumcul Stres

**Aciklama:**  
Melis stres/onay oranini yeterince stres baskin hale getirirse secili kulesini siradaki evrim seviyesine tasir.

| Ozellik | Deger |
|---|---:|
| Cooldown | 6 saniye |
| Evrim 1 kosulu | Stres/Onay >= 3/2 |
| Evrim 2 kosulu | Stres/Onay >= 2/1 |
| Evrim 3 kosulu | Stres/Onay >= 3/1 |
| Basarili evrim sonrasi | Stres onaya esitlenir |
| Maksimum evrim | 3 |

Secili kule Melis'e ait degilse, maksimum evrimdeyse, evrim sirasi bozuluyorsa veya gerekli stres/onay orani yoksa beceri calismaz.

### 3. Test Kabusu

**Aciklama:**  
Gecici test becerisidir. Tum dusmanlari aninda oldurur ve streak gorsellerini test etmek icin kullanilir.

| Ozellik | Deger |
|---|---:|
| Cooldown | 3 saniye |
| Etki | Haritadaki tum dusmanlara oldurucu gercek hasar |

Bu beceri nihai tasarimin parcasi degil, Melis'in streak anonslarini ve psikolojik gorsel dilini test etmek icin tutulur.

## Ultimate: Gotik Kabus

**Aciklama:**  
Haritada giris ve cikislar kapanir. Yeni dusman giremez, icerideki dusmanlar cikamaz. Melis kuleleri canavarlasir ve gercek hasar vermeye baslar.

| Ozellik | Deger |
|---|---:|
| Sure | 9 saniye |
| Kule hasar turu | Gercek hasar |
| Gorsel | Gecitler ve nexus uzerinde glitch neon X |
| Kule gorseli | Melis kulelerinde siyah/gotik dalgali halka |

**Mevcut uygulama:**

- Ultimate aktifken Melis kulelerinin hasar turu `true` olur.
- Gecit ve nexus noktalarinda buyuk glitch neon X gorselleri cizilir.
- Melis kuleleri `Gotik Kabus` statusu alir.
- Melis kulelerinin cooldown'u aktivasyon aninda kisa sureli hizli tepki verecek sekilde dusurulur.
- Ultimate aktifken yeni dusman girisi ve dusman cikisi kilitlenir.

## Kuleler

### 1. Hedefci

**Rol:** Menzilli takinti  
**Sinif:** Hasar  
**Hasar turu:** Psisik  
**Vurus turu:** Mermi

Hedefci menziline giren bir hedefi kilide alir ve hedef olene kadar ona odaklanir. Kilit alindiktan sonra hedef menzil disina ciksa bile Hedefci onu vurmaya devam eder; ancak yeni bir hedefe kilitlenmek icin hedefin once normal menzile girmesi gerekir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 72 altin |
| Upgrade temel maliyeti | 52 |
| Menzil | 63 |
| Hasar | 16 |
| Atis araligi | 820 ms |
| Mermi hizi | 520 |
| AOE | Yok |

**Ozel davranislar:**

- Hedef kilidi mantigiyla calisir.
- Yeni hedefleri sadece normal menziline girdiklerinde kilide alir.
- Kilitlenmis hedef menzil disina ciksa bile hedef olene kadar takip edilir.
- Favori kuleyse onaydan hasar ve atis hizi bonusu alir.
- Evrim 1: Menziline Oluler Bagi ile bagli bir dusman girerse ona oncelik verir. Zaten Oluler Bagi ile bagli bir hedefe vuruyorsa hedef degistirmez.
- Evrim 2: Ayni hedefe kilitlenmis Hedefci sayisina gore hasari artar; hedefe odaklanan Hedefci basina x1.2 hasar carpani uygulanir.
- Evrim 3: Suphe yuku olan hedeflere vururken o hedefe ozel atis hizi artar: 1 yukta %10, 2 yukta %20, 3 yukta %40.

### 2. Parlama

**Rol:** Ofke patlamasi  
**Sinif:** Hasar  
**Hasar turu:** Psisik  
**Vurus turu:** Mermi

Parlama hedefledigi dusmani menzilinden cikana kadar olduremezse ofke patlamasi yasar. Bu patlama cevresindeki dusmanlara korku uygular.

| Ozellik | Deger |
|---|---:|
| Maliyet | 88 altin |
| Upgrade temel maliyeti | 64 |
| Menzil | 59 |
| Hasar | 22 |
| Atis araligi | 950 ms |
| Mermi hizi | 460 |
| Ofke dalgasi yaricapi | Kulenin guncel menzili ile ayni |
| Korku suresi | 2.2 saniye + evrim x 0.5 saniye |

**Ozel davranislar:**

- Hedef menzilden cikarsa ofke dalgasi tetiklenir.
- Korku halindeyken menzilden cikan hedefler Parlama'nin basarisizligi olarak sayilmaz.
- Stres baskinken ofke patlamasi, kendi alanindaki dost kuleleri 0.5 saniye durdurur.
- Evrim ve diger menzil bonuslari kulenin menzilini artirdigi icin ofke dalgasi yaricapini da ayni oranda artirir.

### 3. Lanet Kulesi

**Rol:** Biriken lanet yukleri  
**Sinif:** Hasar  
**Hasar turu:** Psisik  
**Vurus turu:** Lanet

Lanet Kulesi bir alandaki dusmanlara lanet uygular. Her vurus 1 lanet stack'i ekler. Lanetli dusman oldugunde, uzerinde biriken lanet hasari cevresindeki dusmanlara patlar.

| Ozellik | Deger |
|---|---:|
| Maliyet | 104 altin |
| Upgrade temel maliyeti | 70 |
| Menzil | 58 |
| Hasar | 15 |
| Atis araligi | 1180 ms |
| Lanet uygulama alani | 42 |
| Olum patlamasi yaricapi | 58 |

**Sureler:**

| Spektrum durumu | Lanet suresi |
|---|---:|
| Dengeli | 5 saniye |
| Stres baskin | 3 saniye |
| Onay baskin | 7 saniye |

**Ozel davranislar:**

- Her vurus 1 lanet uygular.
- Lanet stack'i teorik olarak sinirsiz birikebilir.
- Stres baskinken lanet suresi kisalir, fakat uygulama alani `x1.45` olur.
- Onay baskinken lanet suresi 7 saniyeye cikar.
- Lanetli dusman oldugunde biriken lanet hasari yakin dusmanlara psisik/lanet hasari olarak patlar.
- Dusman uzerinde `L + stack` seklinde lanet yuk miktari gorunur.

### 4. Ölüler Bağı

**Rol:** Execute, ruh bagi, spektrum yonetimi  
**Sinif:** Kontrol  
**Hasar turu:** Psisik  
**Vurus turu:** Odaklanma

Ölüler Bağı bir dusmana baglanir ve hedef olene ya da nexusa ulasana kadar bagini surdurur. Hedefin cani execute esiginin altina indiginde onu oluler alemine ceker. Kule o anda hangi spektrum modundaysa odul ona gore gelir: Onay modunda +1 onay, Stres modunda +1 stres.

| Ozellik | Deger |
|---|---:|
| Maliyet | 108 altin |
| Upgrade temel maliyeti | 72 |
| Menzil | 62 |
| Dogrudan hasar | 0 |
| Bag sayisi | 1, Evrim 2 ile 2 |
| Execute esigi | Level 1'de %3, level 10'da %18 |
| Sindirim suresi | Level 1'de 3 sn, level 10'da 1 sn |
| Bag zorlugu | Bag uzadikca execute esigi azalir |

**Execute formulu:**

- Temel execute esigi level ile dogrusal artar: `%3 -> %18`.
- Bag mesafesi haritanin dikey kare uzunluguna yaklastikca bu esik zorlasir.
- Uygulanan esik: `temel esik / (1 + mesafe_orani)`.
- `mesafe_orani` 0 ile 1 arasindadir. Mesafe haritanin dikey uzunluguna ulastiginda execute esigi yarilanir.
- Execute gercek hasar gibi davranir ve kalkani/cani bitirerek hedefi oldurur.

**Spektrum davranisi:**

| Durum | Davranis |
|---|---|
| Onay modu | Execute edilen dusman +1 onay verir. |
| Stres modu | Execute edilen dusman +1 stres verir. |
| Dengeli | Onay modu gibi davranir. |

**Oluler alemine cekilen toplam dusman sayisi:**

| Esik | Etki |
|---:|---|
| 20+ | Stres modundaki bag hedefi %10 yavaslatir. Onay modundaki bag hedefin %20 fazla hasar almasini saglar. |
| 50+ | Bag uzadikca bu slow/hasar alma bonusu artar. Haritanin dikey uzunlugunda maksimum 2 katina cikar. |
| 100+ | Bag cizgisinin uzerinden gecen diger dusmanlar kisa araliklarla psisik hasar alir. |

**Evrim etkileri:**

| Evrim | Etki |
|---|---|
| 1 | Kule bir dusmani oluler alemine cektiginde bitisigindeki dusmanlar 1 saniye korkar. |
| 2 | Kulenin bag sayisi 2 olur. |
| 3 | Uzak atici tarzinda vuran bir dusman execute edilirse, bu dusman nexus tarafinda olu olarak dirilir ve ters yone kosar. Menziline dusman girince durup ates eder; normal dusmanlar ilerlemek icin onu oldurmek zorundadir. |

### 5. Kırık Ayna

**Rol:** Gecikmeli patlama, riskli burst  
**Sinif:** Hasar-destek  
**Hasar turu:** Psisik, evrimle kismen gercek hasar  
**Vurus turu:** Carpma

Kırık Ayna Melis'in "icine atar, icine atar, sonra kirilir" fikrini kule mekanigine cevirir. Kendi vuruslari zayiftir; asil gucu etrafindaki 8 komsu karede duran Melis kulelerinin verdigi gercek hasarin bir kismini depolamasindan gelir.

| Ozellik | Deger |
|---|---:|
| Maliyet | 132 altin |
| Upgrade temel maliyeti | 84 |
| Menzil | 96 |
| Hasar | 10 |
| Atis araligi | 1750 ms |
| Depolama orani | Komsu Melis kulelerinin vurdugu gercek hasarin %20'si |
| Depo ust limiti | 180 x `1.5 ^ (level - 1)` |
| Patlama esigi | Depo %100 dolunca |

**Icine Atma mekanigi:**

- Kırık Ayna'nin cevresindeki 8 komsu karede duran, ayni oyuncuya ait Melis kuleleri hasar verdikce, vurulan gercek hasarin bir kismi aynada depolanir.
- Ayni anda en fazla 8 kuleden etkilenebilir.
- Kırık Ayna kendi verdigi hasari depolamaz.
- Depo dolunca kule birikmis hasari tek hedefe patlatir.
- Patlama hedefi oldururse, stres baskin degilse hedefin cevresinde kucuk bir psisik patlama olur.
- Patlama hedefi oldurmezse Melis +1 stres kazanir.
- Kule status satirinda `Ayna %` seklinde depo dolulugu gorunur.

**Spektrum davranisi:**

| Durum | Davranis |
|---|---|
| Onay baskin | Patlama cikisa en yakin dusmani hedefler. Daha kontrolludur. |
| Stres baskin | Depolama orani %20 yerine %24 olur. Patlama rastgele hedef secerek vurur ve hedef oldurse bile cevresel patlama yapmaz. |
| Dengeli | Patlama can/kalkan yuzdesi en yuksek dusmani hedefler. |

**Evrim etkileri:**

| Evrim | Etki |
|---|---|
| 1 | Depolama orani +%4 |
| 2 | Patlamanin %25'i gercek hasara donusur |
| 3 | Patlama hedefi oldururse Melis'in kuleleri 2 saniye boyunca %20 saldiri hizi kazanir |

### 6. Fısıltı Korosu

**Rol:** Alan kontrolu, yavaslatma, korku hazirligi  
**Sinif:** Kontrol  
**Hasar turu:** Psisik  
**Vurus turu:** Dalga

Fısıltı Korosu dusmanlara fiziksel baski kurmaktan cok, karar verme mekanizmalarini bozar. Dalga vuruslari dusmanlara `Suphe` stack'i uygular. Yeterince suphe biriken dusmanlar kisa sure duraksar.

| Ozellik | Deger |
|---|---:|
| Maliyet | 108 altin |
| Upgrade temel maliyeti | 72 |
| Menzil | 62 |
| Hasar | 5 |
| Atis araligi | 1350 ms |
| Dalga alani | 40 |
| Suphe suresi | 4 saniye |
| Maksimum suphe stack'i | 3 |

**Suphe mekanigi:**

- Her dalga vurusunda alandaki dusmanlara 1 Suphe stack'i uygulanir.
- 3 stack'e ulasan dusman 0.5 saniye duraksar.
- Duraksama tetiklenince stack'ler sifirlanir.
- Dusman ustunde `Ş1`, `Ş2`, `Ş3` seklinde suphe miktari gorunur.
- Duraksama aninda dusman ustunde `DUR` yazisi gorunur.

**Spektrum davranisi:**

| Durum | Davranis |
|---|---|
| Onay baskin | Suphe stack'leri 2 saniye daha uzun kalir. Kontrol daha stabil olur. |
| Stres baskin | Duraksama 3 stack yerine 2 stack'te tetiklenir. Duraksama bitince dusman 0.5 saniye %50 hizlanir. |
| Dengeli | Normal calisir. |

**Evrim etkileri:**

| Evrim | Etki |
|---|---|
| 1 | Korku uygulanmis bir dusmanda Suphe tetiklenir ve dusman durursa, dusman 1 saniyeligine taraf degistirir ve diger dusmanlara saldirir. Diger dusmanlar yanindan gecip gidebilir. |
| 2 | Ayni taraf degistirme tetiklenir; bu kez dusmanlar ilerleyebilmek icin onu oldurmek zorundadir ve ona saldirir. |
| 3 | Evrim 2 etkilerine ek olarak, taraf degistirmis dusman cani %10'un altina indiginde intihar bombacisi gibi patlar ve kalan cani kadar cevresine fiziksel hasar verir. |

## Streak Gorsel Dili

Melis'in streak anonslari glitch neon ve korku fantezisi temalidir. Granted, Unstoppable, Rampage ve Legendary seviyelerinde tasarim giderek daha kaotik ve sarsintili hale gelir.

Gorsel dilin amaci, Melis'in onay arayisini "basari kutlamasi" gibi degil, rahatsiz edici bir psikolojik patlama gibi hissettirmektir.

## Mevcut Tasarim Yonelimi

Melis'in henuz tamamlanmamis kule seti, Atakan ve Zeynep'ten belirgin sekilde farkli olmalidir:

- Atakan moduler verimlilik ve kule sinerjisi uzerine kurulu.
- Zeynep dizilim, komut, tempo ve kombinasyon yonetimi uzerine kurulu.
- Melis ise onay/stres spektrumu, riskli evrim, psikolojik kontrol ve dengesiz patlama anlari uzerine kurulu.

Yeni Melis kuleleri tasarlanirken yalnizca hasar artisi degil, oyuncuya su sorulari sorduran mekanikler tercih edilmelidir:

- Bu dalgada onay kasmaya mi calismaliyim, stres biriktirmeyi mi goze almalıyim?
- Stresi kule evrimine harcarsam spektrum dengem bozulur mu?
- Onay baskinligini korumak daha mi guvenli, yoksa stres baskisina girip daha riskli ama daha yuksek potansiyelli bir oyun mu kurmaliyim?
- Hangi 3 kule favori olmali?
