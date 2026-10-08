/**
 * Menunun bos kenarlarindaki kaydirma.
 *
 * Masaustunde menu ortada dar bir sutun (`.menu-stage`, 460 px) ve kaydirilan
 * kutu o sutunun icindeki ekran (`.screen`). Sutunun disindaki genis bos
 * alanda fare tekerlegi ya da touchpad'in iki parmak kaydirmasi hicbir seyi
 * kaydirmiyordu: imlecin altindaki kabuk kaydirilamiyor, kaydirma cubugu da
 * gizli. Oradaki dikey kaydirma etkin ekrana aktariliyor; sutunun icindeki
 * kaydirma tarayicinin kendi kaydirmasi olarak kaliyor.
 */

/** Satir kipindeki tekerlegin bir satiri (piksel); Firefox fare tekerlegi boyle yollar. */
const WHEEL_LINE_PX = 16;

type WheelLike = Pick<WheelEvent, "deltaY" | "deltaMode" | "ctrlKey" | "target">;

/** Sutunun disina dusen dikey kaydirmayi etkin ekrana uygular; uyguladiysa true. */
export function scrollScreenForStrayWheel(host: Pick<HTMLElement, "querySelector">, event: WheelLike) {
  // Ctrl + tekerlek (touchpad'de iki parmakla sikistirma) yakinlastirma: kaydirma degil.
  if (event.ctrlKey || event.deltaY === 0) return false;
  const stage = host.querySelector(".menu-stage");
  if (!stage || stage.contains(event.target as Node | null)) return false;
  const screen = stage.querySelector<HTMLElement>(".screen");
  if (!screen) return false;
  const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? screen.clientHeight : 1;
  screen.scrollTop += event.deltaY * unit;
  return true;
}

/** Menu kabugunun kenarlarindaki kaydirmayi bir kez dinler; kabuk yeniden cizilse de gecerli. */
export function forwardStrayMenuWheel(host: HTMLElement) {
  host.addEventListener("wheel", (event) => {
    scrollScreenForStrayWheel(host, event);
  }, { passive: true });
}
