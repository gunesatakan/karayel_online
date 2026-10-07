import { Client, Room } from "colyseus.js";
import { SERVER_FULL_MESSAGE, WIRE_DELTA_PROTOCOL } from "@karayel/shared";

let sharedClient: Client | undefined;
let activeLobbyRoom: Room | undefined;

/**
 * Odaya giris seceneklerine istemcinin tel surumunu ekler.
 *
 * Her `create`/`joinById`/`join` bunu kullaniyor: sunucu oyuncu ve isci
 * deltasini yalnizca bunu bildiren oturuma yolluyor, digerlerine (eski
 * istemci) o iki bolum tam gidiyor. `reconnect` secenek tasimiyor; sunucu
 * bayragi oturumun ilk girisinden hatirliyor.
 */
export function withWireCaps<T extends object>(options: T): T & { wireDelta: number } {
  return { ...options, wireDelta: WIRE_DELTA_PROTOCOL };
}

/**
 * Solo odanin sahip sirri: kurulumda bir kez uretiliyor, yeniden baglanma
 * kaydinda saklaniyor. Pencereden sonra oda kimligiyle donus bunu gostermek
 * zorunda; oda kimligi HUD'da yaziyor, ad ve operator kimseyi kanitlamiyor.
 */
export function createOwnerSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Menuye donuste odadan izinli cikisin en uzun beklemesi; cikis sayfayi asla tutmuyor. */
export const ROOM_LEAVE_TIMEOUT_MS = 400;

/**
 * Odadan kendi istegiyle cikar (en iyi caba, kisa sureli).
 *
 * Sekme kapanmasi izinsiz cikis: sunucu yuvayi yeniden baglanma icin tutuyor
 * ve oda sinirda yer kapliyor. Oyuncu menuye kendisi donerken izinli cikis
 * yollaniyor; herkes boyle cikinca sunucu odayi beklemeden kapatiyor. Soket
 * olu ya da yavassa zaman asimi bekliyor ve devam ediliyor.
 */
export async function leaveRoomQuietly(room: Room | undefined, timeoutMs = ROOM_LEAVE_TIMEOUT_MS) {
  if (!room) return;
  try {
    await Promise.race([
      Promise.resolve(room.leave(true)).catch(() => undefined),
      delay(timeoutMs)
    ]);
  } catch {
    // Kapanmis soket: cikacak bir sey yok.
  }
}

/**
 * Suren ya da biten bir mactan menuye doner: kosu raporunun dugmeleri ve
 * mac icindeki "Menüye dön" ayni yoldan.
 *
 * Yalnizca yeniden yukleme izinsiz cikis sayiliyordu: sunucu yuvayi yeniden
 * baglanma icin tutuyor, oda sinirda yer kapliyordu. Izinli cikista bitmis ya
 * da herkesin biraktigi oda beklemeden kapaniyor; co-op'ta kalanlar oynamaya
 * devam ediyor. Kayitlar once siliniyor ki yeni sayfa bu odaya donmeyi
 * denemesin. Cikis en iyi caba ve kisa (`leaveRoomQuietly`): olu soket
 * yuklemeyi bekletmiyor, yukleme her durumda oluyor.
 */
export function leaveMatchAndReload(
  room: Room | undefined,
  reload: () => void = () => window.location.reload(),
  timeoutMs = ROOM_LEAVE_TIMEOUT_MS
) {
  if (room) {
    clearMatchReconnect(room.roomId);
    clearActiveLobbyRoom(room.roomId);
  }
  return leaveRoomQuietly(room, timeoutMs).finally(reload);
}

export function isSeatReservationExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLocaleLowerCase("en-US").includes("seat reservation expired");
}

/**
 * Sunucu ayni anda acik oda sinirinda: yeni oda kurulamadi. Gecici bir
 * durum, hata degil; menu metni oldugu gibi gosteriyor, oyun cubugu kisaltiyor.
 */
export function isServerFullError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(SERVER_FULL_MESSAGE);
}

const SEAT_RESERVATION_RETRY_DELAYS_MS = [600, 1800];

const delay = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

/**
 * Suresi dolmus koltuk rezervasyonunda yeniden dener.
 *
 * Rezervasyonun dolmasinin tipik sebebi sunucunun o an mesgul olmasi: uyuyan bir
 * Fly makinesi uyaniyor ya da deploy sirasinda makine degisiyor. Bu yuzden
 * denemeler arasinda beklemek sart -- eski surum aninda tekrar deniyordu ve
 * makine hala hazir olmadigi icin ayni pencereye ikinci kez carpiyordu.
 */
export async function retryExpiredSeatReservation<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SEAT_RESERVATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSeatReservationExpiredError(error)) throw error;
      lastError = error;
      const wait = SEAT_RESERVATION_RETRY_DELAYS_MS[attempt];
      if (wait !== undefined) await delay(wait);
    }
  }
  throw lastError;
}

export function getSharedClient(serverUrl: string) {
  if (!sharedClient) {
    sharedClient = new Client(serverUrl);
  }

  return sharedClient;
}

export function setActiveLobbyRoom(room: Room | undefined) {
  activeLobbyRoom = room;
}

export function getActiveLobbyRoom() {
  return activeLobbyRoom;
}

export function clearActiveLobbyRoom(expectedRoomId?: string) {
  if (!activeLobbyRoom) {
    return;
  }

  if (!expectedRoomId || activeLobbyRoom.roomId === expectedRoomId) {
    activeLobbyRoom = undefined;
  }
}

