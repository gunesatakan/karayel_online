import type Phaser from "phaser";
import {
  computeSynergyState,
  describeSynergyPreview,
  diffSynergyStates,
  findIsolationBlockers,
  getMapGridSize,
  getSynergyStampText,
  getTowerGridSpan,
  previewSynergyPlacement,
  towerCatalog,
  type EditableMapData,
  type SynergyChange,
  type SynergyState,
  type SynergyStructure,
  type TowerDefinition,
  type TowerSnapshot
} from "@karayel/shared";

/**
 * Yerlesim sinerjilerinin sahadaki izi: onizleme, kalici isaret ve damga verisi.
 *
 * Atakan'in yalnizligi ve Zeynep'in dizilimi kulenin **nereye** kuruldugunu
 * oduller, ama oyuncu bunu ancak panelde bir satirdan okuyabiliyordu: kurmadan
 * once "bu kare yalnizligi bozar mi" diye sormanin yolu yoktu, kurduktan sonra
 * da bir seyin kurulup bozuldugunu soyleyen bir an yoktu. Kural paylasilan
 * pakette (`synergy`); burasi onu yalnizca cagiriyor, kopyalamiyor.
 *
 * Maliyet: saha fotografi yalnizca kulelerin kimligi, konumu ya da seviyesi
 * degisince yeniden cekiliyor (anlik goruntu 60 ms'de bir gelse de). Onizleme
 * yalnizca surukleme baska bir kareye gecince hesaplaniyor; kalici isaretler
 * statik bir Graphics'e bir kez ciziliyor, karede hicbir sey yeniden cizilmiyor.
 */

export type SceneSynergyStructure = SynergyStructure & { ownerId: string; ownerName: string; name: string };

/** Damga, bildirim ve yonetmen icin hazir olay. */
export type SynergyAnnouncement = {
  kind: SynergyChange<SceneSynergyStructure>["kind"];
  text: string;
  /** Yerel oyuncunun kulesi (ya da dizilimde bir kulesi) etkilendiyse. */
  own: boolean;
  x: number;
  y: number;
  /** Damganin dayandigi kule; etiket anahtari ve disk boyu icin. */
  anchorId: string;
  /** Senin sinerjini bozan takim arkadasinin adi; yoksa undefined. */
  culprit?: string;
};

export type SynergyPreviewArgs = {
  definition: TowerDefinition;
  characterId: string;
  x: number;
  y: number;
  canPlace: boolean;
  localSessionId: string;
  map: EditableMapData;
  cellSize: number;
  bounds: { left: number; right: number; top: number; bottom: number };
};

const DEFINITIONS_BY_ID = new Map<string, TowerDefinition>(
  Object.values(towerCatalog).flat().map((definition) => [definition.id, definition])
);

/** Onizleme adayinin kimligi; anlik goruntudeki hicbir kimlikle karismaz. */
const PREVIEW_ID = "__synergy-preview__";

/** Yazi doku boyu; dunyadaki boyut olcekle (bkz. world-labels.ts). */
const BASE_FONT_PX = 30;
/** Onizleme yazisi dunyada bu boyda; seviye etiketiyle (12) ayni okunurluk. */
const PREVIEW_FONT_PX = 11;
const PREVIEW_GAP_PX = 3;
const PREVIEW_STROKE = "#0f172a";
const PREVIEW_GAIN_FILL = "#86efac";
const PREVIEW_BLOCKED_FILL = "#fcd34d";
const PREVIEW_WARNING_FILL = "#fca5a5";

/** Yalnizlik rengi: Izolasyon Kulesi'nin turkuazi (atakan-signatures profil tabani). */
const ISOLATION_COLOR = 0x7fe5e8;
/** Dizilim rengi: Zeynep sentez isininin pembesi; sunucu baginin sarisiyla karismasin. */
const FORMATION_COLOR = 0xf9a8d4;
const BLOCKER_COLOR = 0xfcd34d;
const BREAK_COLOR = 0xf87171;
const GLYPH_STROKE = 0x0f172a;
/** Takim arkadasinin isareti gorunsun ama seninkiyle yarismasin. */
const TEAMMATE_GLYPH_ALPHA = 0.45;
/** Tek yapisal degisimin en fazla damgasi; satisla ayni anda bes sey bozulsa da ekran bogulmasin. */
const MAX_ANNOUNCEMENTS = 3;

