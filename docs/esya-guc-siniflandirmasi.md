# Eşya güç sınıflandırması

Tarih: 2026-10-14. Kapsam: mağazadaki 123 eşyanın tamamı (`packages/shared/src/shop/index.ts`), oynanabilir iki operatör için: AttackLord (`warrior`) ve ZentaX (`zeynep`).

Bu belge bir denge **ölçümüdür**, kesin hüküm değildir. Sayıların bir kısmı gerçek `MatchRoom` üzerinde ölçüldü, bir kısmı koddan analitik olarak hesaplandı. Her satırda hangisi olduğu yazılı: **(ö)** ölçüm, **(a)** analitik tahmin.

---

## 1. Yöntem

### 1.1 Koddan çıkan hasar formülü

Bir vuruşun hasarı birbirini **çarpan** üç ayrı havuzdan oluşuyor (`MatchRoom.getTowerDamageBreakdown` ve `damageEnemy`):

1. **M havuzu (motor/karakter):** AttackLord yalnızlık pasifi ×1,5, Obsesyon/Debug Lazer/Ucube seviye çarpanları, motor yığınları (Obsesyon, Sabır Modülü) birbirini çarpar. **Zafer Serisi, Kıdem, Yalnız Kurt, Bitişik Devre ve Kızıl Namlu bu havuza *ham toplam* olarak eklenir.** M büyüdükçe bu eşyaların göreli katkısı seyrelir (ör. izole AttackLord kulesinde M ≥ 1,5 → Yalnız Kurt'un +%25'i en fazla +%16,7).
2. **Hasar havuzu:** kartların ve eşyaların `damage` değerleri kendi aralarında toplanır, sonuç M ile çarpılır (Delici Çekirdek, Hat Namlusu, Odak Merceği vb.).
3. **Vuruş havuzu:** tür bonusları (brute, koşucu, kalkan…), Kan Bankası +%20, Kriyojen Hat +%20 ve **kritik** burada toplanır. Kritiğin beklenen katkısı `(0,01 + Σşans) × (1 + Σkritik hasarı)` − 0,01. Taban şans %1, taban kritik çarpanı ×2.

Atış hızı ayrı bir çarpandır, ama aşağıda görüleceği gibi pratikte ısı tarafından kapatılıyor.

### 1.2 Gerçek oda deneyleri

`tests/helpers/match-room-harness.mjs` ile gerçek `MatchRoom` sürüldü (`tools/compare-builds.mjs` ile aynı yöntem: 50 ms adım, sahte saat, tohumlu RNG). Betikler repo dışında (oturum çalışma alanında) duruyor; repoya kod eklenmedi.

