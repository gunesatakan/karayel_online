/**
 * Isci gelisim agacinin kaydirmasi.
 *
 * Agac (~1216 px) telefondaki pencereden (~350 px) cok genis; oyuncu onu
 * parmakla surukleyerek geziyor. Uc hata yuzunden mobilde kullanilamiyordu:
 *
 * - Kaydirma, cekmeceyi kuran fonksiyonun yerel degiskenindeydi. Panel
 *   parmak basiliyken yeniden kurulmuyor (dokunusu yutmasin), ama parmak
 *   kalkar kalkmaz bekleyen kurulum calisiyor ve agac yeniden sifirdan,
 *   baslangic noktasinda kuruluyordu. Kaydirma artik kurulumdan sagkaliyor.
 * - Agac CSS'te `translateX(-50%)` ile ortalaniyor; surukleme `transform`u
 *   ezip ortalamayi siliyordu, ilk dokunusta agac yarim genislik ziplyordu.
 * - Surukleme bir dugmenin ustunde baslayamiyordu; agac neredeyse tamamen
 *   dugme oldugu icin telefonda tutacak yer kalmiyordu. Artik her yerden
 *   basliyor; esigi asan hareket dugmeye dokunus sayilmiyor.
 */

export type TreePan = { x: number; y: number };

export type TreePanBounds = {
  treeWidth: number;
  treeHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

/** Bundan kisa hareket dokunus: dugmeye basmak parmagin titremesiyle kaymasin. */
export const TREE_DRAG_THRESHOLD_PX = 6;

/** Agacin pencerenin ustunden payi (`.worker-development__tree { top }`). */
export const TREE_TOP_PX = 18;

/** Kenarlar pencerenin kenarina kadar gelebiliyor, bir parca da oteye. */
const TREE_PAN_SLACK_PX = 24;

export function exceedsTreeDragThreshold(dx: number, dy: number) {
  return dx * dx + dy * dy > TREE_DRAG_THRESHOLD_PX * TREE_DRAG_THRESHOLD_PX;
}

/**
 * Agac pencereden kaybolmasin: her kenari en fazla pencerenin kenarina (ve
 * kucuk bir paya) kadar cekilebiliyor. Agac ortadan asili, o yuzden yatay
 * sinir simetrik; dikeyde ust kenar yerinde, asagisi agacin boyu kadar.
 */
export function clampTreePan(pan: TreePan, bounds: TreePanBounds): TreePan {
  const spanX = Math.max(0, (bounds.treeWidth - bounds.viewportWidth) / 2) + TREE_PAN_SLACK_PX;
  const minY = Math.min(0, bounds.viewportHeight - TREE_TOP_PX - bounds.treeHeight) - TREE_PAN_SLACK_PX;
  return {
    x: Math.min(spanX, Math.max(-spanX, pan.x)),
    y: Math.min(TREE_PAN_SLACK_PX, Math.max(minY, pan.y))
  };
}

/** CSS'teki ortalamayi (`-50%`) koruyan transform. */
export function formatTreePanTransform(pan: TreePan) {
  return `translate(calc(-50% + ${Math.round(pan.x)}px), ${Math.round(pan.y)}px)`;
}
