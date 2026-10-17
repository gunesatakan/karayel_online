/**
 * Duran tahtanin tekrar kontrolu: imza metni yerine agacla karsilastirma.
 *
 * `matchJsonTree` kesin cevap verdiginde (`SAME` / `DIFFERENT`) bu cevap
 * `JSON.stringify(a) === JSON.stringify(b)` ile birebir ayni olmali; karar
 * veremedigi (`UNKNOWN`) degerlerde oda metne dusuyor. Duz veride hic
 * `UNKNOWN` donmemeli, yoksa hizlandirma bosa gider.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  compileJsonTree,
  idleSnapshotSignature,
  JSON_TREE_DIFFERENT,
  JSON_TREE_SAME,
  JSON_TREE_UNKNOWN,
  matchJsonTree
} from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const THROWS = Symbol("throws");
function stringifyOrThrow(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return THROWS;
  }
}

function checkPair(a, b, label) {
  const textB = JSON.stringify(b);
  const result = matchJsonTree(a, compileJsonTree(JSON.parse(textB)));
  const textA = stringifyOrThrow(a);
  if (result === JSON_TREE_SAME) assert.equal(textA, textB, `SAME ama metin farkli: ${label}`);
  else if (result === JSON_TREE_DIFFERENT) assert.ok(textA === THROWS || textA !== textB, `DIFFERENT ama metin ayni: ${label}`);
  else assert.equal(result, JSON_TREE_UNKNOWN, label);
  return result;
}

const plainLeaves = [
  0, -0, 1, 1.5, -2, 1e21, 5e-324, NaN, Infinity, -Infinity, null, "", "a", "1", "null", "true", " ", "\ud800", true, false
];
const plainValues = [
  ...plainLeaves,
  [], [1, 2], [1, 2, 3], [2, 1], ["a"], [null], [undefined], [NaN], [Infinity], [[]], [{}], [, 1], new Array(2),
  {}, { a: 1 }, { a: 1, b: undefined }, { b: undefined, a: 1 }, { a: 2 }, { b: 1 }, { a: 1, b: 2 }, { b: 2, a: 1 },
  { a: null }, { a: NaN }, { a: undefined }, { a: [undefined] }, { a: [null] }, { a: {} }, { a: [] }, { 0: 1 }, { 1: "x", 0: "y" },
  [{ a: 1 }], [{ a: 1, b: undefined }], { towers: [{ id: "t1", hp: 5, disabled: undefined }], team: { gold: 3 } },
  Object.assign(Object.create(null), { a: 1 })
];
const exoticValues = [
  new Date(0), new Map([["a", 1]]), new Set([1]), Object(1), Object("a"), Object(true), new Uint8Array(2),
  { toJSON: () => 1 }, { a: 1, toJSON() { return { a: 2 }; } }, { a: { toJSON: () => undefined } }, [{ toJSON: () => null }],
  { a: () => 1 }, [() => 1], { a: Symbol("s") }, [Symbol("s")], { a: 1n }, [1n], new (class Box { constructor() { this.a = 1; } })(),
  { a: 1, b: { toJSON: () => undefined } }, { b: { toJSON: () => undefined }, a: 1 }
];

test("agac karsilastirmasi JSON metniyle birebir ayni cevabi veriyor", () => {
  const all = [...plainValues, ...exoticValues];
  const targets = all.filter((value) => typeof stringifyOrThrow(value) === "string");
  for (const a of all) {
    for (const b of targets) {
      checkPair(a, b, `${stringifyOrThrow(a)?.toString()} / ${JSON.stringify(b)}`);
    }
  }
});

test("duz veride agac hep kesin cevap veriyor", () => {
  for (const a of plainValues) {
    for (const b of plainValues) {
      const result = checkPair(a, b, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
      assert.notEqual(result, JSON_TREE_UNKNOWN, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    }
  }
});

test("ic ice snapshot: tek alan degisikligi, uye sirasi ve undefined uye", () => {
  const base = {
    serverTime: 0,
    players: [{ id: "p1", gold: 10, ownedCardIds: undefined, skillCooldowns: [0, 0, 1], hiredWorkers: [{ id: "w1", skillIds: ["a"] }] }],
    towers: [{ id: "t1", hp: 5, range: 120.5, linkedTowerIds: ["t2"], materials: { metal: 1 } }, { id: "t2", hp: 7 }],
    team: { ammunition: { bullet: 3 } }
  };
  const tree = compileJsonTree(JSON.parse(JSON.stringify(base)));
  assert.equal(matchJsonTree(structuredClone(base), tree), JSON_TREE_SAME);
  assert.equal(matchJsonTree({ ...base, extra: undefined }, tree), JSON_TREE_SAME);
  const variants = [
    { ...base, towers: [{ ...base.towers[0], hp: 6 }, base.towers[1]] },
    { ...base, towers: [base.towers[1], base.towers[0]] },
    { ...base, towers: [{ ...base.towers[0], materials: { metal: 1, crystal: 0 } }, base.towers[1]] },
    { ...base, players: [{ ...base.players[0], hiredWorkers: [{ id: "w1", skillIds: ["a", "b"] }] }] },
    { ...base, players: [{ ...base.players[0], ownedCardIds: [] }] },
    { team: base.team, serverTime: 0, players: base.players, towers: base.towers },
    { ...base, team: { ammunition: { bullet: 3.0000000001 } } }
  ];
  for (const variant of variants) {
    assert.equal(matchJsonTree(variant, tree), JSON_TREE_DIFFERENT, JSON.stringify(variant));
    assert.notEqual(JSON.stringify(variant), JSON.stringify(base));
  }
});

test("odanin gercek snapshotunda agac imzayla ayni karari veriyor", () => {
  const room = createRoom("warrior");
  room.setupPhase = true;
  room.broadcast = () => {};
  for (let index = 0; index < 6; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (!spot) break;
    room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  }
  const snapshot = room.getSnapshot();
  assert.ok(snapshot.towers.length > 0);
  const signature = idleSnapshotSignature(snapshot);
  const tree = compileJsonTree(JSON.parse(signature));
  const again = room.getSnapshot();
  assert.equal(matchJsonTree({ ...again, serverTime: 0 }, tree), idleSnapshotSignature(again) === signature ? JSON_TREE_SAME : JSON_TREE_DIFFERENT);
  assert.equal(matchJsonTree({ ...snapshot, serverTime: 0 }, tree), JSON_TREE_SAME);
  const changed = { ...snapshot, towers: snapshot.towers.map((tower, index) => (index === 0 ? { ...tower, hp: tower.hp - 1 } : tower)) };
  assert.equal(matchJsonTree({ ...changed, serverTime: 0 }, tree), JSON_TREE_DIFFERENT);
});