export class SynergyMarks {
  private readonly glyphs: Phaser.GameObjects.Graphics;
  private readonly previewGraphics: Phaser.GameObjects.Graphics;
  private readonly headline: Phaser.GameObjects.Text;
  private readonly warning: Phaser.GameObjects.Text;
  private structureKey = "";
  private structures: SceneSynergyStructure[] = [];
  private byId = new Map<string, SceneSynergyStructure>();
  private state?: SynergyState<SceneSynergyStructure>;
  private previewKey = "";
  private lastPreview?: SynergyPreviewArgs;

  constructor(scene: Phaser.Scene, depths: { glyph: number; preview: number }) {
    this.glyphs = scene.add.graphics().setDepth(depths.glyph);
    this.previewGraphics = scene.add.graphics().setDepth(depths.preview).setVisible(false);
    const style = {
      fontFamily: "Arial",
      fontSize: `${BASE_FONT_PX}px`,
      fontStyle: "bold",
      color: PREVIEW_GAIN_FILL,
      stroke: PREVIEW_STROKE,
      strokeThickness: 6
    };
    const scale = PREVIEW_FONT_PX / BASE_FONT_PX;
    this.headline = scene.add.text(0, 0, "", style).setScale(scale).setDepth(depths.preview + 0.1).setVisible(false);
    this.warning = scene.add.text(0, 0, "", { ...style, color: PREVIEW_WARNING_FILL })
      .setScale(scale).setDepth(depths.preview + 0.1).setVisible(false);
  }

  /**
   * Anlik goruntuyle esitler; yapisal bir degisim varsa olaylari dondurur.
   *
   * `announce` false ise (ilk goruntu, yeniden baglanma) fotograf cekilir ama
   * olay uretilmez: oyuna katilan oyuncunun ekraninda butun yalnizliklar
   * birden "kuruldu" demesin.
   */
  sync(
    towers: readonly TowerSnapshot[],
    map: EditableMapData,
    localSessionId: string,
    cellSize: number,
    announce: boolean
  ): SynergyAnnouncement[] {
    let key = "";
    for (const tower of towers) {
      key += `${tower.id}:${tower.x}:${tower.y}:${tower.level}:${tower.definitionId}|`;
    }
    if (key === this.structureKey) {
      return [];
    }
    this.structureKey = key;

    const previousById = this.byId;
    const previousState = this.state;
    const structures = towers.map(toSynergyStructure);
    const byId = new Map(structures.map((structure) => [structure.id, structure]));
    const state = computeSynergyState(structures, map, getMapGridSize(map));
    this.structures = structures;
    this.byId = byId;
    this.state = state;
    this.drawGlyphs(localSessionId, cellSize);

    // Saha degisti: suren surukleme parmak kipirdamasa da guncellensin.
    this.previewKey = "";
    if (this.lastPreview) {
      this.preview(this.lastPreview);
    }

    if (!announce || !previousState) {
      return [];
    }
    const changes = diffSynergyStates(previousState, state, byId);
    if (changes.length === 0) {
      return [];
    }
    const added = structures.filter((structure) => !previousById.has(structure.id));
    const removed = [...previousById.values()].filter((structure) => !byId.has(structure.id));
    const announcements = changes.map((change) => this.toAnnouncement(change, added, removed, localSessionId, map, cellSize));
    // Kendi olaylarin once; tek degisimde en fazla birkac damga.
    announcements.sort((a, b) => Number(b.own) - Number(a.own));
    return announcements.slice(0, MAX_ANNOUNCEMENTS);
  }

