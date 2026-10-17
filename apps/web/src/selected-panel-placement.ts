/**
 * Secili kulenin haritadaki kaynak panelinin (mühimmat, enerji, isi,
 * performans cubuklari ve satis tusu) yeri.
 *
 * Panel hicbir zaman DOM'daki kule paneliyle (`tower-sheet`) ust uste
 * binmemeli. Kule paneli uste ya da alta yaslaniyor, genisleyince ekranin
 * dortte ucune cikiyor; eskiden yalnizca panelin kenari kuleye gore
 * seciliyordu ve genis panel, kisa ekran ya da ekranin ortasindaki kule
 * yine ortusuyordu.
 *
 * Hesap saf ve tek koordinat sisteminde (dunya birimi): sahne kule panelinin
 * ekrandaki gercek dikdortgenini dunyaya cevirip `blockers` olarak veriyor.
 * Sira: once onceki taraf (titremesin), sonra kulenin alti, ustu, sagi,
 * solu. Hicbiri sigmiyorsa panel gizleniyor; ayni sayilar kule panelinin
 * Kaynak bolumunde ve satis tusu panelin alt seridinde zaten var.
 */

export type PlacementRect = { left: number; top: number; right: number; bottom: number };

export type PlacementSide = "below" | "above" | "right" | "left";

export type SelectedPanelPlacementInput = {
  /** Kulenin govdesi, can cubugu dahil. */
  tower: PlacementRect;
  /** Panelin ve (varsa) satis tusunun tek blok olarak boyu. */
  width: number;
  height: number;
  /** Panelin cizilebilecegi alan: haritanin ve gorunen bandin (ust cubuk ile alt bar arasi) kesisimi. */
  area: PlacementRect;
  /** Ortulmemesi gereken dikdortgenler (kule paneli). */
  blockers: readonly PlacementRect[];
  /** Kule ile panel arasindaki bosluk ve kenar payi. */
  gap?: number;
  margin?: number;
  /** Onceki karede secilen taraf: hala sigiyorsa degismiyor. */
  previous?: PlacementSide;
};

export type SelectedPanelPlacement =
  | { side: PlacementSide; left: number; top: number; width: number; height: number }
  | { side: "hidden" };

const ORDER: readonly PlacementSide[] = ["below", "above", "right", "left"];

export function rectsOverlap(a: PlacementRect, b: PlacementRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function clamp(value: number, min: number, max: number) {
  return max < min ? min : Math.max(min, Math.min(max, value));
}

/**
 * Bir taraftaki adaylar. Kule ekseninde kulenin hemen yaninda; obur eksende
 * once kuleye ortali (alana sikistirilmis), sonra her engelin kenarina
 * yaslanmis konumlar, kuleye yakindan uzaga. Yan tarafta panel boylece kule
 * paneli ile ust cubuk arasindaki serbest banda kayabiliyor.
 */
function candidates(side: PlacementSide, input: SelectedPanelPlacementInput, gap: number, margin: number): PlacementRect[] {
  const { tower, width, height, area, blockers } = input;
  const horizontal = side === "below" || side === "above";
  const size = horizontal ? width : height;
  const low = (horizontal ? area.left : area.top) + margin;
  const high = (horizontal ? area.right : area.bottom) - margin - size;
  const center = horizontal ? (tower.left + tower.right) / 2 - width / 2 : (tower.top + tower.bottom) / 2 - height / 2;
  const offsets = [center];
  for (const blocker of blockers) {
    if (horizontal) offsets.push(blocker.right + margin, blocker.left - margin - width);
    else offsets.push(blocker.bottom + margin, blocker.top - margin - height);
  }
  const unique = [...new Set(offsets.map((offset) => clamp(offset, low, high)))]
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return unique.map((offset) => {
    if (side === "below") return { left: offset, top: tower.bottom + gap, right: offset + width, bottom: tower.bottom + gap + height };
    if (side === "above") return { left: offset, top: tower.top - gap - height, right: offset + width, bottom: tower.top - gap };
    if (side === "right") return { left: tower.right + gap, top: offset, right: tower.right + gap + width, bottom: offset + height };
    return { left: tower.left - gap - width, top: offset, right: tower.left - gap, bottom: offset + height };
  });
}

function fits(rect: PlacementRect, input: SelectedPanelPlacementInput, margin: number) {
  const { area } = input;
  if (rect.left < area.left + margin - 0.01 || rect.right > area.right - margin + 0.01) return false;
  if (rect.top < area.top + margin - 0.01 || rect.bottom > area.bottom - margin + 0.01) return false;
  if (rectsOverlap(rect, input.tower)) return false;
  // Kule panelinden de kenar payi kadar uzak: iki panel birbirine yapismasin.
  const padded = (blocker: PlacementRect) => ({ left: blocker.left - margin, top: blocker.top - margin, right: blocker.right + margin, bottom: blocker.bottom + margin });
  return input.blockers.every((blocker) => !rectsOverlap(rect, padded(blocker)));
}

export function placeSelectedPanel(input: SelectedPanelPlacementInput): SelectedPanelPlacement {
  const gap = input.gap ?? 6;
  const margin = input.margin ?? 4;
  if (!(input.width > 0) || !(input.height > 0)) return { side: "hidden" };
  const order = input.previous ? [input.previous, ...ORDER.filter((side) => side !== input.previous)] : ORDER;
  for (const side of order) {
    // Panel kuleye bitisik kalsin: kayarken kulenin ortasini birakmiyor.
    const centerX = (input.tower.left + input.tower.right) / 2;
    const centerY = (input.tower.top + input.tower.bottom) / 2;
    const attached = (entry: PlacementRect) => side === "below" || side === "above"
      ? entry.left <= centerX && centerX <= entry.right
      : entry.top <= centerY && centerY <= entry.bottom;
    const rect = candidates(side, input, gap, margin).find((entry) => attached(entry) && fits(entry, input, margin));
    if (rect) return { side, left: rect.left, top: rect.top, width: input.width, height: input.height };
  }
  return { side: "hidden" };
}

/**
 * Ekran oranlarindaki bir dikdortgeni (0..1, tuvale gore) dunyaya cevirir.
 * Ana kameranin bakis alani tuvalin tamami.
 */
export function screenRatioRectToWorld(rect: PlacementRect, view: { x: number; y: number; width: number; height: number }): PlacementRect {
  return {
    left: view.x + rect.left * view.width,
    right: view.x + rect.right * view.width,
    top: view.y + rect.top * view.height,
    bottom: view.y + rect.bottom * view.height
  };
}