- **Kule:** tek kule, komşusuz (AttackLord yalnızlık pasifi açık). Takipçi, Obsesyon, Debug Lazer, Ucube, Hiza Emri, Gösteri Kulesi. Taht Mührü üçgen dizilim istediği için ölçülmedi, analitik değerlendirildi.
- **Seviye:** 4 ("orta oyun") ve 7 ("geç oyun"). Gerekçe: 5. seviye inşa bedelinin 10 katı, 10. seviye 40 katı altın istiyor (Takipçi 1→5: 1017 altın, Obsesyon 1→5: 2613 altın); 10. dalga civarında tipik kule 3–5, geç oyunda 5–7 seviyede.
- **Referans yükler:** *boş kule* (hiç kart/eşya yok) ve *tipik orta-oyun kulesi* — kartlardan ve 2–3 eşyadan gelmiş varsayılan toplamlar: hasar +0,5, atış hızı +0,25, kritik şansı +0,10, kritik hasarı +0,5, isabet +0,3, soğuma +0,25.
- **Tehditler (60 sn):** *tank* (grunt, 4000 can, hız 45), *koşucu-tank* (runner, 4000 can, hız 90), *sürü* (grunt, can = kulenin tank DPS'inin 4 katı, hız 50, 60 adet). Dirençler sıfırlandı. Cephane ve enerji her adımda dolduruldu (lojistik eşyaları ayrıca değerlendirildi).
- **Tekrar:** her yapılandırma 6 tohum. Toplam ~24 000 koşu. Tek kule–akan düşman kurgusu kaotik; tek ölçümde ±%10 gürültü olağan. Tabloda dört yapılandırmanın ve üç tehdidin ortalaması verildi.
- **Ek deneyler:** isabet/mermi hızı/ısı duyarlılığı (8 tohum, atış ve isabet sayımı), komşuluk (4 komşu bina), Komuta Modülü işaret oranı, yoğun sürüde öldürme tetikli eşyalar.

### 1.3 Değer ölçütleri

| Kategori | Ölçüt |
|---|---|
| Hasar, kritik, nişan, ısı | Ortalama % hasar artışı (ö) ve **%DPS / 100 altın** |
| Ekonomi | Eşyanın 8. dalgada alındığı varsayımıyla maç sonuna kadar getirdiği ek altın / fiyat (**ROI ×**) |
| Lojistik | Üst sınır: ölçülen kaynak bekleme payı (`docs/build-comparison-results.json`: kule zamanının %3–10'u) |
| Dayanıklılık, harita, yardımcı | Nitel; ölçülebilenler (ö) |

**Ekonomi dayanağı (a):** başlangıç 750 altın. Öldürme altını 20 dalgada toplam ~20 700, dalga sonu primi ~1 000; maç boyunca toplam gelir ~22 500 altın. 8. dalgadan sonra kalan gelir ~19 300. 6–9 ve 11–20. dalgalarda (14 dalga) şampiyon var. 5., 10., 15. ve 20. dalgalarda toplam 154 uçan düşman geliyor. Düşman canı dalga başına ×1,17 büyüyor (ortalama can: 10. dalga ~160, 15. ~970, 19. ~2650), öldürme altını ise düşman başına ~20 altında sabit kalıyor.

### 1.4 Kademeler

**S:** açık ara en iyi değer (≥40 %DPS/100g ya da ekonomide ≥20× ROI). **A:** 20–40 %DPS/100g ya da 5–20× ROI. **B:** 10–20, ya da koşullu güçlü. **C:** 3–10, dar ya da koşullu. **D:** <3, negatif ya da oynanabilir iki operatörde işlevsiz (tuzak).

---

## 2. Sistem düzeyindeki bulgular (eşya değerini belirleyen)

1. **Kuleler ısıyla sınırlı.** Taban soğuma 3°/sn, atış başına ısı ~10°. Gerçek odada sürekli atış hızı seviyeden bağımsız olarak ~0,3 tetik/sn'ye oturuyor; nominal hız 1,0–2,2/sn. Örnek: Takipçi L7 nominal 2,16/sn, sürekli 0,30/sn; Obsesyon 1,32 → 0,34; Hiza Emri L7 1,67 → 0,30. Sonuç: **atış hızı neredeyse değersiz** (+%25 atış hızı ölçümde ±%3), **ısı ve soğuma doğrudan DPS çarpanı**, ısı bedeli olan her eşya bir ceza (atış hızı, kritik, dönüş eşyalarında).
2. **İsabet işe yaramıyor.** İsabet yalnızca ateş konisini daraltıyor (`getTowerFireAlignmentTolerance`). Iskalar konidan değil, merminin uçuş süresinden (hedef hareket ediyor) geliyor. Ölçülen isabet oranı Takipçi'de isabet 0'da %64, 0,3'te %49, 1,0'da %57; Obsesyon'da %94 → %84; Hiza Emri'nde koşucuya karşı %38 → %33. Atış sayısı değişmiyor. **Gerçek "isabet" statı mermi hızı:** +%90 mermi hızı mermili kulelerde +%45–90 hasar veriyor.
3. **Ekonomi eşyaları oyunu kırıyor.** Yüzdeli altın kartları yarıya indi, eşyalar inmedi. Öldürme altını sabit kalırken can ve hasar katlanarak büyüdüğü için hasara ya da cana bağlı primler (Savaş Tazminatı, Artık Enerji Toplayıcı) maçın geri kalanında eşya fiyatının yüzlerce katı altın üretiyor. `cards/index.ts`teki dalga tavanları (`GOLD_INTEREST_CAP`, `CHAMPION_GOLD_WAVE_CAP`, `OVERKILL_GOLD_WAVE_CAP` …) tanımlı ama sunucu hiçbirini okumuyor.
4. **"Durum etkisi gücü" yavaşlatmayı büyütmüyor.** Yavaşlatmanın hızı `slowFraction`tan geliyor (İzolasyon için seviye, Kin için mesafe); `statusMagnitude` yalnızca durumun `magnitude` alanını çarpıyor ve yavaşlatmada bu alan okunmuyor (`applyEnemyStatusEffect`, 6972–6984).
5. **AttackLord'da yalnızlık her şeyden önce geliyor.** 4 komşulu bir AttackLord kulesi izole haline göre −%48…−%83 hasar verdi (ö). Kodda pasif hâlâ hem hasarı hem **menzili** ×1,5 yapıyor (`getTowerOwnRange` → `getAtakanPassiveMultiplier`; `balance/index.ts` 347–362 "menzil ve hasar"). Bu, "pasif artık yalnızca hasar ×1,5" tanımıyla çelişiyor; bilinçli değilse kontrol edilmeli. Komşu isteyen her eşya AttackLord için tuzak, komşusuzluğu ödüllendiren her eşya (Yalnız Kurt, Sessiz Mevzi) bedava sinerji.
6. **Irk direnci aşama boyunca sabit** (`getStageRace`). Altı ırkın her biri bir hasar tipine %40 dirençli, birine %40 zayıf. Direnç Sökücü ve Zaaf Merceği bu yüzden ya tam değerli ya da sıfır. Not: `modifiers/index.ts`teki "dalga ilerledikçe ırk değişiyor" yorumu eskimiş.

---

## 3. Kategori tabloları

Kısaltmalar: "×1,25, 4" → fiyat her kopyada ×1,25 büyür, kule başına en fazla 4. "Boş/Orta" → iki referans yük. %DPS değerleri dört yapılandırmanın (L4/L7 × boş/orta) ve tank, koşucu ve sürü tehditlerinin ortalaması.

### 3.1 Hasar

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Hat Namlusu | 100 | +%40 hasar; hat kuleleri (Hiza Emri, Gösteri; Abartı'da etkisiz) | (ö) +%34 (boş +40, orta +26; Gösteri +25) | 34 %/100g | **A** |
| Işın Prizması | 105 | +%45 hasar, soğuma −%15; ışın kuleleri (Debug Lazer, Taht Mührü) | (ö) Debug Lazer +%35,5 | 34 %/100g | **A** |
| Odak Merceği | 90 | +%25 hasar; yalnız Debug Lazer | (ö) +%20,5 | 23 %/100g | **A** |
| Ağır Kundak | 90 | +%20 hasar, dönüş −%10; impact (Obsesyon, Ucube, Gösteri, Taht; Sunucu'da etkisiz) | (ö) +%19 | 21 %/100g | **A** |
| Yalnız Kurt | 100 | Komşusuzken +%25 ham hasar (M havuzu), +%15 menzil | (ö) +%22,6; Gösteri +%36 | 23 %/100g | **A** (AttackLord); ZentaX'ta dizilimi bozar |
| Kan Bankası | 75 | +%20 vuruş havuzu; oyuncu başına dalga başına 5 nexus | (a) +%20 (kritikle toplanır) | 27 %/100g + nexus bedeli | **A** |
| Delici Çekirdek | 90 | +%20 hasar; projectile (Takipçi, Hiza Emri) | (ö) +%16,6 | 18 %/100g | **B** |
| Termal Fünye | 120 | Debug Lazer vuruşu 4 sn boyunca saniyede azami canın %1,5'i yanma | (ö) 4000 canlı hedefte +%37; geç dalga canıyla (~1300–2650) (a) +%12–25 | ~15 %/100g | **B** |
| Delici Uç | 120 | +1 delme; tek hedef/hat (Takipçi, Obsesyon, Ucube, Hiza Emri, Gösteri, Abartı) | (ö) +%13; **Gösteri'de 0** | 11 %/100g | **B** |
| Zafer Serisi | 125 | Öldürme başına +%3 ham hasar (M havuzu), dalga içinde en fazla %45 | (a) Geç dalgada ana kule 15 öldürmeye hızla ulaşır: ham +%30–45, izole AttackLord'da ~+%20–30 | ~15–20 %/100g | **B** |
| Bitişik Devre | 110 | Komşu başına +%8 ham hasar (en fazla 4) | (ö) ZentaX 4 komşuyla +%14–32; AttackLord'da yalnızlık kaybı −%40…−80 | ZentaX ~20 %/100g | **B** (ZentaX) / D (AttackLord) |
| Kıdem | 150 | Tamamlanan her dalga için kalıcı +%2 ham hasar | (a) 8. dalgada alınırsa ortalama +%12 ham, AttackLord'da ~+%8 | ~6 %/100g | **C** |
| Komuta Modülü | 110 | İşaretli düşmana +%30; amplify (Takipçi, Taht; Sunucu/Saray/Abartı'da etkisiz) | (ö) Takipçi'de +%1–8 (işaretli hedef payı düşük); Taht'ta (a) +%30 × müttefik işaret payı | 2–7 %/100g | **C** |
| Ağır Avcısı | 100 | Brute'a +%40 | (a) Brute normal dalga EHP'sinin ~%28'i → ~+%11 | 11 %/100g | **C** |
| Karşı Ateş Modülü | 100 | Nişancıya +%50 | (a) EHP payı ~%19 → ~+%9 | 9 %/100g | **C** |
| Kalkan Delici | 105 | Kalkan dururken +%35 | (a) Kalkan EHP payı ~%15 → ~+%5 | 5 %/100g | **C** |
| Tuzak Ağı | 95 | Koşucuya +%45 | (ö) saf koşucu +%41; gerçek karışımda (a) ~+%4 | 4 %/100g | **C** |
| Direnç Sökücü | 125 | Dirençlerin %40'ı yok sayılır | (a) Dirençli aşamada (6'da 1) +%26,7, diğerlerinde ~0–3 | Koşullu 21 / ortalama ~4 %/100g | **C** |
| Uçaksavar Kiti | 160 | Havayı vurma, hava hasarı −%50; her kuleye takılır | Yalnız Debug Lazer'de anlam taşır (hava dalgaları); havayı zaten vuran kulelerde **saf ceza** | — | **C** (Lazer) / D (diğerleri) |
| Sabır Modülü | 130 | Aynı hedefe her vuruşta +%5, 10 yığın | (ö) +%3 (ısı sınırı aynı hedefe vuruş sayısını düşürüyor) | 2,5 %/100g | **D** |
| Zaaf Merceği | 115 | Zaaftan %50 daha çok yararlanma | (a) Zayıf aşamada +%14,3, diğerlerinde 0 | ortalama ~2 %/100g | **D** |
| İntikam Devresi | 115 | Menzilden kaçış sonrası 8 sn +%80 | (ö) ~0 | 0 | **D** |
| Son Mermi | 95 | Mühimmatı bitiren atış +%200 | (a) Kaynak bekleme %3–10; nadir tetiklenir | <2 %/100g | **D** |
| Yörünge Rulmanı | 95 | +%40 hasar, ısı +%20; yalnız yörünge kuleleri | Oynanabilir operatörlerde yörünge kulesi yok | 0 | **D** |
| Ek Bıçak Yuvası | 135 | +1 bıçak, yakıt +%35; yalnız yörünge | Oynanabilir operatörlerde yörünge kulesi yok | 0 | **D** |

### 3.2 Kritik

Beklenen kritik katkısı = `(0,01 + şans) × (1 + kritik hasarı) − 0,01` (vuruş havuzu). Şans ve hasar birbirini çarptığı için tek tarafı alınan kritik eşyası neredeyse boş.

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Kritik Sistem | 150 | +%12 şans, +%50 kritik hasarı | (a) tek başına +%18,5; (ö) +%14,5 | 10–12 %/100g | **B** |
| Hassas Tetik | 45 (×1,25, 4) | +%7 şans | (a) ilk kopya +%7; (ö) +%6 | 13–16 %/100g (ilk kopya) | **B** (kombo içinde A) |
| Yarık Mermi | 110 | +%125 kritik hasarı, −%6 şans | (ö) tek başına −%2,4 (taban %1 şans siliniyor); Hassas Tetik ×4 ile (a) +%51 | Komboda ~14 %/100g | **B** (yalnız kombo) |
| Şans Merceği | 125 | +%25 şans, menzil −%20 | (ö) +%10 (tank +1/+16, koşucu +21/+28, sürü −5/−2) | 8 %/100g | **C** |
| Ağır Çekirdek | 105 (×1,3, 2) | +%60 kritik hasarı | (ö) boş +%0,6, orta (şans %11) +%6 | 2–6 %/100g | **C** |
| İz Okuyucu | 110 | Başka kaynağın işaretlediği düşmana +%20 şans | (a) AttackLord takımında Takipçi işaretli hedeflerde etkili; ZentaX'ın tek başına işaret kaynağı yok | koşullu | **C** |
| Mesafe Ölçer | 100 | İsabet bonusunun her %10'u +%3 şans (≤%30) | (ö) orta yükte (isabet 0,3 → +%9 şans) +%6; boşta 0 | 3 %/100g | **C** |
| Kriyostat | 135 | Sıcaklık 20°'nin altındayken +%25 şans | (ö) +%5,4; kule ateş altında 50–60°'de oturuyor | 4 %/100g | **C** |
| Ateşleme Pimi | 95 | +%20 şans, ısı +%25 | (ö) +%0,5; ısı bedeli kritiği siliyor | ~0 | **D** |
| Optik Hedefleyici | 100 | +%30 isabet, +%8 şans | (ö) ±0; isabet cezası şansı götürüyor | 0 | **D** |
| Hassas Namlu | 105 | +%35 isabet, +%25 kritik hasarı | (ö) −%5 | negatif | **D** |
| İnfilak Başlığı | 130 | +%90 kritik hasarı, ısı +%30 | (ö) −%16 (en kötü ölçüm) | negatif | **D** |

**Kritik kombinasyonları (a), bir kulede:**

| Kombinasyon | Toplam fiyat | Şans / Kritik hasarı | Beklenen + | %/100g |
|---|---|---|---|---|
| Hassas Tetik ×1 | 45 | 0,08 / ×2 | +%7 | 15,6 |
| Kritik Sistem | 150 | 0,13 / ×2,5 | +%18,5 | 12,3 |
| Hassas Tetik ×4 | 261 | 0,29 / ×2 | +%28 | 10,7 |
| Hassas Tetik ×4 + Yarık Mermi | 371 | 0,23 / ×3,25 | +%51 | 13,7 |
| Şans Merceği + Yarık Mermi | 235 | 0,20 / ×3,25 | +%44 (menzil −%20) | 18,7 |
| Hassas Tetik ×4 + Ağır Çekirdek ×2 | 503 | 0,29 / ×3,2 | +%63 | 12,5 |
| Şans + Hassas ×4 + Yarık + Ağır ×2 | 738 | 0,48 / ×4,45 | +%165 | 22,4 |
| Kritik Sistem + Yarık Mermi | 260 | 0,07 / ×3,75 | +%18 | 6,9 (Yarık'ın −%6'sı sistemi bozar) |

Kritik ısı istemediği için ısıyla sınırlı oyunda **en iyi uzun vadeli hasar yatırımı**; atış hızının tam tersi. Çarpımsal olduğu için ölçek büyüdükçe altın başına verim artıyor.

### 3.3 Nişan: isabet, dönüş, mermi hızı

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Sessiz Mevzi | 70 | Komşusuzken mermi hızı +%120; mermili kuleler | (ö) +%57 (koşucuda +96/+120); AttackLord zaten izole | **82 %/100g** | **S** |
| Manyetik Ray | 90 | Mermi hızı +%90 | (ö) +%47 (koşucuda +81/+92) | 53 %/100g | **S** |
| Hafif Çekirdek | 150 | Mermi hızı +%150 | (ö) +%61 (koşucuda +107/+130) | 41 %/100g | **S** |
| Genleşme Odası | 105 | Mermi hızı +%60, menzil +%8 | (ö) +%25,6 | 24 %/100g | **A** |
| Tungsten Çekirdek | 105 | Mermi hızı +%50, kritik hasarı +%20 | (ö) +%25,4 | 24 %/100g | **A** |
| Sabot Fişeği | 40 (×1,25, 4) | Mermi hızı +%25; mermili kuleler | (ö) +%9,6 | 24 %/100g | **A** |
| Hafif Mühimmat | 50 (×1,6, 2) | Mermi hızı +%40; **her kuleye** takılır | (ö) ortalama +%12 (mermili kulelerde koşucuya +%29); Debug Lazer/Gösteri/Sunucu'da 0 | 24 %/100g (mermili) | **A** (mermili) / D (diğerleri) |
| Gauss Bobini | 55 (×1,3, 3) | Mermi hızı +%20, menzil +%3 | (ö) +%3 (gürültülü) | 5,5 %/100g | **C** |
| Bilyalı Yatak | 40 (×1,25, 4) | Dönüş +%20; nişan alan kuleler | (ö) +%1,8 | 4,6 %/100g | **C** |
| Namlu Yatağı | 100 (×1,6, 2) | Dönüş +%35; her kuleye | (ö) +%1,8 | 1,8 %/100g | **D** (Bilyalı Yatak'a yenik) |
| Hareket Öngörücü | 75 | Koşucu/havaya dönerken dönüş +%100 | (ö) +%1,4 (koşucuda +7/+2) | ~2 %/100g | **D** |
| Jiroskop | 85 | Öldürmeden sonra 2 sn dönüş +%150 | (ö) +%0,7 | ~1 %/100g | **D** |
| Hedef Kilidi | 90 | Hedef kilidi +2 sn (yalnız nişan alan kulelerde çalışıyor) | (ö) 0 | 0 | **D** |
| Hafif Taret Kabuğu | 80 | Dönüş +%70, can −%20 | (ö) −%9 | negatif | **D** |
| Taret Motoru | 110 | Dönüş +%120, ısı +%20 | (ö) −%10 | negatif | **D** |
| Termal Kılıf | 70 | 40°'nin altında isabet +%50 | (ö) −%1 | ~0 | **D** |
| Gez ve Arpacık | 35 (×1,25, 4) | İsabet +%15 | (ö) −%3,6 | negatif | **D** |
| Nişangâh | 60 (×1,6, 2) | İsabet +%30; her kuleye | (ö) −%5,6 | negatif | **D** |
| Nişan Dürbünü | 90 | İsabet +%45 | (ö) −%8 | negatif | **D** |
| Lazer Telemetre | 110 | İsabet +%50, menzil +%10 | (ö) −%10 | negatif | **D** |
| Atalet Dengeleyici | 120 | İsabet +%60 | (ö) −%10 | negatif | **D** |
| İrtifa Ölçer | 65 (×1,3, 2) | Hava hedefinde isabet +%60 | İsabet ıskayı azaltmıyor (bkz. §2.2) | 0 | **D** |

### 3.4 Isı ve soğuma

Sürekli tetik hızı ≈ soğuma / atış ısısı. Soğuma ve ısı eşyaları bu yüzden birbirini **çarpar** (+%35 soğuma ve −%25 ısı → ×1,8).

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Soğutucu Kanatlar | 30 (×1,2, 5) | Soğuma +%25; her kuleye | (ö) +%8,6 kopya başına; 5 kopya 225 altın | 29 %/100g | **A** |
| Soğutma Sıvısı | 45 (×1,25, 3) | Soğuma +%35 | (ö) +%11 | 25 %/100g | **A** |
| Isı Emici | 105 (×1,6, 2) | Atış ısısı −%25 | (ö) +%23 (Gösteri +%34); iki kopya (−%50 ısı) duyarlılık deneyinde +%50–90 | 22 %/100g | **A** |
| Dökme Radyatör | 130 | Soğuma sıcaklıkla artar (100°'de ×2) | (ö) +%19 | 14,5 %/100g | **B** |
| Buhar Tahliyesi | 120 | Her öldürmede −4° | (ö) hasar +%5; yoğun sürüde öldürme +%20–51 (Takipçi, Hiza, Gösteri) | sürüde ~25 %/100g | **B** |
| Aşırı Sürücü | 130 | Performans kolunun yarı üstü ısı/enerji bedeli −%50 | (ö) varsayılan kolda (0,5) 0; kolu açan oyuncuda değerli | koşullu | **C** |
| Kızıl Namlu | 140 | Her derece için +%0,6 ham hasar, 80°'de kilit | (ö) +%4,7; sürüde öldürme −%3…−19 | 3 %/100g | **D** |
| Atış Denetleyicisi | 115 | Atış hızı +%25, ısı +%20; dps kuleleri | (ö) −%12: atış hızı ısı tavanına çarpıyor, ısı bedeli sürekli hızı düşürüyor | negatif | **D** |

### 3.5 Durum etkileri ve yavaşlatma

Oynanabilir operatörlerin durum etkileri: İzolasyon Kulesi (vuruş yavaşlatması / yalnızken aura), Kin Kulesi (mesafeli yavaşlatma), Takipçi (işaret), eşyadan gelen chill (Buz Serpintisi) ve yanma (Termal Fünye). Yavaşlatma türleri birbirini çarpar.

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Buz Serpintisi | 125 | Vuruşlar 1,5 sn %20 chill; her kuleye | (ö) kendi hasarı +%4; asıl değeri takımda: hedef %20 yavaş → bütün kuleler için ~%25 daha uzun menzil süresi; diğer yavaşlatmalarla çarpımsal | takım değeri | **B** |
| Ziftli Zemin | 75 (×1,6, 4) | Seçilen karede %25 yavaşlatma | (a) Çarpımsal, ucuz, darboğaza konursa bütün takıma | takım değeri | **B** |
| Ağır Metabolizma | 110 | Süre +%70, güç −%25 | (a) Güç cezası yavaşlatmada **etkisiz**. Kin'in 1150 ms yavaşlatmasını 1955 ms yapar (3,2 sn aralıkta kapsama %36 → %61) | Kin'de iyi | **B** (Kin) |
| Uzun Fitil | 95 | Durum süresi +%35 | (a) Kin'de kapsama %36 → %49; işaret, Termal Fünye ve İzolasyon aurasında etkisiz | düşük | **C** |
| Kalıcı İz | 45 (×1,25, 4) | Durum süresi +%15 | (a) Uzun Fitil'in merdiveni | düşük | **C** |
| Yankı Odası | 90 | Durum gücü +%25; aura kuleleri | Yavaşlatma gücü değişmiyor (bkz. §2.4); oynanabilir aura kulelerinde etki yok | 0 | **D** |
| Buz Çekirdeği | 100 | Durum gücü +%40; CC kuleleri | Aynı nedenle İzolasyon ve Kin'de etki yok | 0 | **D** |
| Koni Yayıcı | 95 | Durum gücü +%45; yalnız Kin | Aynı nedenle etki yok | 0 | **D** |
| Kriyojen Hat | 115 | Yavaşlatılmış hedefe +%20 hasar; yalnız CC kuleleri | Uyan iki kule (İzolasyon, Kin) hasar vermiyor | 0 | **D** |
| Lanet Fitili | 105 | Süre +%50; lanet kuleleri | Oynanabilir operatörlerde lanet kulesi yok | 0 | **D** |
| Rezonans Odası | 100 | Menzil +%25; dalga kuleleri | Oynanabilir operatörlerde dalga kulesi yok | 0 | **D** |
| Enkaz Alanı | 80 | Kule yıkılınca 12 sn yavaşlatıcı enkaz | Kulenin ölmesini gerektiriyor | düşük | **D** |

### 3.6 Lojistik, cephane, enerji

Kuruluş karşılaştırmasında kulelerin kaynak beklediği zaman %3–10 (yalnız "supply" tehdidinde %10). Yani lojistik eşyalarının **toplam** DPS tavanı +%3–10; tek eşyanın payı bunun bir kısmı.

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Seri Cephane Hattı | 33 (×1,2, 5) | Cephane üretimi +%25 (yalnız cephane fabrikasında işler) | (a) ucuz; Verim Hattı ile çarpımsal | düşük | **C** |
| Madenci Eldiveni | 28 (×1,2, 5) | Binaya hizmet eden işçinin toplama hızı +%20 | (a) | düşük | **C** |
| İşçi Botları | 28 (×1,2, 5) | Hizmet eden işçinin hareket hızı +%15 | (a) | düşük | **C** |
| Vardiya Amiri | 120 (×1,35, 3) | Bütün işçilerde toplama +%20, yürüme +%20 | (a) bütün hatta etki | düşük | **C** |
| Seyyar Depo | 135 (×1,4, 2) | İşçi kapasitesi +%40 | (a) | düşük | **C** |
| Kristal Rafinerisi | 85 | Atış yakıtı −%40; güç kristali (Debug Lazer, Gösteri, Taht) | (a) | düşük | **C** |
| İkmal Hattı | 95 | Atış yakıtı −%30; her kuleye | (a) kristal kulelerinde Kristal Rafinerisi'ne yenik | düşük | **C** |
| Verim Hattı | 100 | Üretim +%35 (yalnız cephane fabrikasında işler, enerji binasında etkisiz) | (a) iki Seri Cephane Hattı (73 altın, ×1,56) daha ucuz ve güçlü | çok düşük | **D** |
| Beşinci İşçi | 170 | +1 cephane taşıyıcı | İşçi kiralamak 100×1,1ⁿ (ilk beş kiralama 100–146) | işe almaktan pahalı | **D** |
| Düşük Güç Modülü | 110 | Çalışma enerjisi −%25 | (a) | çok düşük | **D** |
| Tahliye Valfi | 120 | Enerji bitince 4 sn mühimmatla ateş | (a) nadir | çok düşük | **D** |
| Ganimet Avcısı | 90 | Öldürmede %20 ihtimalle 4 mühimmat | (ö) ~0 | çok düşük | **D** |

### 3.7 Ekonomi ve altın

ROI = eşya 8. dalgada alınırsa maç sonuna kadar getirdiği ek altın / fiyat. Taban: 8. dalgadan sonraki toplam gelir ~19 300 altın.

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Ganimet Kesesi | 110 | Düşman altını +%160 (oyuncu) | (a) +29 600 altın (3. dalgada alınırsa 32 500) | **~270×** | **S** |
| Altın Elek | 85 (×1,5, 3) | Düşman altını +%96 / kopya | (a) +17 800 / kopya; 3 kopya (405 altın) +%288 | **~210×** | **S** |
| Artık Enerji Toplayıcı | 70 | Öldürücü vuruşta canı aşan hasarın %20'si altın (vuruş başına düşmanın azami canıyla sınırlı) | (ö) Taşan hasar Obsesyon'da azami canın %72'si, Hiza'da %60, Gösteri ve Takipçi'de %44. Geç dalga canlarıyla (a) Obsesyon'da öldürme başına 140–380 altın | **100× ve üstü** | **S** |
| Savaş Tazminatı | 90 | Dalga sonunda o dalga verilen her 1000 hasar için +40 | (a) Hasar başına 0,04 altın; ana kule geç dalgada 5–10 bin hasar/dalga → 200–400/dalga, ~2–4 bin toplam (öldürme altınının ~3 katı oranında) | **25–45×** | **S** |
| Ödül Fermanı | 120 | Şampiyon ölünce +600 | (a) 8. dalgadan sonra 12 şampiyon → +7 200 | **60×** | **S** |
| Sigorta Poliçesi | 120 | Sızıntısız dalga sonunda +360 | (a) %70 temiz dalga varsayımıyla +3 000 | **25×** | **S** |
| Darphane Modülü | 80 (×1,3, 3/bina) | Ekonomi binası dalga sonunda ayaktaysa +160 | (a) Kopya başına +1 900; sınır **bina başına**, birden fazla binada katlanır | **24×** | **S** |
| Faiz Hesabı | 140 | Dalga sonunda altının %16'sı (tavan yok) | (a) 300 altın birikimle +580, 1000 birikimle +1 900 | 4–14× | **A** |
| Vadeli Mevduat | 150 (×1, 2) | 4 dalga sonra 440 öder | (a) Net +290; 4 dalgada 2,9× | 2,9× / 4 dalga | **A** |
| Riskli Yatırım | 0 (dalgada 1, takımda) | 10 nexus → 400 altın | (a) Nexus 100 can; sızdırmayan takım için bedava altın | 40 altın/nexus | **A** |
| Düşürme Primi | 75 | Kulenin öldürdüğü uçan düşman başına +32 | (a) 154 uçan düşman; kule payı %15–30 → 740–1 480 | 10–20× | **A** |
| Ateş Hattı Primi | 70 | Kule ≥50°'deyken öldürme başına +12 | (ö) 4–9 altın/öldürme (kuleler ateş altında çoğunlukla 50°'nin üstünde) | ~9× | **A** |
| Uzak Menzil Primi | 75 | Menzilin dış dörtte birinde öldürme başına +16 | (ö) 3–16 altın/öldürme (Debug Lazer 15–16) | 8–15× | **A** |
| Toplu İmha Primi | 85 | 2 sn içinde 3 öldürmede +60 | (ö) 0–19 altın/öldürme (Ucube 19, Hiza 5–7, Obsesyon 0) | 0–20× | **B** |
| Soğuk Av Kaydı | 70 | Yavaşlamış öldürme başına +12 | (a) Yavaşlatıcı yanında öldürmelerin çoğu; tek kule testinde 0 | koşullu ~10× | **B** |
| Eğitim Sahası | 130 | O kulenin öldürmelerinden tecrübe +%50 | (a) Seviye altın kadar tecrübeyle de sınırlı; ana kulede değerli | — | **B** |
| Kelle Defteri | 70 | Kritik vuruşla öldürme başına +24 | (ö) 0,2–11 altın/öldürme; kritik şansına bağlı | kritik kurulumunda B | **C** |
| İkmal Senedi | 75 | 5 mühimmat ya da 15 enerji teslimatı başına +2 | (a) Isı sınırlı kulede teslimat az; ~10–20/dalga | ~3× | **C** |

### 3.8 Dayanıklılık ve onarım

Tank testinde düşmanlar kuleye saldırıyor; can eşyalarının DPS etkisi kulenin yıkılmadan ateşte kalmasından geliyor.

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Çelik Döküm | 50 (×1,25, 3) | Kule canı +%55 | (ö) +%14 DPS | 28 %/100g | **A** |
| Tampon Katman | 110 | Can +%90, onarım bedeli −%35 | (ö) +%22 DPS | 20 %/100g | **B** |
| Nexus Kalkanı | 65 (×1,6, sınırsız) | 3 sızıntıyı engeller (24 nexus) | (a) Riskli Yatırım kuruyla ~960 altın değeri; yük **dalga bitince silinmiyor** | yüksek, sızıntı varsa | **B** |
| Kaynak Makinesi | 85 | Onarım bedeli −%60 | (a) onarım harcamasına bağlı | — | **C** |
| Pnömatik Anahtar | 48 (×1,25, 4) | Tamirci onarım hızı +%40 | (a) | — | **C** |
| Yedek Parça Sandığı | 130 | Onarım hızı +%110, işçi kapasitesi −%20 | (a) | — | **C** |
| Çelik Yelek | 55 (×1,25, 4) | İşçi canı +%45 | (a) | — | **C** |
| Sahra Reviri | 140 | İşçi canı +%120, toplama −%15 | (a) | — | **C** |
| Zırh Plakası | 95 | Duvar canı +%80; yalnız duvar | Tampon Katman (+%90 can ve −%35 onarım, 110) ve 2× Çelik Döküm (+%110, 113) duvara da takılıyor | daha kötü | **D** |

### 3.9 Harita ve yardımcı

| Eşya | Fiyat | Etki | Değer ölçütü | Altın başına güç | Kademe |
|---|---|---|---|---|---|
| Bariyer | 180 (×1,6, 3) | Bir yol karesini kapatır (düşman yolu uzar ya da engeli kırar) | (a) yol uzatma ve huni kurma; haritaya bağlı | — | **B** |
| Avcı Protokolü | 60 | En zayıf ve rastgele hedefleme | (a) yardımcı | — | **C** |
| Nöbetçi Protokolü | 60 | En yakın ve son hedefleme | (a) yardımcı | — | **C** |
| Ek Yuva | 210 (×1,5, 2) | Kule kapasitesi +1 (20 → 21), 5. dalgadan sonra | (a) yalnız kontenjan dolunca | düşük | **C** |
| Şarj Kondansatörü | 145 | Ulti şarjı +%20 | (a) | düşük | **C** |

---

## 4. Genel kademe listesi

**Dağılım:** S 10 · A 20 · B 19 · C 36 · D 38 (toplam 123).

**S (10):** Ganimet Kesesi, Altın Elek, Artık Enerji Toplayıcı, Savaş Tazminatı, Ödül Fermanı, Sigorta Poliçesi, Darphane Modülü, Sessiz Mevzi, Manyetik Ray, Hafif Çekirdek.

**A (20):** Hat Namlusu, Işın Prizması, Odak Merceği, Ağır Kundak, Yalnız Kurt, Kan Bankası, Genleşme Odası, Tungsten Çekirdek, Sabot Fişeği, Hafif Mühimmat (mermili kulede), Soğutucu Kanatlar, Soğutma Sıvısı, Isı Emici, Çelik Döküm, Faiz Hesabı, Vadeli Mevduat, Riskli Yatırım, Düşürme Primi, Ateş Hattı Primi, Uzak Menzil Primi.

**B (19):** Delici Çekirdek, Termal Fünye, Delici Uç, Zafer Serisi, Bitişik Devre (ZentaX), Kritik Sistem, Hassas Tetik, Yarık Mermi (kombo), Dökme Radyatör, Buhar Tahliyesi, Buz Serpintisi, Ziftli Zemin, Ağır Metabolizma, Toplu İmha Primi, Soğuk Av Kaydı, Eğitim Sahası, Tampon Katman, Nexus Kalkanı, Bariyer.

**C (36):** Kıdem, Komuta Modülü, Ağır Avcısı, Karşı Ateş Modülü, Kalkan Delici, Tuzak Ağı, Direnç Sökücü, Uçaksavar Kiti (Lazer), Şans Merceği, Ağır Çekirdek, İz Okuyucu, Mesafe Ölçer, Kriyostat, Gauss Bobini, Bilyalı Yatak, Aşırı Sürücü, Uzun Fitil, Kalıcı İz, Seri Cephane Hattı, Madenci Eldiveni, İşçi Botları, Vardiya Amiri, Seyyar Depo, Kristal Rafinerisi, İkmal Hattı, Kelle Defteri, İkmal Senedi, Kaynak Makinesi, Pnömatik Anahtar, Yedek Parça Sandığı, Çelik Yelek, Sahra Reviri, Avcı Protokolü, Nöbetçi Protokolü, Ek Yuva, Şarj Kondansatörü.

**D (38):** Sabır Modülü, Zaaf Merceği, İntikam Devresi, Son Mermi, Yörünge Rulmanı, Ek Bıçak Yuvası, Ateşleme Pimi, Optik Hedefleyici, Hassas Namlu, İnfilak Başlığı, Namlu Yatağı, Hareket Öngörücü, Jiroskop, Hedef Kilidi, Hafif Taret Kabuğu, Taret Motoru, Termal Kılıf, Gez ve Arpacık, Nişangâh, Nişan Dürbünü, Lazer Telemetre, Atalet Dengeleyici, İrtifa Ölçer, Kızıl Namlu, Atış Denetleyicisi, Yankı Odası, Buz Çekirdeği, Koni Yayıcı, Kriyojen Hat, Lanet Fitili, Rezonans Odası, Enkaz Alanı, Verim Hattı, Beşinci İşçi, Düşük Güç Modülü, Tahliye Valfi, Ganimet Avcısı, Zırh Plakası.

---

## 5. Bayraklı listeler

### 5.1 Kesin yenik eşyalar (aynı şeyin daha fazlası daha ucuza)

| Yenik eşya | Yenen | Gerekçe |
|---|---|---|
| Namlu Yatağı (100, +%35 dönüş) | Bilyalı Yatak ×2 (90, +%40) | Daha ucuz, daha fazla; dönüşün işe yaradığı her kulede (nişan alanlar) ikisi de takılıyor |
| Zırh Plakası (95, duvar +%80 can) | Tampon Katman (110, +%90 can ve −%35 onarım); Çelik Döküm ×2 (113, +%110) | İkisi de duvara takılıyor |
| Verim Hattı (100, +%35 üretim) | Seri Cephane Hattı ×2 (73, ×1,56) | Aynı çarpım zinciri; ikisi de yalnız cephane fabrikasında işliyor |
| İkmal Hattı (95, −%30 yakıt) | Kristal Rafinerisi (85, −%40) | Güç kristali kulelerinde (Debug Lazer, Gösteri, Taht) |
| Beşinci İşçi (170) | İşçi kiralamak (100×1,1ⁿ) | İlk beş kiralama 100–146 altın |
| Ateşleme Pimi (95) | Hassas Tetik ×2 (102, +%14 şans, ısı yok) | Kâğıt üstünde kesin değil (%20 > %14), pratikte yenik: ısı sınırında Pimi'nin ölçülen katkısı +%0,5, iki Hassas Tetik'in ~+%12 |
| İsabet eşyalarının tamamı | Mermi hızı eşyaları | Iskayı gerçekte mermi hızı azaltıyor (§2.2) |

### 5.2 Kopya ya da neredeyse kopya eşyalar

- Soğutucu Kanatlar ↔ Soğutma Sıvısı: aynı stat, iki merdiven (altın başına 1,20 ve 1,29 altın/% soğuma).
- Hafif Mühimmat ↔ Sabot Fişeği: aynı stat; Sabot kapsamlı, Hafif Mühimmat her kuleye takılıyor (mermisiz kulede boşa).
- Nişangâh ↔ Gez ve Arpacık ↔ Nişan Dürbünü ↔ Atalet Dengeleyici: aynı stat, dört fiyat noktası.
- Namlu Yatağı ↔ Bilyalı Yatak: aynı stat.
- Uzun Fitil ↔ Kalıcı İz ↔ Lanet Fitili: süre statı; üçüncüsü yalnız lanet kulesine.
- Yankı Odası ↔ Buz Çekirdeği ↔ Koni Yayıcı: aynı stat (durum gücü), farklı kapsam; üçü de oynanabilir kulelerde etkisiz.
- Delici Çekirdek / Odak Merceği / Ağır Kundak / Hat Namlusu / Işın Prizması / Yörünge Rulmanı: aynı "sınıfa göre +hasar" kalıbı; değerleri +%20 ile +%45 arasında rastgele dağılmış (Hat Namlusu +%40 / 100g, Delici Çekirdek +%20 / 90g).
- Madenci Eldiveni ↔ Vardiya Amiri; Pnömatik Anahtar ↔ Yedek Parça Sandığı; Çelik Yelek ↔ Sahra Reviri: merdiven ve tek büyük adım çiftleri (bilerek yapılmış).

### 5.3 Tuzaklar ve oynanabilir iki operatörde işlevsiz eşyalar

**Hiçbir oynanabilir kulede işe yaramayanlar:** Yörünge Rulmanı, Ek Bıçak Yuvası (yörünge kulesi yok), Lanet Fitili (lanet kulesi yok), Rezonans Odası (dalga kulesi yok), Kriyojen Hat (uyduğu İzolasyon ve Kin hasar vermiyor), Yankı Odası, Buz Çekirdeği, Koni Yayıcı (durum gücü yavaşlatmaya işlemiyor). Zırh Plakası yalnızca ortak duvara takılıyor ve yenik. Bunlar vitrinde `deadWeight` 0,15 ağırlıkla hâlâ çıkıyor.

**Negatif değerliler (ölçülen):** İnfilak Başlığı −%16, Atış Denetleyicisi −%12, Atalet Dengeleyici −%10, Lazer Telemetre −%10, Taret Motoru −%10, Hafif Taret Kabuğu −%9, Nişan Dürbünü −%8, Nişangâh −%6, Hassas Namlu −%5, Gez ve Arpacık −%4.

**Bağlama göre tuzaklar:**
- Uçaksavar Kiti, havayı zaten vuran kuleye takılırsa (Takipçi, Obsesyon, Ucube, Hiza, Gösteri, Taht, Kin) yalnızca hava hasarını yarıya indirir.
- Bitişik Devre AttackLord'da: yalnızlık pasifini kapatmak −%40…−80 demek.
- Yalnız Kurt ve Sessiz Mevzi ZentaX'ta: Hiza/Taht dizilimini bozar.
- "Her kuleye" takılan stat eşyaları (Hafif Mühimmat, Namlu Yatağı, Nişangâh, Soğutucu Kanatlar, Isı Emici, Hedef Kilidi, Uzun Fitil…) Sunucu, Saray Arşivi, Abartı, Duvar ve Tamir Merkezi'ne de takılabiliyor ve orada bir şey yapmıyor. Takma geri alınamıyor.
- Hat Namlusu ve Delici Uç Abartı'ya takılabiliyor (Abartı saldırmıyor); Delici Uç Gösteri'de ölçümde 0.
- Yarık Mermi tek başına taban %1 kritiği siliyor (−%2,4).
- Kriyostat ve Termal Kılıf soğuk namlu istiyor; ateş altındaki kule 50–60°'de oturuyor.

### 5.4 Açıklama ile kodun uyuşmadığı yerler

| Eşya | Açıklama | Kod |
|---|---|---|
| Kan Bankası | "karşılığında her dalga 5 nexus canı gider" | Bedel eşya başına değil, **oyuncu başına** bir kez (`ownerHasTowerUnlock`, MatchRoom 5403): on kuleye takılan on Kan Bankası da dalga başına toplam 5 nexus. Nexus 5 ya da altındaysa hiç alınmıyor. |
| Nexus Kalkanı | "Bu dalgadaki ilk 3 sızıntıyı engelleyen 1 kullanım" | `nexusShieldCharges` dalga sonunda sıfırlanmıyor; kullanılmayan haklar sonraki dalgalara taşınıyor. Herhangi bir oyuncunun hakkı takımın sızıntısını yutuyor. |
| Yankı Odası, Buz Çekirdeği, Koni Yayıcı | "durum etkisi gücü +%X" | Yavaşlatmanın hızı `slowFraction`tan; `statusMagnitude` yavaşlatmada okunmuyor. İzolasyon/Kin'de etki yok. İşaret ve Termal Fünye yanması da ölçeklenmiyor. |
| Ağır Metabolizma | "%25 daha zayıftır" | Aynı nedenle yavaşlatmada ceza işlemiyor; yalnızca süre artışı kalıyor. |
| Uzun Fitil (Kalıcı İz) | "bütün durum etkilerinin süresi" | Takipçi işareti (`appliesMark` uygulaması süre çarpanı almıyor), Termal Fünye yanması ve İzolasyon'un yalnızken açtığı aura süre çarpanı almıyor. |
| İsabet eşyaları (Nişangâh, Nişan Dürbünü, Gez ve Arpacık, Lazer Telemetre, Atalet Dengeleyici, Termal Kılıf, İrtifa Ölçer, Optik Hedefleyici, Hassas Namlu) | "isabeti +%X" | İsabet yalnızca ateş konisini daraltıyor; ölçülen isabet oranı artmıyor, çoğu durumda düşüyor (§2.2). Açıklamanın vaat ettiği etki (daha az ıska) oluşmuyor. |
| Delici Uç | "1 düşman daha deler; tek hedef ve hat saldıran kulelere takılır" | Gösteri'nin ışını delme sayısını kullanmıyor (ölçüm 0); Abartı hiç saldırmıyor. |
| Verim Hattı | "binanın üretim hızı +%35; economy binalarına takılır" | `resourceProduction` yalnızca cephane fabrikasında okunuyor; Enerji Reaktörü/Ocağı ve Tamir Merkezi'ne takılıyor ama etkisiz. Seri Cephane Hattı için de aynı. |
| Hedef Kilidi | "Takıldığı kule hedefini 2 saniye daha uzun korur" (her kuleye) | Yalnız nişan alan kulelerin `aimTargetLockUntil` değerine ekleniyor; diğerlerinde etkisiz. |
| Faiz Hesabı / altın primleri (kod yorumları) | Açıklamalar tavansız ve kodla uyumlu | `cards/index.ts` yorumları ("en fazla `GOLD_INTEREST_CAP`", dalga tavanları) ölü sabitleri anlatıyor; sunucu hiçbirini okumuyor. |
| AttackLord yalnızlık pasifi (eşya değil, eşya değerini belirliyor) | Bu çalışmanın tanımı: "artık yalnızca hasar ×1,5" | Kod hâlâ menzili de ×1,5 yapıyor (`getTowerOwnRange`). |

---

## 6. Sinerjiler ve karşı sinerjiler

**Sinerjiler**
- **Kritik şansı × kritik hasarı:** çarpımsal. En verimli kombo Hassas Tetik ×4 + Yarık Mermi (+%51 / 371g) ya da Şans Merceği + Yarık Mermi (+%44 / 235g). Isı istemediği için ısı sınırlı oyunda en iyi geç oyun hasar yatırımı.
- **Soğuma × ısı azaltma:** Soğutucu Kanatlar/Soğutma Sıvısı ile Isı Emici çarpar; Buhar Tahliyesi ve Dökme Radyatör üstüne eklenir. Isı kartlarıyla da aynı zincir.
- **AttackLord yalnızlığı + Sessiz Mevzi + Yalnız Kurt:** pasif zaten izole kule istiyor, iki eşya da aynı koşulu bedavaya ödüllendiriyor (+%57 ve +%23).
- **Mermi hızı + mermili kule:** Takipçi, Hiza Emri, Obsesyon ve Ucube'nin ıskası mermi hızıyla düşüyor; özellikle koşuculara karşı (+%80–130).
- **Yavaşlatmalar çarpımsal:** Buz Serpintisi + Ziftli Zemin + İzolasyon/Kin; Soğuk Av Kaydı bunların üstüne altın.
- **Altın primleri + yüksek hasarlı kule:** Artık Enerji Toplayıcı ve Savaş Tazminatı en büyük vuruşu yapan kulede (Obsesyon, Gösteri) katlanıyor; Ateş Hattı Primi ısı sınırındaki kuleye zaten uyuyor.
- **Kelle Defteri + kritik kurulumu;** Düşürme Primi + hava dalgalarında ana kule.
- **Kan Bankası çok kuleye:** bedel oyuncu başına tek olduğu için her ek kopya +%20 bedava (bkz. §5.4).
- **Obsesyon + Hedef Kilidi/Sabır Modülü** kâğıt üstünde sinerji; ölçümde ısı sınırı yüzünden zayıf.

**Karşı sinerjiler**
- Atış hızı ↔ ısı: Atış Denetleyicisi, atış hızı kartları ve seviyenin atış hızı payı ısı tavanında boşa gidiyor; ısı bedelli kritik eşyaları (Ateşleme Pimi, İnfilak Başlığı) kendi kazancını siliyor.
- Kızıl Namlu ↔ soğuma eşyaları ↔ Kriyostat/Termal Kılıf: biri sıcak, öbürü soğuk namlu istiyor.
- Bitişik Devre ↔ AttackLord pasifi; Yalnız Kurt/Sessiz Mevzi ↔ ZentaX dizilimi. Bitişik Devre ile Yalnız Kurt zaten aynı kuleye takılamıyor (`EXCLUSIVE_SHOP_ITEMS`).
- Yarık Mermi ↔ Kritik Sistem/Optik Hedefleyici: −%6 şans, düşük şanslı kurulumda kritik hasarını boşa çıkarıyor.
- Şans Merceği ↔ menzil: AttackLord'un yarıya inmiş menzilinde −%20 menzil sürüde zarar (−%2…−5).
- İsabet ↔ Mesafe Ölçer: isabetin tek gerçek getirisi Mesafe Ölçer'in kritiğe çevirmesi, ama isabet kendi başına hasar düşürüyor.
- Direnç Sökücü ↔ Zaaf Merceği: aynı aşamada ikisi birden asla değerli değil (ırk sabit).

---

## 7. Yeniden dengeleme önerileri (ilk 10)

1. **Ganimet Kesesi:** +%160 → +%30 (yüzdeli kartların yarıya inmesiyle tutarlı), fiyat 110 → 160. Bugün maçın geri kalan gelirinin 1,5 katını tek alımda veriyor.
2. **Altın Elek:** +%96 → +%15 / kopya, en fazla 2. Ganimet Kesesi ile birlikte bugün öldürme altını ×5,5'e çıkabiliyor.
3. **Artık Enerji Toplayıcı:** pay %20 → %3 ve öldürme başına tavan (ör. düşmanın taban ödülünün 1 katı) ya da `OVERKILL_GOLD_WAVE_CAP` (50) gerçekten uygulanmalı. Can dalgayla katlandığı için prim de katlanıyor; Obsesyon'da öldürme başına 100+ altın.
4. **Savaş Tazminatı:** "her 1000 hasar" eşiği dalganın can çarpanıyla ölçeklenmeli (`1000 × getWaveHpMultiplier`) ya da `DAMAGE_GOLD_WAVE_CAP` (60) uygulanmalı. Bugün hasar başına 0,04 altın, öldürme altınının ~3 katı.
5. **Darphane Modülü:** +160 → +40, sınır bina başına değil **oyuncu başına** 3. Bugün her yeni ekonomi binası ilk kopyayı taban fiyattan açıyor.
6. **Ödül Fermanı ve Sigorta Poliçesi:** +600 → +150 (tavan sabitiyle aynı) ve +360 → +90. İkisi de ilk dalgada kendini 4–5 kez ödüyor.
7. **İsabet mekaniği:** isabet ateş konisini değil öncülü düzeltmeli (hedefin hızına göre nişan) ya da isabet eşyaları mermi hızı/öncül eşyasına dönüştürülmeli. Bugün 9 eşya (Nişangâh, Gez ve Arpacık, Nişan Dürbünü, Lazer Telemetre, Atalet Dengeleyici, Termal Kılıf, İrtifa Ölçer, Optik Hedefleyici'nin ve Hassas Namlu'nun isabet payı) negatif ya da sıfır.
8. **Isı bedelli eşyalar:** Atış Denetleyicisi "atış hızı +%25, ısı +%20" → "atış hızı +%20, soğuma +%20"; Ateşleme Pimi ve İnfilak Başlığı'ndan ısı bedeli kalkmalı ya da Taret Motoru gibi yarıya inmeli. Daha kökten: taban soğuma (3°/sn) ya da atış ısısı gözden geçirilmeli; bugün kule seviyesinin atış hızı payı da ısı tavanında boşa gidiyor.
9. **Mermi hızı kümesi pahalanmalı:** Sessiz Mevzi 70 → 120, Manyetik Ray 90 → 130, Hafif Çekirdek 150 → 180. Fiyat başına en güçlü savaş eşyaları; madde 7 yapılırsa değerleri de düşer, o zaman fiyat dokunuşu gerekmeyebilir.
10. **Oynanabilir operatörde ölü eşyalar:** Yörünge Rulmanı, Ek Bıçak Yuvası, Lanet Fitili, Rezonans Odası ve Kriyojen Hat oynanabilir kadro genişleyene kadar vitrinden çıkarılmalı (ölü ağırlık 0,15 değil 0). `statusMagnitude` yavaşlatma kesrini de ölçeklemeli (ya da Yankı Odası, Buz Çekirdeği ve Koni Yayıcı "yavaşlatma gücü" olarak yeniden yazılmalı). Kan Bankası bedeli eşya başına olmalı.

Ek, küçük düzeltmeler: Namlu Yatağı ve Zırh Plakası fiyatı ya düşmeli ya da etki büyümeli (yeniklikten çıksınlar). "Her kuleye" takılan stat eşyaları kapsamlı olmalı (mermi hızı → `projectiles`, dönüş → `aims`, soğuma ve ısı → ateş eden kuleler). Nexus Kalkanı açıklaması kalıcı haklara göre düzeltilmeli. AttackLord yalnızlık pasifinin menzili de ×1,5 yapması bilinçli değilse ayrılmalı.

---

## 8. Varsayımlar ve sınırlar

- Ölçümler tek kule ve tek akış üzerinde. Takım etkileri (yavaşlatma, işaret, Sunucu bağı, Zeynep dizilimi) analitik.
- Referans "orta-oyun" yükü bir varsayım. Başka kart setlerinde hasar havuzu doluysa hasar eşyalarının göreli değeri düşer, kritik ve ısı eşyalarınınki büyük ölçüde korunur (ayrı havuzlar).
- Ekonomi ROI'si altının harcanabildiğini varsayıyor. Kule kontenjanı (20) ve tecrübe seviye bedelini sınırladığı için çok geç oyunda altının marjinal değeri düşer; S kademesindeki ekonomi eşyaları yine de açık ara önde.
- Dirençler testte sıfır; tür bonusu eşyaları (Ağır Avcısı vb.) ve ırk eşyaları analitik.
- Lojistik eşyaları sonsuz kaynakla ölçülmedi; tavan kuruluş karşılaştırmasındaki bekleme payından.
- Taht Mührü, Kin Kulesi, İzolasyon Kulesi, Saray Arşivi ve Abartı'nın eşya değerleri analitik.

## Yeniden tasarım (2026-10-15)

Denetimin bulgularına göre tuzak eşyalar yeniden tasarlandı, ısı bedelleri yarıya indi ve ısı/atış hızı için yeni içerik eklendi. Testler: `tests/heat-aim-redesign.test.mjs`.

### Yeniden tasarlanan eşyalar

| Eşya | Yeni rol |
|---|---|
| Nişan Dürbünü, Nişangâh, Gez ve Arpacık, Hassas Namlu | Isabet ailesi: ateş konisini daraltmıyor (ceza yok); hedefin gideceği yere önceden nişan alıyor (merminin uçuş süresiyle hedefin yürüyüşünün kesişimi) |
| Hafif Taret Kabuğu, Atalet Dengeleyici | Koşucu ve uçan hedefe fazla hasar; piyadeye değil |
| Taret Motoru | Hedef değiştirdikten sonraki ilk mermiye hasar ekler, aynı hedefe ikinciye eklemez |
| İnfilak Başlığı | Kritik vuruş çevreye patlar; kritiksiz vuruş patlamaz |
| Lazer Telemetre | Menzilin dış yarısındaki hedefe kritik şansı ekler |
| Ek Bıçak Yuvası | Debug Lazer vuruşunu en yakın komşuya sıçratır |
| Kriyojen Hat, Lanet Fitili | Kontrol kulesinin yavaşlattığı düşmana biner; oynanabilir kontrol kulelerine takılır |
| Yörünge Rulmanı | Nişan alan kuleye takılır |
| Atış Denetleyicisi | Isı cezası kalktı (ölçüm: −%12 → +%29) |

### Yeni soğutma ve atış hızı içeriği

Ölçüm: tek kule (Takipçi), tükenmeyen hedefe 120 sn sürekli ateş, ikinci yarının saniye başı hasarı; mühimmat ve enerji dolu, tek sınır ısı. Taban: 483.

| Eşya | Mekanik | Sürekli hasar | Fark |
|---|---|---|---|
| Peltier Plakası | Çarpanlardan sonra düz derece soğutma | 663 | +%37 |
| Fren Soğutucusu | Yalnızca ısı freni devredeyken soğuma | 703 | +%46 |
| Emniyet Ventili | 70 dereceyi aşan atışta dereceyi atar; bekleme süresi var | 685 | +%42 |
| Senkron Tetik | Atış hızı artar, atış ısısı düşer | 591 | +%23 |
| Isıl Eşik Rölesi | Atış hızı yalnız 50 derecenin altında; ısı indirimi her zaman | 580 | +%20 |
| Takip Ritmi | Aynı hedefe art arda atışta hız ve ısı indirimi biriktirir | 697 | +%44 |
| Rejeneratif Fren | Isı freninin kestiği atış hızını hasara çevirir | 783 | +%62 |
| Termal Şok Halkası | 80 dereceyi geçen atışta dalga ve tahliye | 812 | +%68 |
| Kriyo Şok Kartuşu | Öldürmeden sonra kısa süre soğumayı büyütür | ölçülmedi (öldürme gerekir) | |
| Isı Köprüsü | Isıyı bitişik daha soğuk kuleye aktarır | ölçülmedi (komşu gerekir) | |

Kart ve eşya mekanikleri: Yeniden Ateşleme Bobini, Isı Dönüştürücü, Aşırı Hız, Soğuk Salvo, Termodinamik Denge. Bunlar kart olduğu için tek kule ölçümüne girmedi; her birinin mekanik testi var. Isı bedeli taşıyan kart ve eşyaların ısı cezası yarıya indi (test: "isi bedeli olan kart ve esyalarin isi cezasi yariya indi").

Kademe: yukarıdaki yeni ısı/hız eşyaları değere göre B–A aralığında; Rejeneratif Fren ve Termal Şok Halkası A'nın üstünde, fiyatları gözden geçirilmeli.

## Üçüncü tur ve efsanevi eşyalar (2026-10-15)

Ölçüm: tek kule (seviye 5), menzilinde duran 6 düşmanlık küme (ölen yerine 0,4 sn sonra yenisi), düşman canı kulenin sürekli (ısı sınırlı) saniyelik hasarının 15 katı, 180 sn, 6 tohum; mühimmat ve enerji dolu. Fark tabana göre toplam hasar. Küçük örnek (kosu basına 4–5 öldürme) ve tetik sonrası dağılan hedef seçimi yüzünden **±%20 gürültü** var; sayılar kademe için kaba yön, kesin değer değil. Testler: `tests/fire-rate-cooling-third-round.test.mjs`, `tests/legendary-effects.test.mjs`.

| Eşya | Fiyat | Mekanik | Takipçi | Obsesyon | Kademe |
|---|---|---|---|---|---|
| Kalabalık Besleyici | 115 | Menzildeki her düşman için atış hızı +%6 (en fazla 8) | +%1 | +%7 | C (ısı sınırlı kulede atış hızı tavana çarpar; kalabalıkta ve soğutma eşyasıyla değerli) |
| Acil Soğutma Pompası | 90 | Isı kilidindeyken soğuma +%200 | 0 | 0 | C (yalnızca kilide giren kulede: Termal Kütle, Kızgın Namlu, sabit aralık) |
| Kriyo Kovan | 95 | Yavaşlamış / donmuş hedefe atış ısısı −%50 | 0 | 0 | B koşullu (yavaşlatma kuran takımda; ölçümde yavaşlatma yok) |
| Şimşek Bobini (efsanevi) | 460 | Saniyede %35: sıradaki vuruş 3 düşmana sıçrar, her biri 0,65 kule saniyesi | −%18 | +%38 | A |
| Patlayıcı Çekirdek (efsanevi) | 480 | Saniyede %35: 1,6 kare patlama, 1 kule saniyesi | +%38 | +%64 | A |
| Durağan Bobin (efsanevi) | 380 | Saniyede %35: 0,4 sn donma (şampiyon 0,15), 3 sn bağışıklık | 0 | 0 | B (hasar değil kontrol; sızıntıyı geciktirir) |
| Cellat Modülü (efsanevi) | 440 | Saniyede %35: %15 canın altında infaz; brute, şampiyon, avcı bağışık | +%25 | +%3 | B |
| Kırılma Çekirdeği (efsanevi) | 420 | Saniyede %35: 3 sn çatlak, ölünce azami canın %14'ü şarapnel, zincirli | −%20 | −%3 | A (sürüde) |
| Kronal Kapasitör (efsanevi) | 460 | Saniyede %35: 3 sn iz, alınan hasarın %30'u geri | +%3 | +%39 | B (odak ateşi ve co-op'ta büyür) |
| Bağ Vericisi (efsanevi) | 440 | Saniyede %35: 4 sn bağ, hasarın %35'i ortağa | −%14 | −%15 | A |
| Graviton Çekirdeği (efsanevi) | 400 | Saniyede %35: 2 sn çekim, 2,5 kare | −%20 | +%29 | B (alan kulesiyle A) |

İkinci ayar (2026-10-15): ihtimaller %10 / %20 / %30'dan %20 / %35 / %50'ye çıktı, büyüklükler indi (zincir 1→0,65, patlama 1,5→1, donma 0,5→0,4 sn, parçalanma %20→%14, iz %40→%30, bağ %50→%35); infaz Atakan'ın infaz bağışıklığına uyuyor. Tablodaki sayılar ikinci ayarla; ilk ayarla aynı ölçüm: zincir +%28 / +%20, patlama +%104 / +%22, infaz +%23 / +%3, parçalanma −%8 / +%38, iz +%4 / +%1, bağ −%20 / +%71, çekim +%5 / +%67. Tetik sıklığı dakikada ~1–2,5'ten ~1,5–3,5'e çıktı: bu kümede düşman çoğu zaman kurulu hak uygulanmadan ölüyor. Gürültü (±%25) etki başına farkı yer yer aşıyor; ölçüm yön gösteriyor, ayar için çok kulelik gerçek dalga ölçümü gerekir.

Kartlar (efsanevi kartlar her hasar veren kuleye saniyede %20): Av Ritmi (+%1 / +%6), Rölanti Soğutması (+%15 / +%7), Kritik Tahliye (0: kritik şansı olmayan taban kulede). Karşılaştırma: Soğutma Sıvısı +%14 / +%5, Senkron Tetik +%34 / +%11, Kritik Sistem +%12 / +%10.

Notlar: efsanevi etkilerin hasar ölçüsü "kule saniyesi" ısının izin verdiği sürekli hızdan (tanımlı hızdan değil); ilk ölçümde tanımlı hız kullanılıyordu ve patlama ile zincir +%170–260 veriyordu, düzeltildi. Hiçbiri tek başına koşuyu kıracak büyüklükte değil; en güçlüleri (patlama, bağ, parçalanma, çekim) alan ve kalabalık kurulumunda. Simülatör puanları `tools/sim/scoring.mjs` ve `quick.mjs`'te.

## Menzil turu (2026-10-15)

Üç eşya, üç kart; sabitler `packages/shared/src/range-mechanics`, testler `tests/range-round.test.mjs`. Tek kule ölçümüne **girmedi** (o ölçümde düşmanlar menzilde duruyor, menzil farkı görünmüyor); kademe mekanikten ve fiyattan kaba tahmin. Koşullu menzil payları (kart ve eşya) toplamda en fazla +%35.

| Eşya | Fiyat | Mekanik | Kademe |
|---|---|---|---|
| Teleskopik Namlu | 95 | Taban menzile +0,25 kare (1 karede +%25, 2,5 karede +%10); seviyeyle büyümez | B (kısa menzilli AttackLord kulelerinde A'ya yakın; uzun menzilde Lazer Telemetre'nin altında) |
| Atış Haritası | 85 | Dalgadaki her öldürme +%3 menzil, en fazla 5 (+%15); yeni dalgada sıfır | C (dalga başında boş; son vuruşu alan kulede değerli) |
| Gözcü Direği | 110 | Bitişikteki her dost kuleye +%10 menzil; kule başına en fazla +%20 | B (kümede 3–4 kuleye birden; AttackLord'un yalnızlığıyla çelişir) |

Kartlar: Kenetlenme (seyrek; aynı hedefe her sn +%5, en fazla +%20), Termal Mercek (nadir; 50→100 derece 0→+%20), Siper Gözcüsü (yaygın; kenardaki her duvar +%5, en fazla 3). Karşılaştırma: Uzun Namlu (mermi kuleleri +%10 menzil + isabet), Yalnız Nişancı (komşusuz +%15 menzil + %25 hasar).

### Menzil turu, ikinci kısım (2026-10-16)

Tek kule ölçümüne girmedi (menzil farkı o kümede görünmüyor); kademe mekanikten ve fiyattan kaba tahmin. Testler: `tests/range-round-two.test.mjs`.

| Eşya | Fiyat | Mekanik | Kademe |
|---|---|---|---|
| Av Kayıt Defteri | 130 | Menzil −%5; dalgadaki her öldürme +%1,5, en fazla 16 (+%24); Atış Haritası ile aynı kuleye takılmaz | C (dalga başında eksi; uzun dalgada ve son vuruşu alan kulede B) |
| Erim Pompası | 100 | Menzil +%8; menzil bonusunun her %10'u mermi hızına +%15, en fazla +%60; Kinetik Uzatıcı ile takılmaz | C (tek başına +%12 mermi hızı; menzil yığan kurulumda B) |
| Kinetik Uzatıcı | 110 | Mermi hızı +%25; mermi hızı bonusunun her %10'u menzile +%3, en fazla +%15 | B (Genleşme Odası / Gauss Bobini ile tavana çıkar) |
| Tork Radyatörü | 90 | Dönüş hızı +%20; dönüş hızı bonusunun her %10'u soğumaya +%6, en fazla +%30 | B (dönüş eşyası yığan nişancıda; ısı sınırlı kulede soğuma = atış hızı) |
| Uzatma Halkası | 45 (×1,3) | Menzil +%6, 3 kez | C (ucuz dolgu; üçü ~150 g'a +%18) |
| Uzun Erim Optiği | 120 | Menzil +%18, atış hızı −%8 | B (menzil sınırlı haritada; ısı sınırlı kulede atış hızı cezası yarı hissedilir) |

Kartlar: Geniş Ufuk (yaygın, 2 kez; tüm kuleler +%8), Pusu Nöbeti (seyrek; 3 sn vurmayan hasar kulesi +%20, ilk vuruştan sonra 2 sn).

## Dayanıklılık turu (2026-10-17)

Üç eşya, üç kart; sabitler `packages/shared/src/durability-mechanics`, testler `tests/durability-round.test.mjs`. Tek kule hasar ölçümüne **girmez** (can ve zırh); kademe "etkin can" kaba tahmini ve fiyattan. Simülatör puanı can ölçeğinde (+%100 can = 1): Çelik Döküm 0,55 / 50 g, Tampon Katman 0,80 / 110 g, Zırh Plakası 0,80 / 95 g.

| Eşya | Fiyat | Mekanik | Puan | Kademe |
|---|---|---|---|---|
| Yük Dağıtıcı Kiriş | 110 | Bitişikteki dost yapıların hasarının %35'i kirişe, zırhsız; vuruş başına bir kiriş | 0,35 | B (yüksek canlı duvar ya da kalın kule ile kırılgan kuleyi korur; tek başına bir şey yapmaz) |
| Öz Onarım Çekirdeği | 120 | 4 sn hasarsız yapı saniyede azami canın %3'ü; yalnızca dalgada | 0,45 | B (dalgalı baskıda, arka hattaki yapıda; sürekli vurulan ön duvarda C) |
| Perçinli Kaplama | 75 | Zırh +4 (3 → 7) | 0,24 | B erken ve kalabalık dalgada (piyade vuruşu −%44), kuşatma ve geç dalgada C |

Kartlar: Sertleşen Gövde (seyrek; dalga sonu ayakta +%8 azami can, en fazla 8 dalga), İnatçı Siper (yaygın; can %50 altında %40 az hasar), Son Nefes (nadir; dalga başına yapı başına öldürücü vuruşta 1 can + 3 sn hasarsız). Puanlar 0,32 / 0,32 / 0,21; karşılaştırma Kalın Zırh 0,80, Takviyeli Temel 0,38. Düz can kartlarından düşük puan bilerek: üçü de koşula bağlı ve bedelsiz (Takviyeli Temel menzil öder).
