# İngilizce terim sözlüğü

Bu sözlük oyunun Türkçe metinlerinin İngilizceye çevirisinde kullanılır. Kaynak her zaman Türkçedir. Bir terim burada varsa, oyunun her yerinde (arayüz, kartlar, eşyalar, kuleler, işçiler) aynı İngilizce karşılık kullanılır.

## Yazım kuralları

- **Yüzde:** Türkçede işaret önde, İngilizcede arkada. `%25` → `25%`, `+%25` → `+25%`, `−%10` → `−10%`.
- **Ondalık ayraç:** virgül değil nokta. `1,5` → `1.5`.
- **Birimler:** `sn` → `s`, `kare` → `tiles` (tekil `tile`), `g` (altın) aynen kalır, `XP` aynen kalır.
- **Sayılar:** sayılar ve işaretler (`×`, `−`, `+`, `…`, `·`) birebir korunur. Metinde sayı değiştirilmez.
- **Ton:** kısa, kuru, sert bilimkurgu arayüz dili. Süs, ünlem ve şaka eklenmez.
- **Büyük harf:** adlar (kart, eşya, kule, beceri, nişan) Title Case yazılır, açıklamalar cümle düzeninde.
- **Operatör adları değişmez:** AttackLord, ZentaX, DualiTemp, Honour, Zexceed, Boosty, Bioside.

## Sunucu metinleri

Sunucu dili hiç değiştirmez; ürettiği metin Türkçedir ve eskisiyle birebir aynı kalır (eski istemci ve testler onu okur). İstemci metni seçili dilde kendisi yazar:

- **Anahtarlı mesaj:** metin alanının yanında kararlı bir anahtar gider: `{ message: "Oda dolu.", key: "room.full" }`. Türkçeler `packages/shared/src/i18n/server-text.ts` içindeki `SERVER_TEXT`te, istemci karşılığı `server.<anahtar>` (`apps/web/src/locales/areas/server.ts`). Böyle gidenler: `lobby:error` ve `room:error` (`message` + `key`), `card:rejected` (`reason` + `key`), `tower:preview` (red için `errorKey`/`errorParams`; satır etiketleri için `lineKeys`; başlık ve açıklama için `cardId`/`itemId` ve `definitionId`).
- **Oda katılım/kurma reddi:** Colyseus yalnızca hata metnini taşır; istemci bilinen metni (`getRoomRejectionKey`) anahtara çevirir.
- **Snapshot'taki kule durumu ve özeti** (`status`, `insight`): saniyede ~15 kez giden telde anahtar yok. İstemci Türkçe metni `server.status.*`, `server.insight.*`, `server.activity.*` kalıplarıyla parçalar ve aynı anahtarın İngilizcesini yazar. Kalıp sunucudaki metinle birebir aynı olmalı; sunucuda metin değişirse kalıp da değişir (test yakalar). Tanınmayan parça Türkçe kalır.
- **Kule adı** (savunma özeti, koşu raporu): ad Türkçe gider, yanında tanım kimliği (`definitionId`); istemci adı katalogdan çözer.
- Anahtarı tanımayan istemci ya da anahtarsız eski sunucu: Türkçe metin gösterilir.

## Terimler

| Türkçe | English |
| --- | --- |
| Kule | Tower |
| Seviye (Sv) | Level (Lv) |
| Kademe | Tier |
| Dalga | Wave |
| Aşama | Stage |
| Şampiyon | Champion |
| Altın | Gold |
| Kart | Card |
| Eşya | Item |
| Envanter | Inventory |
| Mağaza | Shop |
| Yenile | Reroll |
| İşçi | Worker |
| İşçi Ağacı | Worker Tree |
| Uzmanlık | Specialization |
| Mühimmat | Ammo |
| Kurşun | Bullet |
| Aura kristali | Aura crystal |
| Güç kristali | Power crystal |
| Enerji | Energy |
| Isı | Heat |
| Isı freni | Heat brake |
| Soğuma | Cooling |
| Isı kilidi | Heat lock |
| Performans kolu | Performance lever |
| Menzil | Range |
| Atış hızı | Fire rate |
| Hasar | Damage |
| Kritik ihtimali | Crit chance |
| Kritik hasarı | Crit damage |
| Mermi | Projectile |
| Mermi hızı | Projectile speed |
| Dönüş hızı | Turn rate |
| İsabet | Accuracy |
| Delme | Pierce |
| Alan hasarı | Area damage |
| Yavaşlatma | Slow |
| Dondurma | Freeze |
| Sersemletme | Stun |
| Korku | Fear |
| Lanet | Curse |
| İşaret | Mark |
| Kanama | Bleed |
| Yanma | Burn |
| Zırh | Armor |
| Zırh kırma | Armor break |
| Kalkan | Shield |
| Yığın | Stack |
| Hava / uçan | Air / flying |
| Kara | Ground |
| Sızıntı | Leak |
| Üs / nexus | Base / nexus |
| Yol | Path |
| Kare | Tile |
| Duvar | Wall |
| Kapı | Gate |
| Tamir / onarım | Repair |
| Tamirci (işçi uzmanlığı) | Repairer |
| Ulti | Ultimate |
| Beceri | Skill |
| Pasif | Passive |
| Operatör | Operator |
| Nişan | Badge |
| Unvan | Title |
| Ustalık | Mastery |
| Seri | Streak |
| Kombo | Combo |

## Düşmanlar

| Türkçe | English |
| --- | --- |
| Ezici | Crusher |
| Er | Grunt |
| Koşucu | Runner |
| Nişancı | Shooter |
| Kuşatma | Siege |
| Golem | Golem |
| Meka | Mech |
| Uzay Böceği | Space Bug |
| Düşmüş | the Fallen |
| Dördüncü Boyut | Fourth Dimension |
| Kutsal Koruyucu | Holy Guardian |

## Hasar ve vuruş tipleri

| Türkçe | English |
| --- | --- |
| Fiziksel | Physical |
| Elektrik | Electric |
| Psişik | Psychic |
| Ateş | Fire |
| Işık | Light |
| Hücresel | Cellular |
| Gerçek | True |
| Çarpma | Impact |
| Odak | Focus |
| Bulaşma | Contamination |
| Kesme | Slash |
| Dalga (vuruş tipi) | Wave |

## Kart eksenleri ve nadirlik

| Türkçe | English |
| --- | --- |
| Hasar | Damage |
| Kontrol | Control |
| Büyütme | Amplify |
| Ekonomi | Economy |
| Barikat | Barricade |
| yaygın | common |
| seyrek | uncommon |
| nadir | rare |
| epik | epic |

