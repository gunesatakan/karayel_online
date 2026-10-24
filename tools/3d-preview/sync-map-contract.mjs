import { readFileSync, writeFileSync } from "node:fs";
import {
  createOpenArenaMap,
  getMapGridSize,
  getMapOrigin,
  getMapWorldBounds,
} from "../../packages/shared/src/map.ts";

// Read dimensions from the real server; never execute or connect to MatchRoom.
const source = readFileSync(
  new URL("../../apps/server/src/rooms/MatchRoom.ts", import.meta.url),
  "utf8",
);
const dimensions = source.match(
  /const dimensions = \[([\s\S]*?)\]\[this\.mapScale - 1\]/,
)?.[1];
if (!dimensions)
  throw new Error(
    "Live arena dimensions could not be read; update the preview adapter explicitly.",
  );
const presets = [
  ...dimensions.matchAll(/\{\s*cols:\s*(\d+),\s*rows:\s*(\d+)\s*\}/g),
].map((match, index) => {
  const map = createOpenArenaMap(Number(match[1]), Number(match[2]));
  return {
    scale: index + 1,
    cols: map.cols,
    rows: map.rows,
    cellSize: getMapGridSize(map),
    origin: getMapOrigin(map),
    bounds: getMapWorldBounds(map),
  };
});
if (presets.length !== 4) throw new Error("Expected four arena sizes.");
const result =
  JSON.stringify(
    { source: "MatchRoom.configureArenaForScale + shared/map.ts", presets },
    null,
    2,
  ) + "\n";
const target = new URL("src/game-map.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== result)
    throw new Error(
      "Map contract changed. Run npm run sync:map and review the differences.",
    );
  console.log("Preview map dimensions match the game sources.");
} else {
  writeFileSync(target, result);
  console.log("Updated the preview-only map contract.");
}
