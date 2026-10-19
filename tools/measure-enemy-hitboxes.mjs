/**
 * Dusman isabet kutulari: gorunen govdeden olculen, govdeyle donen dis
 * bukey cokgen.
 *
 * Sahibin karari (2026-10): isabet kutusu gorunen govdeyle ayni olmali ve
 * govdeyle birlikte donmeli. Dusman dokulari 512'lik kare; govde ortada,
 * cevresi saydam bosluk. Bu arac istemcinin cizebildigi her dusman dokusunun
 * gorunen maskesini olcup `packages/shared/src/enemy-hitboxes.ts`yi yaziyor:
 * sunucu ve istemci ayni tablodan okusun, elle yazilmis sayi dokudan
 * kaymasin. Doku degisince bu arac yeniden calistirilir; olcum oyunda degil
 * burada, sunucuya yuk yok.
 *
 * Yon: istemci dokuyu yuruyus yonune ceviriyor (GameScene
 * `getEnemySpriteRotation`: aci = atan2(hareket) - 90 derece), yani dokunun
 * +y ekseni yuruyus yonu, +x ekseni onun sagi (dunyada `(hy, -hx)`).
 * Sunucu yonu dusmanin konum degisiminden biliyor (`enemy-body`).
 *
 * Govde: maskenin dis bukey zarfi (piksel karelerinin koseleri), disariya
 * dogru en fazla `MAX_VERTICES` koseye indirilmis: zarf ile zarfin `pay`
 * kadar sisirilmis hali arasinda kalan, zarfa teget kenarli cokgen (teget
 * yuruyusu; pay ikili aramayla en kucuk). Cokgen hep zarfi kapsiyor, hicbir
 * yerde zarfin icine girmiyor (gec vurus yok); zarftan en fazla `pay`
 * tasiyor (raporda). Bounding box elipsi (eski govde) sivri burunlarda ve
 * koseli zirhlarda kenardan 2-4 birim sapiyordu; cokgen zarfi birkac piksel
 * icinde tutuyor. Zarfin doldurdugu oyuklar (bacak arasi, kanat dibi)
 * raporda alan olarak: dis bukey govde oralarda gorunenden once degiyor.
 *
 * Maske: alfa >= 128 (kenarin yari ortusu, kenarin gozle durdugu yer).
 * Dokularda yumusak hale ya da golge yok: alfa 8-127 pikseller govdeye en
 * fazla 3 piksel (kosucularin alevi ve kirintisinda 14) uzak kenar
 * yumusatmasi; alfa 1-7 lekeler (bombaci ve hasatcilarda govdeden 160
 * piksele kadar) arka plan temizliginin artigi, ekranda gorunmuyor.
 * Govdeden kopuk ve ana govdenin %0,5'inden kucuk parcalar (4. boyut
 * kirintilari, kor kivilcimlari, tek tuk piksel) govde sayilmiyor; buyuk
 * kopuk parcalar (4. boyut kaba zirhinin plakalari, dusmus halesi) sayiliyor.
 *
 * Calistirma: node tools/measure-enemy-hitboxes.mjs           (dosyayi yazar, raporu basar)
 *             node tools/measure-enemy-hitboxes.mjs --check   (guncel degilse 1 ile cikar)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENEMY_IMAGE_DIR = resolve(root, "apps/web/public/images/enemies");
const OUTPUT = resolve(root, "packages/shared/src/enemy-hitboxes.ts");
const OUTPUT_LABEL = "packages/shared/src/enemy-hitboxes.ts";

/** Istemcinin dokuyu cizdigi kare (GameScene olcegi `/ ENEMY_TEXTURE_SIZE` ile kuruyor; boy `enemy-display`). */
const TEXTURE_SIZE = 512;
/** Gorunen govdenin alfa esigi. */
const ALPHA_THRESHOLD = 128;
/** Govdeden kopuk parcanin govde sayilmasi icin ana govdeye gore en kucuk alani. */
const MIN_PART_SHARE = 0.005;
/**
 * Cokgenin en fazla kose sayisi: sunucu her aday govdede kenar basina bir
 * iki carpma yapiyor (O(kose)); 12 kosede zarftan tasma birkac piksel.
 */
