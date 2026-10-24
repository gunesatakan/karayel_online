import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildTower } from "./src/tower-models.js";
import { TOWER_ASSETS } from "./src/asset-catalog.js";

// GLTFExporter uses FileReader for binary buffers; Node already supplies Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const output = new URL("public/game-assets/models/", import.meta.url);
const check = process.argv.includes("--check");
if (!check) mkdirSync(output, { recursive: true });
for (const asset of TOWER_ASSETS) {
  const { root } = buildTower(asset.id);
  const data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  const destination = new URL(`${asset.id}.glb`, output);
  if (check) {
    if (!readFileSync(destination).equals(Buffer.from(data))) throw new Error(`Stale ${asset.id}.glb; run npm run models:export.`);
  } else writeFileSync(destination, Buffer.from(data));
  console.log(`${asset.id}: ${Math.round(data.byteLength / 1024)} KB GLB ${check ? "verified" : "exported"}`);
  root.traverse((object) => object.geometry?.dispose());
}
