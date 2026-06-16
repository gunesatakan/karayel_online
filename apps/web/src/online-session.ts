import { Client, Room } from "colyseus.js";

let sharedClient: Client | undefined;
let activeLobbyRoom: Room | undefined;

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
