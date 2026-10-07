import type Phaser from "phaser";
import { gameServerUrl } from "./config";
import {
  ErrorReporter,
  TELEMETRY_FLUSH_INTERVAL_MS,
  TelemetryClient,
  createBrowserTransport,
  describeSession,
  getInstallId,
  getTelemetryEndpoint,
  isTelemetryActive,
  isTelemetryBlockedLocation,
  onTelemetrySettingChange,
  randomId,
  runTelemetry,
  setActiveErrorReporter
} from "./telemetry";
import { setupTelemetryNotice } from "./telemetry-notice";

declare const __APP_VERSION__: string | undefined;

/**
 * Telemetrinin tarayici kablolamasi; yalnizca `main.ts`in oyun yolundan.
 *
 * Kapilar: derleme bayragi (`VITE_TELEMETRY=off`), adres (gelistirme sahnesi,
 * VFX galerisi), ilk acilis bildirimi (`telemetry-notice.ts`; gecilene kadar
 * kapali) ve oyuncunun ayari. Ayar kapaliyken istemci hicbir sey tutmuyor ve
 * yollamiyor; acilinca yeni olaylar gidiyor.
 *
 * Sunucu adresi oyun sunucusuyla ayni kaynaktan (`VITE_GAME_SERVER_URL`):
 * itch.io gibi goreli yoldan yuklenen derlemede de mutlak adres.
 */
export function startTelemetry(game: Phaser.Game) {
  const flag = String(import.meta.env.VITE_TELEMETRY ?? "").toLowerCase();
  if (flag === "off" || flag === "0" || flag === "false") return undefined;
  if (isTelemetryBlockedLocation(window.location)) return undefined;

  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
  const client = new TelemetryClient({
    endpoint: getTelemetryEndpoint(gameServerUrl),
    installId: getInstallId(),
    sessionId: randomId(),
    version,
    transport: createBrowserTransport(),
    // Ilk acilis bildirimi gecilmeden hicbir olay tutulmuyor ve gitmiyor.
    isEnabled: () => isTelemetryActive()
  });
  runTelemetry.bind((type, fields) => client.track(type, fields));

  const errors = new ErrorReporter({
    send: (fields) => client.track("error", fields),
    context: () => ({
      scene: game.scene.getScenes(true).map((scene) => scene.scene.key).join(","),
      wave: runTelemetry.currentWave,
      rid: runTelemetry.runId
    })
  });
  setActiveErrorReporter(errors);
  window.addEventListener("error", (event) => {
    errors.report(event.error ?? event.message, "error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.report(event.reason, "rejection");
  });
  // Phaser sahne hatalari rAF icinde firliyor ve `error` olayina dusuyor;
  // WebGL baglaminin kaybi ise hata degil olay: mobilde en sik cokme bu.
  game.events.on("contextlost", () => errors.report(new Error("WebGL context lost"), "phaser"));
  game.events.on("poststep", () => runTelemetry.noteFrame(performance.now()));

  const sendSessionStart = () => client.track("session_start", describeSession(window));
  // Bildirim gecilmediyse bu olay atiliyor; "Tamam" ayari tetikleyip yeniden yolluyor.
  sendSessionStart();
  setupTelemetryNotice();
  onTelemetrySettingChange((enabled) => {
    if (!enabled) client.clear();
    else sendSessionStart();
  });

  window.setInterval(() => client.flush(false), TELEMETRY_FLUSH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    runTelemetry.hidden();
    client.flush(true);
  });
  window.addEventListener("pagehide", () => {
    runTelemetry.leave("closed");
    client.flush(true);
  });
  return client;
}
