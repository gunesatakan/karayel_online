/**
 * Arena kamerasi.
 *
 * Haritanin tamami ekranda gorunmek zorunda. Varsayilan arena 12 sutun x 34 px
 * = 408 px genisliginde, kameranin gordugu serit ise 390 px: sigdirma yapilmazsa
 * harita iki yanindan kirpilir ve en soldaki karenin dis kenari ekranin disinda
 * kalir. Bu testler cerceveyi Phaser'in gercek kamera matematigiyle -- centerOn,
 * clampX/clampY ve preRender'daki worldView hesabiyla -- yeniden kurup haritanin
 * her kenarinin gorunur kaldigini sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  createDefaultEditableMap,
  createOpenArenaMap,
  getArenaCameraView,
  getMapWorldBounds
} from "../packages/shared/dist/index.js";

/** MatchRoom.configureArenaForScale ile ayni olcekler. */
const ARENA_SIZES = [
  { cols: 12, rows: 18 },
  { cols: 15, rows: 27 },
  { cols: 20, rows: 32 },
  { cols: 23, rows: 36 }
];

/** RENDER_SCALE = min(devicePixelRatio, 2) araligi. */
const RENDER_SCALES = [1, 1.25, 1.5, 2];

/**
 * Phaser'in gorunur dunya dikdortgeni.
 *
 * Formuller phaser/src/cameras/2d/BaseCamera.js (clampX/clampY, displayWidth)
 * ve Camera.js (preRender) kaynagindan birebir alindi.
 */
function phaserWorldView({ viewportWidth, viewportHeight, zoom, bounds, centerX, centerY }) {
  const displayWidth = viewportWidth / zoom;
  const displayHeight = viewportHeight / zoom;

  // centerOnX / centerOnY
  let scrollX = centerX - viewportWidth * 0.5;
  let scrollY = centerY - viewportHeight * 0.5;

  // clampX / clampY
  const bx = bounds.x + (displayWidth - viewportWidth) / 2;
  const bw = Math.max(bx, bx + bounds.width - displayWidth);
  scrollX = Math.min(Math.max(scrollX, bx), bw);
  const by = bounds.y + (displayHeight - viewportHeight) / 2;
  const bh = Math.max(by, by + bounds.height - displayHeight);
  scrollY = Math.min(Math.max(scrollY, by), bh);

  // preRender
  const midX = scrollX + viewportWidth * 0.5;
  const midY = scrollY + viewportHeight * 0.5;
  const dw = Math.floor(displayWidth + 0.5);
  const dh = Math.floor(displayHeight + 0.5);
  const left = Math.floor(midX - dw / 2 + 0.5);
  const top = Math.floor(midY - dh / 2 + 0.5);
  return { left, top, right: left + dw, bottom: top + dh };
}

/** GameScene.configureArenaCamera ile ayni yapilandirma. */
function configureArenaCamera(map, renderScale) {
  const view = getArenaCameraView(map);
  const padding = TOWER_GRID_SIZE / 2;
  return phaserWorldView({
    viewportWidth: Math.round(GAME_WORLD_WIDTH * renderScale),
    viewportHeight: Math.round(GAME_WORLD_HEIGHT * renderScale),
    zoom: renderScale * view.fit,
    bounds: {
      x: view.left - padding,
      y: view.top - padding,
      width: view.width + padding * 2,
      height: view.height + padding * 2
    },
    centerX: view.left + view.width / 2,
    centerY: view.top + view.height / 2
  });
}

test("varsayilan arena dunya seridinden genis: sigdirma sart", () => {
  const map = createOpenArenaMap(12, 18);
  const bounds = getMapWorldBounds(map);
  assert.equal(bounds.width, 408);
  assert.ok(bounds.width > GAME_WORLD_WIDTH, "12 sutun 390 px'e sigmiyor");
  assert.ok(getArenaCameraView(map).fit < 1, "sigdirma olceginin 1'in altina inmesi gerekir");
});

test("her arena olceginde harita cercevenin icinde kalir", () => {
  for (const size of ARENA_SIZES) {
    const map = createOpenArenaMap(size.cols, size.rows);
    const bounds = getMapWorldBounds(map);
    const view = getArenaCameraView(map);
    const label = `${size.cols}x${size.rows}`;
    assert.ok(view.left <= bounds.left, `${label}: sol kenar cercevenin disinda`);
    assert.ok(view.left + view.width >= bounds.right, `${label}: sag kenar cercevenin disinda`);
    assert.ok(view.top <= bounds.top, `${label}: ust kenar cercevenin disinda`);
    assert.ok(view.top + view.height >= bounds.bottom, `${label}: alt kenar cercevenin disinda`);
  }
});

