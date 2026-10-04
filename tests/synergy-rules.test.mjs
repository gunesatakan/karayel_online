/**
 * Yerlesim sinerjileri: Atakan'in yalnizligi ve Zeynep'in dizilimi.
 *
 * Iki kural sunucudan paylasilan pakete tasindi; istemci yerlestirme
 * onizlemesinde ayni fonksiyonlari cagiriyor. Bu dosya iki seyi tutuyor:
 *
 * 1. Tasinan kural eskisiyle **ayni** sonucu veriyor. Eski sunucu kodu
 *    asagida kelimesi kelimesine duruyor (`eski*`) ve temsil edici
 *    yerlesimlerde, sonra rastgele yerlesimlerde yan yana kosuluyor.
 * 2. Sunucu artik paylasilan kurali cagiriyor: oda uzerinden kurulan
 *    yerlesimde odanin yazdigi dizilim ve yalnizlik, paylasilan fonksiyonun
 *    cevabiyla ayni.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATAKAN_ISOLATION_MULTIPLIER,
  WALL_TOWER_ID,
  computeSynergyState,
  countsAsTower,
  createDefaultEditableMap,
  diffSynergyStates,
  findIsolationBlockers,
  getAtakanIsolationDpsMultiplier,
  getAtakanIsolationMultiplier,
  getMapGridSize,
  getZeynepFormationDamageMultiplier,
  getZeynepFormationFireIntervalMultiplier,
  gridToWorld,
  isStructureIsolated,
  occupiesTowerSlot,
  previewSynergyPlacement,
  resolveZeynepFormations,
  collectZeynepSynthesisGroup,
  describeSynergyPreview,
  FEEDBACK_KIND_RULES,
  getSynergyCulpritNotice,
  getSynergyStampText,
  towerCatalog,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const map = createDefaultEditableMap();
const gridSize = getMapGridSize(map);
const definitions = new Map(Object.values(towerCatalog).flat().map((definition) => [definition.id, definition]));

let nextId = 0;
/** Kareye oturan yapi. `owner` yalnizca okunurluk icin; kural sahibe bakmiyor. */
function yapi(definitionId, col, row, { level = 1, characterId, owner = "p1" } = {}) {
  const definition = definitions.get(definitionId);
  assert.ok(definition, `${definitionId} katalogda yok`);
  const point = gridToWorld(col, row, map);
  nextId += 1;
  return {
    id: `t${nextId}`,
    x: point.x,
    y: point.y,
    level,
    ownerId: owner,
    characterId: characterId ?? (definitionId.startsWith("zeynep") ? "zeynep" : "warrior"),
    definition
  };
}

/** Iki kare arasindaki dikey kenara oturan duvar. */
function duvar(col, row, characterId = "zeynep") {
  const tower = yapi(WALL_TOWER_ID, col, row, { characterId });
  tower.x += gridSize / 2;
  return tower;
}

/* --- Eski sunucu kodu, oldugu gibi (yalnizca `this` cikarildi) ------------ */

