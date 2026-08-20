/**
 * Oynatma saati.
 *
 * Istemci bir donem "en son gelen snapshot"i demir olarak tutuyor ve oynatma
 * zamanini her pakette o paketin varis anina gore yeniden kuruyordu. Her paketin
 * ag jitteri dogrudan render saatine biniyor, bazi kareler zamanda geriye
 * gidiyor ve dusmanlar yol uzerinde ileri geri mikro sicramalar yapiyordu.
 *
 * Buradaki testler o davranisin geri gelmesini engeller: kare ilerlemesi
 * duzgun kalmali ve hicbir kare zamanda geriye gitmemeli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_CLOCK_RESYNC_THRESHOLD_MS,
  SnapshotPlaybackClock
} from "../packages/shared/dist/index.js";

const SEND_MS = 33;
const FRAME_MS = 1000 / 60;
const DELAY = 500;

/** Jitterli paketler ve surekli akan kareler altinda hedef zamanlari toplar. */
function renderWithJitter(jitters, frames = 40) {
  const clock = new SnapshotPlaybackClock(DELAY);
  const targets = [];
  let nextPacket = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const localNow = frame * FRAME_MS;
    while (nextPacket < jitters.length && nextPacket * SEND_MS + jitters[nextPacket] <= localNow) {
      clock.observe(100_000 + nextPacket * SEND_MS, nextPacket * SEND_MS + jitters[nextPacket]);
      nextPacket += 1;
    }
    if (clock.isReady()) targets.push(clock.getTargetServerTime(localNow));
  }
  return targets;
}

const steps = (targets) => targets.slice(1).map((value, index) => value - targets[index]);

test("ilk snapshot gelene kadar saat hazir degil", () => {
  const clock = new SnapshotPlaybackClock(DELAY);
  assert.equal(clock.isReady(), false);
  clock.observe(100_000, 0);
  assert.equal(clock.isReady(), true);
});

test("jitter altinda hicbir kare zamanda geriye gitmez", () => {
  const jitters = [0, 18, -12, 25, -8, 14, -20, 6, -15, 10, -5, 22];
  const backward = steps(renderWithJitter(jitters)).filter((step) => step < 0);
  assert.deepEqual(backward, [], `zamanda geriye giden kareler: ${backward.join(", ")}`);
});

test("kare ilerlemesi gercek zamana yakin kalir", () => {
  const jitters = [0, 18, -12, 25, -8, 14, -20, 6, -15, 10, -5, 22];
  for (const step of steps(renderWithJitter(jitters))) {
    // Jitter dogrudan binseydi adimlar 16.7 yerine 0 ile 32 arasinda salinirdi.
    assert.ok(Math.abs(step - FRAME_MS) < 2, `kare adimi saptı: ${step.toFixed(1)}ms`);
  }
});

test("jitersiz akista saat tam gercek zamanda ilerler", () => {
  for (const step of steps(renderWithJitter(new Array(12).fill(0)))) {
    assert.ok(Math.abs(step - FRAME_MS) < 1e-9);
  }
});

test("gecikme kadar geriden oynatir", () => {
  const clock = new SnapshotPlaybackClock(DELAY);
  clock.observe(100_000, 1_000);
  assert.equal(clock.getTargetServerTime(1_000), 100_000 - DELAY);
});

test("buyuk sapmada saat yeniden kurulur", () => {
  const clock = new SnapshotPlaybackClock(DELAY);
  clock.observe(100_000, 0);
  const before = clock.getTargetServerTime(0);

  // Yeniden baglanma: sunucu saati esige gore cok daha ileri.
  const jump = SERVER_CLOCK_RESYNC_THRESHOLD_MS + 5_000;
  clock.observe(100_000 + jump, 0);
  const after = clock.getTargetServerTime(0);

  assert.equal(after - before, jump, "yeniden kurulum yumusatmaya takildi");
});

test("yumusatma gercek saat kaymasini yine de yakalar", () => {
  const clock = new SnapshotPlaybackClock(DELAY);
  const drift = 120;
  for (let packet = 0; packet < 400; packet += 1) {
    // Sabit bir kayma: her pakette sunucu saati biraz daha ileride gorunuyor.
    clock.observe(100_000 + packet * SEND_MS + drift, packet * SEND_MS);
  }
  const settled = clock.getTargetServerTime(0) + DELAY - 100_000;
  assert.ok(Math.abs(settled - drift) < 1, `kayma yakalanamadi: ${settled.toFixed(2)}`);
});
