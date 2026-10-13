import {
  REPAIR_DEPOT_TOWER_ID,
  RESOURCE_NAMES,
  WORKER_ROLE_LABELS,
  type AmmoNodeSnapshot,
  type CrystalNodeSnapshot,
  type DroneSnapshot,
  type HirableWorkerRole,
  type ResourceKind,
  type TowerSnapshot,
  type TransportProduct
} from "@karayel/shared";
import { ammoTypeLabels } from "./codex";
import { t } from "./i18n";
import { localizeTowerName } from "./server-text";

/**
 * Isci kadrosu: Isci cekmecesinin "Yonetim" bolumunun saf mantigi.
 *
 * Burada DOM yok. Sahne anlik goruntuden satirlari kuruyor (`buildWorkerRoster`),
 * alt bar (`game-control-ui.ts`) onlari kendi cizim hattinda dugmeye ceviriyor:
 * parmak basiliyken yeniden kurma orada erteleniyor, canli sayilar (yuk, kalan)
 * yerinde yaziliyor. Kadro bir donem kendi yuzen paneliydi ve her yuk
 * degisiminde butun satirlari yeniden yaratiyordu; parmagin altindaki dugme
 * DOM'dan cikinca dokunus kayboluyordu.
 *
 * Metinler `t()` ile ve katalogdan (meslek, hammadde, muhimmat, kule adlari);
 * satirlar ham veri tasiyor, dil cizim aninda okunuyor.
 */

export type WorkerRosterRole = "gatherer" | "carrier" | "repairer";

/** Haritadaki kaynak: turu ve ayni turdekiler arasindaki sirasi (1'den). */
export type ResourceNode = { id: string; kind: ResourceKind; ordinal: number; remaining?: number; x: number; y: number };

export type WorkerRosterTarget =
  | { type: "node"; kind: ResourceKind; ordinal: number }
  | { type: "tower"; name: string; definitionId?: string }
  /** Atanan bina artik yok (satildi ya da yikildi). */
  | { type: "lost" };

export type WorkerRosterRow = {
  id: string;
  /** Listedeki sira numarasi (1'den). */
  order: number;
  role: WorkerRosterRole;
  advanced: boolean;
  /** Is oyuncunun secimi degil, sunucunun varsayilani. */
  auto: boolean;
  /** Toplayicinin cikardigi hammadde. */
  resource?: ResourceKind;
  /** Tasiyicinin tasidigi urun. */
  product?: TransportProduct;
  target?: WorkerRosterTarget;
  /** Toplayicinin kaynagi tukendi: isci bekliyor. */
  depleted: boolean;
  // Canli sayilar: yapi anahtarina girmiyor, yerinde yaziliyor.
  cargo: number;
  remaining?: number;
};

export type WorkerPick = { workerId: string; product: TransportProduct };

export type WorkerRosterState = {
  rows: WorkerRosterRow[];
  /** Haritada hedefi beklenen isci; cekmece o sirada tek satira iniyor. */
  picking?: WorkerPick & { order: number; role: WorkerRosterRole };
};

type TowerLike = Pick<TowerSnapshot, "id" | "name" | "definitionId" | "ownerId" | "x" | "y"> & Partial<Pick<TowerSnapshot, "hp" | "resourceProvider">>;

/** Rolun katalogdaki meslek adi (`WORKER_ROLE_LABELS`). */
const ROLE_LABEL_IDS: Record<WorkerRosterRole, HirableWorkerRole> = {
  gatherer: "crystalCollector",
  carrier: "energyTransport",
  repairer: "repairer"
};

const CARRIER_PRODUCTS: readonly TransportProduct[] = ["materials", "energy", "bullet", "auraCrystal", "powerCrystal"];

/** Lojistik iscisinin meslegi; savas dronlarinda `undefined`. */
export function getWorkerRosterRole(mode: DroneSnapshot["mode"]): WorkerRosterRole | undefined {
  if (mode === "crystalCollector" || mode === "ammoCollector") return "gatherer";
  if (mode === "energyTransport" || mode === "ammoTransport") return "carrier";
  return mode === "repairer" ? "repairer" : undefined;
}

/** Enerji kristalleri ve hammadde yataklari tek listede, turune gore numarali. */
export function listResourceNodes(crystalNodes: readonly CrystalNodeSnapshot[] = [], materialNodes: readonly AmmoNodeSnapshot[] = []): ResourceNode[] {
  const counts = new Map<ResourceKind, number>();
  const number = (kind: ResourceKind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return next;
  };
  return [
    ...crystalNodes.map((node) => ({ id: node.id, kind: "energy" as const, ordinal: number("energy"), remaining: node.remaining, x: node.x, y: node.y })),
    ...materialNodes.map((node) => {
      const kind = node.kind ?? "gunpowder";
      return { id: node.id, kind, ordinal: number(kind), remaining: node.remaining, x: node.x, y: node.y };
    })
  ];
}

