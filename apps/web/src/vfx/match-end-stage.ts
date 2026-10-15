/**
 * Mac sonu sahnesinin sahnelenmesi: denetleyici (match-end-sequence), cizim
 * (match-end-vfx), ses, sarsinti, kamera ve "Geç" katmani tek yerde. GameScene
 * ve VFX galerisi ayni sinifi kullaniyor; saat disaridan (galeri sanal saatle).
 *
 * "Geç" katmani tam ekran ve seffaf: herhangi bir yere dokunus dogrudan
 * rapora geciyor. Gorunen ipucu kucuk, 44 px, sert bir cip. Esc, Enter ve
 * bosluk da geciyor. Sahne sirasinda govdeye `match-ending` sinifi: HUD
 * kararip dokunusa kapaniyor (style.css).
 */
import Phaser from "phaser";
import { t } from "../i18n";
import {
  MatchEndSequence,
  MatchEndSoundGovernor,
  type MatchEndKind,
  type MatchEndPlan,
  type MatchEndPoint,
  type MatchEndSoundCue,
  type MatchEndStep,
  type MatchEndStructure
} from "../match-end-sequence";
import type { FlashSink } from "./flash-pool";
import type { VfxLod } from "./lod";
import { MatchEndVfx } from "./match-end-vfx";
import { fnvHash } from "./kit";

/** Sahnenin katman derinlikleri: yer izi dusmanlarin altinda, govde kulelerin ustunde. */
export const MATCH_END_DEPTHS = Object.freeze({ ground: 7.38, body: 13.3, glow: 13.32 });
/** Zaferde kamera nexus'a dogru bu kadar (yol orani) ve bu kadar yakinlasiyor. */
export const MATCH_END_CAMERA_EASE = Object.freeze({ toward: 0.3, zoom: 1.06 });
/** Zaferde dusmanlarin cozulmesi: ilk bu kadar ms icinde, birer birer. */
const DISSOLVE_SPREAD_MS = 1200;
const DISSOLVE_FADE_MS = 520;

export type MatchEndStageDeps = {
  flash?: FlashSink;
  lod?: VfxLod;
  reducedMotion: () => boolean;
  /** Kayitli ornegi cal (FeedbackDirector.playSampleCue). */
  playSample?: (cue: MatchEndSoundCue, key: string) => void;
  /** Yonetilen sarsinti (FeedbackDirector.shakeCamera; hareket azaltmada hic). */
  shake?: (px: number, durationMs: number) => void;
  /** "Geç" katmaninin eklenecegi yer; yoksa document.body. */
  overlayParent?: HTMLElement;
};

export type MatchEndEnemy = { id: string; x: number; y: number; size: number };

export type MatchEndPlayInput = {
  kind: MatchEndKind;
  structures: readonly MatchEndStructure[];
  nexus: MatchEndPoint;
  /** Nexus'un capi (dunya birimi). */
  nexusSize: number;
  enemies: readonly MatchEndEnemy[];
  /** Isinin ust ucu (dunya y). */
  skyY: number;
  speak: () => number | undefined;
  openReport: () => void;
  now: number;
  /** Zaferde kamerayi nexus'a dogru kaydir. */
  cameraEase?: boolean;
};

export class MatchEndStage {
  readonly vfx: MatchEndVfx;
  private readonly surfaces: Phaser.GameObjects.Graphics[];
  private sequence?: MatchEndSequence;
  private readonly sounds = new MatchEndSoundGovernor();
  private overlay?: HTMLElement;
  private keyListener?: (event: KeyboardEvent) => void;
  /** Yapi kimligi -> kabuk (patladi) ya da sonuk (gucunu devretti). */
  private readonly states = new Map<string, "husk" | "dim">();
  private readonly dissolveAt = new Map<string, number>();
  private now = 0;
  private camera?: { scrollX: number; scrollY: number; zoom: number };

  constructor(private readonly scene: Phaser.Scene, private readonly deps: MatchEndStageDeps) {
    const ground = scene.add.graphics().setDepth(MATCH_END_DEPTHS.ground);
    const body = scene.add.graphics().setDepth(MATCH_END_DEPTHS.body);
    const glow = scene.add.graphics().setDepth(MATCH_END_DEPTHS.glow).setBlendMode(Phaser.BlendModes.ADD);
    this.surfaces = [ground, body, glow];
    this.vfx = new MatchEndVfx(ground, body, glow, { flash: deps.flash, lod: deps.lod, reducedMotion: deps.reducedMotion });
  }

  get active() {
    return Boolean(this.sequence && !this.sequence.done);
  }

  get current() {
    return this.sequence;
  }

  /** Yapinin sahnedeki hali: patladiysa "husk", gucunu devrettiyse "dim". */
  structureState(id: string) {
    return this.states.get(id);
  }

  /** Dusmanin gorunurluk carpani (zaferde cozuluyor; yenilgide 1). */
  enemyAlpha(id: string) {
    const at = this.dissolveAt.get(id);
    if (at === undefined) return 1;
    return Math.max(0, Math.min(1, 1 - (this.now - at) / DISSOLVE_FADE_MS));
  }

  play(input: MatchEndPlayInput) {
    if (this.sequence) return this.sequence;
    this.now = input.now;
    const sequence = new MatchEndSequence(input.kind, input.structures, input.nexus, {
      speak: input.speak,
      begin: (plan) => this.begin(plan, input),
      step: (step, plan) => this.step(step, plan, input),
      end: () => this.end(),
      openReport: input.openReport
    });
    this.sequence = sequence;
    sequence.start(input.now);
    return sequence;
  }

