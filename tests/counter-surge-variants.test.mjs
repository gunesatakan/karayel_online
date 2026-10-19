/**
 * Karsi atak cesitleri: band, lance (mizrak), wall (perde), sweep (yandan
 * supurme), slash (capraz kesme) ve aegis (siper dalgasi).
 *
 * Uc katman: paylasilan plan (sayi, cesit kilidi, ayrisma, aralik, tohum),
 * gercek odada geometri ve hasar (cesit basina iceride bir kez ve dogru
 * anda, disarisi, dusman ve nexus dokunulmuyor, carpan, oyun hizi), ve
 * siperin atis kapisi (hedef secimi, ucan mermi, alan etkisi, kayboluyor).
 * Metal Kalkan yandan ve caprazdan gelen seridin de yalnizca kapattigi
 * kismini yutuyor; siper hasarsiz oldugu icin yutulmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATAKAN_SHIELD_SLOT,
  COUNTER_SURGE_KINDS,
  COUNTER_SURGE_KIND_TABLE,
  COUNTER_SURGE_MAX_ACTIVE,
  COUNTER_SURGE_PAIR_WINDOWS,
  COUNTER_SURGE_SECOND_CHANCE_BY_STAGE,
  GAME_SPEED_MULTIPLIER,
  addSurgeAbsorbedInterval,
  clipCounterSurgeLane,
  createSpecialRandom,
  decodeCounterSurgeKind,
  decodeCounterSurgeTravel,
  decodeSurgeCuts,
  encodeSurgeCuts,
  getAegisCrossMs,
  getAegisFrontFace,
  AEGIS_DRAWN,
  getCounterSurgeDamageRatio,
  getProjectileSceneScale,
  getProjectileShape,
  getCounterSurgeDiagonalOffsetLimit,
  getCounterSurgeGeometry,
  getSurgeObstacleContact,
  isSparedFromSurge,
  isStructureInSurgeWidth,
  getCounterSurgeKindsForStage,
  getCounterSurgeWidthCells,
  getMapGridSize,
  getMapOrigin,
  getSurgeFrontCrossing,
  gridToWorld,
  planCounterSurges,
  planWaveSpecials
} from "../packages/shared/dist/index.js";
import { clearBuildZones, createRoom } from "./helpers/match-room-harness.mjs";

const oyun = (ms) => ms / GAME_SPEED_MULTIPLIER;

function makeClient(sessionId = "p1") {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

/** Acik 12x18 arena, p1 AttackLord (Metal Kalkan icin). Yayinlar `room.sent`e. */
function oda(stage = 3) {
  const room = createRoom("warrior");
  const client = makeClient();
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  room.clients = [client];
  room.mapScale = 1;
  room.configureArenaForScale();
  // Sabit karelere yapi kuruluyor; yasak bolgeler ayri testte.
  clearBuildZones(room);
  room.stage = stage;
  room.wave = 8;
  room.sent = sent;
  room.client = client;
  return room;
}

function sahteSaat(fn) {
  const gercek = Date.now;
  const saat = { now: 1_800_000_000_000 };
  Date.now = () => saat.now;
  try {
    return fn(saat);
  } finally {
    Date.now = gercek;
  }
}

function kur(room, definitionId, col, row) {
  const point = gridToWorld(col, row, room.activeMap);
  const before = room.towers.size;
  room.placeTower(room.client, { x: point.x, y: point.y, definitionId });
  assert.equal(room.towers.size, before + 1, `${definitionId} (${col},${row}) kurulamadi`);
  return [...room.towers.values()].at(-1);
}

/** Hucre ortasinda sabit bir yer dusmani (zardan bagimsiz, hareketsiz). */
function dusman(room, col, row) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const point = gridToWorld(col, row, room.activeMap);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", x: point.x, y: point.y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0,
    navigator: undefined, navigatorStep: undefined, structureTargetId: undefined, special: undefined, champion: undefined,
    attackRange: 0, towerAttackCooldownMs: 0, attack: 0, speed: 0, abilities: []
  });
  // Konumu elle yazildi: uzamsal izgara (hedef secimi, carpisma) yeniden kuruluyor.
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

function nokta(room, col, row) {
  const grid = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  return { x: origin.x + col * grid, y: origin.y + row * grid };
}

function kalkan(room, c1, r1, c2, r2) {
  const a = nokta(room, c1, r1);
  const b = nokta(room, c2, r2);
  room.useSkill(room.client, { slot: ATAKAN_SHIELD_SLOT, x: a.x, y: a.y, x2: b.x, y2: b.y });
  return room.metalShields.at(-1);
}

function baslat(room, saat, kind, travel, lane = 0, width) {
  return room.launchCounterSurge({ atSpawn: 0, kind, travel, lane, width: width ?? getCounterSurgeWidthCells(kind, room.activeMap.cols, room.activeMap.rows) }, saat.now);
}

/** Seridi verilen ilerlemeye (0..1) kadar surer. */
function ilerlet(room, saat, surge, progress, step = 50) {
  const hedef = surge.launchAt + progress * surge.crossMs;
  while (saat.now < hedef) {
    saat.now = Math.min(hedef, saat.now + step);
    room.updateCounterSurge(saat.now);
  }
}

/** Serit bitene kadar surer; her adimda `onStep`. */
function bitir(room, saat, surge, onStep, step = 50) {
  for (let guard = 0; room.counterSurges.includes(surge) && guard < 100_000; guard += 1) {
    saat.now += step;
    room.updateCounterSurge(saat.now);
    onStep?.();
  }
}

// --- Plan --------------------------------------------------------------------------

const planOf = (stage, wave, seed, spawnCount = 30, cols = 12, rows = 18) =>
  planCounterSurges({ stage, wave, spawnCount, cols, rows, random: createSpecialRandom(seed, wave) });

test("plan: dalga başına sayı aşama tablosuna uyuyor (2: 1, 3: 1+%35, 4: 1+%65, 5: 2)", () => {
  const seeds = 1200;
  for (const stage of [2, 3, 4, 5]) {
    let twos = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const plan = planOf(stage, 4 + (seed % 15), seed);
      assert.ok(plan.length === 1 || plan.length === 2, `${stage}: ${plan.length}`);
      if (plan.length === 2) twos += 1;
    }
    const share = twos / seeds;
    const expected = COUNTER_SURGE_SECOND_CHANCE_BY_STAGE[stage];
    assert.ok(Math.abs(share - expected) < 0.05, `${stage}. asama ikinci serit payi ${share} (beklenen ${expected})`);
  }
});

