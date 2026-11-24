import {
  HIRABLE_WORKER_ROLES,
  RESOURCE_NAMES,
  getWorkerJob,
  getWorkerPostKind,
  type AmmoNodeSnapshot,
  type CrystalNodeSnapshot,
  type DroneSnapshot,
  type ResourceKind,
  type TowerSnapshot,
  type TransportProduct,
  type WorkerPostKind
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
 * Sahibin istegi (2026-11-24): tek tip isci. Meslek ve tasinacak urun secimi
 * yok; isin adi iscinin atandigi yerden (`getWorkerJob`, `WorkerPostKind`):
 * kaynakta Toplama, Hammadde Deposu / enerji binasi / cephanelikte o binanin
 * tasimasi, Tamir Merkezi'nde Onarim; atamasiz isci Bosta.
 *
 * Metinler `t()` ile ve katalogdan (hammadde, muhimmat, kule adlari);
 * satirlar ham veri tasiyor, dil cizim aninda okunuyor.
 */

/** Iscinin su anki isi (rengi ve satiri bununla). */
export type WorkerRosterRole = "gatherer" | "carrier" | "repairer" | "idle";

/** Haritadaki kaynak: turu ve ayni turdekiler arasindaki sirasi (1'den). */
export type ResourceNode = { id: string; kind: ResourceKind; ordinal: number; remaining?: number; x: number; y: number };

export type WorkerRosterTarget =
  | { type: "node"; kind: ResourceKind; ordinal: number }
  | { type: "tower"; name: string; definitionId?: string }
  /** Atanan bina artik yok (satildi ya da yikildi): isci ayni turden en yakin binada. */
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
  /** Tasiyici ve tamircinin gorev yeri turu. */
  postKind?: WorkerPostKind;
  target?: WorkerRosterTarget;
  /** Toplayicinin kaynagi tukendi: isci bekliyor. */
  depleted: boolean;
  // Canli sayilar: yapi anahtarina girmiyor, yerinde yaziliyor.
  cargo: number;
  remaining?: number;
};

/** Haritada hedefi beklenen isci (tek tip: yalnizca kimligi). */
export type WorkerPick = { workerId: string };

export type WorkerRosterState = {
  rows: WorkerRosterRow[];
  /** Haritada hedefi beklenen isci; cekmece o sirada tek satira iniyor. */
  picking?: WorkerPick & { order: number; role: WorkerRosterRole; postKind?: WorkerPostKind };
};

type TowerLike = Pick<TowerSnapshot, "id" | "name" | "definitionId" | "ownerId" | "x" | "y"> & Partial<Pick<TowerSnapshot, "hp" | "resourceProvider">>;

/** Lojistik iscisi mi (AttackLord'un ulti dronlari degil). */
export function isLogisticsWorkerSnapshot(drone: Pick<DroneSnapshot, "mode">): boolean {
  return (HIRABLE_WORKER_ROLES as readonly string[]).includes(drone.mode);
}

/** Lojistik iscisinin su anki isi; savas dronlarinda `undefined`. */
export function getWorkerRosterRole(drone: Pick<DroneSnapshot, "mode" | "assignment">): WorkerRosterRole | undefined {
  if (!isLogisticsWorkerSnapshot(drone)) return undefined;
  const job = getWorkerJob(drone.assignment);
  return job === "gather" ? "gatherer" : job === "haul" ? "carrier" : job === "repair" ? "repairer" : "idle";
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
    const role = drone.ownerId === input.ownerId && drone.maxHp !== undefined ? getWorkerRosterRole(drone) : undefined;
    if (!role) continue;
    const assignment = drone.assignment;
    const row: WorkerRosterRow = {
      id: drone.id,
      order: rows.length + 1,
      role,
      advanced: drone.advanced === true,
      auto: drone.autoAssigned === true,
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
    } else if (role !== "idle") {
      row.postKind = assignment?.postKind;
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
    picking: picked ? { workerId: picked.id, order: picked.order, role: picked.role, postKind: picked.postKind } : undefined
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
    return `${row.id}:${row.role}:${row.advanced ? 1 : 0}${row.auto ? 1 : 0}${row.depleted ? 1 : 0}:${row.resource ?? ""}:${row.postKind ?? ""}:${target}:${row.remaining === undefined ? 0 : 1}`;
  });
  return `${rows.join("|")}#${state.picking ? state.picking.workerId : ""}`;
}

// ------------------------------------------------------------ Metinler

/** Isin adi: "Toplama", "Hammadde taşıma", "Enerji taşıma", "Mühimmat taşıma", "Onarım", "Boşta". */
export function formatWorkerRole(role: WorkerRosterRole, postKind?: WorkerPostKind): string {
  if (role === "gatherer") return t("controls.roster.jobGather");
  if (role === "repairer") return t("controls.roster.jobRepair");
  if (role === "idle") return t("controls.roster.jobIdle");
  return t(postKind === "warehouse" ? "controls.roster.jobHaulWarehouse" : postKind === "factory" ? "controls.roster.jobHaulFactory" : "controls.roster.jobHaulEnergy");
}

/** "Enerji kristali 2", "Barut yatağı 1": ic kimlik ("crystal-2") yerine. */
export function formatResourceNodeName(kind: ResourceKind, ordinal: number): string {
  return t(kind === "energy" ? "controls.roster.nodeCrystal" : "controls.roster.nodeDeposit", { resource: RESOURCE_NAMES[kind], n: ordinal });
}

