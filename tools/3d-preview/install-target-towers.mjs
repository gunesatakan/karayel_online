// Copies target-style tower builds (build-target-tower.py output) into apps/web/public/models3d
// and refreshes their manifest entries. Usage: node install-target-towers.mjs <build-dir>
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = process.argv[2];
if (!buildDir || !existsSync(buildDir)) throw new Error("usage: node install-target-towers.mjs <build-dir>");
const modelsDir = fileURLToPath(new URL("../../apps/web/public/models3d/", import.meta.url));
const manifestPath = join(modelsDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const installed = [];
for (const file of readdirSync(buildDir).filter((name) => /^(warrior|zeynep)-\d+-tier-[123]\.glb$/.test(name)).sort()) {
  const key = file.replace(/\.glb$/, "");
  const target = join(modelsDir, file);
  copyFileSync(join(buildDir, file), target);
  const bytes = readFileSync(target);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  const triangles = json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0);
  const entry = {
    key,
    bytes: bytes.length,
    triangles,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: `asset-work/target-style/${key.replace(/-tier-\d$/, "")}/tier-${key.slice(-1)}-meshopt.glb (Tripo H3.1, target style)`
  };
  const index = manifest.models.findIndex((model) => model.key === key);
  if (index >= 0) manifest.models[index] = entry; else manifest.models.push(entry);
  installed.push(key);
}
manifest.note = "Game copies of the tower models. Target style (Endless Defense look): tools/3d-preview/build-target-tower.py from Tripo H3.1 sources. Not included in the itch.io package.";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`installed ${installed.length}: ${installed.join(", ")}`);