test("plan: 1. aşamada ve 4. dalgadan önce hiç yok; plan zarı tohumla belirlenimci", () => {
  for (let wave = 1; wave <= 20; wave += 1) {
    assert.deepEqual(planOf(1, wave, 7), []);
    assert.equal(planWaveSpecials({ stage: 1, wave, slotCount: 30, cols: 12, rows: 18, random: createSpecialRandom(7, wave) }), undefined);
  }
  for (const stage of [2, 3, 4, 5]) {
    for (let wave = 1; wave < 4; wave += 1) {
      for (let seed = 1; seed <= 30; seed += 1) assert.deepEqual(planOf(stage, wave, seed), [], `${stage}/${wave}`);
    }
  }
  for (let seed = 1; seed <= 50; seed += 1) {
    assert.deepEqual(planOf(4, 9, seed), planOf(4, 9, seed));
    const a = planWaveSpecials({ stage: 5, wave: 11, slotCount: 36, cols: 12, rows: 18, random: createSpecialRandom(seed, 11) });
    const b = planWaveSpecials({ stage: 5, wave: 11, slotCount: 36, cols: 12, rows: 18, random: createSpecialRandom(seed, 11) });
    assert.deepEqual(a, b);
  }
});

test("plan: çeşitler aşamayla açılıyor (2: band/lance/wall/sweep; 3+: slash ve aegis de)", () => {
  assert.deepEqual(getCounterSurgeKindsForStage(1), []);
  assert.deepEqual(getCounterSurgeKindsForStage(2), ["band", "lance", "wall", "sweep"]);
  for (const stage of [3, 4, 5, 8]) assert.deepEqual(getCounterSurgeKindsForStage(stage), [...COUNTER_SURGE_KINDS]);
  const seen = { 2: new Set(), 3: new Set() };
  for (let seed = 1; seed <= 600; seed += 1) {
    for (const stage of [2, 3]) for (const surge of planOf(stage, 10, seed)) seen[stage].add(surge.kind);
  }
  assert.deepEqual([...seen[2]].sort(), ["band", "lance", "sweep", "wall"]);
  assert.deepEqual([...seen[3]].sort(), [...COUNTER_SURGE_KINDS].sort());
  // Agirliklar: 3/3/2/3/2/2.
  assert.deepEqual(COUNTER_SURGE_KINDS.map((kind) => COUNTER_SURGE_KIND_TABLE[kind].weight), [3, 3, 2, 3, 2, 2]);
});

test("plan: aynı dalgadaki iki şerit çeşitte ya da yönde ayrışıyor, ayrı anlarda; iki siper yok", () => {
  let pairs = 0;
  let sameKindOpposite = 0;
  for (let seed = 1; seed <= 1500; seed += 1) {
    const plan = planOf(5, 4 + (seed % 16), seed, 20 + (seed % 30));
    assert.equal(plan.length, 2);
    pairs += 1;
    const [a, b] = plan;
    assert.ok(a.kind !== b.kind || a.travel !== b.travel, `ayni serit iki kez: ${JSON.stringify(plan)}`);
    if (a.kind === b.kind) {
      sameKindOpposite += 1;
      assert.ok(["sweep", "slash"].includes(a.kind), `yonu degismeyen cesit iki kez: ${a.kind}`);
    }
    assert.ok(!(a.kind === "aegis" && b.kind === "aegis"), "iki siper");
    assert.ok(b.atSpawn > a.atSpawn, `anlar ayri degil: ${a.atSpawn} / ${b.atSpawn}`);
    const count = 20 + (seed % 30);
    const [[min1, span1], [min2, span2]] = COUNTER_SURGE_PAIR_WINDOWS;
    assert.ok(a.atSpawn >= Math.floor(count * min1) && a.atSpawn <= Math.floor(count * (min1 + span1)), `ilk an ${a.atSpawn}/${count}`);
    assert.ok(b.atSpawn >= Math.floor(count * min2) - 1 && b.atSpawn <= count - 1, `ikinci an ${b.atSpawn}/${count}`);
  }
  assert.ok(pairs > 0 && sameKindOpposite > 0, "ayni cesit ters yonden hic cikmadi");
});

test("plan: genişlik ve şerit haritaya sığıyor; perde ve siper küçük haritada yarıya kırpılıyor; yandan gelen kenar satırlara taşmıyor", () => {
  assert.equal(getCounterSurgeWidthCells("wall", 12, 18), 6);
  assert.equal(getCounterSurgeWidthCells("aegis", 8, 12), 4);
  assert.equal(getCounterSurgeWidthCells("wall", 24, 36), 6);
  assert.equal(getCounterSurgeWidthCells("lance", 12, 18), 1);
  assert.equal(getCounterSurgeWidthCells("sweep", 12, 18), 3);
  // Kenarda kirpilan serit daha dar ama hep haritada; capraz ana kosegenden
  // ceyrek hucre adimiyla kayiyor (12x18: |kaydirma| <= R + 1,5).
  const diagonalLimit = getCounterSurgeDiagonalOffsetLimit(12, 18, 3);
  assert.ok(diagonalLimit >= 10.75 && diagonalLimit <= 11, `capraz sinir ${diagonalLimit}`);
  for (let seed = 1; seed <= 400; seed += 1) {
    for (const surge of planOf(3 + (seed % 3), 10, seed)) {
      const full = getCounterSurgeWidthCells(surge.kind, 12, 18);
      assert.ok(surge.width >= 1 && surge.width <= full, `${surge.kind} genislik ${surge.width}`);
      if (surge.travel === "down") assert.ok(surge.lane >= 0 && surge.lane + surge.width <= 12);
      else if (surge.travel === "left" || surge.travel === "right") assert.ok(surge.lane >= 1 && surge.lane + surge.width <= 17, `satir ${surge.lane}`);
      else {
        assert.equal(surge.width, full, "capraz genislik kirpilmiyor");
        assert.ok(Math.abs(surge.lane) <= diagonalLimit && Number.isInteger(surge.lane * 4), `capraz kaydirma ${surge.lane}`);
      }
      // Kirpilmamis serit yalnizca tam genislikte: dar serit hep bir kenara yaslaniyor.
      if (surge.width < full && surge.travel === "down") assert.ok(surge.lane === 0 || surge.lane + surge.width === 12, `dar serit kenarda degil ${surge.lane}+${surge.width}`);
      if (surge.width < full && (surge.travel === "left" || surge.travel === "right")) assert.ok(surge.lane === 1 || surge.lane + surge.width === 17, `dar satir kenarda degil ${surge.lane}`);
    }
  }
});

