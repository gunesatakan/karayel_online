# Kuruluş karşılaştırması

Gerçek `MatchRoom`, tam aşama (20 dalga), aynı bot (`tools/sim/`, politika `standard`). Her hücre 20 tohumun ortalamasıdır; kuruluşlar aynı tohumlarla (aynı harita, yasak bölgeler, kaynak düğümleri, dalga paternleri) eşleşiktir. Irk zaafı/direnci (±%40), Debug Lazer dahil bütün kuleler, işçi/mermi/enerji lojistiği, özel düşmanlar, karşı ataklar ve ırk mekanikleri oyunun kendisinden gelir; hiçbir şey sıfırlanmaz ya da yapay olarak doldurulmaz.

Oluşturma: `node tools/compare-builds.mjs --seeds 20 --stages 1,3,5` (2026-10-14, 960 maç, 7.2 dk, 15 iş parçacığı). Ölçülen oyun kodu: commit `ffdba16` (çalışma ağacında o sırada başka bir çalışmanın yarım kalmış değişiklikleri vardı; ölçüm onların dışında, `git archive HEAD` ile derlenen kopyada yapıldı). Koşu başına özet: `build-comparison-results.json`. Yöntem ve doğrulama: `docs/simulator.md`.

Hücre: **ulaşılan ortalama dalga (medyan) · zafer oranı**; ⏸ = donmuş düşman yüzünden kesilen koşu sayısı (aşağıya bakın). Ulaşılan dalga, temizlenen son dalgadır (0–20).

| Operatör | Kuruluş | Kuleler | Aşama 1 | Aşama 3 | Aşama 5 | En çok hasar (aşama 1) |
|---|---|---|---:|---:|---:|---|
| Atakan | laser-takipci | warrior-5×2 + warrior-1×1 | 8.3 (8) · %0 | 2.5 (2) · %0 | 2.5 (2) · %0 | warrior-1 %51 |
| Atakan | laser | warrior-5×1 | 6.8 (7) · %0 · 1⏸ | 2.5 (3) · %0 | 2.5 (2) · %0 | warrior-5 %61 |
| Atakan | takipci | warrior-1×1 | 8.0 (8) · %0 | 1.7 (1) · %0 | 1.0 (1) · %0 | warrior-1 %100 |
| Atakan | laser-obsession | warrior-5×1 + warrior-4×1 | 4.9 (5) · %0 | 2.4 (2) · %0 | 2.6 (2) · %0 | warrior-5 %67 |
| Atakan | isolation-laser | warrior-5×2 + warrior-3×1 | 5.5 (6) · %0 · 1⏸ | 1.4 (1) · %0 | 1.9 (2) · %0 | warrior-5 %66 |
| Atakan | obsession | warrior-4×1 | 3.9 (4) · %0 | 2.3 (2) · %0 | 2.6 (2) · %0 | warrior-4 %100 |
| Atakan | server-obsession | warrior-4×2 + warrior-2×1 | 2.4 (2) · %0 | 1.3 (1) · %0 | 1.7 (2) · %0 | warrior-4 %100 |
| Atakan | ucube | warrior-6×1 + warrior-1×1 | 3.0 (3) · %0 | 1.0 (1) · %0 | 1.0 (1) · %0 | warrior-1 %86 |
| Zeynep | hiza | zeynep-1×1 | 11.9 (13) · %0 | 5.2 (7) · %0 · 1⏸ | 1.3 (1) · %0 | zeynep-1 %100 |
| Zeynep | abarti-hiza | zeynep-1×3 + zeynep-8×1 | 11.8 (12) · %0 | 5.0 (6) · %0 · 1⏸ | 1.3 (1) · %0 | zeynep-1 %100 |
| Zeynep | hiza-gosteri | zeynep-1×2 + zeynep-2×1 | 9.6 (11) · %0 · 3⏸ | 4.8 (5) · %0 | 1.8 (2) · %0 | zeynep-1 %94 |
| Zeynep | hiza-taht | zeynep-1×2 + zeynep-3×1 | 9.9 (11) · %0 | 4.0 (5) · %0 | 1.4 (1) · %0 | zeynep-1 %98 |
| Zeynep | balanced | zeynep-1×2 + zeynep-2×1 + zeynep-3×1 | 8.9 (10) · %0 | 2.5 (2) · %0 | 1.2 (1) · %0 | zeynep-1 %93 |
| Zeynep | kin-hiza | zeynep-1×2 + zeynep-6×1 | 8.8 (10) · %0 · 1⏸ | 1.6 (1) · %0 | 1.0 (1) · %0 | zeynep-1 %100 |
| Zeynep | archive-hiza | zeynep-1×3 + zeynep-7×1 | 6.0 (7) · %0 | 1.6 (2) · %0 | 1.0 (1) · %0 | zeynep-1 %100 |
| Zeynep | gosteri | zeynep-2×1 | 3.0 (3) · %0 | 1.5 (2) · %0 | 1.4 (1) · %0 | zeynep-2 %100 |

