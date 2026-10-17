/**
 * Bot politikalari: gercek odaya yalnizca istemci mesajlariyla oynayan
 * kurallar dizisi.
 *
 * Bot odanin durumunu okuyor (istemcinin snapshot'ta gordugu bilgiler:
 * kuleler, dusmanlar, isciler, stoklar, teklifler) ve `send` ile mesaj
 * yolluyor. Durumu hicbir zaman dogrudan degistirmiyor; bunu
 * `validate.mjs`in bagimsiz yeniden oynatmasi kanitliyor.
 *
 * Kararlar (her biri secenekle degistirilebilir):
 * - yerlesim: huni (duvar hatti + gecit + koridor) ya da duvarsiz yayilma;
 *   Atakan kuleleri yalniz (Chebyshev >= 2), Zeynep kuleleri ucgen uclu;
 * - insa/yukseltme: kurulus karisimindan siradaki kule, deneyim + altinla
 *   yukseltme, onarim payi;
 * - kartlar: greedy / random / worst / focus:<eksen>, elde bir yenileme;
 * - magaza: greedy / random / none; kule esyasi en iyi uygun kuleye;
 * - isciler: baslangic dortlusu + hammadde tasiyicisi; kitlik olculup
 *   darbogaza gore ek isci; toplayicilar hattin altindaki dugumlere;
 * - beceriler: Execute, Metal Kalkan, Yonlendirme, Zeynep komutlari, ulti.
 */
import { shared } from "./match.mjs";
import { planLayout, getBlockers, getGeometry, isMapRoutable, edgeKey } from "./layout.mjs";
import { cardScore, shopItemScore } from "./scoring.mjs";

const {
  towerCatalog,
  getTowerBuildCost,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getTowerMaxLevel,
  occupiesTowerSlot,
  towerDealsDamage,
  canTowerHoldTargetedCard,
  canAcceptTargetedCard,
  canEquipShopItem,
  isGlobalShopItem,
  getShopItemPrice,
  getUcubePerkTier,
  isExecuteImmune,
  calculateTowerAmmoCost,
  calculateTowerShotEnergyCost,
  getTowerOperatingEnergyPerSecond,
  getStructureRepairCost,
  getWorkerHireCost,
  WALL_TOWER_ID,
  PLAYER_TOWER_LIMIT
} = shared;

/** Sunucudaki `getCharacterCardAxes` ile ayni (sunucu disa vermiyor). */
const CARD_AXES = { warrior: ["dps", "amplify"], zeynep: ["amplify", "dps"], archer: ["cc", "dps"] };

/** Kurulus tarifleri: savas kulesi karisimi (agirlik), operator basina. */
export const BUILDS = {
  warrior: {
    laser: { mix: { "warrior-5": 1 } },
    takipci: { mix: { "warrior-1": 1 } },
    obsession: { mix: { "warrior-4": 1 } },
    "laser-takipci": { mix: { "warrior-5": 2, "warrior-1": 1 } },
    "laser-obsession": { mix: { "warrior-5": 1, "warrior-4": 1 } },
    ucube: { mix: { "warrior-6": 1, "warrior-1": 1 } },
    "server-obsession": { mix: { "warrior-4": 2, "warrior-2": 1 } },
    "isolation-laser": { mix: { "warrior-5": 2, "warrior-3": 1 } },
    balanced: { mix: { "warrior-5": 2, "warrior-1": 1, "warrior-4": 1 } }
  },
  zeynep: {
    hiza: { mix: { "zeynep-1": 1 } },
    gosteri: { mix: { "zeynep-2": 1 } },
    taht: { mix: { "zeynep-3": 1 } },
    "hiza-gosteri": { mix: { "zeynep-1": 2, "zeynep-2": 1 } },
    "hiza-taht": { mix: { "zeynep-1": 2, "zeynep-3": 1 } },
    "kin-hiza": { mix: { "zeynep-1": 2, "zeynep-6": 1 } },
    "archive-hiza": { mix: { "zeynep-1": 3, "zeynep-7": 1 } },
    "abarti-hiza": { mix: { "zeynep-1": 3, "zeynep-8": 1 } },
    balanced: { mix: { "zeynep-1": 2, "zeynep-2": 1, "zeynep-3": 1 } }
  }
};

export const DEFAULT_BUILD = { warrior: "balanced", zeynep: "balanced" };

/** Adli politikalar: varsayilan seceneklerin ustune yazilan farklar. */
export const POLICIES = {
  standard: {},
  greedy: {},
  "random-cards": { cards: "random" },
  "worst-cards": { cards: "worst" },
  "no-shop": { shop: "none" },
  "random-shop": { shop: "random" },
  "no-skills": { skills: false },
  "no-walls": { walls: false },
  cluster: { spacing: "cluster" },
  passive: { skills: false, shop: "none", cards: "random", hireWorkers: false }
};

const DEFAULTS = {
  build: undefined,
  walls: true,
  spacing: undefined,
  cards: "greedy",
  reroll: true,
  shop: "greedy",
  shopShare: 0.35,
  skills: true,
  ultimate: true,
  hireWorkers: true,
  maxExtraWorkers: 14,
  economyScale: 1,
  advancedWorkers: true,
  airGuard: true,
  repair: true,
  combatSpendEverySeconds: 2
};

export function resolvePolicyOptions(name = "standard", overrides = {}) {
  const base = POLICIES[name];
  if (!base) throw new Error(`unknown policy "${name}" (known: ${Object.keys(POLICIES).join(", ")})`);
  const options = { ...DEFAULTS, ...base };
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) options[key] = value;
  return options;
}

function findDefinition(operator, id) {
  return towerCatalog[operator].find((definition) => definition.id === id);
}

function towerFuel(definition) {
  const ammo = calculateTowerAmmoCost(definition) > 0;
  const energy = calculateTowerShotEnergyCost(definition, 0.5) > 0 || getTowerOperatingEnergyPerSecond(definition.hitType) > 0;
  return { ammo, energy };
}

const PROVIDERS = {
  warrior: { energy: "warrior-8", ammo: "warrior-7" },
  zeynep: { energy: "zeynep-10", ammo: "zeynep-9" }
};
const AIR_GUARD = { warrior: "warrior-1", zeynep: "zeynep-1" };
// Nexus cani isteyen (Riskli Yatirim) ve haritaya yerlestirilen esyalar bota kapali.
const SKIPPED_ITEMS = new Set(["riskli-yatirim", "bariyer", "ziftli-zemin"]);

