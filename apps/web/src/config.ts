export const gameServerUrl =
  import.meta.env.VITE_GAME_SERVER_URL ??
  (import.meta.env.PROD ? "wss://karayel-online.fly.dev" : `ws://${window.location.hostname}:2567`);

export const healthUrl = gameServerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:") + "/health";

export function getPlayerName() {
  const savedName = window.localStorage.getItem("karayel_player_name");
  if (savedName) {
    return savedName;
  }

  const generatedName = `Oyuncu ${Math.floor(Math.random() * 900 + 100)}`;
  window.localStorage.setItem("karayel_player_name", generatedName);
  return generatedName;
}
