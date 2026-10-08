/**
 * Kule paneli icin gelistirme sahnesi (yalnizca `vite` dev sunucusunda:
 * `/dev/tower-sheet.html`). Uretim paketine girmiyor; `index.html` bunu
 * hic iceri almiyor.
 *
 * Gercek `setupGameControlUi` sahte bir oyuna baglaniyor ve panele gercekci
 * bir durum yollaniyor: sunucu bloklari test odasindan alinmis sayilar.
 * Phaser yok, yani tarayici bolmesi gizliyken de calisiyor.
 *
 * Adres parametreleri: `?tower=warrior-1|warrior-3|warrior-5`,
 * `dock=top|bottom`, `ro=1` (takim arkadasinin kulesi), `pending=1`,
 * `expanded=1|0` (panelin boyunu yerel depoya yazar).
 */
import type Phaser from "phaser";
import { MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER, type TowerStatsWire } from "@karayel/shared";
import { setupGameControlUi } from "../game-control-ui";
import type { TowerSheetInput } from "../tower-sheet";

type Listener = (...args: unknown[]) => void;

function createFakeGame(canvas: HTMLElement) {
  const listeners = new Map<string, Listener[]>();
  return {
    canvas,
    events: {
      on(type: string, listener: Listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      off(type: string, listener: Listener) {
        listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
      },
      emit(type: string, ...args: unknown[]) {
        for (const listener of listeners.get(type) ?? []) listener(...args);
      }
    }
  };
}

const BLOCKS: Record<string, TowerStatsWire> = {
  "warrior-1": {"id":"t1","c":34,"k":37,"it":["kritik-sistem","hafif-muhimmat","atis-denetleyicisi"],"tc":["serbest-yatak"],"tm":"first","dt":"physical","ht":"projectile","r":{"v":145,"b":96.667,"m":[["character:atakan-passive",1.5]]},"d":{"v":81,"b":60,"s":[["character:atakan-passive",0.5],["card:serbest-yatak",-0.15]]},"f":{"v":3.934,"b":1.692,"s":[["shop:atis-denetleyicisi",0.25],["conversion:tork-aktarimi:0",0.3]],"m":[["character:atakan-passive",1.5]]},"su":0.25,"cc":{"v":0.13,"b":0.01,"s":[["shop:kritik-sistem",0.12]]},"cm":{"v":3,"b":2,"s":[["shop:kritik-sistem",1]]},"dps":401.5,"tr":{"v":199.4,"b":68.755,"s":[["card:nisan-takimi",0.2],["card:tork-aktarimi",0.5],["card:serbest-yatak",1.2]]},"ac":{"v":17,"b":20,"s":[["card:nisan-takimi",0.15]]},"ps":{"v":156.9,"b":95.111,"s":[["card:nisan-takimi",0.25],["shop:hafif-muhimmat",0.4]]},"dx":[["air",0.35],["shielded",0.3],["brute",0.3]],"fe":[["mark",0.2,6500]],"hs":12,"hc":3,"hl":100,"hr":30,"am":1.021,"oe":0.6},
  "warrior-3": {"id":"t1","c":34,"tm":"first","dt":"none","ht":"aura","r":{"v":159,"b":106,"m":[["character:atakan-passive",1.5]]},"f":{"v":4.545},"e":1,"fe":[["slow",0.322,850],["aslow",0.322]],"hs":1,"hc":3,"hl":100,"hr":30,"ec":3.743},
  "warrior-5": {"id":"t1","c":34,"tm":"marked","dt":"fire","ht":"focus","r":{"v":200,"b":133.3,"m":[["character:atakan-passive",1.5]]},"d":{"v":119.5,"b":40,"s":[["character:atakan-passive",0.5],["tower:warrior-5:debug",1.487]]},"f":{"v":12.5,"b":8.681,"m":[["character:atakan-passive",1.5],["etc",0.96]]},"e":1,"su":1.875,"cc":{"v":0.01},"cm":{"v":2},"dps":1508.2,"tr":{"v":116.9,"b":68.755,"s":[["card:nisan-takimi",0.2],["card:tork-aktarimi",0.5]]},"ac":{"v":17,"b":20,"s":[["card:nisan-takimi",0.15]]},"hs":1.6,"hc":3,"hl":100,"hr":30,"ec":1.355}
};

const NAMES: Record<string, { name: string; level: number }> = {
  "warrior-1": { name: "Takipçi", level: 4 },
  "warrior-3": { name: "İzolasyon Kulesi", level: 6 },
  "warrior-5": { name: "Debug Lazer", level: 7 }
};

const params = new URLSearchParams(location.search);
const towerId = BLOCKS[params.get("tower") ?? ""] ? params.get("tower")! : "warrior-1";
const dock = params.get("dock") === "top" ? "top" : "bottom";
const readOnly = params.get("ro") === "1";
const pending = params.get("pending") === "1";
if (params.has("expanded")) {
  try {
    localStorage.setItem("uzay_tower_sheet_expanded_v1", params.get("expanded") === "1" ? "1" : "0");
  } catch {
    // depo kapali
  }
}

const canvas = document.getElementById("fake-canvas")!;
// Kulenin haritadaki yeri: panelin kapatmamasi gereken nokta.
const marker = document.getElementById("tower-marker")!;
marker.style.top = dock === "top" ? "68%" : "30%";

const game = createFakeGame(canvas);
setupGameControlUi(game as unknown as Phaser.Game);

let temperature = 34;
let ammo = 14;
let energy = 72;
let damage = 18_420;
let tick = 0;

function stateFor(): Record<string, unknown> {
  const block = BLOCKS[towerId];
  const meta = NAMES[towerId];
  const operational = true;
  const sheet: TowerSheetInput = {
    towerId: "t1",
    definitionId: towerId,
    characterId: "warrior",
    name: meta.name,
    level: meta.level,
    color: "#22c55e",
    ownerName: readOnly ? "Melis" : undefined,
    readOnly,
    dock,
    stats: pending ? undefined : block,
    live: {
      hp: 182,
      maxHp: 240,
      armor: 4,
      temperature,
      ammo,
      maxAmmo: 40,
      energy,
      maxEnergy: 100,
      shotFuel: towerId === "warrior-1" ? "ammo" : "energy",
      performance: 0.5,
      damageDealt: damage,
      currentDps: 96.4 + (tick % 5),
      status: temperature > 50 ? `Isı freni %${Math.round((100 - temperature) * 2)}` : undefined,
      insight: towerId === "warrior-1" && temperature > 60 ? "Soğuyor: ısı kilidine yaklaşıyor." : undefined
    },
    notes: [
      { section: "resources", text: "Isı freni: sıcaklık %50 üstünde atış hızı düşer (çubuktaki çizgi)" },
      ...(towerId === "warrior-5" ? [{ section: "effects" as const, text: "Overdrive: açık (zincir ışını); 10. seviyede sola ve sağa süpüren iki ışın" }] : [])
    ],
    progress: { maxed: false, upgradeXp: 46, upgradeGold: 30, poolXp: 52.5, poolGold: 210, refund: readOnly ? undefined : { amount: 84, undoable: false } }
  };
  return {
    visible: true,
    selectedPlacedTowerId: "t1",
    selectedTowerId: "t1",
    towerSheet: sheet,
    upgrade: { label: "Geliştir 46 XP + 30g", enabled: !readOnly },
    sell: { label: readOnly ? "Sat" : "Sat 84g", enabled: !readOnly },
    repair: { label: "Onar 12g", enabled: !readOnly },
    performance: operational ? { percent: 50, canEdit: !readOnly } : undefined,
    targeting: { current: block.tm ?? "first", modes: towerId === "warrior-5" ? ["marked", "first", "strongest"] : ["first", "strongest", "weakest", "closest"] },
    ammoLogistics: { enabled: true, canEdit: !readOnly },
    logisticsPriority: { value: "normal", canEdit: !readOnly },
    standby: { active: false, waking: false, canEdit: !readOnly },
    equippedItems: (block.it ?? []).map((id) => ({ id, name: id, description: "" })),
    equippedCapacity: MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
    towerCards: { targetedCardIds: block.tc ?? [], ownerCardIds: towerId === "warrior-1" ? ["nisan-takimi", "tork-aktarimi"] : ["nisan-takimi"] },
    inventory: { open: false, items: [] },
    skills: []
  };
}

function emit() {
  game.events.emit("game:controls-state", stateFor());
}

emit();
// Canli sayilar: sicaklik ve muhimmat oynuyor, panel yeniden kurulmadan yazmali.
window.setInterval(() => {
  tick += 1;
  temperature = 30 + Math.round(35 * (0.5 + 0.5 * Math.sin(tick / 4)));
  ammo = Math.max(0, 40 - (tick * 3) % 41);
  energy = 50 + Math.round(40 * Math.cos(tick / 6));
  damage += 48;
  emit();
}, 500);
(window as unknown as { __rebuilds: () => number }).__rebuilds = () => document.querySelectorAll(".tower-sheet").length;