  /** Karede: adimlar ve cizim. */
  update(now: number) {
    this.now = now;
    this.sequence?.tick(now);
    this.vfx.render(now);
  }

  skip() {
    this.sequence?.skip();
  }

  /** Galeri tekrar oynatiyor ya da sahne kapaniyor: her sey temiz. Rapor acilmamissa acmiyor. */
  reset() {
    this.removeOverlay();
    this.restoreCamera();
    this.vfx.clear();
    this.sounds.reset();
    this.states.clear();
    this.dissolveAt.clear();
    this.sequence = undefined;
    setMatchEndingClass(false);
  }

  destroy() {
    this.reset();
    for (const surface of this.surfaces) surface.destroy();
  }

  /* ------------------------------------------------------------------ */

  private begin(plan: MatchEndPlan, input: MatchEndPlayInput) {
    setMatchEndingClass(true);
    this.showOverlay();
    const now = input.now;
    if (plan.kind === "victory") {
      this.vfx.startBeam(input.nexus.x, input.nexus.y, input.nexusSize, now, now + plan.climaxMs, input.skyY);
      this.sound("beam", "beam");
      // Kalan dusmanlar ilk saniyede birer birer cozuluyor (sira kimlikten).
      input.enemies.forEach((enemy, index) => {
        const at = now + (input.enemies.length > 1 ? (index / (input.enemies.length - 1)) * DISSOLVE_SPREAD_MS : 0) + 200;
        this.dissolveAt.set(enemy.id, at);
        this.vfx.dissolve(enemy.x, enemy.y, enemy.size, at, fnvHash(enemy.id));
      });
      if (input.cameraEase && !this.deps.reducedMotion()) this.easeCamera(input.nexus, plan.climaxMs);
    }
  }

  private step(step: MatchEndStep, plan: MatchEndPlan, input: MatchEndPlayInput) {
    const now = input.now + step.atMs;
    if (plan.kind === "defeat") {
      if (step.role === "nexus") {
        this.vfx.detonate(input.nexus.x, input.nexus.y, input.nexusSize, "nexus", now, 1);
        this.sound("nexus", "nexus");
        this.deps.shake?.(3, 420);
        return;
      }
      for (const item of step.items) {
        this.vfx.detonate(item.x, item.y, item.size, step.role === "walls" ? "wall" : "tower", now, fnvHash(item.id));
        this.states.set(item.id, "husk");
      }
      this.sound(step.role, step.items[0]?.id ?? "w");
      if (step.role === "tower") this.deps.shake?.(1.5, 140);
      return;
    }
    if (step.role === "nexus") {
      this.vfx.launch(now);
      this.sound("launch", "launch");
      this.deps.shake?.(2, 260);
      return;
    }
    for (const item of step.items) {
      this.vfx.powerDown(item.x, item.y, item.size, input.nexus, now, fnvHash(item.id));
      this.states.set(item.id, "dim");
    }
    this.sound("power", step.items[0]?.id ?? "p");
  }

  private end() {
    this.removeOverlay();
    setMatchEndingClass(false);
  }

  private sound(role: Parameters<MatchEndSoundGovernor["admit"]>[0], key: string) {
    const play = this.deps.playSample;
    if (!play) return;
    for (const cue of this.sounds.admit(role, this.now, key)) play(cue, key);
  }

  private easeCamera(nexus: MatchEndPoint, durationMs: number) {
    const camera = this.scene.cameras.main;
    this.camera = { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom };
    const x = camera.midPoint.x + (nexus.x - camera.midPoint.x) * MATCH_END_CAMERA_EASE.toward;
    const y = camera.midPoint.y + (nexus.y - camera.midPoint.y) * MATCH_END_CAMERA_EASE.toward;
    camera.pan(x, y, durationMs, "Sine.easeInOut");
    camera.zoomTo(camera.zoom * MATCH_END_CAMERA_EASE.zoom, durationMs, "Sine.easeInOut");
  }

  private restoreCamera() {
    const saved = this.camera;
    if (!saved) return;
    this.camera = undefined;
    const camera = this.scene.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
    camera.setZoom(saved.zoom);
    camera.setScroll(saved.scrollX, saved.scrollY);
  }

  private showOverlay() {
    if (typeof document === "undefined" || this.overlay) return;
    const overlay = document.createElement("div");
    overlay.className = "match-end-skip";
    overlay.dataset.matchEndSkip = "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-end-skip__button";
    button.textContent = t("scene.matchEnd.skip");
    button.setAttribute("aria-label", t("scene.matchEnd.skipAria"));
    overlay.append(button);
    // Herhangi bir yere dokunus: parmak kalkinca, alttaki tuvale inmeden.
    overlay.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.skip();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.skip();
    });
    this.keyListener = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.skip();
      }
    };
    window.addEventListener("keydown", this.keyListener);
    (this.deps.overlayParent ?? document.body).append(overlay);
    this.overlay = overlay;
  }

  private removeOverlay() {
    this.overlay?.remove();
    this.overlay = undefined;
    if (this.keyListener) window.removeEventListener("keydown", this.keyListener);
    this.keyListener = undefined;
  }
}

/** HUD'un kararmasi: govdede sinif (style.css `body.match-ending`). */
function setMatchEndingClass(on: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("match-ending", on);
}