/** Urunun adi (egitim metinleri): hammadde, enerji ya da muhimmat turu. */
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

/** Satirin sabit metni: baslik ("2. Enerji taşıma") ve hedef ("Enerji Reaktörü"). */
export function describeWorkerRow(row: WorkerRosterRow): { title: string; detail: string } {
  const role = formatWorkerRole(row.role, row.postKind);
  const title = t(row.advanced ? "controls.roster.titleAdvanced" : "controls.roster.title", { n: row.order, role });
  if (row.role === "idle") return { title, detail: t("controls.roster.idleDetail") };
  const target = formatWorkerTarget(row);
  if (row.role === "gatherer") {
    // Elle atanmis toplayicida kaynagin adi turunu zaten soyluyor.
    if (!row.auto && row.target) return { title, detail: target };
    return { title, detail: row.resource ? t("controls.roster.detail", { job: RESOURCE_NAMES[row.resource], target }) : target };
  }
  return { title, detail: target };
}

/** Canli sayi: tasinan yuk. */
export function formatWorkerCargo(row: WorkerRosterRow): string {
  return t("controls.roster.cargo", { n: row.cargo });
}

/** Canli sayi: toplayicinin kaynaginda kalan; baska islerde bos. */
export function formatWorkerReserve(row: WorkerRosterRow): string {
  if (row.depleted) return t("controls.roster.depleted");
  return row.remaining === undefined ? "" : t("controls.roster.remaining", { n: row.remaining });
}

/** Hedef beklenirken seritte yazan yonerge: her isci her yere gidebiliyor. */
export function getWorkerPickHint(): string {
  return t("controls.roster.hintPost");
}

// ------------------------------------------------------------ Haritada hedef

/** Isci atanabilen bina mi (sunucudaki `assignWorker` ile ayni kural: `getWorkerPostKind`). */
export function isWorkerPostTower(tower: Pick<TowerLike, "definitionId" | "resourceProvider">): boolean {
  return getWorkerPostKind({ id: tower.definitionId, resourceProvider: tower.resourceProvider }) !== undefined;
}

export type WorkerAssignMessage = { workerId: string; nodeId?: string; sourceTowerId?: string };

export type WorkerMapTarget =
  | { kind: "assign"; message: WorkerAssignMessage }
  /** Dokunulan kaynak tukenmis: atama gitmiyor, oyuncuya soyleniyor. */
  | { kind: "depleted" }
  /** Dokunulan bina isci alamiyor (kule, duvar). */
  | { kind: "wrongBuilding" }
  | { kind: "none" };

/**
 * Haritaya dokunusun atamaya cevrilmesi: dokunusa en yakin kaynak ya da gorev
 * binasi (Hammadde Deposu, enerji binasi, cephanelik, Tamir Merkezi).
 * `hitTowerId`: dokunulan karedeki kule (cok kareli binada merkez yaricapin
 * disinda kalabiliyor); o en yakin sayiliyor.
 */
export function resolveWorkerMapTarget(input: {
  workerId: string;
  x: number;
  y: number;
  radius: number;
  nodes: readonly ResourceNode[];
  towers: Iterable<TowerLike>;
  hitTowerId?: string;
  ownerId: string;
}): WorkerMapTarget {
  const distance = (item: { x: number; y: number }) => Math.hypot(item.x - input.x, item.y - input.y);
  const reach = (tower: TowerLike) => (tower.id === input.hitTowerId ? 0 : distance(tower));
  let post: TowerLike | undefined;
  let nearbyOwned = false;
  for (const tower of input.towers) {
    if (tower.ownerId !== input.ownerId || (tower.hp ?? 1) <= 0 || reach(tower) > input.radius) continue;
    nearbyOwned = true;
    if (isWorkerPostTower(tower) && (!post || reach(tower) < reach(post))) post = tower;
  }
  const node = input.nodes.filter((entry) => distance(entry) <= input.radius).sort((a, b) => distance(a) - distance(b))[0];
  if (node && (!post || distance(node) < reach(post))) {
    if (node.remaining !== undefined && node.remaining <= 0) return { kind: "depleted" };
    return { kind: "assign", message: { workerId: input.workerId, nodeId: node.id } };
  }
  if (post) return { kind: "assign", message: { workerId: input.workerId, sourceTowerId: post.id } };
  return nearbyOwned ? { kind: "wrongBuilding" } : { kind: "none" };
}

/**
 * Haritaya dokunus bir isciyi mi seciyor: yerel oyuncunun en yakin iscisi,
 * govdesinden genis bir yaricapta (kucuk ve hareketli birim). Dokunus bir
 * yapinin uzerindeyse yapi kazanir (`hitTower`): binada bekleyen isci listeden.
 */
export function findTappedWorker(input: {
  x: number;
  y: number;
  radius: number;
  drones: readonly DroneSnapshot[];
  ownerId: string;
  hitTower: boolean;
}): DroneSnapshot | undefined {
  if (input.hitTower) return undefined;
  let best: DroneSnapshot | undefined;
  let bestDistance = input.radius;
  for (const drone of input.drones) {
    if (drone.ownerId !== input.ownerId || drone.maxHp === undefined || !isLogisticsWorkerSnapshot(drone)) continue;
    const distance = Math.hypot(drone.x - input.x, drone.y - input.y);
    if (distance <= bestDistance) {
      best = drone;
      bestDistance = distance;
    }
  }
  return best;
}