/**
 * Adil serit: kenar sutunu (yandan gelende kenar satiri) ortadaki kadar sik
 * vuruluyor. Eskiden baslangic yalnizca tam sigan konumlardan seciliyordu;
 * 4. asamada ortadaki sutunu vuran hasarli serit olasiligi kenardakinin
 * dort katina yakindi, capraz ise hep ana kosegeni vuruyordu.
 */
test("adil serit: her cesitte hucre basina vurus olasiligi kenarda ve ortada ayni (±%20)", () => {
  const cols = 12;
  const rows = 18;
  const grid = 32;
  const perKind = new Map();
  for (let seed = 1; seed <= 1500; seed += 1) {
    for (const stage of [3, 5]) {
      for (const surge of planCounterSurges({ stage, wave: 12, spawnCount: 60, cols, rows, random: createSpecialRandom(seed * 31 + stage, 12) })) {
        const band = getCounterSurgeGeometry(surge.travel, surge.lane, surge.width, { x: 0, y: 0 }, grid, cols, rows);
        let entry = perKind.get(surge.kind);
        if (!entry) perKind.set(surge.kind, entry = { n: 0, hits: new Float64Array(cols * rows) });
        entry.n += 1;
        for (let row = 1; row < rows - 1; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            if (isStructureInSurgeWidth(band, col * grid + grid / 2, row * grid + grid / 2, grid / 2, grid / 2)) entry.hits[row * cols + col] += 1;
          }
        }
      }
    }
  }
  assert.deepEqual([...perKind.keys()].sort(), [...COUNTER_SURGE_KINDS].sort(), "her cesit en az bir kez");
  for (const [kind, entry] of perKind) {
    const p = (col, row) => entry.hits[row * cols + col] / entry.n;
    const line = (pick) => {
      let sum = 0;
      let count = 0;
      for (let row = 1; row < rows - 1; row += 1) for (let col = 0; col < cols; col += 1) if (pick(col, row)) { sum += p(col, row); count += 1; }
      return sum / count;
    };
    const side = COUNTER_SURGE_KIND_TABLE[kind].route === "side";
    const edge = side ? line((col, row) => row === 1 || row === rows - 2) : line((col) => col === 0 || col === cols - 1);
    const centre = side ? line((col, row) => row === rows / 2 - 1 || row === rows / 2) : line((col) => col === cols / 2 - 1 || col === cols / 2);
    assert.ok(Math.abs(edge / centre - 1) <= 0.2, `${kind}: kenar ${(edge * 100).toFixed(1)}% orta ${(centre * 100).toFixed(1)}%`);
  }
});

test("adil capraz: kaydirma esit dagilinca her hucre ayni olasilikla vuruluyor; ana kosegen ayricalikli degil", () => {
  // Zar yerine katmanli ornek: planin kullandigi aralik ve kirpma, esit adimlarla.
  for (const [cols, rows] of [[12, 18], [24, 36]]) {
    const grid = 32;
    const width = getCounterSurgeWidthCells("slash", cols, rows);
    const limit = getCounterSurgeDiagonalOffsetLimit(cols, rows, width);
    const samples = 4000;
    const hits = new Float64Array(cols * rows);
    for (let index = 0; index < samples; index += 1) {
      const start = -limit + ((index + 0.5) / samples) * 2 * limit;
      const { lane } = clipCounterSurgeLane("slash", cols, rows, start, width);
      for (const travel of ["downRight", "downLeft"]) {
        const band = getCounterSurgeGeometry(travel, lane, width, { x: 0, y: 0 }, grid, cols, rows);
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            if (isStructureInSurgeWidth(band, col * grid + grid / 2, row * grid + grid / 2, grid / 2, grid / 2)) hits[row * cols + col] += 1;
          }
        }
      }
    }
    const all = Array.from(hits, (value) => value / (samples * 2));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    assert.ok(Math.min(...all) >= mean * 0.85 && Math.max(...all) <= mean * 1.15, `${cols}x${rows}: hucre ${Math.min(...all).toFixed(3)}..${Math.max(...all).toFixed(3)} / ${mean.toFixed(3)}`);
    // Beklenen: genislik / 2K.
    assert.ok(Math.abs(mean - width / (2 * limit)) < 0.02, `${cols}x${rows}: ortalama ${mean}`);
  }
});

test("kirpilan serit: Metal Kalkan yutmasi ve tel kesigi dar seritte de seridin kendi genisligi icinde", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    // Sol kenara yaslanan, iki sutuna kirpilmis serit (tam genislik 3).
    const clipped = clipCounterSurgeLane("band", 12, 18, -1, 3);
    assert.deepEqual(clipped, { lane: 0, width: 2 });
    const surge = room.launchCounterSurge({ atSpawn: 0, kind: "band", travel: "down", lane: clipped.lane, width: clipped.width }, saat.now);
    assert.equal(surge.col, 0);
    assert.equal(surge.width, 2);
    const wire = room.getCounterSurgeWire(surge, saat.now);
    assert.equal(wire.col, 0);
    assert.equal(wire.w, 2);
    // Kalkan 1. sutunun ortasindan 3. sutuna uzaniyor: seritte yalnizca [0,5 .. 2] kismi.
    const gridSize = getMapGridSize(room.activeMap);
    const origin = getMapOrigin(room.activeMap);
    const band = surge.band;
    const contact = getSurgeObstacleContact(band, origin.x + gridSize * 0.5, origin.y + gridSize * 6, origin.x + gridSize * 3, origin.y + gridSize * 6, 0, gridSize * 10);
    assert.ok(contact);
    assert.ok(Math.abs(contact.from - (origin.x + gridSize * 0.5)) < 1e-6 && Math.abs(contact.to - (origin.x + gridSize * 2)) < 1e-6, `kesik ${contact.from}..${contact.to}`);
    addSurgeAbsorbedInterval(surge.absorbed, contact.from, contact.to, contact.along / band.length);
    const cut = encodeSurgeCuts(band, surge.absorbed, gridSize);
    assert.deepEqual(cut.slice(0, 2), [0.5, 2], "tel kesigi dar seridin dusuk kenarindan");
    const decoded = decodeSurgeCuts(cut, wire.w);
    assert.deepEqual(decoded.map((entry) => [entry.from, entry.to]), [[0.5, 2]]);
    // Kesigin arkasindaki yapi korunuyor, kesik disindaki vuruluyor.
    assert.equal(isSparedFromSurge(band, surge.absorbed, origin.x + gridSize * 1.5, origin.y + gridSize * 12), true);
    assert.equal(isSparedFromSurge(band, surge.absorbed, origin.x + gridSize * 0.25, origin.y + gridSize * 12), false);
  });
});

