/**
 * itch.io HTML5 paketi.
 *
 * itch oyunu `html.itch.zone/html/<id>/index.html` gibi bir alt yoldan
 * sunuyor; kok mutlak bir varlik yolu ("/images/...") orada alan adinin
 * kokune gidip 404 veriyor. Paket goreli tabanla (`base: "./"`) uretiliyor,
 * `public/` dosyalari kodda `assetUrl()` ile isteniyor.
 *
 * `tools/build-itch.mjs` zip'i kendi yaziyor (Compress-Archive ters bolu
 * yaziyor); burada zip'i geri acip icerigi ve yol ayiricisini dogruluyoruz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { checkBundle, createZip } from "../tools/build-itch.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const readSource = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

function listSources(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listSources(path);
    return /\.(ts|html)$/.test(entry.name) ? [path] : [];
  });
}

/** Merkez dizinden girdileri okuyup acar: `[{ name, data, method }]`. */
function readZip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "merkez dizin sonu var");
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const compressed = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const localName = zip.readUInt16LE(local + 26);
    const localExtra = zip.readUInt16LE(local + 28);
    const body = zip.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed);
    entries.push({ name, method, data: method === 8 ? inflateRawSync(body) : Buffer.from(body) });
    cursor += 46 + nameLength;
  }
  return entries;
}

test("istemci kaynaginda kok mutlak varlik yolu yok; vite goreli tabanla uretiyor", () => {
  const offenders = [];
  for (const path of listSources("apps/web/src").concat(["apps/web/index.html"])) {
    const lines = readSource(path).split("\n");
    lines.forEach((line, index) => {
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
      if (/["'`]\/(images|audio|icon\.svg|manifest\.webmanifest|sw\.js)/.test(line)) offenders.push(`${path}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
  assert.match(readSource("apps/web/vite.config.ts"), /base: "\.\/"/);

  const manifest = JSON.parse(readSource("apps/web/public/manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.every((icon) => !icon.src.startsWith("/")));
});

test("assetUrl gelistirmede kokten, node'da (import.meta.env yok) yine kokten cozer", async () => {
  const { assetUrl } = await importWebModule("apps/web/src/asset-url.ts");
  assert.equal(assetUrl("images/a.png"), "/images/a.png");
  assert.equal(assetUrl("/audio/sfx/"), "/audio/sfx/", "bastaki bolu tekrarlanmiyor");
});

test("zip geri acilinca ayni dosyalar ileri bolulu yollarla; medya sikistirilmadan", () => {
  const files = [
    { name: "index.html", data: Buffer.from("<!doctype html><script src=\"./assets/a.js\"></script>".repeat(20)) },
    { name: "assets/a.js", data: Buffer.from("console.log('Nexhold — çalışıyor');".repeat(50)) },
    { name: "images/towers/kule.webp", data: Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]) },
    { name: "audio/sfx/bos.mp3", data: Buffer.alloc(0) }
  ];
  const entries = readZip(createZip(files));
  assert.deepEqual(entries.map((entry) => entry.name), files.map((file) => file.name));
  for (const [index, entry] of entries.entries()) {
    assert.ok(!entry.name.includes("\\"), "ters bolu yok");
    assert.ok(entry.data.equals(files[index].data), `${entry.name} ayni`);
  }
  assert.equal(entries[0].method, 8, "metin sikistiriliyor");
  assert.equal(entries[2].method, 0, "webp oldugu gibi");
  assert.ok(createZip(files).equals(createZip(files)), "ayni girdi ayni zip");
});

test("paket denetimi: kokte index.html sart, kok mutlak yol yakalaniyor", () => {
  const ok = [
    { name: "index.html", data: Buffer.from('<script src="./assets/a.js"></script>') },
    { name: "assets/a.js", data: Buffer.from('load("./images/a.png")') }
  ];
  assert.deepEqual(checkBundle(ok), []);
  assert.match(checkBundle(ok.slice(1)).join(), /index\.html/);
  const absolute = [ok[0], { name: "assets/a.js", data: Buffer.from('new Audio("/audio/x.mp3")') }];
  assert.match(checkBundle(absolute).join(), /kok mutlak yol \/audio\/x\.mp3/);
});
