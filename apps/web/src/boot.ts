/**
 * Giris noktasi: once depolama, sonra oyun.
 *
 * `arcade` ilk ice aktarim: Bounty Board'un depolama katmani, depolamaya
 * dokunan herhangi bir modul yuklenmeden once kuruluyor. Oyunun kendisi
 * (`main.ts` ve ice aktardigi her sey) ancak bulut okumasi indikten sonra
 * yukleniyor; yoksa menu ilk karede ilerlemeyi bos okuyup operatorleri ve
 * asamalari kilitli gosterirdi. Gercek depolama calisan yerde (Vercel,
 * itch.io) bekleme yok: soz hemen cozuluyor.
 *
 * Buraya depolamaya dokunan baska bir ice aktarim eklenmemeli.
 */
import { arcade } from "./arcade";
import "./style.css";

void arcade.whenStorageReady().then(() => import("./main"));
