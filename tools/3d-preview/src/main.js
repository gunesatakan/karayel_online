import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildArena, buildTower, buildEnemy } from "./models.js";
import {
  beamActive,
  enemyPosition,
  impactsBetween,
  muzzleAt,
  projectileAt,
  shotEnabled,
  weaponAt,
  TOWER_POSITION,
  SHOT_PERIOD,
  FLIGHT_TIME,
} from "./scenario.js";
import "./style.css";

const $ = (id) => document.getElementById(id);
const host = $("canvas-host");
const loading = $("loading");

function start() {
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
  controls.minPolarAngle = Math.PI * 0.1;
  controls.maxPolarAngle = Math.PI * 0.43;
  controls.minZoom = 0.6;
  controls.maxZoom = 2.4;
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
  sun.shadow.normalBias = 0.035;
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
  buildArena(scene);
  const tower = buildTower();
  tower.root.position.set(TOWER_POSITION.x, 0.16, TOWER_POSITION.z);
  scene.add(tower.root);
  const enemy = buildEnemy();
  scene.add(enemy.root);

  const range = new THREE.Mesh(
    new THREE.RingGeometry(7.2, 7.23, 100),
    new THREE.MeshBasicMaterial({
      color: 0xa3cfcd,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  range.rotation.x = -Math.PI / 2;
  range.position.set(TOWER_POSITION.x, 0.07, TOWER_POSITION.z);
  range.visible = false;
  scene.add(range);

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
    { mesh: new THREE.Mesh(cylinder, effectMaterial(0xfff2cb)), radius: 0.026 },
    {
      mesh: new THREE.Mesh(cylinder, effectMaterial(0xff9b31, 0.55)),
      radius: 0.075,
    },
    {
      mesh: new THREE.Mesh(cylinder, effectMaterial(0xff9122, 0.07)),
      radius: 0.2,
    },
  ];
  beams.forEach((b) => scene.add(b.mesh));
  const contactLight = new THREE.PointLight(0xff9c41, 0, 4, 2);
  scene.add(contactLight);
  const contactBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.14, 1),
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
      p.size = 0.018 + (hash(n + 4) % 1) * 0.032;
      p.origin.set(target.x - 0.3, 1.15, target.z);
      p.velocity.set(
        Math.cos(angle) * speed,
        1 + (hash(n + 8) % 1) * 3.8,
        Math.sin(angle) * speed,
      );
    }
    if (kind === "projectile") {
      const r = rings[ringCursor++ % rings.length];
      r.at = at;
      r.mesh.position.set(target.x, 0.08, target.z);
      const s = smoke[smokeCursor++ % smoke.length];
      s.at = at;
      s.origin.set(target.x, 1.2, target.z);
    }
  }

  let time = 0,
    previous = 0,
    paused = false,
    speed = 1,
    mode = "auto",
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
  };
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    // Keep the entire platform readable in narrow and wide panels.
    const halfHeight = Math.max(8.15, 10.7 / aspect);
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
    camera.position.set(
      Math.sin(azimuth) * Math.sin(polar) * radius,
      Math.cos(polar) * radius,
      Math.cos(azimuth) * Math.sin(polar) * radius,
    );
    camera.zoom = p.zoom;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0.25, 0);
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
      TOWER_POSITION.x - target.x,
      TOWER_POSITION.z - target.z,
    );
    enemy.body.position.y = Math.sin(time * 8) * 0.035;
    enemy.legs.forEach(({ pivot, side, front }) => {
      pivot.rotation.x =
        Math.sin(time * 8 + (side * front * Math.PI) / 2) * 0.2;
      pivot.rotation.z =
        Math.cos(time * 8 + (side * front * Math.PI) / 2) * 0.075;
    });
    tower.yaw.rotation.y = Math.atan2(
      target.x - TOWER_POSITION.x,
      target.z - TOWER_POSITION.z,
    );
    const weapon = weaponAt(time, mode),
      beam = beamActive(time, mode);
    const index = Math.floor(time / SHOT_PERIOD),
      sinceShot = time - index * SHOT_PERIOD;
    const recoil =
      weapon === "projectile" && shotEnabled(index * SHOT_PERIOD, mode)
        ? Math.exp(-sinceShot * 22) * 0.12
        : 0;
    tower.barrels.position.z = -recoil;
    tower.flash.visible = weapon === "projectile" && sinceShot < 0.065;
    tower.flash.position.x = index % 2 ? -0.25 : 0.25;
    tower.flash.scale.set(1, 1, 1.4 + (Math.sin(time * 80) + 1) * 0.3);
    tower.light.intensity = tower.flash.visible ? 4 : beam ? 1 : 0;
    let slot = 0;
    for (
      let i = Math.max(0, Math.floor((time - FLIGHT_TIME) / SHOT_PERIOD));
      i <= index;
      i++
    ) {
      if (
        !shotEnabled(i * SHOT_PERIOD, mode) ||
        time - i * SHOT_PERIOD >= FLIGHT_TIME
      )
        continue;
      const p = projectileAt(i, time),
        view = bullets[slot++];
      const dir = new THREE.Vector3(
        p.to.x - p.from.x,
        p.to.y - p.from.y,
        p.to.z - p.from.z,
      ).normalize();
      const back = {
        x: p.position.x - dir.x * 0.42,
        y: p.position.y - dir.y * 0.42,
        z: p.position.z - dir.z * 0.42,
      };
      const trailBack = {
        x: p.position.x - dir.x * 1.15,
        y: p.position.y - dir.y * 1.15,
        z: p.position.z - dir.z * 1.15,
      };
      view.core.visible = view.trail.visible = true;
      segment(view.core, back, p.position, 0.045);
      segment(view.trail, trailBack, p.position, 0.07);
    }
    for (; slot < bullets.length; slot++)
      bullets[slot].core.visible = bullets[slot].trail.visible = false;
    const muzzle = muzzleAt(time, 0, 1.14, 1.7),
      end = { x: target.x - 0.28, y: 1.15, z: target.z };
    beams.forEach(({ mesh, radius }) => {
      mesh.visible = beam;
      if (beam)
        segment(mesh, muzzle, end, radius * (1 + Math.sin(time * 72) * 0.09));
    });
    const events = impactsBetween(previous, time, mode);
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
    contactLight.intensity = beam ? 2.2 : hitFade * 3;
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
        r.mesh.scale.setScalar(0.25 + age * 2.2);
        r.mesh.material.opacity = (1 - age / 0.48) * 0.38;
      }
    });
    smoke.forEach((s) => {
      const age = time - s.at;
      s.mesh.visible = age >= 0 && age < 1.3;
      if (s.mesh.visible) {
        s.mesh.position.copy(s.origin);
        s.mesh.position.y += age * 0.8;
        s.mesh.scale.setScalar(0.13 + age * 0.35);
        s.mesh.rotation.y = age;
        s.mesh.material.opacity = (1 - age / 1.3) * 0.12;
      }
    });
    label($("tower-label"), [TOWER_POSITION.x, 3.0, TOWER_POSITION.z]);
    label($("enemy-label"), [target.x, 2.45, target.z]);
    if (time - lastUi > 0.1 || lastUi < 0) {
      $("hit-count").textContent = String(hits);
      $("elapsed").textContent =
        `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
      $("health-bar").style.width = `${100 - ((hits % 28) / 28) * 100}%`;
      $("weapon-name").textContent =
        weapon === "projectile" ? "Kinetik mermi" : "Enerji ışını";
      $("weapon-description").textContent =
        weapon === "projectile"
          ? "Namlu parlaması, iz ve metal kıvılcımları."
          : "Kesintili enerji akışı, sıcak çekirdek ve temas parlaması.";
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

try {
  start();
} catch (error) {
  console.error("3D preview could not start", error);
  loading.textContent =
    "3D önizleme başlatılamadı. WebGL destekleyen bir tarayıcıda donanım hızlandırmasını kontrol edip sayfayı yenileyebilirsin.";
}
