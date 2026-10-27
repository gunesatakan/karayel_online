/**
 * 3D vitrinleri HTML'e baglar; three.js icermiyor (2D kodundan statik
 * import edilebilir).
 *
 * `data-showcase="operator:<kimlik>"` ozniteligi olan ogede 3D model: ogenin
 * icindeki 2D resim hemen gorunuyor, model inip ilk karesi cizilince oge
 * `is-3d` sinifini aliyor (CSS 2D resmi sondurup tuvali aciyor). Desteklenmiyorsa
 * (itch paketi 3D'yi derlemede kapatiyor, WebGL2 yok, modeli olmayan) hicbir
 * sey yapmiyor: 2D kaliyor.
 *
 * three.js ve model ilk vitrinle, tarayici bostayken iniyor
 * (`requestIdleCallback`): menu once 2D haliyle aciliyor, oyunun 2D baslangici
 * hicbir 3D dosyasi indirmiyor.
 */
import { supportsTowers3d } from "./render3d/renderer-mode";
import { OPERATOR_MODEL_PATHS, OPERATOR_MODEL_YAW_OFFSET } from "./render3d/tower-math";
import { assetUrl } from "./asset-url";
import type { ShowcaseHandle, ShowcaseSpec } from "./render3d/showcase";

/** Operatorun 3D vitrini gosterilebilir mi (modeli var, cihaz ve derleme destekliyor). */
export function canShowcaseOperator(characterId: string) {
  return Boolean(OPERATOR_MODEL_PATHS[characterId]) && supportsTowers3d();
}

/** `data-showcase` degeri: "operator:<kimlik>". */
export function operatorShowcaseKey(characterId: string) {
  return `operator:${characterId}`;
}

/** "#rrggbb" -> sayi; okunamazsa notr gri. */
export function parseAccent(color: string | undefined) {
  const match = /^#?([0-9a-f]{6})$/i.exec((color ?? "").trim());
  return match ? Number.parseInt(match[1], 16) : 0x94a3b8;
}

/** Ozniteligin vitrini: modelin adresi ve yonu; bilinmeyen deger icin yok. */
export function showcaseSpecFor(key: string, accent: string | undefined): Omit<ShowcaseSpec, "onReady" | "onFail"> | undefined {
  const [kind, id] = key.split(":");
  if (kind === "operator" && id && OPERATOR_MODEL_PATHS[id]) {
    // Suzulen komutan; yuzu +X'te, vitrinde kameraya donuk.
    return { url: assetUrl(OPERATOR_MODEL_PATHS[id]), accent: parseAccent(accent), yawOffset: OPERATOR_MODEL_YAW_OFFSET, float: true };
  }
  return undefined;
}

type ShowcaseModule = typeof import("./render3d/showcase");
let showcaseModule: Promise<ShowcaseModule> | undefined;
const mounted = new Map<HTMLElement, ShowcaseHandle | undefined>();

function whenIdle() {
  return new Promise<void>((resolve) => {
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => resolve(), { timeout: 1200 });
    else window.setTimeout(resolve, 200);
  });
}

/**
 * `root` altindaki vitrinleri baglar (HTML her yeniden yazildiginda cagrilir;
 * sayfadan cikan ogelerin vitrini kalkiyor, ayni ogeye ikinci kez baglanmiyor).
 */
export function mountShowcases(root: ParentNode) {
  for (const [host, handle] of mounted) {
    if (host.isConnected) continue;
    handle?.dispose();
    mounted.delete(host);
  }
  if (!supportsTowers3d()) return;
  const hosts = root.querySelectorAll<HTMLElement>("[data-showcase]");
  for (const host of hosts) {
    if (mounted.has(host)) continue;
    const spec = showcaseSpecFor(host.dataset.showcase ?? "", getComputedStyle(host).getPropertyValue("--accent"));
    if (!spec) continue;
    mounted.set(host, undefined);
    showcaseModule ??= whenIdle().then(() => import("./render3d/showcase"));
    showcaseModule.then((module) => {
      if (!host.isConnected || !mounted.has(host)) return;
      mounted.set(host, module.mountShowcase(host, {
        ...spec,
        onReady: () => host.classList.add("is-3d"),
        onFail: () => host.classList.remove("is-3d")
      }));
    }).catch(() => {
      // Modul inmedi (cevrimdisi): 2D kaliyor, bir dahaki cizimde yeniden denensin.
      showcaseModule = undefined;
      mounted.delete(host);
    });
  }
}