function eskiKomsu(towerA, towerB, size) {
  const dx = Math.abs(towerA.x - towerB.x);
  const dy = Math.abs(towerA.y - towerB.y);
  return dx <= size + 2 && dy <= size + 2 && dx + dy > 2;
}
function eskiTamUcgen(group, size) {
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (!eskiKomsu(group[i], group[j], size)) return false;
    }
  }
  return true;
}
function eskiKatilir(tower) {
  return occupiesTowerSlot(tower.definition) && tower.definition.id !== "zeynep-7";
}
function eskiGecerli(group, size) {
  if (!group.every((member) => member.characterId === "zeynep" && eskiKatilir(member))) return false;
  return group.length === 2 || (group.length === 3 && eskiTamUcgen(group, size));
}
/** `refreshZeynepFormations`'in eski govdesi; kule kimligi -> { size, level, reason }. */
function eskiDizilim(all, size) {
  const result = new Map();
  const towers = all.filter((tower) => tower.characterId === "zeynep" && eskiKatilir(tower));
  for (const tower of towers) result.set(tower.id, { size: 0, level: 0, reason: undefined });
  const visited = new Set();
  for (const tower of towers) {
    if (visited.has(tower.id)) continue;
    const group = [];
    const queue = [tower];
    visited.add(tower.id);
    while (queue.length > 0) {
      const current = queue.shift();
      group.push(current);
      for (const candidate of towers) {
        if (visited.has(candidate.id)) continue;
        if (!eskiKomsu(current, candidate, size)) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    const valid = eskiGecerli(group, size);
    const formationSize = valid ? group.length : 0;
    const formationLevel = valid ? Math.min(...group.map((member) => member.level)) : 0;
    for (const member of group) {
      if (member.characterId !== "zeynep" || member.definition.id === "zeynep-7" || member.definition.id === "zeynep-8") continue;
      result.set(member.id, {
        size: formationSize,
        level: formationLevel,
        reason: valid
          ? `Dizilim ${formationSize}: en düşük seviye ${formationLevel} (${group.filter((entry) => entry.level === formationLevel).map((entry) => entry.definition.name).join(", ")})`
          : `Dizilim yok: ${group.length} bağlı kule; geçerli ikili veya üçlü yerleşim gerekiyor`
      });
    }
  }
  return result;
}
/** `getZeynepFormationGroup`'un eski govdesi. */
function eskiSentezGrubu(tower, all, size) {
  const group = new Map([[tower.id, tower]]);
  const queue = [tower];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const candidate of all) {
      if (group.has(candidate.id) || !eskiKatilir(candidate)) continue;
      if (!eskiKomsu(current, candidate, size)) continue;
      group.set(candidate.id, candidate);
      queue.push(candidate);
    }
  }
  return Array.from(group.values());
}
/** `isTowerIsolated` ve `getAtakanPassiveMultiplier`'in eski govdesi. */
function eskiYalniz(tower, all) {
  const towerCell = worldToGrid(tower.x, tower.y, map);
  for (const other of all) {
    if (other.id === tower.id || !countsAsTower(other.definition)) continue;
    const otherCell = worldToGrid(other.x, other.y, map);
    if (Math.abs(otherCell.col - towerCell.col) <= 1 && Math.abs(otherCell.row - towerCell.row) <= 1) return false;
  }
  return true;
}
function eskiPasif(tower, all) {
  if (!countsAsTower(tower.definition)) return 1;
  return tower.characterId === "warrior" && tower.definition.id !== "warrior-2" && eskiYalniz(tower, all)
    ? ATAKAN_ISOLATION_MULTIPLIER
    : 1;
}
const ESKI_CARPAN = { pairDamage: 1.2, trioDamage: 1.45, pairInterval: 0.88, trioInterval: 0.76 };
function eskiOran(level) {
  return level <= 0 ? 0 : Math.min(Math.max(level, 1), 10) / 10;
}
function eskiHasar(size, level) {
  const r = eskiOran(level);
  if (size === 3) return 1 + (ESKI_CARPAN.trioDamage - 1) * r;
  if (size === 2) return 1 + (ESKI_CARPAN.pairDamage - 1) * r;
  return 1;
}
function eskiAralik(size, level) {
  const r = eskiOran(level);
  if (size === 3) return 1 - (1 - ESKI_CARPAN.trioInterval) * r;
  if (size === 2) return 1 - (1 - ESKI_CARPAN.pairInterval) * r;
  return 1;
}

/* --- Karsilastirma --------------------------------------------------------- */

/** Paylasilan kuralin cevabi, eski fonksiyonla ayni bicimde. */
function yeniDizilim(all) {
  const result = new Map();
  for (const group of resolveZeynepFormations(all, gridSize)) {
    for (const member of group.members) {
      result.set(member.id, {
        size: group.size,
        level: group.level,
        reason: group.valid
          ? `Dizilim ${group.size}: en düşük seviye ${group.level} (${group.members.filter((entry) => entry.level === group.level).map((entry) => entry.definition.name).join(", ")})`
          : `Dizilim yok: ${group.members.length} bağlı kule; geçerli ikili veya üçlü yerleşim gerekiyor`
      });
    }
  }
  return result;
}