const MAX_VERTICES = 12;
/**
 * Tasma payinin tabani (piksel, piyadede 0,02 birim): pay bunun altina
 * inmiyor, gorunur farki olmayan koseler sunucuya maliyet olmasin.
 */
const FREE_REMOVAL_ERROR = 0.5;
/**
 * Yuvarlamaya karsi pay (piksel): koseler dort ondalikla (yari kenarin
 * 1/10000'i, 0,026 piksel) yaziliyor; cokgen once bu kadar disariya
 * aciliyor ki yuvarlanmis kose zarfin icine dusmesin (arac dogruluyor).
 */
const ROUNDING_MARGIN = 0.06;
/** Raporun dunya birimi: meka piyadesinin cizilen kenari (34 x 0,675). */
const REPORT_SIDE = 34 * 0.675;
/** Bombaci gorsel olceginin esigi: eski GameScene `BOMBER_ART_SCALE` tablosu bu esikle olculmustu. */
const BOMBER_ART_ALPHA = 32;

// PreloaderScene'in yukledigi dusman dokulari: her irkin dort turu (meka
// oneksiz, `enemy-grunt`), bombacisi ve hasatcisi. Kusatma kocu brute
// dokusunu kullaniyor (paylasilan `getEnemyTextureKey`), kendi dokusu yok.
const RACES = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
const TYPE_ARTS = ["grunt", "brute", "runner", "shooter"];
const SPECIAL_ARTS = ["bomber", "harvester"];
const ARTS = [...TYPE_ARTS, ...SPECIAL_ARTS];
const TYPE_ART_ALIASES = { siege: "brute" };

function textureKey(race, art) {
  return race === "meka" && TYPE_ARTS.includes(art) ? `enemy-${art}` : `enemy-${race}-${art}`;
}

// --- Kaynakla capraz denetim --------------------------------------------------------

