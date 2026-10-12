import { RESOURCE_NAMES, RESOURCE_NAMES_EN, AMMO_RECIPES, type GameSnapshot, type DroneSnapshot, type TransportProduct } from "@karayel/shared";
import { getLocale } from "./i18n";

/** Compact non-modal roster: map remains interactive while assigning a worker. */
export class WorkerAssignmentUi {
  private root = document.createElement("section");
  private open = false;
  private key = "";
  private selected?: string;
  private product: TransportProduct = "energy";
  private snapshot?: GameSnapshot;
  private owner = "";

  constructor(private send: (message: { workerId: string; nodeId?: string; sourceTowerId?: string; product?: string }) => void) {
    this.root.className = "worker-roster";
    this.root.setAttribute("aria-label", "Workers");
    this.root.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.root.addEventListener("pointerup", (event) => event.stopPropagation());
    document.body.append(this.root);
  }

  destroy() { this.root.remove(); }

  update(snapshot: GameSnapshot, owner: string) {
    this.snapshot = snapshot; this.owner = owner;
    const workers = snapshot.drones.filter((worker) => worker.ownerId === owner && worker.maxHp !== undefined);
    if (this.selected && !workers.some((worker) => worker.id === this.selected)) this.selected = undefined;
    const key = JSON.stringify([getLocale(), this.open, this.selected, this.product,
      workers.map((worker) => [worker.id, worker.mode, worker.assignment, Math.floor(worker.cargo ?? 0)]),
      snapshot.towers.map((tower) => [tower.id, tower.name]),
      [...snapshot.crystalNodes, ...snapshot.ammoNodes].map((node) => [node.id, node.remaining])]);
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    const tr = getLocale() === "tr";
    const names = tr ? RESOURCE_NAMES : RESOURCE_NAMES_EN;
    const toggle = document.createElement("button");
    toggle.className = "worker-roster__toggle";
    toggle.textContent = `${tr ? "İşçiler" : "Workers"} (${workers.length}) ${this.open ? "−" : "+"}`;
    toggle.setAttribute("aria-expanded", String(this.open));
    toggle.onclick = () => { this.open = !this.open; this.selected = undefined; this.key = ""; this.update(snapshot, owner); };
    this.root.append(toggle);
    if (this.selected) {
      const worker = workers.find((entry) => entry.id === this.selected)!;
      const hint = document.createElement("div");
      hint.className = "worker-roster__hint";
      hint.textContent = worker.mode === "crystalCollector" || worker.mode === "ammoCollector"
        ? tr ? "Haritada çalışacağı kaynağa dokun." : "Tap a resource on the map."
        : tr ? "Haritada çıkış binasına dokun." : "Tap the source building on the map.";
      if (worker.mode !== "crystalCollector" && worker.mode !== "ammoCollector" && worker.mode !== "repairer") {
        const select = document.createElement("select");
        select.setAttribute("aria-label", tr ? "Taşınacak ürün" : "Transport product");
        for (const product of ["energy", "bullet", "auraCrystal", "powerCrystal"] as const) {
          const option = document.createElement("option"); option.value = product;
          option.textContent = product === "energy" ? tr ? "Enerji" : "Energy" : `${names[AMMO_RECIPES[product]]} → ${tr ? "mühimmat" : "ammo"}`;
          select.append(option);
        }
        select.value = this.product;
        select.onchange = () => { this.product = select.value as TransportProduct; };
        hint.append(select);
      }
      const cancel = document.createElement("button");
      cancel.textContent = tr ? "İptal" : "Cancel";
      cancel.onclick = () => { this.selected = undefined; this.open = true; this.key = ""; this.update(snapshot, owner); };
      hint.append(cancel); this.root.append(hint);
    } else if (this.open) {
      const list = document.createElement("div"); list.className = "worker-roster__list";
      const intro = document.createElement("p");
      intro.textContent = tr ? "İşçiyi seç, sonra haritada kaynağa veya binaya dokun. Taşıdığı yük varsa önce teslim eder." : "Select a worker, then tap a resource or building. Existing cargo is delivered first.";
      list.append(intro);
      workers.forEach((worker, index) => {
        const row = document.createElement("button");
        const gather = worker.mode === "crystalCollector" || worker.mode === "ammoCollector";
        const role = gather ? tr ? "Toplama" : "Gatherer" : worker.mode === "repairer" ? tr ? "Onarım" : "Repairer" : tr ? "Taşıma" : "Carrier";
        const node = [...snapshot.crystalNodes.map((entry) => ({ ...entry, kind: "energy" as const })), ...snapshot.ammoNodes].find((entry) => entry.id === worker.assignment?.nodeId);
        const source = snapshot.towers.find((tower) => tower.id === worker.assignment?.sourceTowerId);
        const job = gather ? names[node?.kind ?? "energy"] : worker.mode === "repairer" ? tr ? "Onarım parçası" : "Repair parts"
          : worker.assignment?.product === "energy" ? tr ? "Enerji" : "Energy" : names[AMMO_RECIPES[worker.assignment?.product as keyof typeof AMMO_RECIPES] ?? "gunpowder"];
        const reserve = gather && node?.remaining !== undefined ? ` · ${tr ? "Kalan" : "Remaining"}: ${Math.floor(node.remaining)}${node.remaining === 0 ? tr ? " (Tükendi)" : " (Depleted)" : ""}` : "";
        row.textContent = `${index + 1}. ${role} · ${job} · ${source?.name ?? worker.assignment?.nodeId ?? (tr ? "Otomatik merkez" : "Automatic source")} · ${tr ? "Yük" : "Cargo"}: ${Math.floor(worker.cargo ?? 0)}${reserve}`;
        row.onclick = () => { this.selected = worker.id; this.product = worker.assignment?.product ?? "energy"; this.open = false; this.key = ""; this.update(snapshot, owner); };
        list.append(row);
      });
      this.root.append(list);
    }
  }

  /** Returns true while choosing, so assignment clicks never place/sell a tower. */
  mapClick(x: number, y: number, radius: number) {
    if (!this.selected || !this.snapshot) return false;
    const worker = this.snapshot.drones.find((entry) => entry.id === this.selected);
    if (!worker) { this.selected = undefined; return true; }
    const nearby = <T extends { x: number; y: number }>(items: T[]) => items.filter((item) => Math.hypot(item.x - x, item.y - y) <= radius)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (worker.mode === "crystalCollector" || worker.mode === "ammoCollector") {
      const node = nearby([...this.snapshot.crystalNodes, ...this.snapshot.ammoNodes]);
      if (!node) return true;
      this.send({ workerId: worker.id, nodeId: node.id });
    } else {
      const source = nearby(this.snapshot.towers.filter((tower) => tower.ownerId === this.owner && (tower.hp ?? 0) > 0
        && (worker.mode === "repairer" ? tower.definitionId === "repair-depot-1" : tower.resourceProvider === (this.product === "energy" ? "energy" : "ammunition"))));
      if (!source) return true;
      this.send({ workerId: worker.id, sourceTowerId: source.id, product: this.product });
    }
    this.selected = undefined; this.open = true; this.key = "";
    return true;
  }
}