  /**
   * Surukleme onizlemesi; yalnizca kare (ya da saha) degisince hesaplanir.
   */
  preview(args: SynergyPreviewArgs) {
    this.lastPreview = args;
    const key = `${args.definition.id}|${args.x}|${args.y}|${args.canPlace}`;
    if (key === this.previewKey) {
      return;
    }
    this.previewKey = key;
    this.previewGraphics.clear();

    if (!args.canPlace || !this.state) {
      this.hidePreview();
      return;
    }
    const candidate: SceneSynergyStructure = {
      id: PREVIEW_ID,
      x: args.x,
      y: args.y,
      level: 1,
      characterId: args.characterId,
      definition: args.definition,
      ownerId: args.localSessionId,
      ownerName: "",
      name: args.definition.name
    };
    const result = previewSynergyPlacement(candidate, this.structures, args.map, getMapGridSize(args.map), this.state);
    const text = describeSynergyPreview(result, (structure) => structure.name);
    if (!text.headline && !text.warning) {
      this.hidePreview();
      return;
    }

    const g = this.previewGraphics.setVisible(true);
    const radius = (structure: SceneSynergyStructure) => args.cellSize * getTowerGridSpan(structure.definition.id) * 0.56;
    for (const blocker of result.isolationBlockers) {
      g.lineStyle(2, BLOCKER_COLOR, 0.95);
      g.strokeCircle(blocker.x, blocker.y, radius(blocker));
    }
    if (result.formation) {
      // Kurulacak baglar: aday ile her uye arasinda ince bir cizgi ve uyelerin halkasi.
      g.lineStyle(2, FORMATION_COLOR, 0.9);
      for (const member of result.formation.members) {
        if (member.id === PREVIEW_ID) continue;
        g.lineBetween(args.x, args.y, member.x, member.y);
        g.strokeCircle(member.x, member.y, radius(member));
      }
    }
    for (const broken of [...result.breaksIsolation, ...result.breaksFormation]) {
      g.lineStyle(2.5, BREAK_COLOR, 0.95);
      g.strokeCircle(broken.x, broken.y, radius(broken));
    }

    this.layoutPreviewText(text, args);
  }

  clearPreview() {
    this.lastPreview = undefined;
    this.previewKey = "";
    this.previewGraphics.clear().setVisible(false);
    this.hidePreview();
  }

  /** Yeni oda ya da harita: eski fotograf yeni sahada olay uretmesin. */
  reset() {
    this.structureKey = "";
    this.structures = [];
    this.byId = new Map();
    this.state = undefined;
    this.glyphs.clear();
    this.clearPreview();
  }

  destroy() {
    this.glyphs.destroy();
    this.previewGraphics.destroy();
    this.headline.destroy();
    this.warning.destroy();
  }

  private hidePreview() {
    this.headline.setVisible(false);
    this.warning.setVisible(false);
  }

  /**
   * Yazilar hayaletin ustunde, birakilacak kareyi ortmeden.
   *
   * Parmak hayaletin altinda (surukleme noktasi kareyi parmagin ustune
   * kaldiriyor), yani yazinin yeri ust. Ust kenara sigmazsa hayaletin yanina,
   * haritanin genis tarafina geciyor; arena disina tasmasin diye yatayda da
   * sinirlaniyor.
   */
  private layoutPreviewText(text: ReturnType<typeof describeSynergyPreview>, args: SynergyPreviewArgs) {
    const lines: Phaser.GameObjects.Text[] = [];
    if (text.headline) {
      this.headline.setColor(text.headline.tone === "gain" ? PREVIEW_GAIN_FILL : PREVIEW_BLOCKED_FILL);
      this.headline.setText(text.headline.text).setVisible(true);
      lines.push(this.headline);
    } else {
      this.headline.setVisible(false);
    }
    if (text.warning) {
      this.warning.setText(text.warning).setVisible(true);
      lines.push(this.warning);
    } else {
      this.warning.setVisible(false);
    }

    // 2x2 kulenin hayaleti dort kare kapliyor; yazi onun da ustunde kalsin.
    const half = (args.cellSize * getTowerGridSpan(args.definition.id)) / 2;
    const heights = lines.map((line) => line.displayHeight);
    const widths = lines.map((line) => line.displayWidth);
    const totalHeight = heights.reduce((sum, height) => sum + height, 0);
    const maxWidth = Math.max(...widths);
    const top = args.y - half - PREVIEW_GAP_PX - totalHeight;
    if (top >= args.bounds.top) {
      const centerX = Math.max(args.bounds.left + maxWidth / 2, Math.min(args.bounds.right - maxWidth / 2, args.x));
      let y = top;
      for (const line of lines) {
        line.setOrigin(0.5, 0).setPosition(centerX, y);
        y += line.displayHeight;
      }
      return;
    }
    const rightSide = args.x <= (args.bounds.left + args.bounds.right) / 2;
    const x = rightSide ? args.x + half + PREVIEW_GAP_PX : args.x - half - PREVIEW_GAP_PX;
    let y = Math.max(args.bounds.top, args.y - totalHeight / 2);
    for (const line of lines) {
      line.setOrigin(rightSide ? 0 : 1, 0).setPosition(x, y);
      y += line.displayHeight;
    }
  }

