// Renders tools/itch-cover/cover.html to the itch.io cover PNGs with headless Chrome or Edge.
//
//   node tools/itch-cover/render.mjs            -> docs/itch-page/cover-630x500-operators.png + cover-1260x1000-operators.png
//   node tools/itch-cover/render.mjs --out DIR  -> same two files into DIR (for trying changes)
//
// Needs network for the Google Fonts (Cinzel, Share Tech Mono) the page loads.
// Set CHROME_PATH to use a specific browser binary.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const outArg = process.argv.indexOf("--out");
const outDir = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(repo, "docs/itch-page");

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error("No Chrome/Edge found; set CHROME_PATH.");
  process.exit(1);
}

const page = pathToFileURL(join(here, "cover.html")).href;
mkdirSync(outDir, { recursive: true });

for (const scale of [1, 2]) {
  const out = join(outDir, `cover-${630 * scale}x${500 * scale}-operators.png`);
  const profile = mkdtempSync(join(tmpdir(), "itch-cover-"));
  const res = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--allow-file-access-from-files",
    `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${scale}`,
    "--window-size=630,500",
    "--virtual-time-budget=10000",
    `--screenshot=${out}`,
    page
  ], { stdio: "inherit" });
  rmSync(profile, { recursive: true, force: true });
  if (res.status !== 0 || !existsSync(out)) {
    console.error(`Render failed at ${scale}x`);
    process.exit(1);
  }
  console.log(`wrote ${out}`);
}
