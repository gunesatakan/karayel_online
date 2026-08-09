import assert from "node:assert/strict";
import test from "node:test";
import { getClientBufferedAmount, MatchRoom, roundNetworkNumber } from "../apps/server/dist/rooms/MatchRoom.js";

test("WebSocket bufferedAmount farklı taşıma şekillerinden okunur", () => {
  assert.equal(getClientBufferedAmount({ ref: { bufferedAmount: 1234 } }), 1234);
  assert.equal(getClientBufferedAmount({ ref: { _socket: { bufferedAmount: 5678 } } }), 5678);
  assert.equal(getClientBufferedAmount({ ref: {} }), 0);
});

test("snapshot sayıları tek ondalığa kırpılır", () => {
  assert.equal(roundNetworkNumber(234.56789123), 234.6);
  assert.equal(roundNetworkNumber(-1.234), -1.2);
});

test("kuyruğu dolu istemciye snapshot eklenmez", () => {
  const room = new MatchRoom();
  let healthySends = 0;
  let congestedSends = 0;
  room.clients.push(
    { ref: { bufferedAmount: 0 }, send() { healthySends += 1; } },
    { ref: { bufferedAmount: 300 * 1024 }, send() { congestedSends += 1; } }
  );

  assert.equal(room.sendSnapshotWithBackpressure({}), true);
  assert.equal(healthySends, 1);
  assert.equal(congestedSends, 0);
});
