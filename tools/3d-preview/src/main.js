import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildEnemy } from "./models.js";
import { loadTowerAssets } from "./tower-assets.js";
import { TOWER_ASSETS, STAGE_ASSETS } from "./asset-catalog.js";
import { buildArena } from "./arena.js";
import {
  MAP,
  MAP_WIDTH,
  MAP_DEPTH,
  TOWER_BASE_Y,
  towerPlacement,
  ENEMY_SCALE,
  ENEMY_HIT_Y,
} from "./layout.js";
import {
  beamActive,
  enemyPosition,
  impactsBetween,
  muzzleAt,
  projectileAt,
  shotEnabled,
  weaponAt,
  SHOT_PERIOD,
  FLIGHT_TIME,
} from "./scenario.js";
import "./style.css";

const $ = (id) => document.getElementById(id);
const host = $("canvas-host");
const loading = $("loading");

async function start() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute(
    "aria-label",
    "Açılı kamerada 3D kule, yürüyen mekanik düşman, mermiler ve ışın",
  );
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x142125);
  scene.fog = new THREE.FogExp2(0x142125, 0.022);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.OrthographicCamera(-12, 12, 9, -9, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI * 0.43;
  controls.minZoom = 0.6;
  controls.maxZoom = 18;
  controls.target.set(0, 0.25, 0);

  const hemi = new THREE.HemisphereLight(0xc7e3ed, 0x424b38, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe4bb, 3.7);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -13;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.normalBias = 0.006;
  sun.shadow.bias = -0.00025;
  sun.shadow.radius = 3;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7cb9d4, 2.1);
  rim.position.set(4, 5, -9);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
      color: 0x1a2728,
      roughness: 1,
      metalness: 0.1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.85;
  floor.receiveShadow = true;
  scene.add(floor);
  const [arena, towers] = await Promise.all([
    buildArena(scene, Math.min(8, renderer.capabilities.getMaxAnisotropy())),
    loadTowerAssets(),
  ]);
  for (const model of towers.values()) {
    const { position } = towerPlacement(model.asset.footprintSpan);
    model.root.position.set(position.x, TOWER_BASE_Y, position.z);
    scene.add(model.root);
  }
  let tower = towers.get(`${TOWER_ASSETS[0].id}:stylized`) ?? towers.get(`${TOWER_ASSETS[0].id}:quality`) ?? towers.get(TOWER_ASSETS[0].id);
  let placement = towerPlacement(tower.asset.footprintSpan);
  tower.root.visible = true;
  const enemy = buildEnemy();
  scene.add(enemy.root);

  const range = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.21, 100),
    new THREE.MeshBasicMaterial({
      color: 0xa3cfcd,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  range.rotation.x = -Math.PI / 2;
  range.position.set(placement.position.x, 0.07, placement.position.z);
  range.visible = false;
  scene.add(range);
  const aura = new THREE.Mesh(new THREE.RingGeometry(1.48, 1.53, 96), new THREE.MeshBasicMaterial({ color: 0x59dce5, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  aura.rotation.x = -Math.PI / 2;
  aura.position.set(placement.position.x, 0.04, placement.position.z);
  aura.visible = false;
  scene.add(aura);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.48, 1.18);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const worldUp = new THREE.Vector3(0, 1, 0);
  const tempA = new THREE.Vector3(),
    tempB = new THREE.Vector3();
  function segment(object, a, b, radius = 1) {
    tempA.set(a.x, a.y, a.z);
    tempB.set(b.x, b.y, b.z);
    object.position.copy(tempA).add(tempB).multiplyScalar(0.5);
    const length = tempA.distanceTo(tempB);
    object.quaternion.setFromUnitVectors(worldUp, tempB.sub(tempA).normalize());
    object.scale.set(radius, length, radius);
  }
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  function effectMaterial(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
  const bulletMaterial = effectMaterial(0xffdb87);
  const trailMaterial = effectMaterial(0xffa651, 0.28);
  const bullets = Array.from({ length: 8 }, () => {
    const core = new THREE.Mesh(cylinder, bulletMaterial),
      trail = new THREE.Mesh(cylinder, trailMaterial);
    scene.add(core, trail);
    return { core, trail };
  });
  const beams = [
    { mesh: new THREE.Mesh(cylinder, effectMaterial(0xfff2cb)), radius: 0.008 },
    {
      mesh: new THREE.Mesh(cylinder, effectMaterial(0xff9b31, 0.55)),
      radius: 0.02,
    },
    {
      mesh: new THREE.Mesh(cylinder, effectMaterial(0xff9122, 0.07)),
      radius: 0.05,
    },
  ];
  beams.forEach((b) => scene.add(b.mesh));
  const contactLight = new THREE.PointLight(0xff9c41, 0, 4, 2);
  scene.add(contactLight);
  const contactBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.045, 1),
    effectMaterial(0xffe3ac),
  );
  scene.add(contactBall);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x95aaa6,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const smoke = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      smokeMaterial.clone(),
    );
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, at: -100, origin: new THREE.Vector3() };
  });
  let smokeCursor = 0;
  const sparks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    effectMaterial(0xffc980),
    320,
  );
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const particles = Array.from({ length: 320 }, () => ({
    at: -100,
    life: 0,
    origin: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    size: 0.03,
  }));
  let particleCursor = 0;
  const dummy = new THREE.Object3D();
  const rings = Array.from({ length: 8 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.018, 5, 40),
      effectMaterial(0xffc278, 0.55),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, at: -100 };
  });
  let ringCursor = 0;
  function hash(n) {
    return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1) + 1;
  }
  function impact(at, kind) {
    const target = enemyPosition(at);
    const count = kind === "beam" ? 5 : 22;
    for (let i = 0; i < count; i++) {
      const p = particles[particleCursor++ % particles.length];
      const n = at * 100 + i * 17;
      const angle = (hash(n) % 1) * Math.PI * 2,
        speed = 1 + (hash(n + 2) % 1) * 3;
      p.at = at;
      p.life = 0.35 + (hash(n + 3) % 1) * 0.5;
      p.size = (0.018 + (hash(n + 4) % 1) * 0.032) * ENEMY_SCALE;
      p.origin.set(target.x, ENEMY_HIT_Y, target.z);
      p.velocity.set(
        Math.cos(angle) * speed,
        1 + (hash(n + 8) % 1) * 3.8,
        Math.sin(angle) * speed,
      );
      p.velocity.multiplyScalar(ENEMY_SCALE);
    }
    if (kind === "projectile") {
      const r = rings[ringCursor++ % rings.length];
      r.at = at;
      r.mesh.position.set(target.x, 0.08, target.z);
      const s = smoke[smokeCursor++ % smoke.length];
      s.at = at;
      s.origin.set(target.x, ENEMY_HIT_Y, target.z);
    }
  }

  let time = 0,
    previous = 0,
    paused = false,
    speed = 1,
    mode = "asset",
    hits = 0,
    lastImpact = -100;
  let lastReal = performance.now(),
    meterTime = lastReal,
    frames = 0,
    lastUi = -1;
  let cameraMode = "tactical";
  const cameraPresets = {
    tactical: { elevation: 45, yaw: 25, zoom: 1 },
    close: { elevation: 30, yaw: 35, zoom: 1.22 },
    overhead: { elevation: 65, yaw: 16, zoom: 1 },
    detail: { elevation: 38, yaw: 35, zoom: 12, focus: true },
    top: { elevation: 89.9, yaw: 0, zoom: 12, focus: true },
  };
  $("map-metrics").textContent =
    `${MAP.cols} × ${MAP.rows} HÜCRE · ${MAP.bounds.width} × ${MAP.bounds.height} BİRİM`;
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    // Keep the entire platform readable in narrow and wide panels.
    const halfDiagonal = Math.hypot(MAP_WIDTH, MAP_DEPTH) / 2 + 0.8;
    const halfHeight = Math.max(halfDiagonal, halfDiagonal / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function preset(name) {
    cameraMode = name;
    const p = cameraPresets[name],
      radius = 25,
      polar = THREE.MathUtils.degToRad(90 - p.elevation),
      azimuth = THREE.MathUtils.degToRad(p.yaw);
    const center = p.focus ? new THREE.Vector3(placement.position.x, 0.25 * placement.span, placement.position.z) : new THREE.Vector3(0, 0.25, 0);
    camera.position.set(
      center.x + Math.sin(azimuth) * Math.sin(polar) * radius,
      center.y + Math.cos(polar) * radius,
      center.z + Math.cos(azimuth) * Math.sin(polar) * radius,
    );
    camera.zoom = p.focus ? p.zoom / placement.span : p.zoom;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    document
      .querySelectorAll("[data-camera]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.camera === name)),
      );
  }
  preset("tactical");
  resize();
  controls.addEventListener("start", () =>
    document
      .querySelectorAll("[data-camera]")
      .forEach((b) => b.setAttribute("aria-pressed", "false")),
  );
  document
    .querySelectorAll("[data-camera]")
    .forEach((b) =>
      b.addEventListener("click", () => preset(b.dataset.camera)),
    );
  $("reset-camera").addEventListener("click", () => preset("tactical"));
  function resetSimulation() {
    time = 0;
    previous = 0;
    hits = 0;
    lastImpact = -100;
    particles.forEach((p) => (p.at = -100));
    rings.forEach((r) => (r.at = -100));
    smoke.forEach((s) => (s.at = -100));
    lastUi = -1;
  }
  function selectTower(id) {
    tower.root.visible = false;
    tower = towers.get(`${id}:${$("model-style").value}`) ?? towers.get(id);
    tower.root.visible = true;
    const asset = tower.asset;
    $("quality-controls").hidden = !asset.qualityModel;
    $("asset-version").textContent = asset.variant === "stylized" ? "STİLİZE" : asset.quality ? "GERÇEKÇİ" : "İLK TASLAK";
    placement = towerPlacement(asset.footprintSpan);
    arena.setFootprint(placement);
    range.position.set(placement.position.x, 0.07, placement.position.z);
    aura.position.set(placement.position.x, 0.04, placement.position.z);
    $("tower-footprint").textContent = `${placement.span} × ${placement.span} HÜCRE`;
    $("footprint-description").textContent = `${placement.span} × ${placement.span} hücre · ${placement.cells.length} kare`;
    if (cameraPresets[cameraMode].focus) preset(cameraMode);
    $("tower-name").textContent = asset.name;
    $("tower-label-name").textContent = asset.name.toLocaleUpperCase("tr-TR");
    $("tower-role").textContent = asset.role;
    $("tower-art").src = asset.art;
    $("tower-art").alt = `${asset.name} — oyundaki tepeden görünüm`;
    $("tower-detail").textContent = asset.detail;
    $("download-model").href = asset.model;
    $("download-model").download = `${asset.id}${asset.variant ? `-${asset.variant}` : ""}.glb`;
    range.scale.setScalar(asset.range / MAP.cellSize / 4.2);
    document.querySelectorAll("[data-tower]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tower === id)));
    resetSimulation();
  }
  for (const asset of TOWER_ASSETS) {
    const button = document.createElement("button");
    button.dataset.tower = asset.id;
    button.setAttribute("aria-label", asset.name);
    const thumbnail = document.createElement("img");
    thumbnail.src = asset.art;
    thumbnail.alt = "";
    const name = document.createElement("span");
    name.textContent = asset.name.replace(" Kulesi", "");
    button.append(thumbnail, name);
    button.addEventListener("click", () => selectTower(asset.id));
    $("tower-picker").append(button);
  }
  for (const asset of STAGE_ASSETS) {
    const option = document.createElement("option");
    option.value = String(asset.id);
    option.textContent = `${asset.id.toString().padStart(2, "0")} / ${asset.name}`;
    $("stage-select").append(option);
  }
  $("stage-select").addEventListener("change", (event) => arena.setStage(Number(event.target.value)));
  $("show-grid").addEventListener("change", (event) => { arena.grid.visible = event.target.checked; });
  $("model-style").addEventListener("change", () => selectTower(tower.asset.id));
  selectTower(TOWER_ASSETS[0].id);
  document.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      resetSimulation();
      document
        .querySelectorAll("[data-mode]")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === b)),
        );
    }),
  );
  $("speed").addEventListener("input", (e) => {
    speed = Number(e.target.value);
    $("speed-value").textContent = `${speed.toLocaleString("tr-TR")}×`;
  });
  $("show-range").addEventListener(
    "change",
    (e) => (range.visible = e.target.checked),
  );
  function togglePause() {
    paused = !paused;
    $("pause").innerHTML = paused
      ? "<span>▶</span> Devam et"
      : "<span>Ⅱ</span> Duraklat";
    $("pause").setAttribute("aria-pressed", String(paused));
    $("run-state").textContent = paused
      ? "SİMÜLASYON DURAKLATILDI"
      : "SİMÜLASYON AKTİF";
  }
  $("pause").addEventListener("click", togglePause);
  $("restart").addEventListener("click", resetSimulation);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      togglePause();
    }
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    paused = true;
    loading.textContent =
      "3D grafik bağlantısı kesildi. Önizlemeyi yenileyerek tekrar açabilirsin.";
    loading.classList.remove("hidden");
  });
  renderer.domElement.addEventListener("webglcontextrestored", () =>
    location.reload(),
  );
  document.addEventListener("visibilitychange", () => {
    lastReal = performance.now();
    meterTime = lastReal;
    frames = 0;
  });
  const labelPoint = new THREE.Vector3();
  function label(element, position) {
    if (element.id === "tower-label" && cameraMode === "top") {
      element.style.display = "none";
      return;
    }
    labelPoint.set(...position).project(camera);
    const visible =
      Math.abs(labelPoint.x) < 0.94 &&
      Math.abs(labelPoint.y) < 0.87 &&
      labelPoint.z < 1;
    element.style.display = visible ? "" : "none";
    element.style.left = `${(labelPoint.x * 0.5 + 0.5) * host.clientWidth}px`;
    element.style.top = `${(-labelPoint.y * 0.5 + 0.5) * host.clientHeight}px`;
  }
  function animate(real) {
    const dt = Math.min(Math.max((real - lastReal) / 1000, 0), 0.06);
    lastReal = real;
    if (!paused && !document.hidden) time += dt * speed;
    controls.update(dt);
    const target = enemyPosition(time);
    enemy.root.position.set(target.x, 0, target.z);
    enemy.root.rotation.y = Math.atan2(
      placement.position.x - target.x,
      placement.position.z - target.z,
    );
    enemy.body.position.y = Math.sin(time * 8) * 0.035;
    enemy.legs.forEach(({ pivot, side, front }) => {
      pivot.rotation.x =
        Math.sin(time * 8 + (side * front * Math.PI) / 2) * 0.2;
      pivot.rotation.z =
        Math.cos(time * 8 + (side * front * Math.PI) / 2) * 0.075;
    });
    tower.yaw.rotation.y = Math.atan2(
      target.x - placement.position.x,
      target.z - placement.position.z,
    );
    const effectiveMode = mode === "asset" ? tower.asset.mode : mode;
    const weapon = weaponAt(time, effectiveMode),
      beam = beamActive(time, effectiveMode);
    const socket = tower.asset.muzzle;
    aura.visible = weapon === "aura";
    aura.material.opacity = 0.18 + Math.sin(time * 2) * 0.07;
    const index = Math.floor(time / SHOT_PERIOD),
      sinceShot = time - index * SHOT_PERIOD;
    const recoil =
      weapon === "projectile" && shotEnabled(index * SHOT_PERIOD, effectiveMode)
        ? Math.exp(-sinceShot * 22) * 0.12
        : 0;
    tower.barrels.position.z = -recoil;
    tower.flash.visible = time > 0 && weapon === "projectile" && sinceShot < 0.065;
    tower.flash.position.x = (socket.centerOffset ?? 0) + (index % 2 ? -socket.offset : socket.offset);
    tower.flash.scale.set(1, 1, 1.4 + (Math.sin(time * 80) + 1) * 0.3);
    tower.light.intensity = tower.flash.visible ? 0.12 : beam ? 0.035 : 0;
    let slot = 0;
    for (
      let i = Math.max(0, Math.floor((time - FLIGHT_TIME) / SHOT_PERIOD));
      i <= index;
      i++
    ) {
      if (
        !shotEnabled(i * SHOT_PERIOD, effectiveMode) ||
        time <= i * SHOT_PERIOD ||
        time - i * SHOT_PERIOD >= FLIGHT_TIME
      )
        continue;
      const p = projectileAt(i, time, socket, placement),
        view = bullets[slot++];
      const dir = new THREE.Vector3(
        p.to.x - p.from.x,
        p.to.y - p.from.y,
        p.to.z - p.from.z,
      );
      const traveled = dir.length() * p.progress;
      dir.normalize();
      const coreLength = Math.min(0.12, traveled);
      const trailLength = Math.min(0.36, traveled);
      const back = {
        x: p.position.x - dir.x * coreLength,
        y: p.position.y - dir.y * coreLength,
        z: p.position.z - dir.z * coreLength,
      };
      const trailBack = {
        x: p.position.x - dir.x * trailLength,
        y: p.position.y - dir.y * trailLength,
        z: p.position.z - dir.z * trailLength,
      };
      view.core.visible = view.trail.visible = true;
      segment(view.core, back, p.position, 0.014);
      segment(view.trail, trailBack, p.position, 0.024);
    }
    for (; slot < bullets.length; slot++)
      bullets[slot].core.visible = bullets[slot].trail.visible = false;
    const muzzle = muzzleAt(time, socket.centerOffset ?? 0, socket.length, socket.height, placement),
      end = { x: target.x, y: ENEMY_HIT_Y, z: target.z };
    beams.forEach(({ mesh, radius }) => {
      mesh.visible = beam;
      if (beam)
        segment(mesh, muzzle, end, radius * (1 + Math.sin(time * 72) * 0.09));
    });
    const events = impactsBetween(previous, time, effectiveMode);
    events.forEach((e) => {
      impact(e.at, e.kind);
      hits++;
      lastImpact = e.at;
    });
    const hitFade = Math.max(0, 1 - (time - lastImpact) * 9);
    enemy.armorMaterial.emissive.setHex(0xff762c);
    enemy.armorMaterial.emissiveIntensity = hitFade * 0.8;
    contactBall.visible = beam || hitFade > 0.6;
    contactBall.position.set(end.x, end.y, end.z);
    contactBall.scale.setScalar(
      beam ? 0.65 + Math.sin(time * 70) * 0.2 : hitFade * 1.5,
    );
    contactLight.position.copy(contactBall.position);
    contactLight.intensity = beam ? 0.2 : hitFade * 0.25;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i],
        age = time - p.at;
      if (age < 0 || age > p.life) {
        dummy.scale.setScalar(0);
      } else {
        dummy.position.copy(p.origin).addScaledVector(p.velocity, age);
        dummy.position.y -= 5.8 * age * age;
        if (dummy.position.y < 0.06) dummy.position.y = 0.06;
        dummy.scale.set(
          p.size * (1 - age / p.life),
          p.size * (1 - age / p.life),
          p.size * (2.5 - age / p.life),
        );
        dummy.rotation.set(age * 3, age * 8, i);
      }
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
    rings.forEach((r) => {
      const age = time - r.at;
      r.mesh.visible = age >= 0 && age < 0.48;
      if (r.mesh.visible) {
        r.mesh.scale.setScalar((0.25 + age * 2.2) * ENEMY_SCALE);
        r.mesh.material.opacity = (1 - age / 0.48) * 0.38;
      }
    });
    smoke.forEach((s) => {
      const age = time - s.at;
      s.mesh.visible = age >= 0 && age < 1.3;
      if (s.mesh.visible) {
        s.mesh.position.copy(s.origin);
        s.mesh.position.y += age * 0.8 * ENEMY_SCALE;
        s.mesh.scale.setScalar((0.13 + age * 0.35) * ENEMY_SCALE);
        s.mesh.rotation.y = age;
        s.mesh.material.opacity = (1 - age / 1.3) * 0.12;
      }
    });
    label($("tower-label"), [
      placement.position.x,
      TOWER_BASE_Y + 3 * placement.scale,
      placement.position.z,
    ]);
    label($("enemy-label"), [target.x, 2.45 * ENEMY_SCALE, target.z]);
    if (time - lastUi > 0.1 || lastUi < 0) {
      $("hit-count").textContent = String(hits);
      $("elapsed").textContent =
        `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
      $("health-bar").style.width = `${100 - ((hits % 28) / 28) * 100}%`;
      const descriptions = {
        projectile: ["Kinetik mermi", "Çift namlu, geri tepme ve temas kıvılcımları."],
        beam: ["Odak ışını", "Enerji başlığından çıkan sürekli ışın."],
        impact: ["Doğrudan temas", "Hedef üzerinde vuruş parlaması."],
        idle: ["Destek kulesi", "Sunucu kendisi ateş etmez. Bağlantı davranışı sonraki aşamada."],
        aura: ["Kontrol alanı", "İzolasyon alanının görsel örneği; hasar vuruşu yok."],
      };
      [$("weapon-name").textContent, $("weapon-description").textContent] = descriptions[weapon];
      lastUi = time;
    }
    $("camera-angle").textContent =
      `${Math.round(90 - THREE.MathUtils.radToDeg(controls.getPolarAngle()))}°`;
    composer.render(dt);
    previous = time;
    frames++;
    if (real - meterTime > 750) {
      $("fps").textContent = String(
        Math.round((frames * 1000) / (real - meterTime)),
      );
      frames = 0;
      meterTime = real;
    }
    renderer.domElement.dataset.ready = "true";
  }
  loading.classList.add("hidden");
  renderer.setAnimationLoop(animate);
  window.addEventListener(
    "pagehide",
    () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      environment.dispose();
      renderer.dispose();
    },
    { once: true },
  );
}

start().catch((error) => {
  console.error("3D preview could not start", error);
  loading.textContent =
    "3D varlıklar yüklenemedi. Yerel sunucunun çalıştığını kontrol edip sayfayı yenileyebilirsin.";
  loading.classList.remove("hidden");
});
