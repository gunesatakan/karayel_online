import test from "node:test";
import assert from "node:assert/strict";
import { dispatchTowerTriggers } from "../packages/shared/dist/index.js";

const triggers = [
  { event: "kill", effect: "overdrive", cooldownMs: 5000 },
  { event: "escape", effect: "rage-wave" },
  { event: "overheat", effect: "disable" }
];

test("yalnız gerçekleşen olaya bağlı triggerları döndürür", () => {
  const result = dispatchTowerTriggers(triggers, "escape", { now: 1000 });
  assert.deepEqual(result.effects, ["rage-wave"]);
});

test("trigger cooldown süresinde tekrar çalışmaz", () => {
  const first = dispatchTowerTriggers(triggers, "kill", { now: 1000 });
  const blocked = dispatchTowerTriggers(triggers, "kill", { now: 4000, cooldowns: first.cooldowns });
  const ready = dispatchTowerTriggers(triggers, "kill", { now: 6000, cooldowns: first.cooldowns });
  assert.deepEqual(first.effects, ["overdrive"]);
  assert.deepEqual(blocked.effects, []);
  assert.deepEqual(ready.effects, ["overdrive"]);
});

test("aynı olaydaki birden fazla effect tanım sırasıyla çalışır", () => {
  const result = dispatchTowerTriggers([
    { event: "ammoEmpty", effect: "alarm" },
    { event: "ammoEmpty", effect: "shutdown" }
  ], "ammoEmpty", { now: 10 });
  assert.deepEqual(result.effects, ["alarm", "shutdown"]);
});

test("koşulu sağlanmayan trigger çalışmaz", () => {
  const conditional = [{ event: "kill", effect: "marked-overdrive", condition: "targetMarked" }];
  assert.deepEqual(dispatchTowerTriggers(conditional, "kill", { now: 1, conditions: [] }).effects, []);
  assert.deepEqual(dispatchTowerTriggers(conditional, "kill", { now: 1, conditions: ["targetMarked"] }).effects, ["marked-overdrive"]);
});

test("tanımsız olay yan etki veya cooldown üretmez", () => {
  assert.deepEqual(dispatchTowerTriggers([], "towerDeath", { now: 1 }), { effects: [], cooldowns: {} });
});
