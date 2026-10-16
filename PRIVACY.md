# Gizlilik / Privacy — Nexhold

_Son güncelleme / Last updated: 2026-10-16_

## Türkçe

**Nexhold** oyunu, hataları düzeltmek ve oyunu dengelemek için **anonim kullanım verisi** toplar. Veriler yalnızca oyunun kendi sunucusuna gönderilir. Üçüncü taraf analitik, reklam veya takip servisi kullanılmaz.

### Toplanan veriler

- **Rastgele kurulum kimliği:** Tarayıcınızda üretilen rastgele bir sayı (UUID). Sizinle, hesabınızla veya cihazınızla bağlantısı yoktur. Tarayıcı verilerini silince değişir.
- **Oturum bilgisi:** Oyunun sürümü, kaba cihaz sınıfı (telefon/tablet/masaüstü), ekran boyutu, dil, oyunun uygulama olarak mı yoksa başka bir sitenin içinde mi açıldığı ve oyunun açıldığı alan adı (örneğin itch.io).
- **Oyun verisi:** Mod (tek oyunculu / co-op / yaratıcı), aşama, seçilen operatör, oyuncu sayısı, ulaşılan dalga, sonuç (kazanma / kaybetme / yarıda bırakma), süre, nexus canı, seçilen kartlar, alınan ve takılan eşyalar, kurulan kulelerin türü ve en yüksek seviyesi, altın, öldürme ve sızıntı sayıları.
- **Performans:** Dalga başına ortalama ve en düşük FPS, ağ gecikmesi (ping) ve sunucu işlem süresi.
- **Hatalar:** Hata mesajı, kısaltılmış hata konumu (kod dosyası ve satır), açık sahne ve dalga.

**Toplanmayanlar:** Oyuncu adı, e-posta, hesap bilgisi, konum, rehber, reklam kimliği veya cihaz parmak izi toplanmaz. IP adresiniz yalnızca kötüye kullanımı önlemek için (istek sınırı) kısa süre bellekte tutulur ve **hiçbir zaman kaydedilmez**.

### Maç kayıtları (performans ve hata ayıklama)

Gecikme ve takılma sorunlarını kesin olarak bulabilmek için oyun sunucusu her maçın bir kaydını tutar.

- **Sunucu tarafı, her maç için** (bu veri zaten oyunun kendi sunucusunda oluşur; ayardan bağımsızdır): saniye başına sunucu işlem süreleri (bölüm bölüm), düşman/kule/mermi sayıları, ağ istatistikleri (bağlantı başına gönderilen bayt, gönderilen ve atlanan anlık görüntüler, gönderim kuyruğu), sunucu süreci ölçümleri (bellek, işlemci, çöp toplama, olay döngüsü gecikmesi). Maçın birebir yeniden oynatılabilmesi için oyun girdileri de kaydedilir: maçın rastgele tohumu, kurulum seçenekleri (aşama, harita, operatör), oyuncuların maç içi komutları (kule kurma, kart seçimi, beceri kullanımı vb.) zamanlarıyla, katılma/ayrılma/yeniden bağlanma anları ve bağlantı başına üretilen rastgele oturum kimlikleri.
- **Oyuncu adı, oda adı ve solo oda şifresi kaydedilmez:** kayıtta takma adla (P1, P2...) değiştirilir. Kayıt rastgele oda kimliğiyle saklanır; kurulum kimliğinize, IP adresinize veya bir hesaba bağlanmaz.
- **İstemci tarafı, yalnızca "Anonim veri" açıksa:** maç sırasında beş saniyede bir küçük bir ölçüm gönderilir: kare hızı ve kare süresi dağılımı, oyunun çizim bölümlerinin süreleri, efekt ayrıntı seviyesi, anlık görüntü alımı (tampon, düşen kare), ping, tarayıcının desteklediği yerde JavaScript bellek kullanımı, kaba cihaz sınıfı (ekran piksel oranı, oyun alanının piksel boyutu, işlemci çekirdeği sayısı, yaklaşık bellek, tarayıcı ailesi ve işletim sistemi ailesi — sürüm veya tam tarayıcı kimlik dizesi değil), sekmenin arka plana geçmesi ve grafik bağlamının (WebGL) kaybı. Ayar kapalıyken bu ölçüm hiç toplanmaz ve gönderilmez.
- Kayıtlara yalnızca geliştirici, jetonla korunan bir yönetim paneliyle erişir.

### Neden