/**
 * Oyuncunun iscilerinin satirlari. Yalnizca gosterileni tasiyor: butun kuleleri
 * ve kaynaklari degil, iscinin kendi hedefini.
 */
export function buildWorkerRoster(input: {
  drones: readonly DroneSnapshot[];
  nodes: readonly ResourceNode[];
  getTower: (id: string) => TowerLike | undefined;
  ownerId: string;
  pick?: WorkerPick;
}): WorkerRosterState {
  const rows: WorkerRosterRow[] = [];
  for (const drone of input.drones) {
    const role = drone.ownerId === input.ownerId && drone.maxHp !== undefined ? getWorkerRosterRole(drone.mode) : undefined;
    if (!role) continue;
    const assignment = drone.assignment;
    const row: WorkerRosterRow = {
      id: drone.id,
      order: rows.length + 1,
      role,
      advanced: drone.advanced === true,
      auto: drone.autoAssigned === true || !assignment,
      depleted: false,
      cargo: Math.floor(drone.cargo ?? 0)
    };
    if (role === "gatherer") {
      const node = input.nodes.find((entry) => entry.id === assignment?.nodeId);
      if (node) {
        row.resource = node.kind;
        row.target = { type: "node", kind: node.kind, ordinal: node.ordinal };
        row.remaining = node.remaining === undefined ? undefined : Math.floor(node.remaining);
        row.depleted = node.remaining !== undefined && node.remaining <= 0;
      }
    } else {
      if (role === "carrier") row.product = assignment?.product ?? "energy";
      if (assignment?.sourceTowerId) {
        const tower = input.getTower(assignment.sourceTowerId);
        row.target = tower && (tower.hp ?? 1) > 0 ? { type: "tower", name: tower.name, definitionId: tower.definitionId } : { type: "lost" };
      }
    }
    rows.push(row);
  }
  const picked = input.pick ? rows.find((row) => row.id === input.pick?.workerId) : undefined;
  return {
    rows,
    picking: picked && input.pick ? { workerId: picked.id, order: picked.order, role: picked.role, product: input.pick.product } : undefined
  };
}

/**
 * Kadronun yapisi: hangi satirlar var ve ne yaziyorlar. Yuk ve kalan miktar
 * burada yok -- onlar her anlik goruntude oynuyor ve yerinde yaziliyor; anahtara
 * girselerdi liste saniyede birkac kez yeniden kurulurdu. Tukenme anahtarda:
 * satirin yazisi ve rengi degisiyor.
 */
export function getWorkerRosterStructureKey(state: WorkerRosterState | undefined): string {
  if (!state) return "";
  const rows = state.rows.map((row) => {
    const target = !row.target ? "" : row.target.type === "node" ? `n${row.target.kind}${row.target.ordinal}` : row.target.type === "tower" ? `t${row.target.definitionId ?? ""}${row.target.name}` : "lost";
    return `${row.id}:${row.role}:${row.advanced ? 1 : 0}${row.auto ? 1 : 0}${row.depleted ? 1 : 0}:${row.resource ?? ""}:${row.product ?? ""}:${target}:${row.remaining === undefined ? 0 : 1}`;
  });
  return `${rows.join("|")}#${state.picking ? `${state.picking.workerId}:${state.picking.product}` : ""}`;
}

/** Haritada hedef beklerken secilebilen urunler; yalnizca tasiyicida. */
export function getWorkerProductOptions(role: WorkerRosterRole): readonly TransportProduct[] {
  return role === "carrier" ? CARRIER_PRODUCTS : [];
}

// ------------------------------------------------------------ Metinler

export function formatWorkerRole(role: WorkerRosterRole): string {
  return WORKER_ROLE_LABELS[ROLE_LABEL_IDS[role]];
}

/** "Enerji kristali 2", "Barut yatağı 1": ic kimlik ("crystal-2") yerine. */
export function formatResourceNodeName(kind: ResourceKind, ordinal: number): string {
  return t(kind === "energy" ? "controls.roster.nodeCrystal" : "controls.roster.nodeDeposit", { resource: RESOURCE_NAMES[kind], n: ordinal });
}

export function formatTransportProduct(product: TransportProduct): string {
  if (product === "materials") return t("controls.roster.productMaterials");
  if (product === "energy") return t("controls.roster.productEnergy");
  return ammoTypeLabels[product];
}

function formatWorkerTarget(row: WorkerRosterRow): string {
  const target = row.target;
  if (target?.type === "lost") return t("controls.roster.targetLost");
  // Varsayilan is bir hedef secimi degil: kaynagin kimligi oyuncunun atamasi
  // gibi gorunmesin.
  if (!target || row.auto) return t("controls.roster.auto");
  return target.type === "node" ? formatResourceNodeName(target.kind, target.ordinal) : localizeTowerName(target.definitionId, target.name);
}

