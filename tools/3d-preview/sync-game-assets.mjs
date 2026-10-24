import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOWER_ASSETS, STAGE_ASSETS } from "./src/asset-catalog.js";

const check = process.argv.includes("--check");
const assets = [...TOWER_ASSETS.map((a) => a.art), ...STAGE_ASSETS.map((a) => a.texture)];
const records = assets.map((path) => {
  const source = `apps/web/public/images/${path.replace("game-assets/", "")}`;
  const data = readFileSync(new URL(`../../${source}`, import.meta.url));
  const destination = new URL(`public/${path}`, import.meta.url);
  if (check) {
    if (!data.equals(readFileSync(destination))) throw new Error(`Asset changed: ${source}. Run npm run sync:assets.`);
  } else {
    mkdirSync(dirname(fileURLToPath(destination)), { recursive: true });
    writeFileSync(destination, data);
  }
  return { source, destination: path, sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
});
const manifest = JSON.stringify({ note: "Original game art copied byte-for-byte. Tower GLBs are new, hand-constructed visual interpretations of the level 1–4 art; unseen sides are designed, not recovered.", assets: records }, null, 2) + "\n";
const target = new URL("public/game-assets/provenance.json", import.meta.url);
if (check) {
  if (readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== manifest) throw new Error("Asset provenance is stale.");
} else writeFileSync(target, manifest);
console.log(`${assets.length} original game assets ${check ? "verified" : "copied"}; live game files unchanged.`);