test("kaydirilmis capraz serit: geometri ana kosegene paralel, haritanin disi vurulmuyor, tel kaydirmayi tasiyor", () => {
  const cols = 12;
  const rows = 18;
  const grid = 32;
  const main = getCounterSurgeGeometry("downRight", 0, 3, { x: 0, y: 0 }, grid, cols, rows);
  const shifted = getCounterSurgeGeometry("downRight", 4.25, 3, { x: 0, y: 0 }, grid, cols, rows);
  assert.equal(shifted.dirX, main.dirX);
  assert.equal(shifted.dirY, main.dirY);
  assert.equal(shifted.length, main.length);
  // Genislik ekseninde tam 4,25 hucre kaydi; yol ekseninde kayma yok.
  const across = (band) => band.originX * band.dirY - band.originY * band.dirX;
  const along = (band) => band.originX * band.dirX + band.originY * band.dirY;
  assert.ok(Math.abs(across(shifted) - across(main) - 4.25 * grid) < 1e-6);
  assert.ok(Math.abs(along(shifted) - along(main)) < 1e-6);
  // Sinirin disindaki kaydirma sinira kirpiliyor.
  const limit = getCounterSurgeDiagonalOffsetLimit(cols, rows, 3);
  const far = getCounterSurgeGeometry("downLeft", 99, 3, { x: 0, y: 0 }, grid, cols, rows);
  const edge = getCounterSurgeGeometry("downLeft", limit, 3, { x: 0, y: 0 }, grid, cols, rows);
  assert.deepEqual(far, edge);
  sahteSaat((saat) => {
    const room = oda(4);
    const surge = room.launchCounterSurge({ atSpawn: 0, kind: "slash", travel: "downRight", lane: -3.5, width: 3 }, saat.now);
    assert.equal(surge.col, -3.5);
    assert.equal(room.getCounterSurgeWire(surge, saat.now).col, -3.5);
  });
});

test("tel kodları: bilinmeyen kod bugünkü şerit (ustten) olarak okunuyor", () => {
  assert.equal(decodeCounterSurgeKind(undefined), "band");
  assert.equal(decodeCounterSurgeKind(5), "aegis");
  assert.equal(decodeCounterSurgeKind(99), "band");
  assert.equal(decodeCounterSurgeTravel(undefined), "down");
  assert.equal(decodeCounterSurgeTravel(3), "downRight");
  assert.equal(decodeCounterSurgeTravel("x"), "down");
});

// --- Odada: haritada en fazla iki, en fazla bir siper ---------------------------------

test("odada en fazla iki şerit ve bir siper: sırası gelen fazlası atlanıyor", () => {
  sahteSaat((saat) => {
    const room = oda(5);
    room.waveSpawned = 0;
    room.planWaveSpawns(room.wave);
    baslat(room, saat, "aegis", "down", 3);
    room.waveSpecialPlan = {
      stage: 5, wave: room.wave, spawns: [], replaced: 0,
      surges: [
        { atSpawn: 0, kind: "aegis", travel: "down", lane: 0, width: 6 },
        { atSpawn: 1, kind: "band", travel: "down", lane: 2, width: 3 },
        { atSpawn: 2, kind: "lance", travel: "down", lane: 7, width: 1 }
      ]
    };
    room.waveSurgeCursor = 0;
    room.waveSpawned = 1;
    room.maybeStartCounterSurge();
    assert.deepEqual(room.counterSurges.map((surge) => surge.kind), ["aegis"], "ikinci siper basladi");
    room.waveSpawned = 2;
    room.maybeStartCounterSurge();
    assert.deepEqual(room.counterSurges.map((surge) => surge.kind), ["aegis", "band"]);
    room.waveSpawned = 3;
    room.maybeStartCounterSurge();
    assert.equal(room.counterSurges.length, COUNTER_SURGE_MAX_ACTIVE, "ucuncu serit basladi");
    assert.equal(room.waveSurgeCursor, 3, "atlanan serit sirada kaldi");
  });
});

// --- Geometri ve hasar ------------------------------------------------------------------

const DAMAGING = [
  { kind: "band", travel: "down", lane: 4, inside: [[4, 3], [6, 12], [5, 16]], outside: [[8, 9], [2, 5], [3, 14]] },
  { kind: "lance", travel: "down", lane: 5, inside: [[5, 4], [5, 15]], outside: [[4, 4], [6, 10]] },
  { kind: "wall", travel: "down", lane: 3, inside: [[3, 5], [8, 14], [6, 2]], outside: [[2, 5], [9, 8]] },
  { kind: "sweep", travel: "right", lane: 6, inside: [[1, 6], [10, 8], [5, 7]], outside: [[5, 5], [5, 9], [11, 2]] },
  { kind: "sweep", travel: "left", lane: 6, inside: [[1, 6], [10, 8], [5, 7]], outside: [[5, 5], [5, 9], [11, 2]] },
  { kind: "slash", travel: "downRight", lane: 0, inside: [[2, 3], [8, 12], [5, 9]], outside: [[10, 2], [4, 9], [1, 15]] },
  { kind: "slash", travel: "downLeft", lane: 0, inside: [[9, 3], [3, 12], [6, 9]], outside: [[1, 2], [7, 9], [10, 15]] }
];

