import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/**
 * Derlemenin surumu (`__APP_VERSION__`): paket surumu + commit ozeti.
 * Telemetri hatayi ve performansi hangi derlemenin urettigini bununla ayiriyor.
 * Git yoksa (ornegin arsivden derleme) yalnizca paket surumu.
 */
function resolveAppVersion() {
  let version = "0.0.0";
  try {
    version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version?: string }).version ?? version;
  } catch {
    // Paket okunamadi: varsayilan surum.
  }
  let hash = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "").slice(0, 7);
  if (!hash) {
    try {
      hash = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      hash = "";
    }
  }
  return hash ? `${version}+${hash}` : version;
}

export default defineConfig({
  // Goreli taban: paket hem alan adinin kokunden (Vercel) hem de bir alt
  // yoldan (itch.io `html.itch.zone/html/<id>/`) ayni dosyalarla calissin.
  // `public/` dosyalarini kodda `assetUrl()` ile istiyoruz.
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion())
  },
  server: {
    port: 5173
  }
});