function ayniSonuc(all, etiket) {
  assert.deepEqual(yeniDizilim(all), eskiDizilim(all, gridSize), `${etiket}: dizilim`);
  for (const tower of all) {
    assert.equal(isStructureIsolated(tower, all, map), eskiYalniz(tower, all), `${etiket}: ${tower.definition.id} yalnizlik`);
    assert.equal(findIsolationBlockers(tower, all, map).length === 0, eskiYalniz(tower, all), `${etiket}: engel listesi`);
    assert.equal(getAtakanIsolationMultiplier(tower, all, map), eskiPasif(tower, all), `${etiket}: ${tower.definition.id} carpan`);
    if (eskiKatilir(tower)) {
      assert.deepEqual(
        collectZeynepSynthesisGroup(tower, all, gridSize).map((member) => member.id),
        eskiSentezGrubu(tower, all, gridSize).map((member) => member.id),
        `${etiket}: sentez grubu`
      );
    }
  }
}

function boyutlar(all) {
  const sizes = yeniDizilim(all);
  return all.map((tower) => sizes.get(tower.id)?.size ?? null);
}

test("ikili: yan yana iki Zeynep kulesi dizilim kurar", () => {
  const all = [yapi("zeynep-1", 3, 4, { level: 3 }), yapi("zeynep-2", 4, 4, { level: 5 })];
  ayniSonuc(all, "ikili");
  assert.deepEqual(boyutlar(all), [2, 2]);
  assert.equal(yeniDizilim(all).get(all[0].id).level, 3, "seviye en dusuk uyeden gelmeli");
});

test("uclu: tam ucgen gecerli, cizgi gecersiz", () => {
  const ucgen = [yapi("zeynep-1", 3, 4), yapi("zeynep-2", 4, 4), yapi("zeynep-6", 3, 5)];
  ayniSonuc(ucgen, "ucgen");
  assert.deepEqual(boyutlar(ucgen), [3, 3, 3]);

  const cizgi = [yapi("zeynep-1", 3, 4), yapi("zeynep-2", 4, 4), yapi("zeynep-6", 5, 4)];
  ayniSonuc(cizgi, "cizgi");
  assert.deepEqual(boyutlar(cizgi), [0, 0, 0]);
});

test("dorduncu bagli kule dizilimi bozar", () => {
  const all = [yapi("zeynep-1", 3, 4), yapi("zeynep-2", 4, 4), yapi("zeynep-6", 3, 5), yapi("zeynep-1", 4, 5)];
  ayniSonuc(all, "dortlu");
  assert.deepEqual(boyutlar(all), [0, 0, 0, 0]);
});

test("aradaki duvar dizilime girmez ve onu bozmaz", () => {
  const all = [yapi("zeynep-1", 3, 4), yapi("zeynep-2", 4, 4), duvar(3, 4)];
  ayniSonuc(all, "duvar");
  assert.deepEqual(boyutlar(all), [2, 2, null]);
  const group = collectZeynepSynthesisGroup(all[0], all, gridSize);
  assert.equal(group.some((member) => member.definition.id === WALL_TOWER_ID), false);
});

test("yalniz Atakan kulesi carpani alir; duvar yalnizligi bozmaz", () => {
  const kule = yapi("warrior-1", 3, 4);
  const all = [kule, duvar(3, 4, "warrior"), yapi("warrior-4", 7, 8)];
  ayniSonuc(all, "yalniz");
  assert.equal(getAtakanIsolationMultiplier(kule, all, map), ATAKAN_ISOLATION_MULTIPLIER);
  assert.equal(getAtakanIsolationDpsMultiplier(), ATAKAN_ISOLATION_MULTIPLIER ** 2);
});