/**
 * Bir oyuncunun botu.
 *
 * `ctx`: { room, client, playerId, operator, send, rng, tick }
 */
export function createBot(ctx, rawOptions = {}) {
  const options = { ...DEFAULTS, ...rawOptions };
  const { room, playerId, operator, send, rng } = ctx;
  const buildName = options.build ?? DEFAULT_BUILD[operator];
  const build = BUILDS[operator]?.[buildName];
  if (!build) throw new Error(`unknown build "${buildName}" for ${operator} (known: ${Object.keys(BUILDS[operator] ?? {}).join(", ")})`);
  const spacing = options.spacing ?? (operator === "warrior" ? "isolated" : operator === "zeynep" ? "trio" : "cluster");
  const mixIds = Object.keys(build.mix);
  const providers = PROVIDERS[operator];
  const axes = CARD_AXES[operator] ?? ["dps"];
  const player = () => room.state.players.get(playerId);
  let layout;
  let setupSession = -1;
  let setupTicks = 0;
  let setupFailures = new Set();
  let rerolledThisDraft = false;
  let lastCombatSpendTick = -1;
  const starvation = { ammoTicks: 0, energyTicks: 0, towerTicks: 0 };
  const lastStarvation = { ammo: 0, energy: 0 };
  let hiredExtra = 0;
  const materialCarrierIds = new Set();
  const decisions = [];
  const starvationLog = [];
  let providerSamples = { count: 0, reactorFill: 0, bullets: 0, gunpowder: 0 };
  let sampleWave = -1;
  let hiresThisSetup = 0;
  const enemyCells = new Map();
  const unplaceable = new Set();
  const placementMisses = new Map();
  const placementMissSession = new Map();

  const geometry = () => getGeometry(room);
  const ownTowers = () => [...room.towers.values()].filter((tower) => tower.ownerId === playerId);
  const combatTowers = () => ownTowers().filter((tower) => tower.hp > 0 && (towerDealsDamage(tower.definition) || mixIds.includes(tower.definition.id)));
  const slotTowerCount = () => ownTowers().filter((tower) => occupiesTowerSlot(tower.definition)).length;
  const towerLimit = () => PLAYER_TOWER_LIMIT + Math.floor((player().runModifiers ?? []).filter((modifier) => modifier.stat === "towerCapacity").reduce((sum, modifier) => sum + (modifier.add ?? 0), 0));
  const cellOf = (tower) => geometry().toCell(tower.x, tower.y);

  function ensureLayout() {
    if (!layout) {
      const reach = operator === "warrior" ? 2.6 : 2.4;
      layout = planLayout(room, { walls: options.walls, spacing, reach });
    }
    return layout;
  }

  /** Bir mesaj yolla, durumun degisip degismedigini dondur. */
  function attempt(type, message, changed) {
    const before = changed();
    send(type, message);
    return changed() !== before;
  }

  // ------------------------------------------------------------ yerlesim

  function structureCells() {
    const cells = [];
    for (const tower of room.towers.values()) {
      if (tower.hp <= 0 || !occupiesTowerSlot(tower.definition)) continue;
      for (const cell of room.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation)) cells.push({ cell, tower });
    }
    return cells;
  }

  function placementPoint(definitionId, col, row) {
    const g = geometry();
    if ((shared.getTowerGridSpan?.(definitionId) ?? 1) === 2) return { x: g.origin.x + col * g.size, y: g.origin.y + row * g.size };
    return g.cellCenter(col, row);
  }

  function footprintFor(definitionId, col, row) {
    if ((shared.getTowerGridSpan?.(definitionId) ?? 1) === 2) return [{ col: col - 1, row: row - 1 }, { col, row: row - 1 }, { col: col - 1, row }, { col, row }];
    return [{ col, row }];
  }

  function canUseCells(cells) {
    const plan = ensureLayout();
    const g = geometry();
    for (const cell of cells) {
      if (cell.col < 0 || cell.row < 0 || cell.col >= g.cols || cell.row >= g.rows) return false;
      if (plan.corridor.has(cell.row * g.cols + cell.col)) return false;
      if (plan.walls && cell.row === plan.line - 1 && Math.abs(cell.col - plan.gap) <= 1) return false;
    }
    return isMapRoutable(g, getBlockers(room), cells);
  }

  /** Yalnizlik / uclu kurali: yeni kulenin komsulari. */
  function spacingAllows(cells, definitionId, role) {
    if (spacing === "cluster" && role === "combat") return true;
    const existing = structureCells();
    const near = (a, b) => Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
    const neighbours = new Set();
    for (const { cell, tower } of existing) if (cells.some((own) => near(own, cell))) neighbours.add(tower);
    if (role === "support") {
      // Destek binalari savas kulelerinin yalnizligini/uclusunu bozmasin.
      return [...neighbours].every((tower) => !combatTowers().includes(tower));
    }
    if (spacing === "isolated") {
      // Atakan: yalnizlik bonusu alan kuleler komsusuz. Sunucu (warrior-2)
      // bonus almiyor ama komsusunu bozuyor; o da ayni kurala uyuyor.
      return neighbours.size === 0;
    }
    // trio: bitisik grup en fazla uc ve hepsi birbirine komsu (ucgen).
    if (neighbours.size === 0) return true;
    const group = [...neighbours];
    if (group.some((tower) => !combatTowers().includes(tower) || tower.definition.id === "zeynep-7")) return false;
    if (definitionId === "zeynep-7") return false;
    // Komsularin kendi gruplari da sayilmali: grup zaten 3 ise yer yok.
    const members = new Set(group);
    for (const member of group) {
      for (const { tower } of existing) {
        if (tower !== member && near(cellOf(tower), cellOf(member)) && combatTowers().includes(tower)) members.add(tower);
      }
    }
    if (members.size >= 3) return false;
    return [...members].every((member) => cells.every((cell) => near(cell, cellOf(member))));
  }

  function tryPlace(definitionId, candidates, role) {
    const g = geometry();
    for (const slot of candidates) {
      const cells = footprintFor(definitionId, slot.col, slot.row);
      const point = placementPoint(definitionId, slot.col, slot.row);
      if (!room.canPlaceTower(point.x, point.y, definitionId, "horizontal")) continue;
      if (!spacingAllows(cells, definitionId, role)) continue;
      if (!canUseCells(cells)) continue;
      const before = room.towers.size;
      send("placeTower", { definitionId, x: point.x, y: point.y });
      if (room.towers.size > before) {
        decisions.push(`w${room.wave}:build:${definitionId}@${slot.col},${slot.row}`);
        return [...room.towers.values()].at(-1);
      }
      void g;
      return undefined;
    }
    return undefined;
  }

  function combatSlots(definitionId) {
    const plan = ensureLayout();
    const air = findDefinition(operator, definitionId)?.engine?.canHitAir;
    return [...plan.slots]
      .map((slot) => ({ ...slot, score: slot.value + (air ? slot.airValue * 1.5 : 0) }))
      .sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
  }

  // ------------------------------------------------------------ duvarlar

  function missingWalls() {
    const plan = ensureLayout();
    if (!plan.walls) return [];
    const { edges } = getBlockers(room);
    return plan.wallEdges.filter((edge) => !edges.has(edgeKey("horizontal", edge.col, edge.row)));
  }

  function buildWalls(limit = Infinity) {
    let built = 0;
    const g = geometry();
    const cost = getTowerBuildCost(findDefinition(operator, WALL_TOWER_ID).cost);
    for (const edge of missingWalls()) {
      if (built >= limit || player().gold < cost) break;
      const point = g.hEdge(edge.col, edge.row);
      if (setupFailures.has(`wall:${edge.col}`)) continue;
      if (!room.canPlaceTower(point.x, point.y, WALL_TOWER_ID, "horizontal")) { setupFailures.add(`wall:${edge.col}`); continue; }
      if (!isMapRoutable(g, getBlockers(room), [], [{ orientation: "horizontal", col: edge.col, row: edge.row }])) { setupFailures.add(`wall:${edge.col}`); continue; }
      const before = room.towers.size;
      send("placeTower", { definitionId: WALL_TOWER_ID, x: point.x, y: point.y });
      if (room.towers.size > before) built += 1;
      else setupFailures.add(`wall:${edge.col}`);
    }
    return built;
  }

  // ------------------------------------------------------------ ekonomi

  function needs() {
    const own = combatTowers();
    const planned = mixIds.map((id) => findDefinition(operator, id)).filter(Boolean);
    const defs = own.length ? own.map((tower) => tower.definition) : planned;
    return {
      ammo: defs.some((definition) => towerFuel(definition).ammo),
      energy: true
    };
  }

  function findOwn(definitionId) {
    return ownTowers().filter((tower) => tower.definition.id === definitionId && tower.hp > 0);
  }

  function supportSlots() {
    return ensureLayout().supportSlots;
  }

  function ensureEconomy() {
    const need = needs();
    let acted = false;
    if (need.energy && findOwn(providers.energy).length === 0 && player().gold >= getTowerBuildCost(findDefinition(operator, providers.energy).cost)) {
      acted = Boolean(tryPlace(providers.energy, nearNodes("energy"), "support")) || acted;
    }
    if (need.ammo && combatTowers().length > 0 && (room.wave >= 2 || player().gold > 400)) {
      if (findOwn("warehouse-1").length === 0 && player().gold >= getTowerBuildCost(findDefinition(operator, "warehouse-1").cost)) {
        acted = Boolean(tryPlace("warehouse-1", nearNodes("gunpowder"), "support")) || acted;
      }
      if (findOwn(providers.ammo).length === 0 && findOwn("warehouse-1").length > 0 && player().gold >= getTowerBuildCost(findDefinition(operator, providers.ammo).cost)) {
        acted = Boolean(tryPlace(providers.ammo, nearNodes("gunpowder"), "support")) || acted;
      }
      const factory = findOwn(providers.ammo)[0];
      if (factory && factory.logisticsPriority !== "low") send("tower:priority", { towerId: factory.id, priority: "low" });
      if (factory && options.hireWorkers) acted = ensureMaterialCarrier(factory) || acted;
    }
    acted = assignGatherers() || acted;
    return acted;
  }

  /** Destek yuvalari, istenen turdeki en yakin guvenli dugume gore. */
  function nearNodes(kind) {
    const nodes = safeNodes(kind);
    const slots = supportSlots();
    if (nodes.length === 0) return slots;
    return [...slots].sort((a, b) => {
      const da = Math.min(...nodes.map((node) => Math.hypot(node.col - a.col, node.row - a.row)));
      const db = Math.min(...nodes.map((node) => Math.hypot(node.col - b.col, node.row - b.row)));
      return da - db || b.value - a.value;
    });
  }

  function economyNodes() {
    return room.getEconomyNodes().map((node) => ({ ...node, ...room.resourceLayout.cells[node.id] }));
  }

  /** Hattin altindaki (korunan) ve tukenmemis dugumler; yoksa hepsi. */
  function safeNodes(kind) {
    const plan = ensureLayout();
    const all = economyNodes().filter((node) => node.kind === kind && node.remaining > 0);
    const safe = plan.walls ? all.filter((node) => node.row >= plan.line && Math.abs(node.col - plan.gap) >= 1) : all;
    return safe.length ? safe : all;
  }

  function ownWorkers() {
    return [...room.drones.values()].filter((drone) => drone.ownerId === playerId && drone.id.startsWith(`logistics-${playerId}-`));
  }

  function assignGatherers() {
    let acted = false;
    const base = geometry().cellCenter(ensureLayout().gap, geometry().rows - 1);
    for (const worker of ownWorkers()) {
      if (worker.mode !== "crystalCollector") continue;
      const kind = worker.id.includes("ammoCollector") ? "gunpowder" : "energy";
      const current = worker.assignment?.nodeId;
      const candidates = safeNodes(kind);
      if (candidates.length === 0) continue;
      const g = geometry();
      const best = [...candidates].sort((a, b) => {
        const pa = g.cellCenter(a.col, a.row);
        const pb = g.cellCenter(b.col, b.row);
        return Math.hypot(pa.x - base.x, pa.y - base.y) - Math.hypot(pb.x - base.x, pb.y - base.y);
      })[0];
      const currentNode = economyNodes().find((node) => node.id === current);
      const currentOk = currentNode && currentNode.remaining > 0 && candidates.some((node) => node.id === current);
      if (currentOk || best.id === current) continue;
      send("worker:assign", { workerId: worker.id, nodeId: best.id });
      acted = true;
    }
    return acted;
  }

  function hire(role) {
    const before = new Set(ownWorkers().map((worker) => worker.id));
    // Gelismis isci: dort kat fiyat, uc kat yuk, 1,5 kat hiz, iki kat toplama.
    // Alim bedeli her iscide %10 artiyor; altin yetiyorsa her alim gelismis.
    const advancedCost = getWorkerHireCost(player().hiredWorkers.length, true);
    const advanced = options.advancedWorkers && room.wave >= 3 && player().gold >= advancedCost + 100;
    const cost = advanced ? advancedCost : getWorkerHireCost(player().hiredWorkers.length);
    if (player().gold < cost) return undefined;
    send("worker:hire", { role, ...(advanced ? { advanced: true } : {}) });
    const added = ownWorkers().find((worker) => !before.has(worker.id));
    if (added) {
      hiredExtra += 1;
      decisions.push(`w${room.wave}:hire:${role}${advanced ? "+" : ""}`);
    }
    return added;
  }

  function ensureMaterialCarrier(factory) {
    // Hammadde tasiyicisi: depodan fabrikaya barut. Baslangic dortlusunde yok.
    for (const id of materialCarrierIds) {
      const worker = room.drones.get(id);
      if (worker) {
        if (worker.assignment?.sourceTowerId !== factory.id || worker.assignment?.product !== "materials") {
          send("worker:assign", { workerId: id, sourceTowerId: factory.id, product: "materials" });
        }
        return false;
      }
      materialCarrierIds.delete(id);
    }
    // Olen isci kurulumda geri geliyor (ayni kimlik); yeni isci ancak hic yoksa.
    const existing = ownWorkers().find((worker) => worker.assignment?.product === "materials");
    if (existing) { materialCarrierIds.add(existing.id); return false; }
    if (hiredExtra >= options.maxExtraWorkers) return false;
    const worker = hire("ammoTransport");
    if (!worker) return false;
    materialCarrierIds.add(worker.id);
    send("worker:assign", { workerId: worker.id, sourceTowerId: factory.id, product: "materials" });
    return true;
  }

  /**
   * Isci hedefi kulelerin tahmini ihtiyacindan (oyun kurali degil, botun kaba
   * hesabi): isletme enerjisi + atis enerjisi/mermisi x atis hizi x dolu
   * calisma payi (0,35). Toplayici ~1 enerji/sn (7,1 sn cikarma + yuruyus,
   * 13,5 yuk), enerji tasiyicisi ~2/sn, mermi tasiyicisi ~0,6/sn (4,5 yuk).
   * En buyuk goreli acigi olan role kurulumda en fazla iki isci.
   */
  function growEconomy() {
    if (!options.hireWorkers || hiredExtra >= options.maxExtraWorkers || hiresThisSetup >= 2) return false;
    const reactor = findOwn(providers.energy)[0];
    if (!reactor || combatTowers().length < 2) return false;
    const factory = findOwn(providers.ammo)[0];
    const warehouse = findOwn("warehouse-1")[0];
    const demand = demandPerSecond();
    // Fabrika uretim hizi (oyun saniyesi) ihtiyacin altindaysa once seviye.
    if (factory && factory.level < 4 && shared.getAmmoFactoryProductionRate(factory.level) * 0.8 < demand.ammo && upgradeProvider(factory)) return true;
    const cost = getWorkerHireCost(player().hiredWorkers.length);
    if (player().gold < cost + 80) return false;
    const count = (predicate) => ownWorkers().filter(predicate).reduce((sum, worker) => sum + (worker.advanced ? 3 : 1), 0);
    const scale = options.economyScale;
    const roles = [
      { role: "crystalCollector", have: count((w) => w.mode === "crystalCollector" && !w.id.includes("ammoCollector") && w.assignment?.nodeId && isEnergyNode(w.assignment.nodeId)), want: Math.ceil(demand.energy / 1.0 * scale), node: () => leastBusyNode("energy", reactor) },
      { role: "energyTransport", have: count((w) => w.mode === "energyTransport" && w.assignment?.product === "energy"), want: Math.ceil(demand.energy / 2.0 * scale) }
    ];
    if (factory && warehouse) {
      roles.push(
        { role: "ammoCollector", have: count((w) => w.mode === "crystalCollector" && w.assignment?.nodeId && !isEnergyNode(w.assignment.nodeId)), want: Math.ceil(demand.ammo / 1.2 * scale), node: () => leastBusyNode("gunpowder", warehouse) },
        { role: "ammoTransport", have: count((w) => w.mode === "energyTransport" && w.assignment?.product === "materials"), want: Math.ceil(demand.ammo / 1.2 * scale), assign: { product: "materials", sourceTowerId: factory.id } },
        { role: "ammoTransport", have: count((w) => w.mode === "energyTransport" && w.assignment?.product === "bullet"), want: Math.ceil(demand.ammo / 0.6 * scale), assign: { product: "bullet", sourceTowerId: factory.id } }
      );
    }
    const pick = roles.filter((entry) => entry.have < entry.want).sort((a, b) => a.have / a.want - b.have / b.want)[0];
    if (!pick) return false;
    const worker = hire(pick.role);
    if (!worker) return false;
    hiresThisSetup += 1;
    const node = pick.node?.();
    if (node) send("worker:assign", { workerId: worker.id, nodeId: node.id });
    if (pick.assign) send("worker:assign", { workerId: worker.id, ...pick.assign });
    return true;
  }

  function isEnergyNode(nodeId) {
    return economyNodes().find((node) => node.id === nodeId)?.kind === "energy";
  }

  /** Kulelerin tahmini saniyelik (duvar saati) enerji ve mermi ihtiyaci. */
  function demandPerSecond() {
    let energy = 0;
    let ammo = 0;
    for (const tower of combatTowers()) {
      const definition = tower.definition;
      const shots = 1000 / Math.max(120, definition.fireIntervalMs) * 0.35;
      energy += (getTowerOperatingEnergyPerSecond(definition.hitType) + calculateTowerShotEnergyCost(definition, 0.5) * shots) * 0.8;
      ammo += calculateTowerAmmoCost(definition) * shots * 0.8;
    }
    // Fabrika da mermi basina 0,25 enerji yakiyor.
    energy += ammo * 0.25;
    return { energy, ammo };
  }

  /**
   * Gecen dalganin kitligina gore darbogaz: once ucuz bina seviyesi
   * (fabrika uretim hizi, reaktor/fabrika deposu), sonra isci. Darbogaz
   * savas boyunca olculen stoklardan: kaynak binasi doluyken kule ac
   * kaliyorsa tasiyici, bina bossa toplayici/hammadde eksik.
   */
  function relieveStarvation() {
    const reactor = findOwn(providers.energy)[0];
    const factory = findOwn(providers.ammo)[0];
    const warehouse = findOwn("warehouse-1")[0];
    const samples = Math.max(1, providerSamples.count);
    if (lastStarvation.ammo > 0.05 && factory && factory.level < 4 && upgradeProvider(factory)) return true;
    if (lastStarvation.energy > 0.05 && reactor && reactor.level < 3 && upgradeProvider(reactor)) return true;
    if (!options.hireWorkers || hiredExtra >= options.maxExtraWorkers) return false;
    const reserve = getWorkerHireCost(player().hiredWorkers.length);
    if (player().gold < reserve + 40) return false;
    if (lastStarvation.energy > 0.08 && reactor) {
      const reactorFill = providerSamples.reactorFill / samples;
      // Reaktorde enerji birikiyorsa darbogaz tasiyici; bossa toplayici.
      const carriers = ownWorkers().filter((worker) => worker.mode === "energyTransport" && worker.assignment?.product === "energy").length;
      const gatherers = ownWorkers().filter((worker) => worker.mode === "crystalCollector" && !worker.id.includes("ammoCollector")).length;
      const role = reactorFill > 0.25 || carriers < gatherers ? "energyTransport" : "crystalCollector";
      const worker = hire(role);
      if (worker && role === "crystalCollector") {
        const node = leastBusyNode("energy", reactor);
        if (node) send("worker:assign", { workerId: worker.id, nodeId: node.id });
      }
      if (++hiresThisSetup >= 2) lastStarvation.energy = 0;
      return Boolean(worker);
    }
    if (lastStarvation.ammo > 0.08 && factory && warehouse) {
      const bullets = providerSamples.bullets / samples;
      const gunpowder = providerSamples.gunpowder / samples;
      let role = "ammoTransport";
      let assign;
      if (bullets > 6) assign = { product: "bullet", sourceTowerId: factory.id };
      else if (gunpowder > 15) assign = { product: "materials", sourceTowerId: factory.id };
      else role = "ammoCollector";
      const worker = hire(role);
      if (worker && assign) send("worker:assign", { workerId: worker.id, ...assign });
      if (worker && role === "ammoCollector") {
        const node = leastBusyNode("gunpowder", warehouse);
        if (node) send("worker:assign", { workerId: worker.id, nodeId: node.id });
      }
      if (++hiresThisSetup >= 2) lastStarvation.ammo = 0;
      return Boolean(worker);
    }
    return false;
  }

  function upgradeProvider(tower) {
    const xp = getTowerLevelExpCost(tower.definition.cost, tower.level);
    const gold = getTowerLevelGoldCost(tower.definition.cost, tower.level, tower.definition.id);
    if (player().experience < xp || player().gold < gold + 20) return false;
    const changed = attempt("upgradeTower", { towerId: tower.id }, () => tower.level);
    if (changed) decisions.push(`w${room.wave}:up:${tower.definition.id}->L${tower.level}`);
    return changed;
  }

  /** En yakin dugumler arasindan en az toplayicisi olan (yakinlik esitlik bozar). */
  function leastBusyNode(kind, from) {
    const ordered = nodesByDistance(kind, from).slice(0, 2);
    const busy = (node) => ownWorkers().filter((worker) => worker.assignment?.nodeId === node.id).length;
    return [...ordered].sort((a, b) => busy(a) - busy(b))[0];
  }

  function nodesByDistance(kind, from) {
    const g = geometry();
    return [...safeNodes(kind)].sort((a, b) => {
      const pa = g.cellCenter(a.col, a.row);
      const pb = g.cellCenter(b.col, b.row);
      return Math.hypot(pa.x - from.x, pa.y - from.y) - Math.hypot(pb.x - from.x, pb.y - from.y);
    });
  }

  function sampleStarvation() {
    for (const tower of combatTowers()) {
      const fuel = towerFuel(tower.definition);
      starvation.towerTicks += 1;
      if (fuel.ammo && tower.ammo < Math.max(1, calculateTowerAmmoCost(tower.definition))) starvation.ammoTicks += 1;
      if (fuel.energy && tower.energy < 2) starvation.energyTicks += 1;
    }
    if (ctx.tick % 30 !== 0) return;
    const reactor = findOwn(providers.energy)[0];
    const factory = findOwn(providers.ammo)[0];
    const warehouse = findOwn("warehouse-1")[0];
    providerSamples.count += 1;
    if (reactor) providerSamples.reactorFill += reactor.energy / Math.max(1, reactor.maxEnergy);
    if (factory) providerSamples.bullets += Object.values(factory.ammoStock ?? {}).reduce((sum, value) => sum + value, 0);
    if (warehouse) providerSamples.gunpowder += warehouse.materials?.gunpowder ?? 0;
  }

  // ------------------------------------------------------------ insa / yukselt

  function nextMixTower() {
    const counts = new Map(mixIds.map((id) => [id, 0]));
    for (const tower of combatTowers()) if (counts.has(tower.definition.id)) counts.set(tower.definition.id, counts.get(tower.definition.id) + 1);
    // Hava korumasi: ucanlardan once havayi vurabilen en az iki kule.
    if (options.airGuard && room.wave >= 3) {
      const airCapable = combatTowers().filter((tower) => tower.definition.engine?.canHitAir).length;
      if (airCapable < 2 && !mixIds.some((id) => findDefinition(operator, id)?.engine?.canHitAir)) return AIR_GUARD[operator];
    }
    // Yerlestirilemeyen kule (bu kurulumda yer yok ya da haritada hic
    // kurulamiyor) siradakine yer birakir.
    const open = [...counts.entries()].filter(([id]) => !setupFailures.has(`build:${id}`) && !unplaceable.has(id));
    if (open.length === 0) return mixIds[0];
    const next = open.sort((a, b) => a[1] / build.mix[a[0]] - b[1] / build.mix[b[0]] || mixIds.indexOf(a[0]) - mixIds.indexOf(b[0]))[0][0];
    // Acilis: ilk kule baslangic altininin %40indan pahaliysa (Ucube) once
    // karisimin ya da hava korumasinin en ucuzu; duvar hatti ve reaktor de sigsin.
    if (combatTowers().length === 0 && getTowerBuildCost(findDefinition(operator, next).cost) > player().gold * 0.4) {
      return [...mixIds, AIR_GUARD[operator]].sort((a, b) => findDefinition(operator, a).cost - findDefinition(operator, b).cost)[0];
    }
    return next;
  }

  function desiredTowerCount() {
    return Math.min(towerLimit() - 3, 2 + Math.ceil(room.wave * 0.9));
  }

  function buildCombatTower() {
    if (slotTowerCount() >= towerLimit()) return false;
    const id = nextMixTower();
    if (lastStarvation.energy > 0.3 && combatTowers().length >= 4 && hiredExtra < options.maxExtraWorkers && options.hireWorkers) return false;
    const definition = findDefinition(operator, id);
    if (!definition || player().gold < getTowerBuildCost(definition.cost)) return false;
    if (setupFailures.has(`build:${id}`)) return false;
    const tower = tryPlace(id, combatSlots(id), "combat");
    if (!tower) {
      setupFailures.add(`build:${id}`);
      // Uc kurulum ust uste hic yer bulamayan kule kalici olarak birakilir
      // (ornegin Abarti: arena haritasinda kurulabilecek kenar yok).
      const streak = (placementMisses.get(id) ?? 0) + (placementMissSession.get(id) === setupSession ? 0 : 1);
      placementMissSession.set(id, setupSession);
      placementMisses.set(id, streak);
      if (streak >= 3 && combatTowers().every((tower) => tower.definition.id !== id)) {
        unplaceable.add(id);
        decisions.push(`w${room.wave}:unplaceable:${id}`);
      }
      return buildCombatTowerFallback(id);
    }
    placementMisses.delete(id);
    afterBuild(tower);
    return true;
  }

  /** Siradaki kule yerlesemediyse karisimin baska bir kulesi denenir (ayni cagri icinde bir kez). */
  function buildCombatTowerFallback(failedId) {
    const id = nextMixTower();
    if (id === failedId || setupFailures.has(`build:${id}`)) return false;
    const definition = findDefinition(operator, id);
    if (!definition || player().gold < getTowerBuildCost(definition.cost)) return false;
    const tower = tryPlace(id, combatSlots(id), "combat");
    if (!tower) { setupFailures.add(`build:${id}`); return false; }
    afterBuild(tower);
    return true;
  }

  function afterBuild(tower) {
    if (tower.definition.id === "warrior-2") linkServers();
  }

  function linkServers() {
    for (const server of findOwn("warrior-2")) {
      if ((server.linkedTowerIds ?? []).length > 0) continue;
      const target = combatTowers().filter((tower) => tower.definition.id !== "warrior-2").sort((a, b) => b.damageDealt - a.damageDealt)[0];
      if (target) send("linkServer", { serverTowerId: server.id, targetTowerId: target.id });
    }
  }

  function upgradeCandidates(goldBudget) {
    const xp = player().experience;
    return combatTowers()
      .filter((tower) => tower.hp > 0 && tower.level < getTowerMaxLevel(tower.definition))
      .map((tower) => ({
        tower,
        xp: getTowerLevelExpCost(tower.definition.cost, tower.level),
        gold: getTowerLevelGoldCost(tower.definition.cost, tower.level, tower.definition.id)
      }))
      .filter((entry) => entry.xp <= xp && entry.gold <= goldBudget)
      // Ucuz seviyeler once (tier esikleri 20 kat pahali), esitlikte cok hasar veren.
      .sort((a, b) => a.gold - b.gold || b.tower.damageDealt - a.tower.damageDealt);
  }

  function upgradeOnce(reserve) {
    const [best] = upgradeCandidates(player().gold - reserve);
    if (!best) return false;
    const changed = attempt("upgradeTower", { towerId: best.tower.id }, () => best.tower.level);
    if (changed) {
      decisions.push(`w${room.wave}:up:${best.tower.definition.id}->L${best.tower.level}`);
      const tier = getUcubePerkTier(best.tower.ucubePendingLevel);
      if (tier && best.tower.definition.id === "warrior-6") chooseUcube(best.tower, tier);
    }
    return changed;
  }

  function chooseUcube(tower, tier) {
    const option = options.cards === "random" ? tier.options[Math.floor(rng() * tier.options.length)] : tier.options[0];
    send("ucube:choose", { towerId: tower.id, perkId: option.id });
  }

  /** Yikik yapilar (can 0) haritada kaliyor ve kontenjan tutuyor: satilip yeniden kuruluyor. */
  function clearRuins() {
    let acted = false;
    for (const tower of ownTowers()) {
      if (tower.hp > 0) continue;
      send("sellTower", { towerId: tower.id });
      if (!room.towers.has(tower.id)) {
        acted = true;
        decisions.push(`w${room.wave}:clear:${tower.definition.id}`);
      }
    }
    return acted;
  }

  function repairReserve() {
    return Math.min(120, 20 + room.wave * 5);
  }

  function repairStructures(threshold) {
    if (!options.repair) return false;
    let acted = false;
    const damaged = ownTowers().filter((tower) => tower.hp > 0 && tower.hp < tower.maxHp * threshold)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const tower of damaged) {
      const cost = getStructureRepairCost(getTowerBuildCost(tower.definition.cost), 1 - tower.hp / tower.maxHp);
      if (cost > player().gold) continue;
      acted = attempt("structure:repair", { towerId: tower.id }, () => tower.hp) || acted;
    }
    return acted;
  }

  // ------------------------------------------------------------ kartlar

  function chooseCard() {
    const choices = room.pendingCardChoices.get(playerId);
    if (!choices) return false;
    const definitions = combatTowers().map((tower) => tower.definition);
    const focus = typeof options.cards === "string" && options.cards.startsWith("focus:") ? options.cards.slice(6) : undefined;
    const usable = choices.filter((card) => card.scope.kind !== "targeted" || targetFor(card));
    const scored = (usable.length ? usable : choices).map((card) => ({
      card,
      score: cardScore(card, axes, definitions) + (focus && (card.axes ?? []).includes(focus) ? 100 : 0)
    }));
    if (options.cards === "greedy" && options.reroll && !rerolledThisDraft) {
      const best = Math.max(...scored.map((entry) => entry.score));
      if (best < 1.2) {
        rerolledThisDraft = true;
        const before = room.pendingCardChoices.get(playerId);
        send("card:reroll", {});
        if (room.pendingCardChoices.get(playerId) !== before) return true;
      }
    }
    let pick;
    if (options.cards === "random") pick = scored[Math.floor(rng() * scored.length)];
    else if (options.cards === "worst") pick = [...scored].sort((a, b) => a.score - b.score)[0];
    else pick = [...scored].sort((a, b) => b.score - a.score)[0];
    const target = pick.card.scope.kind === "targeted" ? targetFor(pick.card) : undefined;
    send("card:choose", { cardId: pick.card.id, ...(target ? { towerId: target.id } : {}) });
    if (!room.pendingCardChoices.has(playerId)) {
      decisions.push(`w${room.wave}:card:${pick.card.id}`);
      rerolledThisDraft = false;
      return true;
    }
    // Hedefli kart reddedildiyse ilk hedefsiz karta dus.
    const fallback = choices.find((card) => card.scope.kind !== "targeted");
    if (fallback) send("card:choose", { cardId: fallback.id });
    rerolledThisDraft = false;
    return true;
  }

  function targetFor(card) {
    return combatTowers()
      .filter((tower) => canTowerHoldTargetedCard(tower.definition) && canAcceptTargetedCard(tower.targetedCardIds) && tower.definition.id !== "warrior-2"
        && (card.scope.kind !== "targeted" || shared.cardAppliesToTower(card, tower.definition)))
      .sort((a, b) => b.damageDealt - a.damageDealt || b.level - a.level)[0];
  }

  // ------------------------------------------------------------ magaza

  function shopping(budget) {
    if (options.shop === "none") return false;
    let spent = 0;
    let acted = false;
    for (let guard = 0; guard < 8; guard += 1) {
      const offers = (player().shopOffers ?? []).filter((item) => !SKIPPED_ITEMS.has(item.id));
      const loadout = room.getPlayerShopLoadout(playerId, player());
      const priced = offers.map((item) => ({ item, price: getShopItemPrice(item, player().ownedShopItemIds, loadout), score: shopItemScore(item) }))
        .filter((entry) => entry.price <= Math.min(player().gold, budget - spent) && (isGlobalShopItem(entry.item) || equipTarget(entry.item)));
      if (priced.length === 0) break;
      let pick;
      if (options.shop === "random") {
        if (rng() < 0.4) break;
        pick = priced[Math.floor(rng() * priced.length)];
      } else {
        pick = priced.filter((entry) => entry.score > 0).sort((a, b) => b.score / Math.max(1, b.price) - a.score / Math.max(1, a.price))[0];
      }
      if (!pick) break;
      const changed = attempt("shop:buy", { itemId: pick.item.id }, () => player().ownedShopItemIds.length);
      if (!changed) break;
      spent += pick.price;
      acted = true;
      decisions.push(`w${room.wave}:buy:${pick.item.id}`);
    }
    equipInventory();
    return acted;
  }

  function equipTarget(item) {
    return combatTowers()
      .filter((tower) => tower.hp > 0 && canEquipShopItem(item, tower.definition, tower.equippedShopItemIds).ok)
      .sort((a, b) => b.damageDealt - a.damageDealt || b.level - a.level)[0];
  }

  function equipInventory() {
    for (const itemId of [...player().inventoryItemIds]) {
      const item = shared.shopCatalog.find((entry) => entry.id === itemId);
      const tower = item && equipTarget(item);
      if (tower) send("equipShopItem", { itemId, towerId: tower.id });
    }
  }

  // ------------------------------------------------------------ beceriler

  function enemiesAlive() {
    return [...room.enemies.values()].filter((enemy) => enemy.hp > 0 && !enemy.untargetable
      && !(enemy.dominatedUntil > Date.now()) && !(enemy.melisUndeadUntil > Date.now()) && !(enemy.melisWhisperTurnedUntil > Date.now()));
  }

  function useSkills() {
    if (!options.skills) return;
    const p = player();
    const enemies = enemiesAlive();
    if (enemies.length === 0) return;
    const leading = [...enemies].sort((a, b) => b.y - a.y);
    const g = geometry();
    if (operator === "warrior") {
      if (p.skill3CooldownMs <= 0) {
        const target = leading.find((enemy) => !isExecuteImmune({ type: enemy.type, champion: enemy.champion, special: enemy.special?.kind }));
        if (target) send("useSkill", { slot: 2, enemyId: target.id });
      }
      if (p.skill2CooldownMs <= 0) {
        const ground = leading.find((enemy) => enemy.movementKind !== "air");
        const bottom = g.origin.y + g.rows * g.size;
        if (ground && ground.y > g.origin.y + g.rows * g.size * 0.55 && ground.y + g.size < bottom) {
          const y = ground.y + g.size * 0.7;
          send("useSkill", { slot: 1, x: Math.max(g.origin.x + 1, ground.x - g.size * 2.5), y, x2: Math.min(g.origin.x + g.cols * g.size - 1, ground.x + g.size * 2.5), y2: y });
        }
      }
      if (p.skill1CooldownMs <= 0 && enemies.length >= 3) {
        const centre = densestPoint(enemies);
        send("useSkill", { slot: 0, x: centre.x, y: centre.y });
      }
    } else if (operator === "zeynep") {
      const tier = p.reputation >= 80 ? "big" : p.reputation >= 40 ? "medium" : p.reputation >= 10 ? "small" : undefined;
      if (tier && enemies.length >= 3) {
        const slot = [0, 2, 1][(p.authorityChain ?? 0) % 3];
        const cooldown = slot === 0 ? p.skill1CooldownMs : slot === 1 ? p.skill2CooldownMs : p.skill3CooldownMs;
        if (cooldown <= 0) send("useSkill", { slot, commandTier: tier });
      }
    }
    if (options.ultimate && p.ultimateCharge >= 100 && (enemies.length >= 6 || leading[0].y > g.origin.y + g.rows * g.size * 0.75)) {
      if (operator === "zeynep") {
        const counts = new Array(g.cols).fill(0);
        for (const enemy of enemies) counts[Math.max(0, Math.min(g.cols - 1, g.toCell(enemy.x, enemy.y).col))] += 1;
        send("useUltimate", { column: counts.indexOf(Math.max(...counts)) });
      } else {
        send("useUltimate", { mode: "attack" });
      }
    }
  }

  function densestPoint(enemies) {
    let best = enemies[0];
    let bestCount = -1;
    for (const enemy of enemies) {
      let count = 0;
      for (const other of enemies) if (Math.hypot(other.x - enemy.x, other.y - enemy.y) < 70) count += 1;
      if (count > bestCount) { bestCount = count; best = enemy; }
    }
    return { x: best.x, y: best.y };
  }

  // ------------------------------------------------------------ evreler

  function setupStep() {
    if (room.setupSession !== setupSession) {
      setupSession = room.setupSession;
      setupTicks = 0;
      setupFailures = new Set();
      hiresThisSetup = 0;
      const total = Math.max(1, starvation.towerTicks);
      lastStarvation.ammo = starvation.ammoTicks / total;
      lastStarvation.energy = starvation.energyTicks / total;
      starvationLog.push({ wave: room.wave - 1, ammo: +lastStarvation.ammo.toFixed(3), energy: +lastStarvation.energy.toFixed(3) });
      starvation.ammoTicks = 0;
      starvation.energyTicks = 0;
      starvation.towerTicks = 0;
    }
    setupTicks += 1;
    if (room.pendingCardChoices.has(playerId)) return chooseCard();
    if (setupTicks > 900) return finishSetup();

    let actions = 0;
    const reserve = repairReserve();
    // 1) Ilk kuleler + kaynak binalari + duvar hatti (ilk dalga oncesi sira onemli).
    if (combatTowers().length === 0) {
      if (buildCombatTower()) return true;
    }
    if (clearRuins()) return true;
    if (missingWalls().length > 0 && buildWalls(6) > 0) return true;
    if (ensureEconomy()) actions += 1;
    if (actions === 0 && combatTowers().length < 2 && buildCombatTower()) return true;
    // 2) Onarim, darbogaz iscisi.
    if (actions === 0 && repairStructures(0.75)) actions += 1;
    if (actions === 0 && relieveStarvation()) actions += 1;
    if (actions === 0 && growEconomy()) actions += 1;
    // 3) Kartla gelen magaza (her hazirlikta bir kez acik).
    if (actions === 0 && !setupFailures.has("shop")) {
      setupFailures.add("shop");
      const budget = player().gold * options.shopShare;
      if (combatTowers().length >= 3 && shopping(budget)) actions += 1;
    }
    // 4) Yukseltme (deneyim varsa), sonra yeni kule.
    if (actions === 0) {
      const under = combatTowers().length < desiredTowerCount();
      if (under && buildCombatTower()) actions += 1;
      else if (upgradeOnce(reserve)) actions += 1;
      else if (buildCombatTower()) actions += 1;
    }
    if (actions > 0) return true;
    return finishSetup();
  }

  function finishSetup() {
    equipInventory();
    send("wave:continue", {});
    return true;
  }

  /**
   * Donmus dusmana karsilik. Kor gezinmenin dongu tespiti, takip ettigi yapi
   * yikilinca acik alanda "kir" karari veriyor ama kiracak komsu yapi
   * bulamiyor; dusman o karede sonsuza kadar duruyor ve dalga bitmiyor
   * (oyunun kendi davranisi; docs/simulator.md). Bir oyuncu ona menzili
   * yeten bir kule kurar: bot da 20 saniyedir kimildamayan bir dusmanin iki
   * kare yakinina en ucuz savas kulesini koyuyor.
   */
  function answerFrozenEnemies() {
    const now = ctx.tick;
    const g = geometry();
    let frozen;
    for (const enemy of room.enemies.values()) {
      if (enemy.movementKind === "air") continue;
      const cell = g.toCell(enemy.x, enemy.y);
      const key = `${cell.col}:${cell.row}`;
      const seen = enemyCells.get(enemy.id);
      if (!seen || seen.key !== key) enemyCells.set(enemy.id, { key, since: now });
      else if (now - seen.since > 20 * 60 && !frozen) frozen = { enemy, cell, seconds: (now - seen.since) / 60 };
    }
    for (const id of enemyCells.keys()) if (!room.enemies.has(id)) enemyCells.delete(id);
    if (!frozen) return false;
    const id = [...mixIds].sort((a, b) => findDefinition(operator, a).cost - findDefinition(operator, b).cost)[0];
    const definition = findDefinition(operator, id);
    if (player().gold < getTowerBuildCost(definition.cost) || slotTowerCount() >= towerLimit()) {
      // Altin ya da kontenjan yetmiyorsa 40 sn sonra uzaktaki en ucuz savas kulesi satilir.
      if (frozen.seconds < 40) return false;
      const far = combatTowers()
        .map((tower) => ({ tower, distance: Math.hypot(tower.x - frozen.enemy.x, tower.y - frozen.enemy.y) }))
        .filter((entry) => entry.distance > g.size * 3)
        .sort((a, b) => a.tower.definition.cost - b.tower.definition.cost || b.distance - a.distance)[0];
      if (!far) return false;
      send("sellTower", { towerId: far.tower.id });
      decisions.push(`w${room.wave}:sell-for-unfreeze:${far.tower.definition.id}`);
      if (player().gold < getTowerBuildCost(definition.cost)) return false;
    }
    const candidates = [];
    for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
      if (Math.abs(dc) + Math.abs(dr) === 0) continue;
      candidates.push({ col: frozen.cell.col + dc, row: frozen.cell.row + dr, d: Math.hypot(dc, dr) });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const slot of candidates) {
      const point = placementPoint(id, slot.col, slot.row);
      if (!room.canPlaceTower(point.x, point.y, id, "horizontal")) continue;
      if (!isMapRoutable(g, getBlockers(room), footprintFor(id, slot.col, slot.row))) continue;
      const before = room.towers.size;
      send("placeTower", { definitionId: id, x: point.x, y: point.y });
      if (room.towers.size > before) {
        decisions.push(`w${room.wave}:unfreeze:${id}@${slot.col},${slot.row}`);
        enemyCells.delete(frozen.enemy.id);
        return true;
      }
    }
    return false;
  }

  function combatStep() {
    if (room.wave !== sampleWave) {
      sampleWave = room.wave;
      providerSamples = { count: 0, reactorFill: 0, bullets: 0, gunpowder: 0 };
    }
    sampleStarvation();
    if (ctx.tick % 6 === 0) useSkills();
    const spendEvery = Math.round(options.combatSpendEverySeconds * 60);
    if (ctx.tick - lastCombatSpendTick >= spendEvery) {
      lastCombatSpendTick = ctx.tick;
      setupFailures = new Set();
      clearRuins();
      answerFrozenEnemies();
      if (missingWalls().length > 0) buildWalls(2);
      repairStructures(0.4);
      // Savasta yalnizca acil isler ve bol altin: ekonomi kararlari kurulumda.
      const comfortable = player().gold > 260 + repairReserve();
      if (comfortable && combatTowers().length < desiredTowerCount()) buildCombatTower();
    }
  }

  return {
    decisions,
    starvationLog,
    buildName,
    get layout() { return layout; },
    act() {
      if (room.matchResult) return;
      if (room.setupPhase) setupStep();
      else combatStep();
    }
  };
}
