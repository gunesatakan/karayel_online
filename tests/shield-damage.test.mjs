import assert from "node:assert/strict";
import test from "node:test";
import {
  SHIELD_DAMAGE_TAKEN_MULTIPLIER,
  calculateDamageTaken
} from "../packages/shared/dist/index.js";

const physicalHit = (amount) => ({ amount, damageType: "physical", hitType: "projectile" });

test("shield takes fifty percent damage while it remains active", () => {
  const result = calculateDamageTaken(physicalHit(40), { armor: 0, shield: 100 });
  assert.equal(SHIELD_DAMAGE_TAKEN_MULTIPLIER, 0.5);
  assert.equal(result.rawDamage, 40);
  assert.equal(result.shieldDamage, 20);
  assert.equal(result.hpDamage, 0);
  assert.equal(result.remainingShield, 80);
});

test("damage left after breaking a resistant shield reaches health at full rate", () => {
  const result = calculateDamageTaken(physicalHit(40), { armor: 0, shield: 10 });
  assert.equal(result.shieldDamage, 10);
  assert.equal(result.hpDamage, 20);
  assert.equal(result.totalDamage, 30);
  assert.equal(result.remainingShield, 0);
});

test("shield resistance does not reduce damage when no shield remains", () => {
  const result = calculateDamageTaken(physicalHit(40), { armor: 0, shield: 0 });
  assert.equal(result.shieldDamage, 0);
  assert.equal(result.hpDamage, 40);
  assert.equal(result.totalDamage, 40);
});

test("true damage also respects the shield layer but still ignores armor", () => {
  const result = calculateDamageTaken({ amount: 40, damageType: "true" }, { armor: 999, shield: 100 });
  assert.equal(result.rawDamage, 40);
  assert.equal(result.shieldDamage, 20);
  assert.equal(result.hpDamage, 0);
});