test("bitisik reaktor yalnizligi bozar", () => {
  const kule = yapi("warrior-1", 3, 4);
  const reaktor = yapi("warrior-8", 4, 5);
  const all = [kule, reaktor];
  ayniSonuc(all, "reaktor");
  assert.equal(getAtakanIsolationMultiplier(kule, all, map), 1);
  assert.deepEqual(findIsolationBlockers(kule, all, map).map((entry) => entry.id), [reaktor.id]);
});

test("takim arkadasinin kulesi de yalnizligi bozar", () => {
  const kule = yapi("warrior-1", 3, 4, { owner: "p1" });
  const arkadas = yapi("zeynep-1", 2, 3, { owner: "p2" });
  const all = [kule, arkadas];
  ayniSonuc(all, "arkadas");
  assert.equal(getAtakanIsolationMultiplier(kule, all, map), 1);
});

test("Sunucu yalniz durabilir ama odul almaz", () => {
  const sunucu = yapi("warrior-2", 3, 4);
  const all = [sunucu];
  ayniSonuc(all, "sunucu");
  assert.equal(isStructureIsolated(sunucu, all, map), true);
  assert.equal(getAtakanIsolationMultiplier(sunucu, all, map), 1);
});

test("karisik sahipli ve kaynak binali dizilim; Abarti ve Saray Arsivi disarida", () => {
  const all = [
    yapi("zeynep-1", 3, 4, { owner: "p1" }),
    yapi("zeynep-9", 4, 4, { owner: "p2" }),
    yapi("zeynep-7", 3, 5),
    yapi("warrior-1", 6, 6),
    yapi("zeynep-6", 7, 6)
  ];
  ayniSonuc(all, "karisik");
});

test("dizilim carpanlari eski sayilarla ayni", () => {
  for (const size of [0, 2, 3, 4]) {
    for (const level of [0, 1, 3, 7, 10, 12]) {
      const state = { zeynepFormationSize: size, zeynepFormationLevel: level };
      assert.equal(getZeynepFormationDamageMultiplier(state), eskiHasar(size, level), `hasar ${size}/${level}`);
      assert.equal(getZeynepFormationFireIntervalMultiplier(state), eskiAralik(size, level), `aralik ${size}/${level}`);
    }
  }
  assert.equal(getZeynepFormationDamageMultiplier({}), 1);
});

test("rastgele yerlesimlerde paylasilan kural eskisiyle ayni", () => {
  const ids = ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-7", "zeynep-9", "warrior-1", "warrior-2", "warrior-3", "warrior-8", "repair-depot-1"];
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let round = 0; round < 300; round += 1) {
    const used = new Set();
    const all = [];
    const count = 2 + Math.floor(random() * 9);
    for (let index = 0; index < count; index += 1) {
      const col = 1 + Math.floor(random() * 5);
      const row = 1 + Math.floor(random() * 5);
      if (used.has(`${col},${row}`)) continue;
      used.add(`${col},${row}`);
      const definitionId = ids[Math.floor(random() * ids.length)];
      const characterId = definitionId === "repair-depot-1" ? (random() < 0.5 ? "zeynep" : "warrior") : undefined;
      all.push(yapi(definitionId, col, row, { level: 1 + Math.floor(random() * 10), characterId }));
    }
    if (random() < 0.4) all.push(duvar(1 + Math.floor(random() * 5), 1 + Math.floor(random() * 5)));
    ayniSonuc(all, `tur ${round}`);
  }
});

test("onizleme: kurulacak kule dizilim kurar, buyutur ya da bozar", () => {
  const a = yapi("zeynep-1", 3, 4, { level: 4 });
  const b = yapi("zeynep-2", 4, 4, { level: 6 });
  const ucuncu = yapi("zeynep-6", 3, 5);
  const preview = previewSynergyPlacement(ucuncu, [a, b], map, gridSize);
  assert.equal(preview.formation?.size, 3, "ucgen kurulmali");
  assert.equal(preview.formation?.level, 1, "yeni kule seviye 1 ile giriyor");
  assert.equal(preview.formationDamageMultiplier, eskiHasar(3, 1));
  assert.deepEqual(preview.breaksFormation, []);

  const c = yapi("zeynep-6", 3, 5);
  const dorduncu = yapi("zeynep-1", 4, 5);
  const bozan = previewSynergyPlacement(dorduncu, [a, b, c], map, gridSize);
  assert.equal(bozan.formation, undefined);
  assert.deepEqual(bozan.breaksFormation.map((entry) => entry.id).sort(), [a.id, b.id, c.id].sort());
});