**Okuma:**

- Bu bot için en güçlüsü Zeynep'in Hiza Emri çekirdeği (aşama 1'de 11,9, aşama 3'te 5,2 dalga). Atakan'da en iyisi Takipçi'li karışımlar (8,0–8,3); saf Obsesyon, Sunucu ve Ucube kuruluşları ilk dalgalarda düşüyor.
- **Debug Lazer gerçek lojistikle baskın değil.** Aşama 1'de hasarın %61–67'sini lazer veriyor, ama atışta ~8,5 enerji/sn yakması yüzünden saf lazer (6,8) ve lazer + İzolasyon (5,5) Takipçi'li karışımın (8,3) gerisinde kalıyor. Lojistik serbest bırakılınca (güvensiz bayrak, yalnızca karşılaştırma için) aynı bot Atakan'la ortalama 7,9 yerine 11,4 dalgaya çıkıyor; lazerin gücü enerji zincirine bağlı.
- **Irk etkisi görünüyor.** Aşama 5'te (fiziksel −%40) fiziksel kuruluşlar (Takipçi, Hiza) ilk dalgada düşüyor; psişik Obsesyon ve ateş lazeri 2–3 dalgaya kadar dayanıyor. Aşama 3'te lazerli kuruluşlar (2,5) saf Takipçi'den (1,7) uzun dayanıyor; Ucube ve Sunucu tutmuyor.
- Hiçbir kuruluş bu botla bir aşamayı bitiremiyor (zafer %0). Aşama 3 ve 5'in ilk dalgaları (kalabalık sürü, özel düşmanlar, ırk mekanikleri) botun açılışını aşıyor. Bu tablo bir zorluk hedefi değil, aynı oyuncu altında kuruluşların sırası.

Aşama ırkları: 1: Golem (fiziksel +%40, hücresel -%40); 3: Uzay Böceği (hücresel +%40, ateş -%40); 5: Dördüncü Boyut (psişik +%40, fiziksel -%40). Atakan'ın hasar türleri: Takipçi fiziksel, Obsesyon psişik, Debug Lazer ateş, Ucube/Sunucu elektrik; Zeynep: Hiza fiziksel, Gösteri ışık.

## Bot sınırları (sonuçları okurken)

- Bu bir **sezgisel bot**dur, usta oyuncu değildir. Mutlak dalga sayıları iyi bir oyuncunun ulaşacağının altında kalır; tablo kuruluşları **aynı bot** altında karşılaştırır. Sıralama bot kararlarına (yerleşim, işçi sayısı, harcama sırası) duyarlıdır.
- Yerleşim tek kalıp: harita ortasına yakın tam genişlikte duvar hattı, uçanların indiği köşeye yakın tek kareli geçit ve geçitten nexus'a inen koridor; kuleler koridorun iki yanına. Labirent/kıvrım kurmaz, duvarı kalınlaştırmaz.
- Karışımda havayı vurabilen kule yoksa (Atakan'da Debug Lazer, İzolasyon ve Sunucu havayı vuramaz: `laser`, `isolation-laser`) bot 3. dalgadan sonra iki Takipçi ekler (hava koruması); "Kuleler" sütunu bu korumayı göstermez. 5. ve 10. dalga tamamen, 15. ve 20. dalga yarı yarıya uçandır.
- İşçi sayısı kulelerin tahmini enerji/mermi ihtiyacından ve geçen dalganın kıtlığından; işçi gelişim ağacı (XP) ve işçi uzmanlık seçimleri kullanılmaz. Yerleştirmeli eşyalar (Bariyer, Ziftli Zemin) ve Riskli Yatırım alınmaz.
- Kartlar ve eşyalar kaba bir puanla (açgözlü) seçilir; tutarlı ama en iyi değil. Ultiler şarj dolunca kullanılır; ulti gücü yükseltilmez.
- ⏸ (stalled): kör gezinmenin döngü tespiti, takip ettiği yapı yıkılınca açık alanda "kır" kararı verip kıracak komşu yapı bulamıyor ve düşman o karede donuyor. Bot 20 sn kımıldamayan düşmanın yanına kule kurarak bunu çoğunlukla çözer; çözemediği koşu dalga 6 dakikayı aşınca kesilir ve kesildiği dalganın bir eksiği "ulaşılan dalga" sayılır.
