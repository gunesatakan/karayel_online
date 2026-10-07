/**
 * itch.io'ya yuklenecek HTML5 paketi.
 *
 *   npm run build:itch
 *   VITE_GAME_SERVER_URL=wss://baska-sunucu.fly.dev npm run build:itch
 *   npm run build:itch -- --server wss://baska-sunucu.fly.dev
 *
 * Istemciyi uretip (`npm run build:web`) `apps/web/dist` klasorunu
 * `dist/itch/uzay-savunma-web.zip` olarak paketliyor; zip kokunde
 * `index.html` var, itch'in istedigi bu. Sunucu adresi derleme aninda
 * `VITE_GAME_SERVER_URL` ile gomuluyor (`apps/web/src/config.ts`); verilmezse
 * uretim sunucusu.
 *
 * Zip'i kendimiz yaziyoruz: Windows'ta PowerShell 5.1 `Compress-Archive`
 * yol ayiricisi olarak ters bolu yaziyor, itch o paketi acamiyor. Bagimlilik
 * da istemiyoruz; node'un zlib'i (deflate + crc32) yetiyor.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "apps/web/dist");
const outFile = join(root, "dist/itch/uzay-savunma-web.zip");

/** itch.io HTML5 sinirlari: en fazla 1000 dosya, dosya basina 200 MB. */
export const ITCH_MAX_FILES = 1000;
export const ITCH_MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Zaten sikistirilmis bicimler: deflate yer kazandirmiyor, oldugu gibi. */
const STORED_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg", ".mp3", ".ogg", ".m4a", ".woff2"]);

/** Paketlenecek dosyalar; yollar ileri bolulu, kaynak haritalari disarida. */
export function collectFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!entry.name.endsWith(".map")) {
        files.push({ name: relative(dir, full).split(sep).join("/"), full });
      }
    }
  };
  walk(dir);
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Paketin itch'te calismasini bozacak seyler: kokte index.html yok, sinir
 * asimi, ya da kok mutlak bir varlik yolu (alt yolda 404 verir).
 */
export function checkBundle(files) {
  const problems = [];
  if (!files.some((file) => file.name === "index.html")) problems.push("kokte index.html yok");
  if (files.length > ITCH_MAX_FILES) problems.push(`${files.length} dosya; itch siniri ${ITCH_MAX_FILES}`);
  for (const file of files) {
    const size = file.data?.length ?? statSync(file.full).size;
    if (size > ITCH_MAX_FILE_BYTES) problems.push(`${file.name} cok buyuk (${size} bayt)`);
    if (/\.(html|js|css|webmanifest)$/.test(file.name)) {
      const text = (file.data ?? readFileSync(file.full)).toString("utf8");
      const absolute = text.match(/["'`(]\/(images|audio|assets)\/[^"'`)\s]*/);
      if (absolute) problems.push(`${file.name}: kok mutlak yol ${absolute[0].slice(1)}`);
    }
  }
  return problems;
}

/** Sabit tarih (1980-01-01): ayni girdi ayni zip, karsilastirmasi kolay. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

/** `[{ name, data }]` -> zip baytlari. */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    const deflated = STORED_EXTENSIONS.has(extension) ? undefined : deflateRawSync(data, { level: 9 });
    const useDeflate = deflated !== undefined && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // 30: ek alan, 32: yorum, 34: disk, 36: ic nitelik, 38: dis nitelik
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function parseServerArg(argv) {
  const index = argv.indexOf("--server");
  return index >= 0 ? argv[index + 1] : undefined;
}

function main() {
  const server = parseServerArg(process.argv.slice(2)) ?? process.env.VITE_GAME_SERVER_URL;
  if (server && !/^wss?:\/\//.test(server)) {
    console.error(`Sunucu adresi ws:// ya da wss:// ile baslamali: ${server}`);
    process.exit(1);
  }
  const env = { ...process.env };
  if (server) env.VITE_GAME_SERVER_URL = server;

  // Tek dizge + kabuk: Windows'ta npm bir .cmd, dogrudan calistirilamiyor.
  const built = spawnSync("npm run build:web", { cwd: root, env, stdio: "inherit", shell: true });
  if (built.status !== 0) process.exit(built.status ?? 1);

  const files = collectFiles(distDir).map((file) => ({ ...file, data: readFileSync(file.full) }));
  const problems = checkBundle(files);
  if (problems.length > 0) {
    console.error("Paket itch.io icin hazir degil:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const zip = createZip(files);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, zip);
  const rawBytes = files.reduce((sum, file) => sum + file.data.length, 0);
  console.log(`\nitch.io paketi: ${relative(root, outFile).split(sep).join("/")}`);
  console.log(`  ${files.length} dosya, ${(rawBytes / 1048576).toFixed(1)} MB acik, ${(zip.length / 1048576).toFixed(1)} MB zip`);
  console.log(`  sunucu: ${server ?? "wss://karayel-online.fly.dev (varsayilan)"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
