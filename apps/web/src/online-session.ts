import { Client, Room } from "colyseus.js";

let sharedClient: Client | undefined;
let activeLobbyRoom: Room | undefined;

export function isSeatReservationExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLocaleLowerCase("en-US").includes("seat reservation expired");
}

export async function retryExpiredSeatReservation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isSeatReservationExpiredError(error)) throw error;
    return operation();
  }
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
