import type Phaser from "phaser";
import {
  getPlacementPreviewRange,
  type EditableMapData,
  type PlacementPreviewRange,
  type SynergyStructure,
  type TowerDefinition
} from "@karayel/shared";

/**
 * Yerlestirme hayaletinin menzil halkasi.
 *
 * Cekmeceden suruklenen kule, kurulursa nereye yetisecegini ancak
 * kurulduktan sonra secip menzilini acarak gosterebiliyordu. Halka artik
 * surukleme sirasinda hayaletin cevresinde: kulenin o karede sahip olacagi
 * menzil (`getPlacementPreviewRange`, paylasilan paket), olu bolgesi ve
 * AttackLord kulesinde yalnizlik durumu.
 *
 * Dil secili kulenin menzil cemberiyle ayni: ince, keskin kenarli bir cizgi,
 * dolgu neredeyse yok, parilti yok. Gecersiz karede halka soluk kirmizi.
 *
 * Maliyet: yalnizca hayaletin karesi (ya da saha) degisince yeniden ciziliyor;
 * parmak ayni karede kipirdadikca hicbir sey yapilmiyor.
 */

export type PlacementRangeArgs = {
  definition: TowerDefinition;
  characterId: string;
  x: number;
  y: number;
  canPlace: boolean;
  map: EditableMapData;
  /** Sahadaki yapilar; dizi kimligi saha degisimini soyluyor (SynergyMarks). */
  structures: readonly SynergyStructure[];
};

/** Secili kulenin menzil cemberinden (2) bir tik ince: hayaletle yarismasin. */
export const PLACEMENT_RANGE_LINE_WIDTH = 1.5;
const RANGE_FILL_ALPHA = 0.05;
const RANGE_STROKE_ALPHA = 0.78;
/** Aura ya da hizmet cemberi: vurus menzili degil, bir tik daha sonuk. */
const AURA_STROKE_ALPHA = 0.55;
const INVALID_COLOR = 0xf87171;
const INVALID_STROKE_ALPHA = 0.42;
/** Olu bolge: secili kulenin `deadZone` cemberiyle ayni turuncu. */
const DEAD_ZONE_COLOR = 0xf97316;
const DEAD_ZONE_ALPHA = 0.8;
/** Yalnizlik rengi: SynergyMarks'in turkuazi. */
const ISOLATION_COLOR = 0x7fe5e8;
const ISOLATION_BASE_ALPHA = 0.4;
const ISOLATION_MARK_SIZE = 3.2;
const MARK_STROKE = 0x0f172a;

/**
 * Halkayi cizer. Saf: yalnizca verilen Graphics'e cagri yapar (testte kayitci).
 *
 * Yalniz karede halka buyuk yaricapta, yalnizliksiz yaricap ince turkuaz bir
 * cizgiyle iceride kaliyor ve halkanin sag ust kosesinde turkuaz bir elmas:
 * oyuncu kazanci yaricap farki olarak goruyor. Yalniz degilse yalnizca normal
 * halka -- komsu kuleler zaten sinerji onizlemesinde sari halkayla isaretli.
 */
export function drawPlacementRange(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  range: PlacementPreviewRange,
  options: { color: number; canPlace: boolean }
) {
  if (range.kind === "none" || !(range.radius > 0)) {
    return false;
  }
  if (!options.canPlace) {
    g.lineStyle(PLACEMENT_RANGE_LINE_WIDTH, INVALID_COLOR, INVALID_STROKE_ALPHA);
    g.strokeCircle(x, y, range.radius);
    return true;
  }

  g.fillStyle(options.color, RANGE_FILL_ALPHA);
  g.fillCircle(x, y, range.radius);
  g.lineStyle(PLACEMENT_RANGE_LINE_WIDTH, options.color, range.kind === "aura" ? AURA_STROKE_ALPHA : RANGE_STROKE_ALPHA);
  g.strokeCircle(x, y, range.radius);
  if (range.minimumRadius > 0) {
    g.lineStyle(PLACEMENT_RANGE_LINE_WIDTH, DEAD_ZONE_COLOR, DEAD_ZONE_ALPHA);
    g.strokeCircle(x, y, range.minimumRadius);
  }

  if (range.isolated && range.baseRadius > 0 && range.baseRadius < range.radius) {
    g.lineStyle(1, ISOLATION_COLOR, ISOLATION_BASE_ALPHA);
    g.strokeCircle(x, y, range.baseRadius);
    // Elmas 45 derecede, halkanin uzerinde.
    const offset = range.radius * Math.SQRT1_2;
    drawDiamond(g, x + offset, y - offset, ISOLATION_MARK_SIZE);
  }
  return true;
}

function drawDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number) {
  const outer = size + 1.2;
  g.fillStyle(MARK_STROKE, 0.85);
  g.fillPoints([{ x, y: y - outer }, { x: x + outer, y }, { x, y: y + outer }, { x: x - outer, y }], true);
  g.fillStyle(ISOLATION_COLOR, 1);
  g.fillPoints([{ x, y: y - size }, { x: x + size, y }, { x, y: y + size }, { x: x - size, y }], true);
}

export class PlacementRangePreview {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private key = "";
  private structures?: readonly SynergyStructure[];
  private last?: PlacementRangeArgs;
  /** Son cizilen halka; testler ve hata ayiklama icin. */
  current?: PlacementPreviewRange;

  constructor(scene: Phaser.Scene, depth: number) {
    this.graphics = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  /**
   * Hayalet yeni bir kareye gectiyse ya da saha degistiyse yeniden cizer.
   * Cizdiyse true; ayni kare ve ayni sahada hicbir sey yapmaz.
   */
  update(args: PlacementRangeArgs) {
    this.last = args;
    const key = `${args.definition.id}|${args.characterId}|${args.x}|${args.y}|${args.canPlace}`;
    if (key === this.key && args.structures === this.structures) {
      return false;
    }
    this.key = key;
    this.structures = args.structures;
    const range = getPlacementPreviewRange({
      definition: args.definition,
      characterId: args.characterId,
      x: args.x,
      y: args.y,
      structures: args.structures,
      map: args.map
    });
    this.current = range;
    const g = this.graphics.clear();
    const drawn = drawPlacementRange(g, args.x, args.y, range, { color: args.definition.color, canPlace: args.canPlace });
    g.setVisible(drawn);
    return true;
  }

  /** Saha degisti (kule kuruldu, satildi): suren surukleme parmak kipirdamasa da tazelensin. */
  refresh(structures: readonly SynergyStructure[]) {
    if (this.last) this.update({ ...this.last, structures });
  }

  clear() {
    this.key = "";
    this.structures = undefined;
    this.last = undefined;
    this.current = undefined;
    this.graphics.clear().setVisible(false);
  }

  destroy() {
    this.graphics.destroy();
  }
}