for (const variant of DAMAGING) {
  test(`${variant.kind} (${variant.travel}): içerideki yapı doğru anda bir kez, dışarısı, düşman ve nexus hiç`, () => {
    sahteSaat((saat) => {
      const room = oda(3);
      const inside = variant.inside.map(([c, r]) => kur(room, "warrior-1", c, r));
      const outside = variant.outside.map(([c, r]) => kur(room, "warrior-1", c, r));
      const enemy = dusman(room, variant.inside[0][0], variant.inside[0][1] + (variant.travel === "down" ? 1 : 0));
      const enemyHp = enemy.hp;
      const surge = baslat(room, saat, variant.kind, variant.travel, variant.lane);
      const spec = COUNTER_SURGE_KIND_TABLE[variant.kind];
      // Oyun suresi: uyari ve gecis oyun hizi carpaniyla.
      assert.equal(surge.launchAt - surge.createdAt, oyun(spec.telegraphMs));
      assert.equal(surge.crossMs, oyun(spec.crossMs));
      const ratio = getCounterSurgeDamageRatio(room.wave) * spec.damageMultiplier;
      assert.ok(Math.abs(surge.damageRatio - ratio) < 1e-12, `carpan ${surge.damageRatio}`);
      // Beklenen vurus ani: on cizgi yapinin merkezine vardiginda.
      const map = room.activeMap;
      const band = getCounterSurgeGeometry(variant.travel, variant.lane, surge.width, getMapOrigin(map), getMapGridSize(map), map.cols, map.rows);
      const expectedAt = new Map(inside.map((tower) => {
        const along = (tower.x - band.originX) * band.dirX + (tower.y - band.originY) * band.dirY;
        return [tower.id, surge.launchAt + Math.max(0, along / band.length) * surge.crossMs];
      }));
      const hitAt = new Map();
      // Uyari evresinde hicbir sey.
      saat.now = surge.launchAt - 1;
      room.updateCounterSurge(saat.now);
      assert.ok(inside.every((tower) => tower.hp === tower.maxHp), "uyari evresinde vurdu");
      bitir(room, saat, surge, () => {
        for (const tower of inside) if (!hitAt.has(tower.id) && tower.hp < tower.maxHp) hitAt.set(tower.id, saat.now);
      });
      for (const tower of inside) {
        const beklenen = tower.maxHp * (1 - ratio);
        assert.ok(Math.abs(tower.hp - beklenen) < 0.001, `${variant.kind}: (${tower.x},${tower.y}) bir kez vurulmadi: ${tower.hp} / ${beklenen}`);
        const at = hitAt.get(tower.id);
        assert.ok(at >= expectedAt.get(tower.id) && at <= expectedAt.get(tower.id) + 50, `${variant.kind}: vurus ani ${at - expectedAt.get(tower.id)} ms kaymis`);
      }
      for (const tower of outside) assert.equal(tower.hp, tower.maxHp, `${variant.kind}: seridin disindaki (${tower.x},${tower.y}) vuruldu`);
      assert.equal(enemy.hp, enemyHp, "serit dusmana vurdu");
      assert.equal(room.teamHealth, 100, "serit nexusa vurdu");
      const hits = room.sent.filter((entry) => entry.type === "surge:hit").flatMap((entry) => entry.payload.hits.map((hit) => hit.towerId));
      assert.equal(new Set(hits).size, hits.length, "bir yapi iki kez vuruldu");
      assert.equal(hits.length, inside.length);
      assert.equal(room.counterSurges.length, 0, "serit bitince kalkmadi");
    });
  });
}

test("yandan süpürme iki taraftan: sağa giden önce soldaki yapıya, sola giden önce sağdakine varıyor", () => {
  for (const travel of ["right", "left"]) {
    sahteSaat((saat) => {
      const room = oda(2);
      const sol = kur(room, "warrior-1", 1, 7);
      const sag = kur(room, "warrior-1", 10, 7);
      const surge = baslat(room, saat, "sweep", travel, 6);
      ilerlet(room, saat, surge, 0.5);
      const once = travel === "right" ? sol : sag;
      const sonra = travel === "right" ? sag : sol;
      assert.ok(once.hp < once.maxHp, `${travel}: giris tarafindaki yapi vurulmadi`);
      assert.equal(sonra.hp, sonra.maxHp, `${travel}: karsi taraftaki yapi erken vuruldu`);
    });
  }
});

test("çapraz kesme iki köşeden: başladığı köşeye yakın yapıyı önce, karşı köşeyi sonra", () => {
  for (const [travel, near, far] of [["downRight", [1, 1], [10, 15]], ["downLeft", [10, 1], [1, 15]]]) {
    sahteSaat((saat) => {
      const room = oda(3);
      const yakin = kur(room, "warrior-1", ...near);
      const uzak = kur(room, "warrior-1", ...far);
      const surge = baslat(room, saat, "slash", travel);
      assert.ok(surge.band.dirX !== 0 && surge.band.dirY > 0, "capraz yon degil");
      ilerlet(room, saat, surge, 0.4);
      assert.ok(yakin.hp < yakin.maxHp, `${travel}: kalkis kosesindeki yapi vurulmadi`);
      assert.equal(uzak.hp, uzak.maxHp, `${travel}: karsi kosedeki yapi erken vuruldu`);
      bitir(room, saat, surge);
      assert.ok(uzak.hp < uzak.maxHp, `${travel}: karsi kosedeki yapi hic vurulmadi`);
    });
  }
});

test("hız farkı: mızrak hızlı, perde yavaş; sürüm oyun hızı çarpanıyla", () => {
  assert.notEqual(GAME_SPEED_MULTIPLIER, 1);
  const table = COUNTER_SURGE_KIND_TABLE;
  assert.deepEqual(
    Object.fromEntries(COUNTER_SURGE_KINDS.map((kind) => [kind, [table[kind].crossMs, table[kind].telegraphMs, table[kind].damageMultiplier, table[kind].widthCells]])),
    { band: [32000, 3000, 1, 3], lance: [9000, 2500, 0.8, 1], wall: [60000, 4000, 1, 6], sweep: [26000, 3000, 1, 3], slash: [30000, 3000, 0.9, 3], aegis: [0, 3000, 0, 6] }
  );
  sahteSaat((saat) => {
    const room = oda(3);
    const lance = baslat(room, saat, "lance", "down", 1);
    const wall = baslat(room, saat, "wall", "down", 5);
    assert.ok(lance.crossMs * 6 < wall.crossMs, "mizrak perdeden belirgin hizli degil");
    // Olceksiz sure dolunca mizrak hala yolda; olcekli surede bitiyor.
    saat.now = lance.launchAt + table.lance.crossMs;
    room.updateCounterSurge(saat.now);
    assert.ok(room.counterSurges.includes(lance), "mizrak olceksiz surede bitti");
    saat.now = lance.launchAt + oyun(table.lance.crossMs);
    room.updateCounterSurge(saat.now);
    assert.ok(!room.counterSurges.includes(lance), "mizrak olcekli surede bitmedi");
  });
});

// --- Metal Kalkan: yandan ve caprazdan ---------------------------------------------