test("onizleme: yalnizlik, engel ve bozulacak komsular", () => {
  const takipci = yapi("warrior-1", 3, 4, { owner: "p2" });
  const sunucu = yapi("warrior-2", 7, 7);
  const aday = yapi("warrior-4", 4, 5);
  const preview = previewSynergyPlacement(aday, [takipci, sunucu], map, gridSize);
  assert.equal(preview.isolationEligible, true);
  assert.equal(preview.isolated, false);
  assert.deepEqual(preview.isolationBlockers.map((entry) => entry.id), [takipci.id]);
  assert.deepEqual(preview.breaksIsolation.map((entry) => entry.id), [takipci.id], "takim arkadasinin Takipcisi yalnizligini kaybeder");

  const uzak = yapi("warrior-4", 1, 1);
  const yalniz = previewSynergyPlacement(uzak, [takipci, sunucu], map, gridSize);
  assert.equal(yalniz.isolated, true);
  assert.deepEqual(yalniz.breaksIsolation, []);

  const duvarAdayi = duvar(3, 4, "warrior");
  const duvarOnizleme = previewSynergyPlacement(duvarAdayi, [takipci], map, gridSize);
  assert.equal(duvarOnizleme.isolationEligible, false);
  assert.deepEqual(duvarOnizleme.breaksIsolation, [], "duvar yalnizligi bozmaz");
});

test("degisim: kurulan, bozulan yalnizlik ve dizilim olaylari", () => {
  const takipci = yapi("warrior-1", 3, 4);
  const z1 = yapi("zeynep-1", 7, 7);
  const z2 = yapi("zeynep-2", 8, 7);
  const once = [takipci, z1];
  const sonra = [takipci, z1, z2, yapi("zeynep-6", 4, 4, { owner: "p2" })];
  const present = new Map(sonra.map((entry) => [entry.id, entry]));
  const changes = diffSynergyStates(computeSynergyState(once, map, gridSize), computeSynergyState(sonra, map, gridSize), present);
  const kinds = changes.map((change) => change.kind).sort();
  assert.deepEqual(kinds, ["formationFormed", "isolationLost"]);

  // Satis: dizilim uyesi gidince kalan yalniz uye "bozuldu" olayi alir.
  const satis = [takipci, z1];
  const satisChanges = diffSynergyStates(
    computeSynergyState([takipci, z1, z2], map, gridSize),
    computeSynergyState(satis, map, gridSize),
    new Map(satis.map((entry) => [entry.id, entry]))
  );
  assert.deepEqual(satisChanges.map((change) => change.kind), ["formationBroken"]);
  assert.deepEqual(satisChanges[0].members.map((entry) => entry.id), [z1.id]);
});

test("onizleme metni kisa ve sayilari kuraldan aliyor", () => {
  const ad = (structure) => structure.definition.name;
  const takipci = yapi("warrior-1", 3, 4);
  const yalniz = describeSynergyPreview(previewSynergyPlacement(yapi("warrior-4", 7, 8), [takipci], map, gridSize), ad);
  assert.deepEqual(yalniz, { headline: { text: "Yalnız ×2,25 DPS", tone: "gain" } });

  const bitisik = describeSynergyPreview(previewSynergyPlacement(yapi("warrior-4", 4, 4), [takipci], map, gridSize), ad);
  assert.deepEqual(bitisik, { headline: { text: "Yalnızlık yok", tone: "blocked" }, warning: "Bozar: Takipçi" });

  const a = yapi("zeynep-1", 3, 8, { level: 3 });
  const b = yapi("zeynep-2", 4, 8, { level: 3 });
  const ikili = describeSynergyPreview(previewSynergyPlacement(yapi("zeynep-6", 3, 9, { level: 3 }), [a, b], map, gridSize), ad);
  // Uclu tam carpan 1,45; seviye 3'te oran 0,3, yani 1 + 0,45 x 0,3.
  assert.equal(ikili.headline?.text, "DİZİLİM ×1,14 · Sv 3", "carpan seviye oranindan gelmeli");
  const c = yapi("zeynep-6", 3, 9);
  const bozan = describeSynergyPreview(previewSynergyPlacement(yapi("zeynep-1", 4, 9), [a, b, c], map, gridSize), ad);
  assert.deepEqual(bozan, { warning: "Bozar: Dizilim" });
  for (const line of [yalniz.headline.text, bitisik.warning, ikili.headline.text]) {
    assert.ok(line.length <= 22, `375 px icin uzun: ${line}`);
  }
});

