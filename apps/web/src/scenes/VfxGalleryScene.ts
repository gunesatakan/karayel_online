import Phaser from "phaser";
import { towerCatalog, type BeamSnapshot, type ProjectileSnapshot } from "@karayel/shared";
import { configureHiDpiCamera } from "../rendering";
import { AttackVfx } from "../vfx/attack-vfx";
import { BeamRenderer } from "../vfx/beam-renderer";
import { FlashPool, GlowStampPool } from "../vfx/flash-pool";
import { liftToWhite, toTier } from "../vfx/kit";
import { VfxLod } from "../vfx/lod";
import {
  VfxScenario,
  createStressScenario,
  getAttackingDefinitionIds,
  getScenarioColor,
  getScenarioIntervalMs,
  walkerPosition,
  type ScenarioTower,
  type ScenarioWalker
} from "../vfx/vfx-scenario";
import { getVfxProfile, getVfxTier } from "../vfx/vfx-profiles";

/**
 * VFX galerisi (`?vfx-gallery`): her saldiran kule, sv 1 / 5 / 10, yan yana.
 *
 * Sunucu yok; `VfxScenario` sunucunun gonderdigi mermi, isin ve olaylarin
 * aynisini deterministik olarak uretiyor ve oyunun kendi cizicilerine
 * (AttackVfx, BeamRenderer, FlashPool, GlowStampPool) besliyor -- GameScene'in
 * kullandigi siniflar, ayni katman derinlikleriyle. Lazer burada da kitin
 * ustunde ve oyundakiyle ayni.
 *
 * Kontroller (alt cubuk): sayfa, 0.25x yavas cekim, duraklat, takim arkadasi
 * (%70), yuk testi (20 kademe-3 kule, 60 dusman ve olcum katmani). Saat
 * sanal: yavas cekim ve duraklatma butun efektleri birlikte yavaslatiyor.
 * 375 px'lik telefonda satirlar sayfalara bolunuyor.
 */
const COLUMN_LEVELS = [1, 5, 10] as const;
const HEADER = 40;
const FOOTER = 64;
const ROW_HEIGHT = 84;

type Mode = "grid" | "stress";