test("Metal Kalkan yandan süpürmenin yalnızca kapattığı satırları yutuyor", () => {
  sahteSaat((saat) => {
    const room = oda(2);
    const once = kur(room, "warrior-1", 3, 6);
    const korunan = kur(room, "warrior-1", 8, 6);
    const acik = kur(room, "warrior-1", 8, 8);
    const surge = baslat(room, saat, "sweep", "right", 6);
    // On cizgi 4,4. sutunda; kalkan 5. sutunun sol kenarinda, 6-7,5. satirlari kapatiyor.
    ilerlet(room, saat, surge, 4.4 / 12);
    assert.ok(once.hp < once.maxHp, "kalkandan once gecilen yapi vurulmadi");
    const shield = kalkan(room, 5, 6, 5, 7.5);
    assert.ok(shield, "kalkan kurulamadi");
    for (let t = 0; t < 4000 && room.counterSurges.includes(surge); t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    assert.equal(surge.absorbed.length, 1, "yutulma yok");
    const wire = room.getSnapshot().surges[0];
    assert.equal(wire.k, 3);
    assert.equal(wire.d, 1);
    assert.ok(Array.isArray(wire.cut) && wire.cut.length === 3, "kesik telde yok");
    bitir(room, saat, surge);
    assert.equal(korunan.hp, korunan.maxHp, "kalkanin arkasindaki yapi vuruldu");
    assert.ok(acik.hp < acik.maxHp, "kapatilmayan satirdaki yapi vurulmadi");
  });
});

test("Metal Kalkan çapraz kesmenin yalnızca kapattığı yarısını yutuyor", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    const once = kur(room, "warrior-1", 3, 4);
    const korunan = kur(room, "warrior-1", 8, 11);
    const acik = kur(room, "warrior-1", 7, 12);
    const surge = baslat(room, saat, "slash", "downRight");
    const band = surge.band;
    const length = band.length / getMapGridSize(room.activeMap);
    // Kalkan kosegenin ortasinda (6,9), yola dik, genisligin bir yarisini kapatiyor.
    const perp = { x: band.dirY, y: -band.dirX };
    ilerlet(room, saat, surge, 0.5 - 0.9 / length);
    assert.ok(once.hp < once.maxHp, "kalkandan once gecilen yapi vurulmadi");
    const shield = kalkan(room, 6 - perp.x * 0.05, 9 - perp.y * 0.05, 6 + perp.x * 1.6, 9 + perp.y * 1.6);
    assert.ok(shield, "kalkan kurulamadi");
    for (let t = 0; t < 4000 && room.counterSurges.includes(surge); t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    assert.equal(surge.absorbed.length, 1, "yutulma yok");
    bitir(room, saat, surge);
    assert.equal(korunan.hp, korunan.maxHp, "kalkanin arkasindaki yapi vuruldu");
    assert.ok(acik.hp < acik.maxHp, "kapatilmayan yaridaki yapi vurulmadi");
  });
});

// --- Siper dalgasi --------------------------------------------------------------------

/** Siper 3-8. sutunlarda, on cizgisi `row` satirinda (kesirli). */
function siper(room, saat, row) {
  const surge = baslat(room, saat, "aegis", "down", 3);
  ilerlet(room, saat, surge, row / room.activeMap.rows, 20);
  assert.ok(room.activeAegis === surge, "siper kalkmadi");
  return surge;
}

test("siper: yapıya hasar yok, Metal Kalkan yutmuyor, haritayı geçince kayboluyor", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    const kule = kur(room, "warrior-1", 5, 8);
    const duvarKule = kur(room, "warrior-1", 4, 14);
    const surge = baslat(room, saat, "aegis", "down", 3);
    assert.equal(surge.damageRatio, 0);
    // Gecis grunt'un yurume hiziyla, oyun suresiyle olcekli.
    room.spawnEnemy(undefined, { kind: "heater", type: "grunt", healthMultiplier: 1, start: gridToWorld(0, 1, room.activeMap) });
    const grunt = [...room.enemies.values()].at(-1);
    room.enemies.delete(grunt.id);
    assert.ok(Math.abs(surge.crossMs - oyun(getAegisCrossMs(surge.band.length, grunt.speed))) < 1e-6, `gecis ${surge.crossMs}`);
    ilerlet(room, saat, surge, 7 / 18);
    const shield = kalkan(room, 4, 8.2, 6.5, 8.2);
    assert.ok(shield);
    bitir(room, saat, surge, () => room.updateMetalShields?.(saat.now));
    assert.equal(surge.absorbed.length, 0, "Metal Kalkan siperi yuttu");
    assert.equal(kule.hp, kule.maxHp, "siper yapiya vurdu");
    assert.equal(duvarKule.hp, duvarKule.maxHp, "siper yapiya vurdu");
    assert.equal(room.sent.filter((entry) => entry.type === "surge:hit").length, 0);
    assert.equal(room.activeAegis, undefined, "siper haritayi gecince kalkmadi");
    assert.equal(room.counterSurges.length, 0);
    assert.ok(!("surges" in room.getSnapshot()));
  });
});

test("siper: kule siperin ardındaki düşmanı hedefleyemiyor, aynı taraftakini hedefliyor; ön çizgi geçince arkada kalanlar birbirini görüyor", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    const kule = kur(room, "warrior-1", 5, 13);
    // AttackLord menzilleri yariya indi: 1. seviye Takipci iki kare oteye
    // yetmiyor. Olcum siperin gorus kurali; menzil 10. seviyeyle saglaniyor.
    kule.level = 10;
    const range = room.getTowerRange(kule) / getMapGridSize(room.activeMap);
    assert.ok(range >= 2.5, `kule menzili kisa: ${range}`);
    const ardinda = dusman(room, 5, 11);
    const surge = siper(room, saat, 12.2);
    assert.ok(room.isLineBlockedByAegis(kule.x, kule.y, ardinda.x, ardinda.y));
    assert.equal(room.findTowerTarget(kule), undefined, "kule siperin ardindaki dusmani hedefledi");
    // Ayni taraftaki dusman secilebiliyor.
    const onunde = dusman(room, 6, 13);
    assert.equal(room.findTowerTarget(kule)?.id, onunde.id);
    room.enemies.delete(onunde.id);
    // Siperin genisligi disindaki kule (9. sutun genislikte degil) yandan atabiliyor.
    const yandaki = kur(room, "warrior-1", 10, 13);
    yandaki.level = 10;
    const yandakiHedef = dusman(room, 10, 11);
    assert.equal(room.findTowerTarget(yandaki)?.id, yandakiHedef.id, "siperin disindaki hat engellendi");
    room.enemies.delete(yandakiHedef.id);
    // Kule paneli: hedef yok diye okunuyor.
    assert.equal(room.getTowerActivity(kule), "target");
    // On cizgi kuleyi gecti: arkada kalan kule ve dusman ayni tarafta.
    ilerlet(room, saat, surge, 14.5 / 18);
    assert.equal(room.findTowerTarget(kule)?.id, ardinda.id, "on cizgi gectikten sonra arkadaki dusman hala engelli");
    // Siperin onune gecen dusman artik engelli.
    room.enemies.delete(ardinda.id);
    dusman(room, 5, 15);
    assert.equal(room.findTowerTarget(kule), undefined, "kule siperin onundeki dusmani arkadan vurdu");
  });
});