  /**
   * Kalici isaretler: yalniz kulenin kosesinde turkuaz bir elmas, dizilimin
   * her bagi icin iki kulenin sinirinda pembe bir elmas.
   *
   * Cizgi yerine sinirda isaret: bitisik iki kulenin diskleri birbirine
   * degiyor, merkezden merkeze cizgi tamamen sprite'larin altinda kalirdi.
   * Hareket yok; hareket azaltma icin ayrica dal gerekmiyor.
   */
  private drawGlyphs(localSessionId: string, cellSize: number) {
    const g = this.glyphs.clear();
    const state = this.state;
    if (!state) return;
    const size = Math.max(2.5, cellSize * 0.1);
    for (const id of state.isolated) {
      const tower = this.byId.get(id);
      if (!tower) continue;
      const offset = cellSize * getTowerGridSpan(tower.definition.id) * 0.36;
      const alpha = tower.ownerId === localSessionId ? 1 : TEAMMATE_GLYPH_ALPHA;
      drawDiamond(g, tower.x + offset, tower.y - offset, size, ISOLATION_COLOR, alpha);
    }
    const drawn = new Set<unknown>();
    for (const group of state.formations.values()) {
      if (drawn.has(group)) continue;
      drawn.add(group);
      const own = group.members.some((member) => member.ownerId === localSessionId);
      const alpha = own ? 1 : TEAMMATE_GLYPH_ALPHA;
      for (let first = 0; first < group.members.length; first += 1) {
        for (let second = first + 1; second < group.members.length; second += 1) {
          const a = group.members[first];
          const b = group.members[second];
          drawDiamond(g, (a.x + b.x) / 2, (a.y + b.y) / 2, size, FORMATION_COLOR, alpha);
        }
      }
    }
  }

  private toAnnouncement(
    change: SynergyChange<SceneSynergyStructure>,
    added: SceneSynergyStructure[],
    removed: SceneSynergyStructure[],
    localSessionId: string,
    map: EditableMapData,
    cellSize: number
  ): SynergyAnnouncement {
    const text = getSynergyStampText(change.kind);
    if ("structure" in change) {
      const tower = change.structure;
      const own = tower.ownerId === localSessionId;
      let culprit: string | undefined;
      if (own && change.kind === "isolationLost") {
        const cause = findIsolationBlockers(tower, added, map).find((structure) => structure.ownerId !== localSessionId);
        culprit = cause?.ownerName || undefined;
      }
      return { kind: change.kind, text, own, x: tower.x, y: tower.y - cellSize / 2, anchorId: tower.id, culprit };
    }

    const members = change.members;
    const own = members.some((member) => member.ownerId === localSessionId);
    let culprit: string | undefined;
    if (own && change.kind === "formationBroken") {
      // Dizilimi yalnizca Zeynep yapilari degistirebiliyor: eklenen ya da kaldirilan.
      const cause = [...added, ...removed].find((structure) => structure.characterId === "zeynep" && structure.ownerId !== localSessionId);
      culprit = cause?.ownerName || undefined;
    }
    let x = 0;
    let top = Number.POSITIVE_INFINITY;
    for (const member of members) {
      x += member.x;
      top = Math.min(top, member.y);
    }
    return { kind: change.kind, text, own, x: x / members.length, y: top - cellSize / 2, anchorId: members[0].id, culprit };
  }
}

function toSynergyStructure(tower: TowerSnapshot): SceneSynergyStructure {
  // Katalogda olmayan bir kimlik (eski istemci, yeni kule) kule sayiliyor:
  // kenara oturmayan, duvar olmayan yapi -- sunucunun varsayilani da bu.
  const definition = DEFINITIONS_BY_ID.get(tower.definitionId) ?? { id: tower.definitionId, name: tower.name } as TowerDefinition;
  return {
    id: tower.id,
    x: tower.x,
    y: tower.y,
    level: tower.level,
    characterId: tower.characterId,
    definition,
    ownerId: tower.ownerId,
    ownerName: tower.ownerName,
    name: tower.name || definition.name
  };
}

function drawDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, alpha: number) {
  g.fillStyle(GLYPH_STROKE, 0.85 * alpha);
  g.fillPoints([
    { x, y: y - size - 1.2 },
    { x: x + size + 1.2, y },
    { x, y: y + size + 1.2 },
    { x: x - size - 1.2, y }
  ], true);
  g.fillStyle(color, alpha);
  g.fillPoints([
    { x, y: y - size },
    { x: x + size, y },
    { x, y: y + size },
    { x: x - size, y }
  ], true);
}