test("Phaser kamerasi haritanin her kenarini gosterir", () => {
  for (const size of ARENA_SIZES) {
    for (const renderScale of RENDER_SCALES) {
      const map = createOpenArenaMap(size.cols, size.rows);
      const bounds = getMapWorldBounds(map);
      const world = configureArenaCamera(map, renderScale);
      const label = `${size.cols}x${size.rows} @${renderScale}x`;
      assert.ok(world.left <= bounds.left, `${label}: sol kenar kirpiliyor (${world.left} > ${bounds.left})`);
      assert.ok(world.right >= bounds.right, `${label}: sag kenar kirpiliyor (${world.right} < ${bounds.right})`);
      assert.ok(world.top <= bounds.top, `${label}: ust kenar kirpiliyor`);
      assert.ok(world.bottom >= bounds.bottom, `${label}: alt kenar kirpiliyor`);
    }
  }
});

test("harita yerlesim seridinin ortasina oturur", () => {
  // Sigdirma haritayi kucultur. Artan pay ust ve alt arasinda esit paylasilmazsa
  // harita ile kontrol panelinin arasinda tek tarafli bir bosluk kalir.
  for (const size of ARENA_SIZES) {
    const map = createOpenArenaMap(size.cols, size.rows);
    const bounds = getMapWorldBounds(map);
    const view = getArenaCameraView(map);
    const label = `${size.cols}x${size.rows}`;

    const ekranUst = (bounds.top - view.top) * view.fit;
    const ekranAlt = (bounds.bottom - view.top) * view.fit;
    assert.ok(ekranUst >= TOWER_BUILD_TOP - 0.001, `${label}: harita ust cubugun altina tasiyor`);
    assert.ok(ekranAlt <= TOWER_BUILD_BOTTOM + 0.001, `${label}: harita kontrol panelinin altina tasiyor`);

    const ustPay = ekranUst - TOWER_BUILD_TOP;
    const altPay = TOWER_BUILD_BOTTOM - ekranAlt;
    assert.ok(Math.abs(ustPay - altPay) < 0.001, `${label}: dikey paylar esit degil`);
  }
});

test("harita ekranda yatay olarak ortalanir", () => {
  for (const size of ARENA_SIZES) {
    const map = createOpenArenaMap(size.cols, size.rows);
    const bounds = getMapWorldBounds(map);
    const view = getArenaCameraView(map);
    const solPay = (bounds.left - view.left) * view.fit;
    const sagPay = (view.left + view.width - bounds.right) * view.fit;
    assert.ok(Math.abs(solPay - sagPay) < 0.001, `${size.cols}x${size.rows}: yatay paylar esit degil`);
    assert.ok(solPay >= -0.001, `${size.cols}x${size.rows}: sol kenar ekranin disinda`);
  }
});

test("odaya baglanmak haritayi cerceve disina tasiramaz", () => {
  // Istemci once kendi varsayilan haritasini cizer (11 sutun, 374 px: dunya
  // seridine zaten sigar), sunucunun arenasi ise 12 sutun. Kamera yalnizca ilk
  // haritaya gore ayarlanirsa oyuncu "baglanana kadar sigiyordu, baglaninca
  // iki yanindan tasti" der -- bildirilen hata tam olarak buydu.
  const asamalar = [
    { ad: "baglanmadan once", map: createDefaultEditableMap() },
    { ad: "baglandiktan sonra", map: createOpenArenaMap(12, 18) }
  ];

  for (const asama of asamalar) {
    const bounds = getMapWorldBounds(asama.map);
    const view = getArenaCameraView(asama.map);
    assert.ok(view.left <= bounds.left + 0.001, `${asama.ad}: sol kenar cerceve disinda`);
    assert.ok(view.left + view.width >= bounds.right - 0.001, `${asama.ad}: sag kenar cerceve disinda`);

    const world = configureArenaCamera(asama.map, 1);
    assert.ok(world.left <= bounds.left, `${asama.ad}: sol kenar kirpiliyor`);
    assert.ok(world.right >= bounds.right, `${asama.ad}: sag kenar kirpiliyor`);
  }

  // Ikinci asama daha genis oldugu icin olcegin kuculmesi sart: fit sabit
  // kalirsa harita ancak kirpilarak sigar.
  assert.ok(
    getArenaCameraView(asamalar[1].map).fit < getArenaCameraView(asamalar[0].map).fit,
    "genisleyen harita icin olcek kuculmemis"
  );
});