test("siper: uçan mermi siperde duruyor (doğrusal ve güdümlü), hasar yok; durdurulan atışlar seyrek mesajla", () => {
  for (const hitType of ["projectile", "focus"]) {
    sahteSaat((saat) => {
      const room = oda(3);
      const kule = kur(room, "warrior-1", 5, 14);
      const hedef = dusman(room, 5, 9);
      const surge = siper(room, saat, 11.5);
      const speed = getMapGridSize(room.activeMap) * 8;
      room.projectiles.set("px", {
        id: "px", towerId: kule.id, definitionId: kule.definition.id, kind: "tower", damageType: "physical", hitType, source: "tower",
        targetId: hedef.id, x: kule.x, y: kule.y, vx: 0, vy: -speed, damage: 500, maxHealthDamageRatio: 0, aoeRadius: 40, slowMs: 0,
        pierceLimit: 1, armorBreakAmount: 0, piercedEnemyIds: []
      });
      const hp = hedef.hp;
      for (let index = 0; index < 60 && room.projectiles.has("px"); index += 1) room.updateProjectiles(0.02);
      assert.ok(!room.projectiles.has("px"), `${hitType}: mermi durmadi`);
      assert.equal(hedef.hp, hp, `${hitType}: mermi siperi gecip vurdu`);
      const front = getMapOrigin(room.activeMap).y + surge.frontAlong;
      if (hitType === "projectile") {
        // Mermi govdesinin on ucu siperin cizilen on kenarina (on cizginin
        // yarim kalinligi, `getAegisFrontFace`) varinca duruyor: merkez on
        // cizgiden yuz + ucun uzakligi kadar geride. Siper tik icinde ilerliyor:
        // tikin sonundaki on cizgi en fazla bir tiklik yol (< 1) daha yakin.
        // Eskiden cizginin kendisinde (yalnizca ucun uzakligi) duruyordu.
        const hit = room.sent.filter((entry) => entry.type === "projectile:hit").at(-1);
        const reachFront = getProjectileShape(kule.definition.id, 1, getProjectileSceneScale(getMapGridSize(room.activeMap))).front;
        const expected = getAegisFrontFace() + reachFront;
        const gap = hit ? hit.payload.y - front : Number.NaN;
        assert.ok(gap <= expected + 0.06 && gap >= expected - 1, `${hitType}: mermi siperin cizilen yuzunde durmadi (${gap} / ${expected})`);
      }
      saat.now += 400;
      room.updateCounterSurge(saat.now);
      const blocks = room.sent.filter((entry) => entry.type === "surge:block");
      assert.equal(blocks.length, 1, `${hitType}: surge:block yok`);
      assert.equal(blocks[0].payload.id, surge.id);
      assert.deepEqual(blocks[0].payload.a, [2.5], "durma noktasi seridin genisliginde degil");
    });
  }
});

test("siper: cizilen govde on levhaya (genislik boyunca, uclar dahil) degince duruyor; zaten degen mermi yerinde; namlunun gerisindeki ve gecilmis siper durdurmuyor", () => {
  // Meka kalkaniyla ayni kural (tests/visible-hitbox): levha on cizgi arti
  // eksi sert kenarin yarisi (`getAegisFrontFace`), seridin genisligi
  // boyunca. Eskiden yalnizca ucus 0'da (dogarken) zaten degen mermi
  // duruyordu; siper ustune geldiginde degen mermi levhanin icinden
  // geciyordu, namlunun gerisindeki siper de dogan mermiyi durduruyordu.
  sahteSaat((saat) => {
    const room = oda(3);
    const surge = siper(room, saat, 11.5);
    const band = surge.band;
    const scale = getProjectileSceneScale(getMapGridSize(room.activeMap));
    const face = getAegisFrontFace();
    const frontY = band.originY + surge.frontAlong;
    const span = { from: band.originX - band.width / 2, to: band.originX + band.width / 2 };
    const middle = (span.from + span.to) / 2;
    const stopAt = (id, x, y, ux, uy, flown, travel = 6) => room.getProjectileBlockCrossing({ flown }, getProjectileShape(id, 1, scale), x, y, ux, uy, travel);
    for (const id of ["zeynep-1", "warrior-6", "warrior-1"]) {
      const shape = getProjectileShape(id, 1, scale);
      // Onunden (siperin yol yonunde, +y) yukari, kafa kafaya: merkez on cizgiden `gap` geride.
      for (let gap = 0.5; gap <= 12; gap += 0.5) {
        const t = stopAt(id, middle, frontY + gap, 0, -1, 1000);
        if (gap < face + shape.front) assert.equal(t, 0, `${id} ${gap}: degen mermi yerinde durmadi`);
        else if (gap - face - shape.front <= 6) assert.ok(t !== undefined && Math.abs(t - (gap - face - shape.front)) < 1e-6, `${id} ${gap}: cizilen yuzde durmadi (${t})`);
        else assert.equal(t, undefined, `${id} ${gap}: erisemeyecegi siperde durdu`);
      }
      // Namlunun gerisindeki siper: dogan mermi ondan uzaklasiyor (asagi ya da yukari).
      for (const behind of [0.5, 2, 6]) {
        assert.equal(stopAt(id, middle, frontY + behind, 0, 1, 0), undefined, `${id}: namlunun ${behind} gerisindeki siper durdurdu (on yan)`);
        assert.equal(stopAt(id, middle, frontY - behind, 0, -1, 0), undefined, `${id}: namlunun ${behind} gerisindeki siper durdurdu (arka yan)`);
      }
      // Gecilmis siper: merkez on cizginin otesinde, govde hala levhada, uzaklasiyor.
      assert.equal(stopAt(id, middle, frontY - 0.5, 0, -1, 1000), undefined, `${id}: gecilmis siper arkadan durdurdu`);
    }
    // Levhanin ucu: Ucube'nin ekseni seridin 0,5 disinda, basi levhanin ucuna degiyor; 5 disarida degmiyor.
    const ucube = getProjectileShape("warrior-6", 1, scale);
    assert.ok(stopAt("warrior-6", span.to + 0.5, frontY + 10, 0, -1, 1000, 10) !== undefined, "levhanin ucuna degen mermi gecti");
    // Uclarda direk (`getAegisPostOutline`): seridin disinda ama diregin cizilen
    // govdesine degen mermi duruyor, onun da disindaki durmuyor.
    const postHalf = (getMapGridSize(room.activeMap) * AEGIS_DRAWN.postCells) / 2 + AEGIS_DRAWN.postRim / 2;
    assert.ok(stopAt("warrior-6", span.to + postHalf + ucube.halfWidth - 0.5, frontY + 10, 0, -1, 1000, 10) !== undefined, "diregin yanina degen mermi gecti");
    assert.equal(stopAt("warrior-6", span.to + postHalf + ucube.halfWidth + 0.5, frontY + 10, 0, -1, 1000, 10), undefined, "diregin disindaki mermi durdu");
    // Gercek ucus: yandan girip on levhaya degen mermi siperde duruyor, isaret seridin genisliginde.
    room.projectiles.set("px", {
      id: "px", towerId: "t", definitionId: "warrior-6", kind: "tower", damageType: "physical", hitType: "projectile", source: "tower",
      targetId: "", x: span.to + 0.5, y: frontY + 30, vx: 0, vy: -300, damage: 1, maxHealthDamageRatio: 0, aoeRadius: 0, slowMs: 0,
      pierceLimit: 1, armorBreakAmount: 0, piercedEnemyIds: [], tier: 1, flown: 1000
    });
    for (let index = 0; index < 30 && room.projectiles.has("px"); index += 1) room.updateProjectiles(1 / 60);
    assert.ok(!room.projectiles.has("px"), "ucun yanindaki mermi durmadi");
    assert.ok(room.aegisBlockPending.length === 1 && Math.abs(room.aegisBlockPending[0] - surge.width) < 0.11, `isaret: ${room.aegisBlockPending}`);
  });
});

