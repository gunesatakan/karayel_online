/**
 * Operator bedeni dokulari (ZentaX, AttackLord): beyaz zeminli ana gorselden
 * saydam, kirpilmis oyun dokusu.
 *
 * Kaynaklar `assets-src/operator-bodies/` altinda (sahibin gonderdigi tepeden
 * bakis gorseller, ~1254 kare, beyaz zemin). Cikti
 * `apps/web/public/images/operators/body-<karakter>.webp`.
 *
 * Zincir:
 *  1. ffmpeg kaynagi ham RGBA'ya cozuyor (webp/png fark etmez).
 *  2. Zemin: kenarlardan baslayan taskin dolgusu yalnizca "beyaza yakin"
 *     (en koyu kanal >= 226, doygunluk dusuk) piksellerden yuruyor. Govdenin
 *     kalin siyah dis cizgisi dolguyu durduruyor; govde icindeki fildisi ve
 *     gumus yuzeyler zemine bagli olmadigi icin korunuyor.
 *  3. Kenar: zemine 3 piksel yakin, gri tonlu (dis cizginin beyazla
 *     karisimi) pikseller beyazdan ayristiriliyor: alfa = 1 - parlaklik,
 *     renk = siyaha dogru geri cozulmus. Beyaz hale kalmiyor.
 *  4. Kirpma: alfasi gorunur piksellerin kutusu, kenara %3 pay; kare tuval
 *     (doku donerken kesilmesin).
 *  5. Kucultme: on carpimli (premultiplied) alan ortalamasi; saydam
 *     piksellerin rengi kenara sizmiyor. Uzun kenar `SIZE`.
 *  6. ffmpeg kayipsiz webp (alfali) yaziyor.
 *
 * Calistirma: node tools/build-operator-bodies.mjs [--ffmpeg <ffmpeg.exe>]
 * (ya da FFMPEG ortam degiskeni; ffmpeg yolda ise gerek yok)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ffmpegFlag = args.indexOf("--ffmpeg");
const ffmpeg = ffmpegFlag >= 0 && args[ffmpegFlag + 1] ? args[ffmpegFlag + 1] : process.env.FFMPEG || "ffmpeg";

/** Dokunun uzun kenari (piksel). Ekranda ~20 dunya birimi; yakinlastirma ve yuksek DPR icin pay. */
const SIZE = 192;

const SOURCES = [
  { characterId: "zeynep", source: "assets-src/operator-bodies/zentax-body.webp" },
  { characterId: "warrior", source: "assets-src/operator-bodies/attacklord-body.webp" }
];

function probe(path) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", path], { encoding: "utf8" });
  const match = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(result.stderr ?? "");
  if (!match) throw new Error(`boyut okunamadi: ${path}\n${result.stderr}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function decode(path) {
  const { width, height } = probe(path);
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`cozulemedi: ${path}\n${result.stderr}`);
  const data = new Uint8Array(result.stdout.buffer, result.stdout.byteOffset, result.stdout.byteLength);
  if (data.length !== width * height * 4) throw new Error(`beklenmeyen boy: ${data.length} != ${width * height * 4}`);
  return { width, height, data: new Uint8ClampedArray(data) };
}

const isNearWhite = (r, g, b) => Math.min(r, g, b) >= 226 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;

function removeBackground(image) {
  const { width, height, data } = image;
  const background = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (background[index]) return;
    const offset = index * 4;
    if (!isNearWhite(data[offset], data[offset + 1], data[offset + 2])) return;
    background[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
  while (stack.length > 0) {
    const index = stack.pop();
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  // Zemine uzaklik (en fazla 3 piksel), kenar bandi icin.
  const distance = new Uint8Array(width * height).fill(255);
  for (let index = 0; index < background.length; index += 1) if (background[index]) distance[index] = 0;
  for (let pass = 1; pass <= 3; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (distance[index] !== 255) continue;
        const near = (x > 0 && distance[index - 1] === pass - 1) || (x < width - 1 && distance[index + 1] === pass - 1)
          || (y > 0 && distance[index - width] === pass - 1) || (y < height - 1 && distance[index + width] === pass - 1);
        if (near) distance[index] = pass;
      }
    }
  }
  for (let index = 0; index < background.length; index += 1) {
    const offset = index * 4;
    if (background[index]) {
      data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
      continue;
    }
    if (distance[index] > 3) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Yalnizca gri (cizgi-beyaz karisimi) kenar pikseli; renkli isik ve yuzey korunuyor.
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) continue;
    const lightness = Math.min(r, g, b) / 255;
    const alpha = Math.max(0, Math.min(1, 1 - lightness));
    if (alpha >= 0.98) continue;
    const unmix = (channel) => alpha <= 0.01 ? 0 : Math.max(0, Math.min(255, (channel - (1 - alpha) * 255) / alpha));
    data[offset] = unmix(r); data[offset + 1] = unmix(g); data[offset + 2] = unmix(b);
    data[offset + 3] = Math.round(alpha * 255);
  }
  return image;
}

function trimToSquare(image) {
  const { width, height, data } = image;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 12) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left) throw new Error("gorunur piksel yok");
  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  const side = Math.ceil(Math.max(contentWidth, contentHeight) * 1.06);
  const out = new Uint8ClampedArray(side * side * 4);
  const offsetX = Math.floor((side - contentWidth) / 2) - left;
  const offsetY = Math.floor((side - contentHeight) / 2) - top;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const from = (y * width + x) * 4;
      const to = ((y + offsetY) * side + (x + offsetX)) * 4;
      out[to] = data[from]; out[to + 1] = data[from + 1]; out[to + 2] = data[from + 2]; out[to + 3] = data[from + 3];
    }
  }
  return { width: side, height: side, data: out, content: { width: contentWidth, height: contentHeight } };
}

function downscale(image, size) {
  const { width, data } = image;
  const scale = width / size;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const x0 = x * scale, x1 = (x + 1) * scale, y0 = y * scale, y1 = (y + 1) * scale;
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const w = wx * wy;
          const offset = (sy * width + sx) * 4;
          const alpha = data[offset + 3] / 255;
          r += data[offset] * alpha * w; g += data[offset + 1] * alpha * w; b += data[offset + 2] * alpha * w;
          a += alpha * w; weight += w;
        }
      }
      const offset = (y * size + x) * 4;
      const coverage = a / Math.max(1e-6, weight);
      out[offset] = a > 0 ? r / a : 0; out[offset + 1] = a > 0 ? g / a : 0; out[offset + 2] = a > 0 ? b / a : 0;
      out[offset + 3] = Math.round(coverage * 255);
    }
  }
  return { width: size, height: size, data: out };
}

function encode(image, path) {
  mkdirSync(dirname(path), { recursive: true });
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${image.width}x${image.height}`, "-i", "pipe:0",
    "-c:v", "libwebp", "-lossless", "1", "-compression_level", "6", "-pix_fmt", "bgra", "-frames:v", "1", path], { input: Buffer.from(image.data.buffer) });
  if (result.status !== 0) throw new Error(`yazilamadi: ${path}\n${result.stderr}`);
}

for (const { characterId, source } of SOURCES) {
  const decoded = removeBackground(decode(resolve(root, source)));
  const trimmed = trimToSquare(decoded);
  const output = resolve(root, `apps/web/public/images/operators/body-${characterId}.webp`);
  encode(downscale(trimmed, SIZE), output);
  console.log(`${characterId}: ${source} -> ${output} (icerik ${trimmed.content.width}x${trimmed.content.height}, ${statSync(output).size} bayt)`);
}