function readUnion(file, name) {
  const source = readFileSync(resolve(root, file), "utf8");
  const match = new RegExp(`export type ${name} = ([^;]+);`).exec(source);
  if (!match) throw new Error(`${file}: ${name} bulunamadi`);
  return [...match[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

function readConstArray(file, name) {
  const source = readFileSync(resolve(root, file), "utf8");
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
  if (!match) throw new Error(`${file}: ${name} bulunamadi`);
  return [...match[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/**
 * Yeni bir irk, tur ya da doku eklenince arac sessizce eksik tablo yazmasin:
 * paylasilan tipler ve on yukleyicinin listeleri buradakiyle ayni olmali.
 */
function checkSourcesAgree() {
  const races = readUnion("packages/shared/src/combat.ts", "EnemyRace");
  if (!sameSet(races, RACES)) throw new Error(`EnemyRace (${races.join(", ")}) ile aracin irklari (${RACES.join(", ")}) ayni degil`);
  const types = readUnion("packages/shared/src/index.ts", "EnemyType").map((type) => TYPE_ART_ALIASES[type] ?? type);
  if (!sameSet([...new Set(types)], TYPE_ARTS)) throw new Error(`EnemyType dokulari (${[...new Set(types)].join(", ")}) ile aracin turleri (${TYPE_ARTS.join(", ")}) ayni degil`);
  const preloader = "apps/web/src/scenes/PreloaderScene.ts";
  const preloadRaces = ["meka", ...readConstArray(preloader, "ENEMY_RACE_TEXTURES")];
  if (!sameSet(preloadRaces, RACES)) throw new Error(`${preloader} irklari (${preloadRaces.join(", ")}) ile aracin irklari ayni degil`);
  const preloadTypes = readConstArray(preloader, "ENEMY_TYPE_TEXTURES");
  if (!sameSet(preloadTypes, TYPE_ARTS)) throw new Error(`${preloader} turleri (${preloadTypes.join(", ")}) ile aracin turleri ayni degil`);
}

// --- PNG cozucu (yalnizca zlib; resim kutuphanesi yok) --------------------------------

export function decodePng(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: PNG degil`);
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`${path}: araya serpistirilmis PNG desteklenmiyor`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  // Alfa kanalli 8 bit (RGBA ya da gri + alfa); oyunun butun dusman dokulari RGBA.
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 4)) {
    throw new Error(`${path}: ${bitDepth} bit / renk turu ${colorType} desteklenmiyor (8 bit RGBA bekleniyor)`);
  }
  const bpp = colorType === 6 ? 4 : 2;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? pixels[out + x - bpp] : 0;
      const b = y > 0 ? pixels[out - stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[out - stride + x - bpp] : 0;
      let value = raw[rowStart + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + x] = value & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) alpha[i] = pixels[i * bpp + bpp - 1];
  return { width, height, alpha };
}

// --- Maske ---------------------------------------------------------------------------

/** 8 komsulu bilesenler; donen etiket dizisi ve bilesen alanlari. */
function labelComponents(mask, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const areas = [];
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = areas.length;
    let area = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop();
      area += 1;
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && label[next] < 0) {
            label[next] = id;
            stack.push(next);
          }
        }
      }
    }
    areas.push(area);
  }
  return { label, areas };
}

/** Gorunen govde: esigi gecen ve ana govdeye gore yeterince buyuk parcalar. */
export function bodyMask(image, threshold = ALPHA_THRESHOLD) {
  const { width, height, alpha } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = alpha[i] >= threshold ? 1 : 0;
  const { label, areas } = labelComponents(mask, width, height);
  if (areas.length === 0) throw new Error("bos doku");
  const mainArea = Math.max(...areas);
  const keep = areas.map((area) => area >= mainArea * MIN_PART_SHARE);
  let dropped = 0;
  let droppedArea = 0;
  let area = 0;
  for (let id = 0; id < areas.length; id += 1) {
    if (keep[id]) area += areas[id];
    else {
      dropped += 1;
      droppedArea += areas[id];
    }
  }
  for (let i = 0; i < mask.length; i += 1) if (mask[i] && !keep[label[i]]) mask[i] = 0;
  return { mask, area, parts: areas.length - dropped, dropped, droppedArea };
}

// --- Dis bukey cokgen ----------------------------------------------------------------

const cross = (ox, oy, ax, ay, bx, by) => (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);

/**
 * Maskenin piksel karelerinin dis bukey zarfi, kare merkezine gore (piksel;
 * x dokunun +x'i, y +y'si), saat yonunun tersine ([x, y] ciftleri). Her
 * satirin en soldaki ve en sagdaki pikselinin koseleri yetiyor.
 */
export function maskHull(mask, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const points = [];
  for (let y = 0; y < height; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0) continue;
    points.push([left - cx, y - cy], [left - cx, y + 1 - cy], [right + 1 - cx, y - cy], [right + 1 - cx, y + 1 - cy]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(...out[out.length - 2], ...out[out.length - 1], ...point) <= 0) out.pop();
      out.push(point);
    }
    return out;
  };
  const lower = chain(points);
  const upper = chain([...points].reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    area += ax * by - ay * bx;
  }
  return area / 2;
}

/** Noktanin dis bukey cokgene (saat yonunun tersine) uzakligi; icerdeyse 0. */
export function distanceToConvex(px, py, polygon) {
  let best = Infinity;
  let outside = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    if (cross(ax, ay, bx, by, px, py) >= 0) continue;
    outside = true;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(ax + ex * t - px, ay + ey * t - py));
  }
  return outside ? best : 0;
}

/** Zarfin kenarlari: disa bakan birim normaller, ofsetler ve kenar yonleri (aramalar bunlari okuyor). */
function prepareHull(hull) {
  const n = hull.length;
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % n];
    const length = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / length;
    const ny = -(bx - ax) / length;
    edges.push({ ax, ay, nx, ny, h: nx * ax + ny * ay, ex: (bx - ax) / length, ey: (by - ay) / length, length });
  }
  return { hull, edges };
}

/**
 * Zarfin `margin` kadar sisirilmis halinin (yuvarlak koseli) icinden cikan
 * isinin cikis noktasi: koseleri keskin sisirilmis cokgenden cikis ve cikis
 * bir kosenin bolgesindeyse o kosenin dairesi. Isinin basi sisirilmis
 * zarfin icinde olmali (teget noktasi).
 */
function rayExit(prepared, ox, oy, dx, dy, margin) {
  let exit = Infinity;
  let edge;
  for (const candidate of prepared.edges) {
    const den = candidate.nx * dx + candidate.ny * dy;
    if (!(den > 1e-15)) continue;
    const t = (candidate.h + margin - candidate.nx * ox - candidate.ny * oy) / den;
    if (t < exit) {
      exit = t;
      edge = candidate;
    }
  }
  const qx = ox + dx * exit;
  const qy = oy + dy * exit;
  const along = (qx - edge.ax) * edge.ex + (qy - edge.ay) * edge.ey;
  if (along >= 0 && along <= edge.length) return [qx, qy];
  const index = prepared.edges.indexOf(edge);
  const [cx, cy] = prepared.hull[along < 0 ? index : (index + 1) % prepared.hull.length];
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const t = -b + Math.sqrt(Math.max(0, b * b - (fx * fx + fy * fy - margin * margin)));
  return [ox + dx * t, oy + dy * t];
}

/** Disaridaki noktadan zarfa saat yonunun tersine giden teget: butun koseler dogrunun solunda (esitlikte uzak kose). */
function tangentPoint(hull, qx, qy) {
  let best = hull[0];
  for (const point of hull) {
    const side = cross(qx, qy, best[0], best[1], point[0], point[1]);
    if (side < -1e-9 || (Math.abs(side) <= 1e-9 && Math.hypot(point[0] - qx, point[1] - qy) > Math.hypot(best[0] - qx, best[1] - qy))) best = point;
  }
  return best;
}

const keepsHullOnLeft = (hull, ax, ay, bx, by) => hull.every(([x, y]) => cross(ax, ay, bx, by, x, y) >= -1e-7);

function isConvex(polygon) {
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const [cx, cy] = polygon[(i + 2) % polygon.length];
    if (cross(ax, ay, bx, by, cx, cy) < -1e-9) return false;
  }
  return true;
}

/**
 * Zarf ile `margin` kadar sisirilmis zarf arasinda kalan cokgen, bir baslangic
 * yonunden: baslangic kosesi sisirilmis zarfin o yondeki noktasi; her kose
 * zarfa teget dogru boyunca sisirilmis zarfin kenarina kadar uzaniyor;
 * kapanan kenar zarfi kesmeyince bitiyor. Kenarlar zarfa degiyor ya da
 * disinda (zarf icerde kaliyor), koseler zarftan tam `margin` uzakta.
 */
function tangentWalk(prepared, margin, direction) {
  const { hull } = prepared;
  const ux = Math.cos(direction);
  const uy = Math.sin(direction);
  let support = hull[0];
  for (const point of hull) if (point[0] * ux + point[1] * uy > support[0] * ux + support[1] * uy) support = point;
  const start = [support[0] + ux * margin, support[1] + uy * margin];
  const polygon = [start];
  let current = start;
  for (let step = 0; step < 4 * MAX_VERTICES; step += 1) {
    if (polygon.length >= 3 && keepsHullOnLeft(hull, current[0], current[1], start[0], start[1])) return isConvex(polygon) ? polygon : undefined;
    const tangent = tangentPoint(hull, current[0], current[1]);
    const length = Math.hypot(tangent[0] - current[0], tangent[1] - current[1]);
    current = rayExit(prepared, tangent[0], tangent[1], (tangent[0] - current[0]) / length, (tangent[1] - current[1]) / length, margin);
    polygon.push(current);
  }
  return undefined;
}

/** Baslangic yonlerinin sayisi: en az koseli (esitlikte en kucuk alanli) yuruyus seciliyor. */
const WALK_STARTS = 120;

function bestWalk(prepared, margin) {
  let best;
  for (let index = 0; index < WALK_STARTS; index += 1) {
    const polygon = tangentWalk(prepared, margin, (2 * Math.PI * index) / WALK_STARTS);
    if (!polygon) continue;
    if (!best || polygon.length < best.length || (polygon.length === best.length && polygonArea(polygon) < polygonArea(best))) best = polygon;
  }
  return best;
}

/**
 * Zarfi kapsayan, en fazla `MAX_VERTICES` koseli ve zarfa en az tasan dis
 * bukey cokgen: tasma payi ikili aramayla (her payda teget yuruyusu, iki ic
 * ice dis bukey cokgen arasinda en az koseli cokgene en fazla bir kose
 * uzak). Pay `FREE_REMOVAL_ERROR`un altinda kaliyorsa o paya kadar
 * genisletiliyor: gorunur farki olmayan kose sunucuya maliyet olmasin.
 * Donen `error` koselerin zarfa en buyuk uzakligi (piksel).
 */
export function simplifyOutward(hull) {
  const prepared = prepareHull(hull);
  let low = 0;
  let high = 64;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    const polygon = bestWalk(prepared, middle);
    if (polygon && polygon.length <= MAX_VERTICES) high = middle;
    else low = middle;
  }
  const polygon = bestWalk(prepared, Math.max(high, FREE_REMOVAL_ERROR));
  let error = 0;
  for (const [x, y] of polygon) error = Math.max(error, distanceToConvex(x, y, hull));
  return { polygon, error };
}

/** Cokgenin kenarlarini `margin` kadar disariya acar (komsu kenarlarin kesisimi). */
function offsetOutward(polygon, margin) {
  const n = polygon.length;
  const normals = polygon.map(([ax, ay], i) => {
    const [bx, by] = polygon[(i + 1) % n];
    const length = Math.hypot(bx - ax, by - ay);
    return [(by - ay) / length, -(bx - ax) / length];
  });
  return polygon.map(([x, y], i) => {
    const [n0x, n0y] = normals[(i - 1 + n) % n];
    const [n1x, n1y] = normals[i];
    const k = margin / (1 + n0x * n1x + n0y * n1y);
    return [x + (n0x + n1x) * k, y + (n0y + n1y) * k];
  });
}

// Yuvarlaninca sifira inen eksi deger "-0.0000" yazilmasin.
const fixed = (value) => (Math.abs(value) < 0.00005 ? 0 : value).toFixed(4);

/**
 * Dokunun govde cokgeni: maske, zarf, disariya indirme, yuvarlama payi.
 * Donen `outline` yari kenara oranli dort ondalikli koseler (dosyaya
 * yazilan); `hull` ve olcumler rapor icin. Yuvarlanmis cokgenin zarfin
 * her kosesini kapsadigi dogrulaniyor.
 */
export function measurePolygon(image, threshold = ALPHA_THRESHOLD) {
  const { width, height } = image;
  const { mask, area, parts, dropped, droppedArea } = bodyMask(image, threshold);
  const hull = maskHull(mask, width, height);
  const { polygon, error } = simplifyOutward(hull);
  const half = width / 2;
  const outline = offsetOutward(polygon, ROUNDING_MARGIN).map(([x, y]) => [Number(fixed(x / half)), Number(fixed(y / half))]);
  // Yuvarlanmis cokgen zarfi kapsiyor mu (kenarin ic yaninda ya da ustunde).
  for (let i = 0; i < outline.length; i += 1) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    for (const [hx, hy] of hull) {
      if (cross(ax * half, ay * half, bx * half, by * half, hx, hy) < -1e-9) {
        throw new Error(`yuvarlanmis cokgen zarfin kosesini (${hx}, ${hy}) disarida birakiyor`);
      }
    }
  }
  if (polygonArea(outline) <= 0) throw new Error("cokgen saat yonunun tersine degil");
  const outlinePixels = outline.map(([x, y]) => [x * half, y * half]);
  let outward = 0;
  for (const [x, y] of outlinePixels) outward = Math.max(outward, distanceToConvex(x, y, hull));
  return {
    outline,
    hull,
    mask,
    hullVertices: hull.length,
    error,
    outward,
    maskArea: area,
    hullArea: polygonArea(hull),
    polygonArea: polygonArea(outlinePixels),
    parts,
    dropped,
    droppedArea
  };
}

/** Bounding box'in uzun kenari (piksel), eski GameScene `BOMBER_ART_SCALE` olcumuyle ayni. */
function longestVisibleSide(image, threshold) {
  const { width, height, alpha } = image;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

// --- Yazim ---------------------------------------------------------------------------

function render(rows, bomberScales) {
  const keys = rows.map((row) => row.key);
  const lines = [];
  lines.push(
    "/**",
    " * URETILMIS DOSYA -- elle duzenleme; dokular degisince yeniden uret:",
    " *   node tools/measure-enemy-hitboxes.mjs          (yazar)",
    " *   node tools/measure-enemy-hitboxes.mjs --check  (guncel mi)",
    " * Kaynak: apps/web/public/images/enemies/*.png (" + TEXTURE_SIZE + " kare). Yontem aracin",
    " * basinda: alfa >= " + ALPHA_THRESHOLD + " maske, ana govdenin %" + (MIN_PART_SHARE * 100).toFixed(1).replace(".", ",") + "'inden kucuk kopuk parcalar",
    " * haric; maskenin dis bukey zarfi, disariya dogru en fazla " + MAX_VERTICES + " koseye",
    " * indirilmis (zarfin icine hic girmiyor).",
    " *",
    " * Koseler cizilen karenin yari kenarina oranli: dunya olcusu = oran *",
    " * cizilen kenar / 2. Cizilen kenar istemcide `getEnemySpriteDisplaySize`",
    " * x sampiyon / ruh cekici olcegi x bombaci gorsel olcegi x havada 1,28",
    " * (`enemy-display`; GameScene ve sunucu ayni fonksiyonlardan). Eksenler",
    " * dokunun: x yana (yonun sagi), y ileri (istemcinin dondurdugu yuruyus",
    " * yonu); koseler saat yonunun tersine.",
    " */",
    "import type { EnemyRace } from \"./combat.js\";",
    "",
    "/** Olculen doku karesi (piksel); istemci olcegi bununla kuruyor. */",
    `export const ENEMY_TEXTURE_SIZE = ${TEXTURE_SIZE};`,
    "",
    "/** Dokunun govde turu: dort savas turu (kusatma kocu brute dokusunda), bombaci ve hasatci. */",
    `export type EnemyHitboxArt = ${ARTS.map((art) => `"${art}"`).join(" | ")};`,
    "",
    "/** Olculen dokularin anahtari (PreloaderScene'in yukledigi adlar). */",
    "export type EnemyHitboxTextureKey =",
    ...keys.map((key, index) => `  | "${key}"${index === keys.length - 1 ? ";" : ""}`),
    "",
    "/** Gorunen govdenin dis bukey cokgeni: duz `[x0, y0, x1, y1, ...]` (x yana, y ileri; yari kenara oranli). */",
    "export type EnemyBodyOutline = readonly number[];",
    "",
    "/** Irk ve govde turune gore cokgen (sunucu ve istemci modul yuklenirken bir kez kuruyor). */",
    "export const ENEMY_BODY_OUTLINES: Readonly<Record<EnemyRace, Readonly<Record<EnemyHitboxArt, EnemyBodyOutline>>>> = {"
  );
  RACES.forEach((race, raceIndex) => {
    lines.push(`  ${race}: {`);
    ARTS.forEach((art, artIndex) => {
      const row = rows.find((entry) => entry.race === race && entry.art === art);
      const values = row.outline.flatMap(([x, y]) => [fixed(x), fixed(y)]).join(", ");
      lines.push(`    ${art}: [${values}]${artIndex === ARTS.length - 1 ? "" : ","}`);
    });
    lines.push(`  }${raceIndex === RACES.length - 1 ? "" : ","}`);
  });
  lines.push(
    "};",
    "",
    "/**",
    " * Bombacinin gorunen uzun kenarini irkin piyadesine esitleyen gorsel olcek",
    " * (alfa >= " + BOMBER_ART_ALPHA + ", bounding box'in uzun kenari: piyade / bombaci). Istemci",
    " * dokuyu bununla ciziyor, isabet govdesi de (`getEnemyArtScale`).",
    " */",
    "export const ENEMY_BOMBER_ART_SCALE: Readonly<Record<EnemyRace, number>> = {"
  );
  RACES.forEach((race, raceIndex) => {
    const scale = bomberScales[race];
    lines.push(`  ${race}: ${scale.grunt} / ${scale.bomber}${raceIndex === RACES.length - 1 ? "" : ","}`);
  });
  lines.push("};", "");
  return lines.join("\n");
}

// --- Akis ------------------------------------------------------------------------------

/** Dokularin olcumu (yazim, `--check` ve rapor ayni sayilardan). */
export function measureAll() {
  checkSourcesAgree();
  const rows = [];
  const bomberScales = {};
  const images = new Map();
  const load = (key) => {
    if (!images.has(key)) {
      const path = resolve(ENEMY_IMAGE_DIR, `${key}.png`);
      if (!existsSync(path)) throw new Error(`doku yok: ${path}`);
      const image = decodePng(path);
      if (image.width !== TEXTURE_SIZE || image.height !== TEXTURE_SIZE) {
        throw new Error(`${key}: ${image.width}x${image.height}; istemci olcegi ${TEXTURE_SIZE} kare varsayiyor`);
      }
      images.set(key, image);
    }
    return images.get(key);
  };
  for (const race of RACES) {
    for (const art of ARTS) {
      const key = textureKey(race, art);
      const image = load(key);
      rows.push({ key, race, art, ...measurePolygon(image), image });
    }
    bomberScales[race] = {
      grunt: longestVisibleSide(load(textureKey(race, "grunt")), BOMBER_ART_ALPHA),
      bomber: longestVisibleSide(load(textureKey(race, "bomber")), BOMBER_ART_ALPHA)
    };
  }
  return { rows, bomberScales };
}

function main() {
  const check = process.argv.includes("--check");
  const { rows, bomberScales } = measureAll();
  const used = new Set(rows.map((row) => `${row.key}.png`));
  const unused = readdirSync(ENEMY_IMAGE_DIR).filter((file) => file.endsWith(".png") && !used.has(file));

  const content = render(rows, bomberScales);
  if (check) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== content) {
      console.error(`${OUTPUT_LABEL} guncel degil: node tools/measure-enemy-hitboxes.mjs`);
      process.exit(1);
    }
    console.log(`${OUTPUT_LABEL} guncel (${rows.length} doku).`);
    return;
  }
  writeFileSync(OUTPUT, content);
  console.log(`${OUTPUT_LABEL} yazildi (${rows.length} doku).`);
  // Rapor: dunya birimleri meka piyadesinin cizilen kenarinda (22,95; 1
  // piksel 0,045 birim). Tasma: cokgenin zarftan en uzak noktasi (yuvarlama
  // payi dahil). Oyuk: zarfin maskede olmayan alani, maskenin yuzdesi.
  const world = (pixels) => (pixels * REPORT_SIDE / TEXTURE_SIZE).toFixed(2);
  console.table(rows.map((row) => ({
    key: row.key,
    "kose (zarf)": `${row.outline.length} (${row.hullVertices})`,
    "tasma px / birim": `${row.outward.toFixed(2)} / ${world(row.outward)}`,
    "oyuk %": ((row.hullArea - row.maskArea) / row.maskArea * 100).toFixed(1),
    "cokgen fazlasi %": ((row.polygonArea - row.hullArea) / row.maskArea * 100).toFixed(1),
    parts: row.parts,
    dropped: row.dropped ? `${row.dropped} (${row.droppedArea} px)` : ""
  })));
  if (unused.length > 0) console.log(`Oyunun yuklemedigi dokular (olculmedi): ${unused.join(", ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
