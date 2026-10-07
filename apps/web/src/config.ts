export const gameServerUrl =
  import.meta.env.VITE_GAME_SERVER_URL ??
  (import.meta.env.PROD ? "wss://karayel-online.fly.dev" : `ws://${window.location.hostname}:2567`);

export const healthUrl = gameServerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:") + "/health";
export const roomsUrl = gameServerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:") + "/rooms";

// itch.io oyunu baska kokenli bir iframe'de aciyor; ucuncu taraf cerezleri
// kapali Chrome orada localStorage'a erisimde hata firlatiyor. Ad kaydedilemezse
// bu oturum icin uretilen adla devam.
let sessionPlayerName = "";

export function getPlayerName() {
  try {
    const savedName = window.localStorage.getItem("karayel_player_name");
    if (savedName) {
      return savedName;
    }
  } catch {
    // Depolama kapali.
  }

  sessionPlayerName ||= `Oyuncu ${Math.floor(Math.random() * 900 + 100)}`;
  try {
    window.localStorage.setItem("karayel_player_name", sessionPlayerName);
  } catch {
    // Depolama kapali.
  }
  return sessionPlayerName;
}
