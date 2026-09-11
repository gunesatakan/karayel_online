# İşçi uzmanlık ağacı

İşçi satın alma akışı tek tip işçi → hücrenin ne iş yapacağını seçme şeklindedir. Bu seçim yalnızca satın alınan hücreyi belirler: Kristal Toplayıcı, Enerji Taşıyıcı, Mühimmat Toplayıcı, Mühimmat Taşıyıcı veya Tamirci.

İşçi gelişim ağacı satın alma ekranından ayrıdır. Oyuncu ağacı XP ile açar; üç kademenin her birinde iki seçenekten yalnızca biri seçilir. Seçilen ilerleme oyuncunun ortak ağacına yazılır ve o uzmanlıktaki bütün işçi hücrelerine uygulanır. Seçimler geri alınamaz. XP bedelleri 120, 280 ve 560'tır.

Enerji taşıyıcının mevcut altı yeteneğine ek olarak diğer dört rol de üç ikili kademeye sahiptir. Seçimler işçi verimliliğini artırmaz; teslimatın kule, fabrika, reaktör, düşman akışı veya kriz durumunu nasıl değiştirdiğini belirler. Katalog ve açıklamalar `packages/shared/src/worker-skills.ts` içindedir.

## Olay sözleşmesi

- Kristal Toplayıcı: reaktör teslimatı, reaktör dolması/boşalması, düğümden ilk toplama ve dalga geçişi.
- Mühimmat Toplayıcı: hammadde teslimatı, fabrika enerjisinin bitmesi, ağır düşman ölümü, fabrika hasarı ve dalga geçişi.
- Mühimmat Taşıyıcı: kule teslimatı, boş şarjör, art arda teslimat, dolu hedef, işçi ölümü ve düşük can.
- Tamirci: tamir başlangıcı, tamir sürmesi, tamir tamamlanması, ölümcül yapı hasarı ve nexus can eşiği.

Her aktif durumun süresi, yükü veya dalga sınırı vardır. Sunucu bunları uygular; istemci "İşçi Ağacı" çekmecesinde XP bedelini, seçili hücreyi ve etkisini gösterir.
