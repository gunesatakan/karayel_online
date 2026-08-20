import { Client, Room } from "colyseus.js";

let sharedClient: Client | undefined;
let activeLobbyRoom: Room | undefined;

export function isSeatReservationExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLocaleLowerCase("en-US").includes("seat reservation expired");
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
