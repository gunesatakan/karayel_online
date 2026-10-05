# İşçi uzmanlık ağacı

İşçi satın alma akışı tek tip işçi → hücrenin ne iş yapacağını seçme şeklindedir. Bu seçim yalnızca satın alınan hücreyi belirler: Kristal Toplayıcı, Enerji Taşıyıcı, Mühimmat Toplayıcı, Mühimmat Taşıyıcı veya Tamirci.

İşçi gelişim ağacı satın alma ekranından ayrıdır. Oyuncu ağacı XP ile açar. Seçilen ilerleme oyuncunun ortak ağacına yazılır ve o uzmanlıktaki bütün işçilere uygulanır. Seçimler geri alınamaz. Katalog, açıklamalar ve sayılar `packages/shared/src/worker-skills.ts` içindedir.

## Yapı

Her rolün 9 hücresi vardır ve her hücrede iki seçenek bulunur. Hücreler sırayla açılır; her hücreden yalnızca bir seçenek alınır. Her üçlü sıra aynı düzendedir:

| Hücre | Görev |
|---|---|
| 1, 4, 7 | **Yön seçimi.** İki seçenek farklı bir oyun planına hizmet eder. |
| 2, 5, 8 | **Derinleştirme.** Üstteki yönün güçlüsüdür; yalnızca o yön seçildiyse açılır (A seçen A+, B seçen B+). |
| 3, 6, 9 | **Oyun değiştirici.** Eski üç ikili kademe (`WORKER_SKILL_TIERS`). |

XP bedelleri hücre sırasıyla 60, 90, 120, 160, 220, 280, 380, 470 ve 560'tır; bir rolün tamamı 2340 XP. Oyun değiştiricilerin eski bedelleri (120, 280, 560) korunur. XP kule seviyeleriyle ortak olduğu için her dal bir kule seviyesinden vazgeçmek demektir.

## Keşif ilkesi

Seçenekler hiçbir kuleye, karaktere ya da kule tipine açıkça bağlanmaz: ne açıklama metninde ne arayüzde ne de kodda kule tipi filtresi vardır. Etkiler evrenseldir ("teslim alan kulenin ısısını 12° düşürür"). Hangi seçimin hangi planla iyi gittiğini oyuncu, kulelerinin neyde tıkandığına bakarak kendisi bulur. Örneğin vuruş başına enerji yakan bir kule enerji indiriminden, ısıda tıkanan bir kule soğutmadan çok kazanır. `tests/worker-development-tree.test.mjs` hiçbir seçenek metninin bir kule ya da karakter adı anmadığını denetler.

Seçimler işçi verimliliğini (kapasite, hız) artırmaz; teslimatın kule, fabrika, reaktör, düşman akışı veya kriz durumunu nasıl değiştirdiğini belirler.

## Olay sözleşmesi

- Enerji Taşıyıcı: kule teslimatı (yön seçimleri teslim alan kuleye işler).
- Kristal Toplayıcı: reaktör teslimatı, reaktör dolması/boşalması, düğümden ilk toplama ve dalga geçişi (yön seçimleri sahibin kulelerine işler).
- Mühimmat Toplayıcı: hammadde teslimatı, fabrika enerjisinin bitmesi, ağır düşman ölümü, fabrika hasarı ve dalga geçişi. Yön seçimleri fabrikadan çıkan partiyle, mühimmat teslim alan kuleye işler; bunun için sahada canlı bir mühimmat toplayıcı olmalıdır.
- Mühimmat Taşıyıcı: kule teslimatı, boş şarjör, art arda teslimat, dolu hedef, işçi ölümü ve düşük can.
- Tamirci: tamir başlangıcı, tamir sürmesi, tamir tamamlanması (yön seçimleri onarımı biten kuleye işler), ölümcül yapı hasarı ve nexus can eşiği.

Her aktif durumun süresi, atış sayısı veya dalga sınırı vardır; aynı etki üst üste gelirse toplanmaz, en güçlü değer ve en uzun süre kalır. Sunucu bunları uygular. İstemci "İşçi Ağacı" çekmecesinde seçeneğe dokununca açıklamasını, bedelini ve durumunu gösterir; seçim ayrıntıdaki "Aç" düğmesiyle yapılır.