/**
 * Suren macin yeniden baglanma kaydi.
 *
 * Sayfa yenilenince (ya da mobil tarayici sekmeyi oldurunce) bellekteki oda
 * ve yeniden baglanma anahtari kayboluyordu; geri donmenin tek yolu oda
 * listesiydi. Sunucu kopan oyuncunun yuvasini pencere boyunca ona ayiriyor,
 * yani anahtari olmayan oyuncu kendi yuvasina bu sure icinde donemiyordu.
 * Kayit sekmeye bagli (`sessionStorage`): ayni sekmede yeniden yuklemede
 * duruyor, baska sekmeye ya da cihaza tasinmiyor.
 */
export type MatchReconnectRecord = {
  roomId: string;
  token: string;
  /** Solo ve co-op kayitlari ayri anahtarlarda: sahne kipi buradan. */
  mode: "solo" | "online";
  characterId: string;
  /**
   * Odaya girerken kullanilan ad. Solo oda listede yok; pencere kapandiktan
   * sonra donen oyuncu odaya kimligiyle ve sahip sirriyla (`ownerSecret`)
   * giriyor. Eski kayitlarda yok.
   */
  playerName?: string;
  /**
   * Solo odanin sahip sirri (`createOwnerSecret`). Pencere kapandiktan sonra
   * sunucu yuvayi yalnizca bunu gosterene veriyor. Co-op kayitlarinda ve
   * eski kayitlarda yok.
   */
  ownerSecret?: string;
  mapScale: number;
  stage: number;
  savedAt: number;
};

const MATCH_RECONNECT_KEY = "karayel:match-reconnect";
/** Sunucu terk edilmis odayi bundan once kapatmiyor; daha eski kayit denenmiyor. */
const MATCH_RECONNECT_MAX_AGE_MS = 15 * 60 * 1000;

export function saveMatchReconnect(room: Room, info: Omit<MatchReconnectRecord, "roomId" | "token" | "savedAt">) {
  if (!room.reconnectionToken) return;
  const record: MatchReconnectRecord = { ...info, roomId: room.roomId, token: room.reconnectionToken, savedAt: Date.now() };
  try {
    window.sessionStorage.setItem(MATCH_RECONNECT_KEY, JSON.stringify(record));
  } catch {
    // Gizli pencere ya da kapali depolama: yeniden baglanma yalnizca listeden.
  }
}

export function loadMatchReconnect(): MatchReconnectRecord | undefined {
  try {
    const raw = window.sessionStorage.getItem(MATCH_RECONNECT_KEY);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as Partial<MatchReconnectRecord>;
    if (typeof record.token !== "string" || typeof record.roomId !== "string" || typeof record.characterId !== "string"
      || (record.mode !== "solo" && record.mode !== "online") || typeof record.savedAt !== "number"
      || Date.now() - record.savedAt > MATCH_RECONNECT_MAX_AGE_MS) {
      clearMatchReconnect();
      return undefined;
    }
    return {
      roomId: record.roomId,
      token: record.token,
      mode: record.mode,
      characterId: record.characterId,
      playerName: typeof record.playerName === "string" ? record.playerName : undefined,
      ownerSecret: typeof record.ownerSecret === "string" ? record.ownerSecret : undefined,
      mapScale: typeof record.mapScale === "number" ? record.mapScale : 1,
      stage: typeof record.stage === "number" ? record.stage : 1,
      savedAt: record.savedAt
    };
  } catch {
    return undefined;
  }
}

/** Kaydi siler; oda verilirse yalnizca o odanin kaydini. */
export function clearMatchReconnect(expectedRoomId?: string) {
  try {
    if (expectedRoomId) {
      const raw = window.sessionStorage.getItem(MATCH_RECONNECT_KEY);
      const record = raw ? JSON.parse(raw) as Partial<MatchReconnectRecord> : undefined;
      if (record?.roomId !== expectedRoomId) return;
    }
    window.sessionStorage.removeItem(MATCH_RECONNECT_KEY);
  } catch {
    // Depolama yoksa silinecek bir sey de yok.
  }
}

/**
 * Yeniden yuklemeden sonra suren maca donulen oda; sahne `create` yerine onu
 * kullaniyor. Kip kayittan: solo mac co-op rekoru olarak yazilmasin.
 */
let resumedMatch: { room: Room; mode: "solo" | "online"; ownerSecret?: string } | undefined;

/** Sahip sirri da tasiniyor: sahne kaydi yeniden yazarken onu korusun. */
export function setResumedMatch(room: Room, mode: "solo" | "online", ownerSecret?: string) {
  resumedMatch = { room, mode, ownerSecret };
}

export function takeResumedMatch() {
  const match = resumedMatch;
  resumedMatch = undefined;
  return match;
}

/**
 * Kayitli anahtarla odaya donmeyi dener; olmazsa kaydi silip `undefined` doner.
 *
 * Anahtar yalnizca yeniden baglanma penceresinde gecerli. Co-op odasina
 * pencereden sonra listeden donuluyor; solo oda listede olmadigi icin oraya
 * kayitli oda kimligi ve sahip sirriyla donuluyor (sunucu yuvayi yalnizca
 * sirri gosterene veriyor).
 */
export async function resumeSavedMatch(serverUrl: string, record: MatchReconnectRecord) {
  const client = getSharedClient(serverUrl);
  try {
    return await client.reconnect(record.token);
  } catch {
    if (record.mode === "solo" && record.playerName && record.ownerSecret) {
      try {
        return await client.joinById(record.roomId, withWireCaps({
          playerName: record.playerName,
          characterId: record.characterId,
          ownerSecret: record.ownerSecret
        }));
      } catch {
        // Oda kapandi, mac bitti ya da yuva baskasinin: normal menu akisi.
      }
    }
    clearMatchReconnect(record.roomId);
    return undefined;
  }
}