export class VfxGalleryScene extends Phaser.Scene {
  private mode: Mode = "grid";
  private page = 0;
  private slow = false;
  private paused = false;
  private teammate = false;
  private now = 0;
  private lastFrameAt = 0;
  private scenario?: VfxScenario;
  private readonly towerOwn = new Map<string, boolean>();
  private readonly lod = new VfxLod();
  private attackVfx?: AttackVfx;
  private beamRenderer?: BeamRenderer;
  private flashPool?: FlashPool;
  private stamps?: GlowStampPool;
  private surfaces: Phaser.GameObjects.Graphics[] = [];
  private towerSprites: Phaser.GameObjects.Image[] = [];
  private walkerSprites: Phaser.GameObjects.Image[] = [];
  private walkerHitAt: number[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private readonly projectileSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly spritePool: Phaser.GameObjects.Image[] = [];
  private perfText?: Phaser.GameObjects.Text;
  private controls?: HTMLElement;
  private frameMsEma = 16.7;
  private vfxMsEma = 0;

  constructor() {
    super("vfx-gallery");
  }

  create() {
    configureHiDpiCamera(this);
    this.cameras.main.setBackgroundColor("#000000");
    const beamGraphics = this.add.graphics().setDepth(10);
    const beamGlow = this.add.graphics().setDepth(10.05).setBlendMode(Phaser.BlendModes.ADD);
    const body = this.add.graphics().setDepth(10.9);
    const glow = this.add.graphics().setDepth(10.85).setBlendMode(Phaser.BlendModes.ADD);
    const events = this.add.graphics().setDepth(12.45);
    this.surfaces = [beamGraphics, beamGlow, body, glow, events];
    this.flashPool = new FlashPool(this, 12.5);
    this.stamps = new GlowStampPool(this, 10.86);
    this.beamRenderer = new BeamRenderer(beamGraphics, beamGlow, this.lod);
    this.attackVfx = new AttackVfx(body, glow, events, this.flashPool, {
      lod: this.lod,
      stamps: this.stamps,
      // Galeride sarsinti yok: yan yana 40 kule kamerayi hic durdurmazdi.
      onHeavyImpact: undefined
    });
    this.perfText = this.add.text(6, HEADER + 2, "", { fontFamily: "monospace", fontSize: "9px", color: "#a7f3d0", backgroundColor: "#020617cc" })
      .setDepth(40)
      .setVisible(false);
    this.createControls();
    this.buildScene();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls?.remove();
      this.flashPool?.destroy();
      this.stamps?.destroy();
    });
  }

  update(time: number, delta: number) {
    const step = this.paused ? 0 : delta * (this.slow ? 0.25 : 1);
    const since = this.now;
    this.now += step;
    const frameMs = this.lastFrameAt > 0 ? time - this.lastFrameAt : 16.7;
    this.lastFrameAt = time;
    const scenario = this.scenario;
    if (!scenario || !this.attackVfx || !this.beamRenderer) return;

    const start = performance.now();
    const frame = scenario.frame(this.now, step > 0 ? since : this.now);
    const ownOf = (key: string) => {
      if (this.teammate) return false;
      const towerId = /^(?:beam-|melis-curse-|melis-underworld-link-)?(.*?)(?:-[pb]\d+.*)?$/.exec(key)?.[1] ?? key;
      return this.towerOwn.get(towerId) ?? true;
    };
    for (const event of frame.events) {
      const own = this.teammate ? false : event.own;
      const input = { x: event.x, y: event.y, angle: event.angle, definitionId: event.definitionId, tier: event.tier, own, key: event.key, bornAt: event.at };
      if (event.type === "anticipation") this.attackVfx.emitAnticipation(input);
      else if (event.type === "muzzle") this.attackVfx.emitMuzzle(input);
      else if (event.type === "contact") {
        this.attackVfx.emitImpact({ ...input, radius: event.radius });
        this.walkerHitAt[event.walker] = this.now;
      }
    }
    this.attackVfx.renderProjectiles(frame.projectiles, this.now, 1, (projectile) => ownOf(projectile.id));
    this.syncProjectileSprites(frame.projectiles);
    this.beamRenderer.render(frame.beams, { now: this.now, sceneNow: this.now, scale: 1, isOwn: (beam: BeamSnapshot) => ownOf(beam.id) });
    this.attackVfx.render(this.now, 1);
    this.flashPool?.update(this.now);
    const vfxMs = performance.now() - start;
    this.lod.note(vfxMs, frameMs, time);
    this.updateWalkers(scenario.walkers);
    this.updatePerf(vfxMs, frameMs, frame.projectiles.length, frame.beams.length);
  }

  /* ---------------------------------------------------------------- */

  private get worldHeight() {
    return this.cameras.main.height / this.cameras.main.zoom;
  }

  private get rowsPerPage() {
    return Math.max(2, Math.floor((this.worldHeight - HEADER - FOOTER) / ROW_HEIGHT));
  }

  private get pageCount() {
    return Math.max(1, Math.ceil(getAttackingDefinitionIds().length / this.rowsPerPage));
  }

  private buildScene() {
    for (const sprite of [...this.towerSprites, ...this.walkerSprites]) sprite.destroy();
    for (const label of this.labels) label.destroy();
    for (const sprite of this.projectileSprites.values()) sprite.destroy();
    this.projectileSprites.clear();
    this.towerSprites = [];
    this.walkerSprites = [];
    this.labels = [];
    this.attackVfx?.clear();
    this.scenario = this.mode === "stress" ? createStressScenario(390, HEADER + 30, this.worldHeight - HEADER - FOOTER - 30) : this.createGridScenario();
    this.lod.force(this.mode === "stress" ? undefined : 0);
    this.towerOwn.clear();
    for (const tower of this.scenario.towers) this.towerOwn.set(tower.id, tower.own);
    this.perfText?.setVisible(this.mode === "stress");

    for (const tower of this.scenario.towers) {
      const key = this.textures.exists(`tower-${tower.definitionId}`) ? `tower-${tower.definitionId}` : "projectile-tower";
      const sprite = this.add.image(tower.x, tower.y, key).setDepth(12);
      sprite.setDisplaySize(30, 30);
      this.towerSprites.push(sprite);
      if (this.mode === "grid") {
        this.labels.push(this.add.text(tower.x, tower.y + 17, `sv ${tower.level}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "9px", color: tierCss(tower) })
          .setOrigin(0.5, 0)
          .setDepth(13));
      }
    }
    for (const walker of this.scenario.walkers) {
      const sprite = this.add.image(walker.cx, walker.cy, "enemy-grunt").setDepth(8);
      sprite.setDisplaySize(16, 16);
      this.walkerSprites.push(sprite);
    }
    this.walkerHitAt = this.scenario.walkers.map(() => -Infinity);

    if (this.mode === "grid") {
      const ids = this.pageIds();
      ids.forEach((id, row) => {
        const definition = Object.values(towerCatalog).flat().find((tower) => tower.id === id);
        const y = HEADER + row * ROW_HEIGHT + 4;
        this.labels.push(this.add.text(6, y, `${id} · ${definition?.name ?? ""}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "10px", color: "#cbd5e1" }).setDepth(13));
      });
      COLUMN_LEVELS.forEach((level, column) => {
        this.labels.push(this.add.text(column * 130 + 65, 14, `Sv ${level}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" })
          .setOrigin(0.5, 0)
          .setDepth(13));
      });
    } else {
      this.labels.push(this.add.text(195, 12, "Yük testi · 20 kule (sv 10) · 60 düşman", { fontFamily: "Rajdhani, sans-serif", fontSize: "12px", color: "#f8fafc" }).setOrigin(0.5, 0).setDepth(13));
    }
    this.refreshControls();
  }

  private pageIds() {
    const ids = getAttackingDefinitionIds();
    const per = this.rowsPerPage;
    this.page = Math.min(this.page, this.pageCount - 1);
    return ids.slice(this.page * per, this.page * per + per);
  }

  /** Satir basina bir kule tanimi, sutun basina bir seviye; her hucrede bir yuruyucu. */
  private createGridScenario() {
    const towers: ScenarioTower[] = [];
    const walkers: ScenarioWalker[] = [];
    this.pageIds().forEach((definitionId, row) => {
      const y = HEADER + row * ROW_HEIGHT + 48;
      COLUMN_LEVELS.forEach((level, column) => {
        const cellX = column * 130;
        const walker = walkers.length;
        walkers.push({ id: `w-${definitionId}-${level}`, cx: cellX + 86, cy: y, rx: 22, ry: 13, periodMs: 3400, phase: row * 0.7 + column * 1.9 });
        towers.push({
          id: `g-${definitionId}-${level}`,
          definitionId,
          level,
          x: cellX + 28,
          y,
          color: getScenarioColor(definitionId),
          own: true,
          walker,
          intervalMs: getScenarioIntervalMs(definitionId)
        });
      });
    });
    return new VfxScenario(towers, walkers);
  }

  private updateWalkers(walkers: readonly ScenarioWalker[]) {
    walkers.forEach((walker, index) => {
      const sprite = this.walkerSprites[index];
      if (!sprite) return;
      const position = walkerPosition(walker, this.now);
      sprite.setPosition(position.x, position.y);
      // Vurus flasi oyundakiyle ayni sure (50 ms), yavas cekimde de.
      const hit = this.now - (this.walkerHitAt[index] ?? -Infinity) < 50;
      if (hit) sprite.setTintFill(0xffffff);
      else if (sprite.isTinted) sprite.clearTint();
    });
  }

  /** Kendi cizilmis dokusu olan mermiler (Melis): oyundaki gibi profil boyunda sprite. */
  private syncProjectileSprites(projectiles: readonly ProjectileSnapshot[]) {
    const seen = new Set<string>();
    for (const projectile of projectiles) {
      const profile = getVfxProfile(projectile.definitionId);
      if (profile.silhouette !== "sprite") continue;
      seen.add(projectile.id);
      let sprite = this.projectileSprites.get(projectile.id);
      const textureKey = this.textures.exists(`projectile-${profile.id}`) ? `projectile-${profile.id}` : "projectile-tower";
      if (!sprite) {
        sprite = this.spritePool.pop() ?? this.add.image(0, 0, textureKey).setDepth(11.2);
        sprite.setTexture(textureKey).setVisible(true);
        this.projectileSprites.set(projectile.id, sprite);
      }
      const recipe = getVfxTier(profile, projectile.tier);
      sprite.setPosition(projectile.x, projectile.y).setDisplaySize(recipe.silhouette, recipe.silhouette);
      sprite.setRotation(Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1));
      sprite.setTint(toTier(projectile.tier) >= 2 ? liftToWhite(recipe.color, 0.5) : 0xffffff);
    }
    for (const [id, sprite] of this.projectileSprites) {
      if (seen.has(id)) continue;
      sprite.setVisible(false);
      this.spritePool.push(sprite);
      this.projectileSprites.delete(id);
    }
  }

  private updatePerf(vfxMs: number, frameMs: number, projectiles: number, beams: number) {
    if (this.mode !== "stress" || !this.perfText) return;
    this.frameMsEma += (frameMs - this.frameMsEma) * 0.05;
    this.vfxMsEma += (vfxMs - this.vfxMsEma) * 0.05;
    const commands = this.surfaces.reduce((sum, surface) => sum + (surface as unknown as { commandBuffer: unknown[] }).commandBuffer.length, 0);
    this.perfText.setText([
      `fps ${(1000 / Math.max(1, this.frameMsEma)).toFixed(0)}  vfx ${this.vfxMsEma.toFixed(2)} ms`,
      `LOD ${this.lod.level}  (kıvılcım ${this.lod.sparks ? "açık" : "kapalı"}, hale ${this.lod.corona ? "açık" : "kapalı"}, iz ×${this.lod.trailScale})`,
      `mermi ${projectiles}  ışın ${beams}  olay ${this.attackVfx?.liveEvents ?? 0}`,
      `parlama ${this.flashPool?.live ?? 0}/64  damga ${this.stamps?.count ?? 0}  komut ${commands}`
    ]);
  }

  /* ---------------------------------------------------------------- */
  /* DOM denetimleri: telefonda parmakla basilacak boyutta, Turkce.     */
  /* ---------------------------------------------------------------- */

  private createControls() {
    const bar = document.createElement("div");
    bar.id = "vfx-gallery-controls";
    bar.style.cssText = [
      "position:fixed", "left:0", "right:0", "bottom:0", "z-index:50", "display:flex", "flex-wrap:wrap", "gap:6px",
      "justify-content:center", "padding:8px max(8px, env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom))",
      "background:rgba(2,6,23,0.88)", "border-top:1px solid #1e293b", "font:600 13px Rajdhani, sans-serif"
    ].join(";");
    const button = (label: string, action: () => void, id: string) => {
      const element = document.createElement("button");
      element.type = "button";
      element.dataset.vfx = id;
      element.textContent = label;
      element.style.cssText = "min-width:44px;min-height:36px;padding:4px 10px;color:#f8fafc;background:#0f172a;border:1px solid #334155;border-radius:8px";
      element.addEventListener("click", () => {
        action();
        this.refreshControls();
      });
      bar.append(element);
      return element;
    };
    button("◀", () => this.changePage(-1), "prev");
    const pageLabel = document.createElement("span");
    pageLabel.dataset.vfx = "page";
    pageLabel.style.cssText = "align-self:center;color:#cbd5e1;min-width:52px;text-align:center";
    bar.append(pageLabel);
    button("▶", () => this.changePage(1), "next");
    button("0.25×", () => { this.slow = !this.slow; }, "slow");
    button("Duraklat", () => { this.paused = !this.paused; }, "pause");
    button("Arkadaş %70", () => { this.teammate = !this.teammate; }, "mate");
    button("Yük testi", () => {
      this.mode = this.mode === "stress" ? "grid" : "stress";
      this.buildScene();
    }, "stress");
    document.body.append(bar);
    this.controls = bar;
  }

  private changePage(delta: number) {
    if (this.mode !== "grid") return;
    this.page = (this.page + delta + this.pageCount) % this.pageCount;
    this.buildScene();
  }

  private refreshControls() {
    const bar = this.controls;
    if (!bar) return;
    const set = (id: string, active: boolean, label?: string) => {
      const element = bar.querySelector<HTMLElement>(`[data-vfx="${id}"]`);
      if (!element) return;
      if (label) element.textContent = label;
      element.style.background = active ? "#0e7490" : "#0f172a";
    };
    const page = bar.querySelector<HTMLElement>('[data-vfx="page"]');
    if (page) page.textContent = this.mode === "grid" ? `${this.page + 1} / ${this.pageCount}` : "—";
    set("slow", this.slow);
    set("pause", this.paused, this.paused ? "Oynat" : "Duraklat");
    set("mate", this.teammate);
    set("stress", this.mode === "stress");
  }
}

function tierCss(tower: ScenarioTower) {
  const tier = tower.level >= 10 ? 3 : tower.level >= 5 ? 2 : 1;
  const color = getVfxProfile(tower.definitionId, tower.color).ramp[tier - 1];
  return `#${color.toString(16).padStart(6, "0")}`;
}
