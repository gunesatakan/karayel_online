# İşçi uzmanlık ağacı

İşçi satın alma akışı artık tek tip işçi → uzmanlık seçimi → üç kalıcı kademe şeklindedir. Uzmanlık seçimi beş rolden birini belirler: Kristal Toplayıcı, Enerji Taşıyıcı, Mühimmat Toplayıcı, Mühimmat Taşıyıcı veya Tamirci. Her kademede iki seçenekten biri alınır; seçim sunucuda tutulur ve geri alınamaz.

Enerji taşıyıcının mevcut altı yeteneğine ek olarak diğer dört rol de üç ikili kademeye sahiptir. Seçimler işçi verimliliğini artırmaz; teslimatın kule, fabrika, reaktör, düşman akışı veya kriz durumunu nasıl değiştirdiğini belirler. Katalog ve açıklamalar `packages/shared/src/worker-skills.ts` içindedir.

## Olay sözleşmesi

- Kristal Toplayıcı: reaktör teslimatı, reaktör dolması/boşalması, düğümden ilk toplama ve dalga geçişi.
- Mühimmat Toplayıcı: hammadde teslimatı, fabrika enerjisinin bitmesi, ağır düşman ölümü, fabrika hasarı ve dalga geçişi.
- Mühimmat Taşıyıcı: kule teslimatı, boş şarjör, art arda teslimat, dolu hedef, işçi ölümü ve düşük can.
- Tamirci: tamir başlangıcı, tamir sürmesi, tamir tamamlanması, ölümcül yapı hasarı ve nexus can eşiği.

Her aktif durumun süresi, yükü veya dalga sınırı vardır. Sunucu bunları uygular; istemci seçim penceresinde tetikleyici ve sonucu gösterir.
