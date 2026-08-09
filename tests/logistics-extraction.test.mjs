import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_EXTRACTION_DURATION_MS, advanceResourceExtraction } from "../packages/shared/dist/index.js";

test("kaynak çıkarma beş saniye dolmadan tamamlanmaz", () => {
  let state = advanceResourceExtraction(undefined, 1000);
  assert.equal(state.remainingMs, 4000);
  assert.equal(state.completed, false);

  state = advanceResourceExtraction(state.remainingMs, 3999);
  assert.equal(state.remainingMs, 1);
  assert.equal(state.completed, false);
});

test("kaynak çıkarma toplam beş saniyede tamamlanır", () => {
  let remainingMs;
  for (let second = 0; second < 5; second += 1) {
    const state = advanceResourceExtraction(remainingMs, 1000);
    remainingMs = state.remainingMs;
    assert.equal(state.completed, second === 4);
  }
  assert.equal(RESOURCE_EXTRACTION_DURATION_MS, 5000);
  assert.equal(remainingMs, 0);
});