Oyuncuların nerede zorlandığını, hangi seçimlerin işe yaradığını, oyunun nerede bırakıldığını ve hangi hataların oluştuğunu görmek; performans sorunlarını (ör. geç dalgalardaki gecikme) bulmak için.

### Saklama

Veriler sunucuda **90 gün** saklanır, sonra otomatik olarak silinir. Maç kayıtları **30 gün** saklanır; toplam boyut sınırı aşılırsa en eski kayıt daha erken silinir. Veriler satılmaz ve kimseyle paylaşılmaz.

### Nasıl kapatılır

- Ana menüde alttaki **"Anonim veri"** kutusunun işaretini kaldırın, veya
- Oyun içinde **Ses ayarları (♪)** panelinde **"Anonim kullanım verisi gönder"** seçeneğini kapatın.

Kapalıyken tarayıcınızdan hiçbir veri gönderilmez (maç içi ölçümler dahil). Tercih bu tarayıcıda saklanır. Sunucu tarafı maç kaydı (yukarıda) oyunun kendi sunucusunda oluşan, adsız veridir ve bu ayardan bağımsızdır.

Sorular ve silme talepleri için: nobetportal@gmail.com. Veriler kimliksiz olduğundan, silme için oyundaki kurulum kimliğine ihtiyaç duyabiliriz.

## English

**Nexhold** collects **anonymous usage data** to fix bugs and balance the game. Data is sent only to the game's own server. No third-party analytics, advertising or tracking services are used.

### What is collected

- **Random install ID:** a random number (UUID) generated in your browser. It is not linked to you, an account or your device. It changes when you clear browser data.
- **Session info:** game version, rough device class (phone/tablet/desktop), screen size, language, whether the game runs as an installed app or inside another site, and the host it was opened from (e.g. itch.io).
- **Gameplay data:** mode (solo / co-op / creative), stage, chosen operator, player count, wave reached, outcome (win / loss / abandoned), duration, nexus health, cards picked, items bought and equipped, tower types placed and their highest level, gold, kills and leaks.
- **Performance:** average and minimum FPS, network latency (ping) and server tick time, once per wave.
- **Errors:** error message, a shortened error location (code file and line), the active scene and wave.

**Not collected:** player names, e-mail, account data, location, contacts, advertising IDs or device fingerprints. Your IP address is held briefly in memory only for abuse protection (rate limiting) and is **never stored**.

### Match recordings (performance and debugging)

To pin down lag and stutter precisely, the game server keeps a recording of every match.

- **Server side, for every match** (this data already exists on the game's own server; it does not depend on the setting): per-second server processing times (per section), enemy/tower/projectile counts, network statistics (bytes sent per connection, snapshots sent and skipped, send queue), server process measurements (memory, CPU, garbage collection, event-loop delay). So that a match can be replayed exactly, the game inputs are recorded too: the match's random seed, setup options (stage, map, operator), players' in-match commands (placing towers, picking cards, using skills, etc.) with their timing, join/leave/reconnect moments and the random per-connection session IDs.
- **Player names, room names and the solo room secret are not recorded:** they are replaced with aliases (P1, P2...). Recordings are keyed by the random room ID; they are not linked to your install ID, IP address or any account.
- **Client side, only while "Anonymous data" is on:** during a match a small sample is sent every five seconds: frame rate and frame-time distribution, the durations of the game's drawing sections, the effect level of detail, snapshot reception (buffer, dropped frames), ping, JavaScript memory use where the browser reports it, a rough device class (device pixel ratio, game canvas size in pixels, CPU core count, approximate memory, browser family and operating-system family — not versions or the full user-agent string), the tab going to the background, and loss of the graphics (WebGL) context. While the setting is off, none of this is collected or sent.
- Only the developer can access recordings, through a token-protected admin panel.

### Why

To see where players struggle, which choices work, where the game is abandoned, which errors happen, and to find performance problems (e.g. late-game lag).

### Retention

Data is kept on the server for **90 days** and then deleted automatically. Match recordings are kept for **30 days**; if the total size cap is reached, the oldest recording is deleted earlier. Data is never sold or shared.

### How to opt out

- On the main menu, untick **"Anonim veri"** at the bottom, or
- In game, open the **sound settings (♪)** panel and turn off **"Anonim kullanım verisi gönder"** ("send anonymous usage data").

While off, nothing is sent from your browser (including in-match samples). The choice is stored in this browser. The server-side match recording (above) is anonymous data created on the game's own server and does not depend on this setting.

Questions or deletion requests: nobetportal@gmail.com. Because the data is anonymous, we may need your install ID to find it.