/** Satirin sabit metni: baslik ("2. Taşıma") ve is ("Enerji · Otomatik"). */
export function describeWorkerRow(row: WorkerRosterRow): { title: string; detail: string } {
  const role = formatWorkerRole(row.role);
  const title = t(row.advanced ? "controls.roster.titleAdvanced" : "controls.roster.title", { n: row.order, role });
  const target = formatWorkerTarget(row);
  if (row.role === "gatherer") {
    // Elle atanmis toplayicida kaynagin adi turunu zaten soyluyor.
    if (!row.auto && row.target) return { title, detail: target };
    return { title, detail: row.resource ? t("controls.roster.detail", { job: RESOURCE_NAMES[row.resource], target }) : target };
  }
  const job = row.role === "repairer" ? t("controls.roster.jobRepair") : formatTransportProduct(row.product ?? "energy");
  return { title, detail: t("controls.roster.detail", { job, target }) };
}

/** Canli sayi: tasinan yuk. */
export function formatWorkerCargo(row: WorkerRosterRow): string {
  return t("controls.roster.cargo", { n: row.cargo });
}

/** Canli sayi: toplayicinin kaynaginda kalan; baska rollerde bos. */
export function formatWorkerReserve(row: WorkerRosterRow): string {
  if (row.depleted) return t("controls.roster.depleted");
  return row.remaining === undefined ? "" : t("controls.roster.remaining", { n: row.remaining });
}

/** Hedef beklenirken seritte yazan yonerge. */
export function getWorkerPickHint(role: WorkerRosterRole, product: TransportProduct): string {
  if (role === "gatherer") return t("controls.roster.hintNode");
  if (role === "repairer") return t("controls.roster.hintRepair");
  if (product === "materials") return t("controls.roster.hintMaterials");
  return t(product === "energy" ? "controls.roster.hintEnergy" : "controls.roster.hintAmmo");
}

// ------------------------------------------------------------ Haritada hedef

/** Bina bu isin cikis (hammaddede: beslenecek) binasi mi; sunucudaki `assignWorker` ile ayni kural. */
export function isWorkerSourceTower(role: WorkerRosterRole, product: TransportProduct, tower: Pick<TowerLike, "definitionId" | "resourceProvider">): boolean {
  const depot = tower.definitionId === REPAIR_DEPOT_TOWER_ID;
  if (role === "repairer") return depot;
  if (role !== "carrier") return false;
  if (product === "materials") return tower.resourceProvider === "ammunition" || depot;
  return tower.resourceProvider === (product === "energy" ? "energy" : "ammunition");
}

export type WorkerAssignMessage = { workerId: string; nodeId?: string; sourceTowerId?: string; product?: TransportProduct };

export type WorkerMapTarget =
  | { kind: "assign"; message: WorkerAssignMessage }
  /** Dokunulan kaynak tukenmis: atama gitmiyor, oyuncuya soyleniyor. */
  | { kind: "depleted" }
  /** Dokunulan bina bu is icin uygun degil. */
  | { kind: "wrongBuilding" }
  | { kind: "none" };

/**
 * Haritaya dokunusun atamaya cevrilmesi. Toplayici kaynaga, tasiyici ve
 * tamirci kendi binasina gider; en yakin aday secilir. `hitTowerId`: dokunulan
 * karedeki kule (cok kareli binada merkez yaricapin disinda kalabiliyor).
 */
export function resolveWorkerMapTarget(input: {
  workerId: string;
  role: WorkerRosterRole;
  product: TransportProduct;
  x: number;
  y: number;
  radius: number;
  nodes: readonly ResourceNode[];
  towers: Iterable<TowerLike>;
  hitTowerId?: string;
  ownerId: string;
}): WorkerMapTarget {
  const distance = (item: { x: number; y: number }) => Math.hypot(item.x - input.x, item.y - input.y);
  if (input.role === "gatherer") {
    const node = input.nodes.filter((entry) => distance(entry) <= input.radius).sort((a, b) => distance(a) - distance(b))[0];
    if (!node) return { kind: "none" };
    if (node.remaining !== undefined && node.remaining <= 0) return { kind: "depleted" };
    return { kind: "assign", message: { workerId: input.workerId, nodeId: node.id } };
  }
  const reach = (tower: TowerLike) => (tower.id === input.hitTowerId ? 0 : distance(tower));
  const nearby: TowerLike[] = [];
  for (const tower of input.towers) {
    if (tower.ownerId === input.ownerId && (tower.hp ?? 1) > 0 && reach(tower) <= input.radius) nearby.push(tower);
  }
  if (nearby.length === 0) return { kind: "none" };
  const source = nearby.filter((tower) => isWorkerSourceTower(input.role, input.product, tower)).sort((a, b) => reach(a) - reach(b))[0];
  if (!source) return { kind: "wrongBuilding" };
  return {
    kind: "assign",
    message: input.role === "repairer"
      ? { workerId: input.workerId, sourceTowerId: source.id }
      : { workerId: input.workerId, sourceTowerId: source.id, product: input.product }
  };
}