test("siper: seyrek mesaj — çok sayıda durdurulan atış saniyede birkaç mesaj", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    siper(room, saat, 9);
    for (let index = 0; index < 200; index += 1) room.noteAegisBlock(nokta(room, 3 + (index % 6), 9).x, 0);
    for (let t = 0; t < 1000; t += 16) {
      saat.now += 16;
      room.updateCounterSurge(saat.now);
      for (let index = 0; index < 5; index += 1) room.noteAegisBlock(nokta(room, 4, 9).x, 0);
    }
    const blocks = room.sent.filter((entry) => entry.type === "surge:block");
    assert.ok(blocks.length <= 5, `saniyede ${blocks.length} mesaj`);
    assert.ok(blocks.every((entry) => entry.payload.a.length <= 6));
  });
});

test("siper: alan etkisi bloklanmıyor — önündeki düşmana vuran merminin alanı arkadakine de işliyor", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    const kule = kur(room, "warrior-1", 5, 15);
    const onunde = dusman(room, 5, 12);
    const ardinda = dusman(room, 5, 11);
    const surge = siper(room, saat, 11.8);
    assert.ok(room.isLineBlockedByAegis(kule.x, kule.y, ardinda.x, ardinda.y));
    assert.ok(!room.isLineBlockedByAegis(kule.x, kule.y, onunde.x, onunde.y));
    const grid = getMapGridSize(room.activeMap);
    room.projectiles.set("pa", {
      id: "pa", towerId: kule.id, definitionId: kule.definition.id, kind: "tower", damageType: "physical", hitType: "projectile", source: "tower",
      targetId: onunde.id, x: kule.x, y: kule.y, vx: 0, vy: -grid * 8, damage: 500, maxHealthDamageRatio: 0, aoeRadius: grid * 1.6, slowMs: 0,
      pierceLimit: 1, armorBreakAmount: 0, piercedEnemyIds: []
    });
    const a = onunde.hp;
    const b = ardinda.hp;
    for (let index = 0; index < 60 && room.projectiles.has("pa"); index += 1) room.updateProjectiles(0.02);
    assert.ok(onunde.hp < a, "onundeki dusman vurulmadi");
    assert.ok(ardinda.hp < b, "alan etkisi siperin ardina islemedi");
    assert.ok(surge);
  });
});

test("siper ön çizgisinin kesişimi: yalnızca genişlik içinde, ön çizginin iki yanı", () => {
  const band = { originX: 100, originY: 0, dirX: 0, dirY: 1, length: 200, width: 60 };
  assert.ok(getSurgeFrontCrossing(band, 100, 100, 100, 150, 100, 50) !== undefined);
  assert.equal(getSurgeFrontCrossing(band, 100, 100, 100, 150, 100, 120), undefined, "ayni taraf");
  assert.equal(getSurgeFrontCrossing(band, 100, 100, 200, 150, 200, 50), undefined, "genisligin disi");
  // Hareket eden on cizgi: nokta yerinde, on cizgi uzerinden gecti.
  assert.ok(getSurgeFrontCrossing(band, 90, 110, 100, 100, 100, 100) !== undefined);
});

// --- Tel ve yeni katilan ------------------------------------------------------------

test("snapshot çeşit ve yönü taşıyor; bugünkü şerit eski kayıtla aynı; yeni katılan her çeşidi görüyor", () => {
  sahteSaat((saat) => {
    const room = oda(5);
    const band = baslat(room, saat, "band", "down", 4);
    const sweep = baslat(room, saat, "sweep", "left", 6);
    const kayitlar = room.getSnapshot().surges;
    assert.deepEqual(kayitlar, [
      { id: band.id, col: 4, w: 3, p: 0, warn: true },
      { id: sweep.id, col: 6, w: 3, p: 0, k: 3, d: 2, warn: true }
    ]);
    room.clearCounterSurges();
    const slash = baslat(room, saat, "slash", "downLeft");
    const aegis = baslat(room, saat, "aegis", "down", 3);
    saat.now = Math.max(slash.launchAt, aegis.launchAt) + 1000;
    room.updateCounterSurge(saat.now);
    // Yeni katilan: snapshot her karede tam (delta degil); ilk karesinde iki serit de var.
    const ilk = room.getSnapshot().surges;
    assert.equal(ilk.length, 2);
    assert.deepEqual({ ...ilk[0], p: undefined }, { id: slash.id, col: 0, w: 3, k: 4, d: 4, p: undefined });
    assert.deepEqual({ ...ilk[1], p: undefined }, { id: aegis.id, col: 3, w: 6, k: 5, p: undefined });
    assert.ok(ilk.every((surge) => surge.p > 0 && surge.warn === undefined));
  });
});
