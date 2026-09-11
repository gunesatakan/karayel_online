# Kuruluş karşılaştırması

Aynı altın ve deneyim bütçesi; kurulum, yükseltme ve iki ek taşıyıcı bedelleri dahildir. Harcanmayan bütçe ayrıca gösterilir. Gerçek MatchRoom 50 ms adımlarla, üç sabit tohumla çalışır. Süreler duvar saati eşdeğeridir; bekleme ve aura süreleri oyun saatidir.

Bu bir sabit kuruluş kıyaslamasıdır; en iyi yerleşim araması, insan oyun testi veya bütün kart/eşya kombinasyonlarının denge kanıtı değildir. İlk satırlar yeni bağlantı, yüksek bütçe satırları açıkça 10 dalga yaşlandırılmış Sunucu bağlantısı kullanır. Tehditler kontrollü test profilleridir; sonuçlar doğal dalga zorluğu puanı değildir.

| Bütçe | Tehdit | Kuruluş | Harcanan | Kalan | Hasar | Nexus kaybı | Süre (sn) | Kaynak bekleme (kule·sn) | Hasar/altın |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 850 | swarm | obsession | 844.0 | 6.0 | 1733.3 | 81.3 | 51.2* | 4.0 | 2.1 |
| 850 | swarm | hiza | 742.0 | 108.0 | 1520.0 | 94.7 | 48.4* | 0.0 | 2.1 |
| 850 | swarm | server | 776.0 | 74.0 | 1040.0 | 100.0 | 42.8* | 0.0 | 1.3 |
| 850 | swarm | ucube | 782.0 | 68.0 | 160.3 | 100.0 | 29.6* | 0.0 | 0.2 |
| 850 | swarm | control | 744.0 | 106.0 | 1066.7 | 100.0 | 41.6* | 27.2 | 1.4 |
| 850 | armored | obsession | 844.0 | 6.0 | 3989.3 | 100.0 | 40.8* | 0.0 | 4.7 |
| 850 | armored | hiza | 742.0 | 108.0 | 4935.7 | 100.0 | 41.6* | 0.0 | 6.6 |
| 850 | armored | server | 776.0 | 74.0 | 2410.5 | 100.0 | 37.2* | 0.0 | 3.1 |
| 850 | armored | ucube | 782.0 | 68.0 | 87.3 | 100.0 | 32.4* | 0.0 | 0.1 |
| 850 | armored | control | 744.0 | 106.0 | 1653.5 | 100.0 | 34.9* | 19.5 | 2.2 |
| 850 | runners | obsession | 844.0 | 6.0 | 1500.0 | 72.0 | 35.8 | 0.0 | 1.8 |
| 850 | runners | hiza | 742.0 | 108.0 | 1233.3 | 92.0 | 33.7* | 0.0 | 1.7 |
| 850 | runners | server | 776.0 | 74.0 | 733.3 | 100.0 | 30.9* | 0.0 | 0.9 |
| 850 | runners | ucube | 782.0 | 68.0 | 90.6 | 100.0 | 22.9* | 0.0 | 0.1 |
| 850 | runners | control | 744.0 | 106.0 | 766.7 | 100.0 | 31.1* | 17.8 | 1.0 |
| 850 | air | obsession | 844.0 | 6.0 | 1680.0 | 0.0 | 31.1 | 0.0 | 2.0 |
| 850 | air | hiza | 742.0 | 108.0 | 1680.0 | 0.0 | 30.1 | 0.0 | 2.3 |
| 850 | air | server | 776.0 | 74.0 | 1120.0 | 64.0 | 38.6 | 0.0 | 1.4 |
| 850 | air | ucube | 782.0 | 68.0 | 184.5 | 100.0 | 28.7* | 0.0 | 0.2 |
| 850 | air | control | 744.0 | 106.0 | 840.0 | 94.7 | 39.3* | 0.0 | 1.1 |
| 850 | supply | obsession | 844.0 | 6.0 | 3466.7 | 100.0 | 62.3* | 25.4 | 4.1 |
| 850 | supply | hiza | 742.0 | 108.0 | 3553.3 | 100.0 | 57.5* | 3.6 | 4.8 |
| 850 | supply | server | 776.0 | 74.0 | 1646.7 | 100.0 | 45.1* | 0.3 | 2.1 |
| 850 | supply | ucube | 782.0 | 68.0 | 159.1 | 100.0 | 31.5* | 0.0 | 0.2 |
| 850 | supply | control | 744.0 | 106.0 | 2080.0 | 100.0 | 47.9* | 32.6 | 2.8 |
| 6500 | swarm | obsession | 5164.0 | 1336.0 | 1493.3 | 97.3 | 50.4* | 17.5 | 0.3 |
| 6500 | swarm | hiza | 4042.0 | 2458.0 | 2293.3 | 26.7 | 48.9 | 6.8 | 0.6 |
| 6500 | swarm | server | 4416.0 | 2084.0 | 826.7 | 100.0 | 41.2* | 0.2 | 0.2 |
| 6500 | swarm | ucube | 5692.0 | 808.0 | 533.3 | 100.0 | 37.2* | 0.0 | 0.1 |
| 6500 | swarm | control | 4064.0 | 2436.0 | 960.0 | 100.0 | 41.6* | 27.6 | 0.2 |
| 6500 | armored | obsession | 5164.0 | 1336.0 | 7740.0 | 0.0 | 24.9 | 0.0 | 1.5 |
| 6500 | armored | hiza | 4042.0 | 2458.0 | 7740.0 | 0.0 | 28.6 | 0.0 | 1.9 |
| 6500 | armored | server | 4416.0 | 2084.0 | 7023.3 | 23.3 | 42.9 | 0.0 | 1.6 |
| 6500 | armored | ucube | 5692.0 | 808.0 | 1431.9 | 100.0 | 36.0* | 0.0 | 0.3 |
| 6500 | armored | control | 4064.0 | 2436.0 | 4300.0 | 99.3 | 43.6* | 23.8 | 1.1 |
| 6500 | runners | obsession | 5164.0 | 1336.0 | 933.3 | 100.0 | 33.8* | 1.4 | 0.2 |
| 6500 | runners | hiza | 4042.0 | 2458.0 | 1866.7 | 42.7 | 33.7 | 0.8 | 0.5 |
| 6500 | runners | server | 4416.0 | 2084.0 | 533.3 | 100.0 | 28.9* | 0.0 | 0.1 |
| 6500 | runners | ucube | 5692.0 | 808.0 | 633.3 | 100.0 | 30.2* | 0.0 | 0.1 |
| 6500 | runners | control | 4064.0 | 2436.0 | 766.7 | 100.0 | 31.4* | 19.1 | 0.2 |
| 6500 | air | obsession | 5164.0 | 1336.0 | 1680.0 | 0.0 | 32.6 | 0.1 | 0.3 |
| 6500 | air | hiza | 4042.0 | 2458.0 | 1680.0 | 0.0 | 30.0 | 0.0 | 0.4 |
| 6500 | air | server | 4416.0 | 2084.0 | 1236.7 | 50.7 | 38.2 | 0.0 | 0.3 |
| 6500 | air | ucube | 5692.0 | 808.0 | 420.0 | 100.0 | 34.4* | 0.0 | 0.1 |
| 6500 | air | control | 4064.0 | 2436.0 | 746.7 | 98.7 | 39.5* | 0.0 | 0.2 |
| 6500 | supply | obsession | 5164.0 | 1336.0 | 2643.3 | 100.0 | 55.9* | 26.5 | 0.5 |
| 6500 | supply | hiza | 4042.0 | 2458.0 | 4333.3 | 100.0 | 71.1* | 60.5 | 1.1 |
| 6500 | supply | server | 4416.0 | 2084.0 | 1430.0 | 100.0 | 43.1* | 1.0 | 0.3 |
| 6500 | supply | ucube | 5692.0 | 808.0 | 910.0 | 100.0 | 39.9* | 0.0 | 0.2 |
| 6500 | supply | control | 4064.0 | 2436.0 | 1603.3 | 100.0 | 43.9* | 27.8 | 0.4 |
| 26000 | swarm | obsession | 22444.0 | 3556.0 | 1706.7 | 84.0 | 52.0* | 19.7 | 0.1 |
| 26000 | swarm | hiza | 17242.0 | 8758.0 | 2133.3 | 42.7 | 51.3 | 18.0 | 0.1 |
| 26000 | swarm | server | 18976.0 | 7024.0 | 933.3 | 100.0 | 42.0* | 1.2 | 0.0 |
| 26000 | swarm | ucube | 24892.0 | 1108.0 | 533.3 | 100.0 | 37.2* | 0.0 | 0.0 |
| 26000 | swarm | control | 17344.0 | 8656.0 | 1013.3 | 100.0 | 42.8* | 28.1 | 0.1 |
| 26000 | armored | obsession | 22444.0 | 3556.0 | 7740.0 | 0.0 | 24.5 | 0.0 | 0.3 |
| 26000 | armored | hiza | 17242.0 | 8758.0 | 7740.0 | 0.0 | 26.0 | 0.0 | 0.5 |
| 26000 | armored | server | 18976.0 | 7024.0 | 7166.7 | 18.7 | 43.3 | 0.0 | 0.4 |
| 26000 | armored | ucube | 24892.0 | 1108.0 | 2866.7 | 100.0 | 40.4* | 0.0 | 0.1 |
| 26000 | armored | control | 17344.0 | 8656.0 | 4300.0 | 98.7 | 42.6* | 24.0 | 0.2 |
| 26000 | runners | obsession | 22444.0 | 3556.0 | 1633.3 | 61.3 | 35.4 | 1.1 | 0.1 |
| 26000 | runners | hiza | 17242.0 | 8758.0 | 1733.3 | 53.3 | 35.4 | 4.3 | 0.1 |
| 26000 | runners | server | 18976.0 | 7024.0 | 833.3 | 100.0 | 32.1* | 0.0 | 0.0 |
| 26000 | runners | ucube | 24892.0 | 1108.0 | 566.7 | 100.0 | 29.3* | 0.0 | 0.0 |
| 26000 | runners | control | 17344.0 | 8656.0 | 1033.3 | 100.0 | 35.0* | 20.7 | 0.1 |
| 26000 | air | obsession | 22444.0 | 3556.0 | 1633.3 | 5.3 | 36.4 | 1.7 | 0.1 |
| 26000 | air | hiza | 17242.0 | 8758.0 | 1680.0 | 0.0 | 31.1 | 0.0 | 0.1 |
| 26000 | air | server | 18976.0 | 7024.0 | 1236.7 | 50.7 | 38.6 | 0.0 | 0.1 |
| 26000 | air | ucube | 24892.0 | 1108.0 | 420.0 | 100.0 | 34.4* | 0.0 | 0.0 |
| 26000 | air | control | 17344.0 | 8656.0 | 933.3 | 84.0 | 39.3* | 0.0 | 0.1 |
| 26000 | supply | obsession | 22444.0 | 3556.0 | 2730.0 | 100.0 | 55.9* | 30.7 | 0.1 |
| 26000 | supply | hiza | 17242.0 | 8758.0 | 4376.7 | 100.0 | 71.9* | 68.8 | 0.3 |
| 26000 | supply | server | 18976.0 | 7024.0 | 1126.7 | 100.0 | 40.3* | 0.2 | 0.1 |
| 26000 | supply | ucube | 24892.0 | 1108.0 | 910.0 | 100.0 | 39.9* | 0.0 | 0.0 |
| 26000 | supply | control | 17344.0 | 8656.0 | 1213.3 | 100.0 | 41.5* | 23.6 | 0.1 |

* Süre sınırına ulaşan veya yenilgiyle biten koşular içerir; temizleme süresi sayılmaz. Ayrıntılı JSON, her koşunun bitiş durumunu, seviyelerini ve deneyim harcamasını içerir.

Otomatik üstünlük taraması (eş bütçe ve tohumdaki her tehditte daha az/eşit nexus kaybı, daha çok/eşit öldürme; en az bir kesin iyileşme):
- 850 altın: Bütün diğer kuruluşlara üstün gelen seçenek yok.
- 6500 altın: hiza
- 26000 altın: Bütün diğer kuruluşlara üstün gelen seçenek yok.
