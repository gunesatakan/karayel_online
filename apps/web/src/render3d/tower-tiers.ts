import * as THREE from "three";
import type { TowerTier } from "./tower-math";

/**
 * Kademe gorunusu (egik gorunum). Kule seviyeyle buyurken (`towerLevelGrowth`)
 * kademe 2 ve 3 kendi suslerini aliyor; yukseltme ani kutlaniyor:
 *  - Kademe 2: kaidenin ustunde yavas donen isikli runik cember.
 *  - Kademe 3: parlak runik cember, kulenin belinde salinan guc halkasi ve
 *    onunla donen uc kristal, yukari suzulen isik zerreleri.
 *  - Yukseltme: zeminde genisleyen sok dalgasi ve parlama; kademe atlayinca
 *    ustune gokyuzune uzanan isik sutunu (kulenin "pop"u tower-layer'da).
 * Renkler 1'in ustunde (HDR): parlama gecisi yayiyor.
 */

/** Susun yeri ve olcusu: kule merkezi, kaidenin ustu, modelin dunyadaki eni ve boyu. */
export type TierAuraInput = { x: number; z: number; base: number; width: number; height: number; cell: number; span: number; visible: boolean };

const MOTES = 10;

function hdr(accent: number, k: number) {
  return new THREE.Color(accent).multiplyScalar(k);
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d") as CanvasRenderingContext2D };
}