test("damga metinleri ve yonetmen kurali", () => {
  assert.equal(getSynergyStampText("isolationGained"), "Yalnız ×2,25");
  assert.equal(getSynergyStampText("isolationLost"), "Yalnızlık bozuldu");
  assert.equal(getSynergyStampText("formationFormed"), "Dizilim kuruldu");
  assert.equal(getSynergyStampText("formationBroken"), "Dizilim bozuldu");
  // Bildirim kimin seyinin bozuldugunu soyluyor: Ali'nin kendi yalnizligi degil.
  assert.equal(getSynergyCulpritNotice("isolationLost", "Ali"), "Ali senin yalnızlığını bozdu");
  assert.equal(getSynergyCulpritNotice("formationBroken", "Ali"), "Ali senin dizilimini bozdu");
  const rule = FEEDBACK_KIND_RULES.synergy;
  assert.equal(rule.channel, "label", "etiket butcesinden geciyor");
  assert.equal(rule.ownPriority, 2);
  assert.equal(rule.soundMs, 0, "yerlestirme sesinin ustune ikinci ses yok");
  assert.equal(rule.shakePx, 0);
  assert.equal(rule.vibrateMs, 0);
  assert.equal(rule.teammateVisual, true, "takim arkadasininki soluk ama gorunur");
});

/* --- Sunucu artik paylasilan kurali cagiriyor ------------------------------ */

test("sunucu dizilimi ve yalnizligi paylasilan kuralla yaziyor", () => {
  const room = createRoom("zeynep");
  const client = { sessionId: "p1", send() {} };
  room.broadcast = () => {};
  room.clients = [client];
  const size = getMapGridSize(room.activeMap);
  const first = findBuildableSpot(room, "zeynep-1");
  assert.ok(first, "yer bulunamadi");
  for (const [dx, dy, id] of [[0, 0, "zeynep-1"], [size, 0, "zeynep-2"], [0, size, "zeynep-6"], [size * 4, size * 4, "zeynep-1"]]) {
    room.placeTower(client, { x: first.x + dx, y: first.y + dy, definitionId: id });
  }
  room.refreshZeynepFormations();
  const towers = [...room.towers.values()];
  assert.ok(towers.length >= 3, "kuleler kurulamadi");
  const expected = new Map();
  for (const group of resolveZeynepFormations(towers, size)) {
    for (const member of group.members) expected.set(member.id, [group.size, group.level]);
  }
  const reference = eskiDizilimOda(towers, size);
  for (const tower of towers) {
    assert.deepEqual([tower.zeynepFormationSize, tower.zeynepFormationLevel], expected.get(tower.id) ?? [0, 0]);
    assert.deepEqual([tower.zeynepFormationSize, tower.zeynepFormationLevel], reference.get(tower.id) ?? [0, 0], "eski kuralla ayrisiyor");
    assert.equal(room.isTowerIsolated(tower), isStructureIsolated(tower, towers, room.activeMap));
  }
  assert.ok(towers.some((tower) => tower.zeynepFormationSize === 3), "uclu dizilim kurulamadi");
});

function eskiDizilimOda(towers, size) {
  const result = new Map();
  for (const [id, entry] of eskiDizilim(towers, size)) result.set(id, [entry.size, entry.level]);
  return result;
}
