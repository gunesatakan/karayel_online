# Kuruluş karşılaştırması

Aynı altın ve deneyim bütçesi; kurulum, yükseltme ve iki ek taşıyıcı bedelleri dahildir. Harcanmayan bütçe ayrıca gösterilir. Gerçek MatchRoom 50 ms adımlarla, üç sabit tohumla çalışır. Süreler duvar saati eşdeğeridir; bekleme ve aura süreleri oyun saatidir.

Bu bir sabit kuruluş kıyaslamasıdır; en iyi yerleşim araması, insan oyun testi veya bütün kart/eşya kombinasyonlarının denge kanıtı değildir. Sunucu tarifinde Sunucu, tehdit türü hakkında kademelere göre 0 / 40 / 160 öldürmelik bilgiyle başlar (seviye 1'de +%0 / +%20 / +%50). Tehditler kontrollü test profilleridir; sonuçlar doğal dalga zorluğu puanı değildir.

| Bütçe | Tehdit | Kuruluş | Harcanan | Kalan | Hasar | Nexus kaybı | Süre (sn) | Kaynak bekleme (kule·sn) | Hasar/altın |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 850 | swarm | obsession | 844.0 | 6.0 | 1706.7 | 85.3 | 50.4 | 0.4 | 2.0 |
| 850 | swarm | hiza | 742.0 | 108.0 | 1573.3 | 89.3 | 48.4* | 0.0 | 2.1 |
| 850 | swarm | server | 776.0 | 74.0 | 773.3 | 100.0 | 38.8* | 0.0 | 1.0 |
| 850 | swarm | ucube | 782.0 | 68.0 | 568.5 | 100.0 | 32.0* | 0.0 | 0.7 |
| 850 | swarm | control | 744.0 | 106.0 | 960.0 | 100.0 | 41.6* | 27.3 | 1.3 |
| 850 | armored | obsession | 844.0 | 6.0 | 3887.6 | 100.0 | 40.0* | 0.0 | 4.6 |
| 850 | armored | hiza | 742.0 | 108.0 | 4834.7 | 100.0 | 39.2* | 0.0 | 6.5 |
| 850 | armored | server | 776.0 | 74.0 | 2402.8 | 100.0 | 36.8* | 0.0 | 3.1 |
| 850 | armored | ucube | 782.0 | 68.0 | 352.9 | 100.0 | 32.4* | 0.0 | 0.5 |
| 850 | armored | control | 744.0 | 106.0 | 1503.7 | 100.0 | 35.1* | 19.0 | 2.0 |
| 850 | runners | obsession | 844.0 | 6.0 | 1066.7 | 93.3 | 33.4* | 0.0 | 1.3 |
| 850 | runners | hiza | 742.0 | 108.0 | 1233.3 | 92.0 | 33.7* | 0.0 | 1.7 |
| 850 | runners | server | 776.0 | 74.0 | 700.0 | 100.0 | 30.2* | 0.0 | 0.9 |
| 850 | runners | ucube | 782.0 | 68.0 | 410.3 | 100.0 | 23.3* | 0.0 | 0.5 |
| 850 | runners | control | 744.0 | 106.0 | 433.3 | 100.0 | 27.8* | 16.2 | 0.6 |
| 850 | air | obsession | 844.0 | 6.0 | 1680.0 | 0.0 | 31.6 | 0.0 | 2.0 |
| 850 | air | hiza | 742.0 | 108.0 | 1680.0 | 0.0 | 31.1 | 0.0 | 2.3 |
| 850 | air | server | 776.0 | 74.0 | 1120.0 | 64.0 | 39.0 | 0.0 | 1.4 |
| 850 | air | ucube | 782.0 | 68.0 | 557.9 | 100.0 | 31.3* | 0.0 | 0.7 |
| 850 | air | control | 744.0 | 106.0 | 793.3 | 98.7 | 40.7* | 0.0 | 1.1 |
| 850 | supply | obsession | 844.0 | 6.0 | 3596.7 | 100.0 | 63.1* | 20.8 | 4.3 |
| 850 | supply | hiza | 742.0 | 108.0 | 3293.3 | 100.0 | 55.1* | 0.1 | 4.4 |
| 850 | supply | server | 776.0 | 74.0 | 1300.0 | 100.0 | 42.6* | 0.0 | 1.7 |
| 850 | supply | ucube | 782.0 | 68.0 | 607.3 | 100.0 | 32.6* | 0.0 | 0.8 |
| 850 | supply | control | 744.0 | 106.0 | 2036.7 | 100.0 | 47.5* | 31.8 | 2.7 |
| 6500 | swarm | obsession | 5164.0 | 1336.0 | 1333.3 | 100.0 | 47.2* | 4.2 | 0.3 |
| 6500 | swarm | hiza | 4042.0 | 2458.0 | 2160.0 | 40.0 | 49.7 | 8.9 | 0.5 |
| 6500 | swarm | server | 4416.0 | 2084.0 | 800.0 | 100.0 | 39.6* | 0.0 | 0.2 |
| 6500 | swarm | ucube | 5692.0 | 808.0 | 2400.0 | 16.0 | 45.0 | 0.1 | 0.4 |
| 6500 | swarm | control | 4064.0 | 2436.0 | 800.0 | 100.0 | 39.6* | 24.5 | 0.2 |
| 6500 | armored | obsession | 5164.0 | 1336.0 | 7740.0 | 0.0 | 23.9 | 0.0 | 1.5 |
| 6500 | armored | hiza | 4042.0 | 2458.0 | 7453.3 | 9.3 | 33.8 | 0.0 | 1.8 |
| 6500 | armored | server | 4416.0 | 2084.0 | 6880.0 | 28.0 | 43.3 | 0.0 | 1.6 |
| 6500 | armored | ucube | 5692.0 | 808.0 | 5569.1 | 88.7 | 44.5 | 0.0 | 1.0 |
| 6500 | armored | control | 4064.0 | 2436.0 | 4013.3 | 100.0 | 43.2* | 24.2 | 1.0 |
| 6500 | runners | obsession | 5164.0 | 1336.0 | 1133.3 | 90.7 | 34.6* | 0.0 | 0.2 |
| 6500 | runners | hiza | 4042.0 | 2458.0 | 966.7 | 77.3 | 30.6* | 1.3 | 0.2 |
| 6500 | runners | server | 4416.0 | 2084.0 | 600.0 | 100.0 | 29.3* | 0.0 | 0.1 |
| 6500 | runners | ucube | 5692.0 | 808.0 | 1200.0 | 86.7 | 34.6* | 0.0 | 0.2 |
| 6500 | runners | control | 4064.0 | 2436.0 | 766.7 | 100.0 | 31.8* | 19.3 | 0.2 |
| 6500 | air | obsession | 5164.0 | 1336.0 | 1633.3 | 5.3 | 37.6 | 0.0 | 0.3 |
| 6500 | air | hiza | 4042.0 | 2458.0 | 1680.0 | 0.0 | 31.4 | 0.1 | 0.4 |
| 6500 | air | server | 4416.0 | 2084.0 | 1166.7 | 58.7 | 38.6 | 0.0 | 0.3 |
| 6500 | air | ucube | 5692.0 | 808.0 | 1586.7 | 10.7 | 38.4 | 0.0 | 0.3 |
| 6500 | air | control | 4064.0 | 2436.0 | 840.0 | 92.0 | 38.9* | 0.0 | 0.2 |
| 6500 | supply | obsession | 5164.0 | 1336.0 | 2773.3 | 100.0 | 55.9* | 15.0 | 0.5 |
| 6500 | supply | hiza | 4042.0 | 2458.0 | 4116.7 | 100.0 | 68.6* | 53.9 | 1.0 |
| 6500 | supply | server | 4416.0 | 2084.0 | 1256.7 | 100.0 | 41.1* | 0.0 | 0.3 |
| 6500 | supply | ucube | 5692.0 | 808.0 | 5070.0 | 100.0 | 75.9* | 7.8 | 0.9 |
| 6500 | supply | control | 4064.0 | 2436.0 | 1213.3 | 100.0 | 41.5* | 25.6 | 0.3 |
| 26000 | swarm | obsession | 22444.0 | 3556.0 | 1093.3 | 100.0 | 44.4* | 3.6 | 0.0 |
| 26000 | swarm | hiza | 17242.0 | 8758.0 | 2026.7 | 52.0 | 49.2* | 12.8 | 0.1 |
| 26000 | swarm | server | 18976.0 | 7024.0 | 640.0 | 100.0 | 37.6* | 0.0 | 0.0 |
| 26000 | swarm | ucube | 24892.0 | 1108.0 | 2240.0 | 32.0 | 47.1 | 0.4 | 0.1 |
| 26000 | swarm | control | 17344.0 | 8656.0 | 720.0 | 100.0 | 38.8* | 25.0 | 0.0 |
| 26000 | armored | obsession | 22444.0 | 3556.0 | 7740.0 | 0.0 | 26.1 | 0.0 | 0.3 |
| 26000 | armored | hiza | 17242.0 | 8758.0 | 7453.3 | 9.3 | 34.6 | 0.0 | 0.4 |
| 26000 | armored | server | 18976.0 | 7024.0 | 6593.3 | 37.3 | 43.6 | 0.0 | 0.3 |
| 26000 | armored | ucube | 24892.0 | 1108.0 | 7740.0 | 0.0 | 22.3 | 0.0 | 0.3 |
| 26000 | armored | control | 17344.0 | 8656.0 | 3870.0 | 99.3 | 41.8* | 24.2 | 0.2 |
| 26000 | runners | obsession | 22444.0 | 3556.0 | 1000.0 | 100.0 | 34.1* | 0.0 | 0.0 |
| 26000 | runners | hiza | 17242.0 | 8758.0 | 1533.3 | 54.7 | 31.7* | 3.8 | 0.1 |
| 26000 | runners | server | 18976.0 | 7024.0 | 633.3 | 100.0 | 30.2* | 0.0 | 0.0 |
| 26000 | runners | ucube | 24892.0 | 1108.0 | 1400.0 | 78.7 | 35.8* | 0.0 | 0.1 |
| 26000 | runners | control | 17344.0 | 8656.0 | 733.3 | 100.0 | 30.6* | 18.5 | 0.0 |
| 26000 | air | obsession | 22444.0 | 3556.0 | 1610.0 | 8.0 | 36.8 | 0.0 | 0.1 |
| 26000 | air | hiza | 17242.0 | 8758.0 | 1680.0 | 0.0 | 29.5 | 0.0 | 0.1 |
| 26000 | air | server | 18976.0 | 7024.0 | 1213.3 | 53.3 | 39.4 | 0.0 | 0.1 |
| 26000 | air | ucube | 24892.0 | 1108.0 | 1680.0 | 0.0 | 35.2 | 0.0 | 0.1 |
| 26000 | air | control | 17344.0 | 8656.0 | 910.0 | 88.0 | 39.4 | 0.0 | 0.1 |
| 26000 | supply | obsession | 22444.0 | 3556.0 | 2556.7 | 100.0 | 52.6* | 8.2 | 0.1 |
| 26000 | supply | hiza | 17242.0 | 8758.0 | 4290.0 | 100.0 | 69.9* | 62.2 | 0.3 |
| 26000 | supply | server | 18976.0 | 7024.0 | 1300.0 | 100.0 | 41.5* | 0.0 | 0.1 |
| 26000 | supply | ucube | 24892.0 | 1108.0 | 4593.3 | 100.0 | 72.6* | 6.4 | 0.2 |
| 26000 | supply | control | 17344.0 | 8656.0 | 1170.0 | 100.0 | 41.1* | 24.2 | 0.1 |

* Süre sınırına ulaşan veya yenilgiyle biten koşular içerir; temizleme süresi sayılmaz. Ayrıntılı JSON, her koşunun bitiş durumunu, seviyelerini ve deneyim harcamasını içerir.

Otomatik üstünlük taraması (eş bütçe ve tohumdaki her tehditte daha az/eşit nexus kaybı, daha çok/eşit öldürme; en az bir kesin iyileşme):
- 850 altın: Bütün diğer kuruluşlara üstün gelen seçenek yok.
- 6500 altın: Bütün diğer kuruluşlara üstün gelen seçenek yok.
- 26000 altın: Bütün diğer kuruluşlara üstün gelen seçenek yok.