/** Runik cember: iki cizgi, olcek cizgileri ve elmas isaretler; ortasi bos (kule orada). */
function runeTexture() {
  const size = 256;
  const { canvas, context } = canvas2d(size, size);
  const c = size / 2;
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(c, c, c - 6, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 2.5;
  context.beginPath();
  context.arc(c, c, c - 32, 0, Math.PI * 2);
  context.stroke();
  for (let index = 0; index < 36; index += 1) {
    const angle = (index / 36) * Math.PI * 2;
    const inner = index % 3 === 0 ? c - 28 : c - 19;
    context.lineWidth = index % 3 === 0 ? 3 : 2;
    context.beginPath();
    context.moveTo(c + Math.cos(angle) * (c - 12), c + Math.sin(angle) * (c - 12));
    context.lineTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
    context.stroke();
  }
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + Math.PI / 6;
    const x = c + Math.cos(angle) * (c - 46);
    const y = c + Math.sin(angle) * (c - 46);
    context.beginPath();
    context.moveTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
    context.lineTo(x + Math.cos(angle + Math.PI / 2) * 5, y + Math.sin(angle + Math.PI / 2) * 5);
    context.lineTo(x - Math.cos(angle) * 9, y - Math.sin(angle) * 9);
    context.lineTo(x - Math.cos(angle + Math.PI / 2) * 5, y - Math.sin(angle + Math.PI / 2) * 5);
    context.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

/** Yumusak isik noktasi (zerreler ve parlama). */
function dotTexture() {
  const size = 64;
  const { canvas, context } = canvas2d(size, size);
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Isik sutunu: altta parlak, yukari dogru sonuyor (toplamali karisimda siyah = yok). */
function columnTexture() {
  const { canvas, context } = canvas2d(4, 128);
  const gradient = context.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.4, "#7a7a7a");
  gradient.addColorStop(1, "#000000");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(canvas);
}

type Aura = {
  tier: TowerTier;
  group: THREE.Group;
  rune: THREE.Mesh;
  halo?: THREE.Mesh;
  motes?: { points: THREE.Points; positions: Float32Array; colors: Float32Array; color: THREE.Color };
  seed: number;
  input?: TierAuraInput;
};

type Burst = { at: number; duration: number; big: boolean; cell: number; span: number; parts: THREE.Object3D[]; wave: THREE.Mesh; column?: THREE.Mesh; flash?: THREE.Sprite };

export function createTierFx(scene: THREE.Scene) {
  const rune = runeTexture();
  const dot = dotTexture();
  const fade = columnTexture();
  const runeGeometry = new THREE.PlaneGeometry(1, 1);
  runeGeometry.rotateX(-Math.PI / 2);
  // Birim halka (cap 1) XZ duzleminde; kristaller onun ustunde.
  const haloGeometry = new THREE.TorusGeometry(0.5, 0.012, 6, 72);
  haloGeometry.rotateX(Math.PI / 2);
  const crystalGeometry = new THREE.OctahedronGeometry(0.5, 0);
  crystalGeometry.scale(1, 1.8, 1);
  const waveGeometry = new THREE.RingGeometry(0.42, 0.5, 64);
  waveGeometry.rotateX(-Math.PI / 2);
  const columnGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true);
  columnGeometry.translate(0, 0.5, 0);
  const materials = new Map<string, THREE.Material>();
  const shared = (key: string, make: () => THREE.Material) => {
    let material = materials.get(key);
    if (!material) {
      material = make();
      materials.set(key, material);
    }
    return material;
  };
  const glow = (options: Record<string, unknown>) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...options });
  const auras = new Map<string, Aura>();
  const bursts: Burst[] = [];

  function build(tier: TowerTier, accent: number): Aura {
    const group = new THREE.Group();
    const runeMesh = new THREE.Mesh(runeGeometry, shared(`rune:${accent}:${tier}`, () => glow({ map: rune, color: hdr(accent, tier === 3 ? 0.75 : 0.55) })));
    runeMesh.renderOrder = 2;
    group.add(runeMesh);
    const aura: Aura = { tier, group, rune: runeMesh, seed: Math.random() };
    if (tier === 3) {
      const halo = new THREE.Mesh(haloGeometry, shared(`halo:${accent}`, () => new THREE.MeshBasicMaterial({ color: hdr(accent, 1.1) })));
      halo.rotation.order = "YXZ";
      const crystalMaterial = shared(`crystal:${accent}`, () => new THREE.MeshBasicMaterial({ color: hdr(accent, 1.05) }));
      for (let index = 0; index < 3; index += 1) {
        const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
        const angle = (index / 3) * Math.PI * 2;
        crystal.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
        halo.add(crystal);
      }
      group.add(halo);
      aura.halo = halo;
      const positions = new Float32Array(MOTES * 3);
      const colors = new Float32Array(MOTES * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, shared("motes", () => new THREE.PointsMaterial({ map: dot, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      points.frustumCulled = false;
      group.add(points);
      aura.motes = { points, positions: geometry.getAttribute("position").array, colors: geometry.getAttribute("color").array, color: hdr(accent, 0.75) };
    }
    scene.add(group);
    return aura;
  }

  function remove(id: string) {
    const aura = auras.get(id);
    if (!aura) return;
    scene.remove(aura.group);
    aura.motes?.points.geometry.dispose();
    auras.delete(id);
  }

  return {
    /** Kulenin susu: kademe 1'de yok, 2-3'te kurulup yerine konuyor. */
    update(id: string, tier: TowerTier, accent: number | undefined, input: TierAuraInput) {
      let aura = auras.get(id);
      if (aura && aura.tier !== tier) {
        remove(id);
        aura = undefined;
      }
      if (tier < 2 || accent === undefined) {
        if (aura) remove(id);
        return;
      }
      if (!aura) {
        aura = build(tier, accent);
        auras.set(id, aura);
      }
      aura.input = input;
    },
    remove,
    /** Yukseltme ani: sok dalgasi ve parlama; kademe atlayinca isik sutunu. */
    celebrate(x: number, z: number, base: number, height: number, cell: number, span: number, accent: number, big: boolean) {
      const parts: THREE.Object3D[] = [];
      const wave = new THREE.Mesh(waveGeometry, glow({ color: hdr(accent, big ? 3 : 2) }));
      wave.position.set(x, base + cell * 0.01, z);
      wave.renderOrder = 3;
      parts.push(wave);
      const burst: Burst = { at: performance.now(), duration: big ? 1100 : 560, big, cell, span, parts, wave };
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: hdr(accent, big ? 3.2 : 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      flash.position.set(x, base + height * 0.55, z);
      parts.push(flash);
      burst.flash = flash;
      if (big) {
        const column = new THREE.Mesh(columnGeometry, glow({ map: fade, color: hdr(accent, 2.6), side: THREE.DoubleSide }));
        column.position.set(x, base, z);
        column.renderOrder = 3;
        parts.push(column);
        burst.column = column;
      }
      for (const part of parts) scene.add(part);
      bursts.push(burst);
    },
    /** Her karede: suslerin donusu, zerreler ve kutlamalar; tepeden gorunumde hepsi gizli. */
    tick(now: number, shown: boolean) {
      const t = now / 1000;
      for (const aura of auras.values()) {
        const p = aura.input;
        aura.group.visible = shown && Boolean(p?.visible);
        if (!aura.group.visible || !p) continue;
        aura.group.position.set(p.x, p.base, p.z);
        const runeSize = p.cell * p.span * (aura.tier === 3 ? 1.12 : 0.96);
        aura.rune.scale.set(runeSize, 1, runeSize);
        aura.rune.position.y = p.cell * 0.004;
        aura.rune.rotation.y = t * (aura.tier === 3 ? 0.45 : 0.18) + aura.seed * 6;
        if (aura.halo) {
          const ring = p.width * 1.25;
          aura.halo.scale.setScalar(ring);
          aura.halo.position.y = p.height * 0.5 + Math.sin(t * 1.7 + aura.seed * 9) * p.cell * 0.04;
          // Egik halka dikey eksende donuyor: egim yonu dolaniyor, kristaller onunla.
          aura.halo.rotation.set(0.26, t * 1.1 + aura.seed * 6, 0);
          const crystal = (p.cell * 0.1) / ring;
          for (const child of aura.halo.children) {
            child.scale.setScalar(crystal);
            child.rotation.y = t * 3;
          }
        }
        const motes = aura.motes;
        if (motes) {
          (motes.points.material as { size: number }).size = p.cell * 0.14;
          for (let index = 0; index < MOTES; index += 1) {
            const phase = (t / 1.9 + index / MOTES + aura.seed) % 1;
            const angle = aura.seed * 20 + index * 2.4 + t * 0.3;
            const radius = p.width * (0.5 - 0.18 * phase);
            motes.positions[index * 3] = Math.cos(angle) * radius;
            motes.positions[index * 3 + 1] = phase * p.height * 1.5;
            motes.positions[index * 3 + 2] = Math.sin(angle) * radius;
            const fadeIn = Math.sin(Math.PI * phase);
            motes.colors[index * 3] = motes.color.r * fadeIn;
            motes.colors[index * 3 + 1] = motes.color.g * fadeIn;
            motes.colors[index * 3 + 2] = motes.color.b * fadeIn;
          }
          motes.points.geometry.getAttribute("position").needsUpdate = true;
          motes.points.geometry.getAttribute("color").needsUpdate = true;
        }
      }
      for (let index = bursts.length - 1; index >= 0; index -= 1) {
        const burst = bursts[index];
        const age = (now - burst.at) / burst.duration;
        if (age >= 1) {
          for (const part of burst.parts) {
            scene.remove(part);
            (part as THREE.Mesh).material.dispose();
          }
          bursts.splice(index, 1);
          continue;
        }
        for (const part of burst.parts) part.visible = shown;
        const ease = 1 - (1 - age) ** 3;
        const reach = burst.cell * burst.span;
        const radius = reach * (0.45 + ease * (burst.big ? 2.6 : 1.2));
        burst.wave.scale.set(radius * 2, 1, radius * 2);
        burst.wave.material.opacity = (1 - age) ** 1.5;
        if (burst.flash) {
          burst.flash.scale.setScalar(reach * (0.8 + ease * (burst.big ? 1.8 : 0.9)));
          burst.flash.material.opacity = (1 - age) ** 2;
        }
        if (burst.column) {
          const width = reach * 0.85 * (1 - 0.6 * age);
          burst.column.scale.set(width, burst.cell * (2.5 + 4 * ease), width);
          burst.column.material.opacity = age < 0.12 ? age / 0.12 : ((1 - age) / 0.88) ** 1.3;
        }
      }
    },
    dispose() {
      for (const id of [...auras.keys()]) remove(id);
      for (const burst of bursts) {
        for (const part of burst.parts) {
          scene.remove(part);
          (part as THREE.Mesh).material.dispose();
        }
      }
      bursts.length = 0;
      materials.forEach((material) => material.dispose());
      for (const geometry of [runeGeometry, haloGeometry, crystalGeometry, waveGeometry, columnGeometry]) geometry.dispose();
      rune.dispose();
      dot.dispose();
      fade.dispose();
    }
  };
}
