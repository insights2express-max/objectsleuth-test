// The Estate – Study (placeholder Scene for Draft 1).
// A cut-away low-poly diorama: back wall + left wall, open to the front and right.
// Units are roughly metres. Floor is y = 0. Room spans x -4..4, z -3..3, walls 3.2 high.
// Test shortcut: ?swing=1 or ?swing=-1 holds the pendulum at one end (for screenshots).
const TEST_SWING = new URLSearchParams(location.search).has('swing') ? Number(new URLSearchParams(location.search).get('swing')) : null;
import * as THREE from '../../vendor/three/three.module.js';
import { mat, glow, mesh, box, cyl, group, canvasTex } from '../art/kit.js';
import { rng, range, pick } from '../core/random.js';

const C = {
  floorA: 0x8a5a3b, floorB: 0x7f5236, floorC: 0x93613e, slab: 0x3f2a1d,
  wall: 0xd8c39c, plaster: 0xcbb38a, cap: 0xf2e7d2, wainscot: 0x6e4a2e, rail: 0x56381f,
  wood: 0x6b4226, woodDark: 0x4a2c19, woodLight: 0x9a6a42,
  stone: 0xb9b1a3, stoneDark: 0x8a8378, soot: 0x231e1b, logs: 0x5a3a22,
  brass: 0xc9a14a, iron: 0x3a3a3e, cream: 0xf0e2c0, paper: 0xf5f0e3, ink: 0x1d2236,
  green: 0x3f6b4f, greenDark: 0x2e5039, red: 0x8c2f2f, redDark: 0x6c2222,
  terracotta: 0xb5653d, leaf: 0x4f8a3c, leafDark: 0x3a6c2c, blueGlaze: 0x3d6f8f,
};
const BOOK_COLORS = [0x7a2e2e, 0x2e4a7a, 0x2f6b4a, 0x8a6a2a, 0x5a3a6b, 0x3a3a3a,
  0xb08850, 0x9a4a2a, 0x2a5a5a, 0xc0b090, 0x6b2a40, 0x4a5a2a];

export function buildStudy() {
  const r = rng(20261105); // fixed seed: the room looks the same every time
  const root = new THREE.Group();
  const fx = { lamps: [], bulbMats: [], shadeMats: [], flames: [], windowMats: [], openings: [], fireLight: null,
    room: new THREE.Box3(new THREE.Vector3(-4.0, 0, -3.0), new THREE.Vector3(4.0, 3.2, 3.0)) };
  const books = [];

  root.add(buildFloor(r));
  root.add(buildWalls(fx));
  root.add(buildFireplace(r, fx));
  root.add(buildBookcase(r, books, -2.3, { level: 2, keep: 0.55, ornament: 'vase' }));
  root.add(buildBookcase(r, books, 2.3, { level: 3, keep: 0.5, ornament: 'hourglass' }));
  const clock = buildClock();
  clock.group.position.set(-3.62, 0, -2.78);
  root.add(clock.group);
  root.add(buildRug());
  root.add(group([buildDesk(r, fx, books)], 1.5, 0, 0.0));
  root.add(group([buildDeskChair()], 1.5, 0, 0.85, Math.PI));
  root.add(group([buildArmchair()], -3.45, 0, 0.8, Math.PI / 2));
  root.add(group([buildSideTable(r, books)], -3.4, 0, 2.15));
  root.add(group([buildFloorLamp(fx)], -3.55, 0, -0.6));
  const globe = buildGlobe(r);
  globe.group.position.set(3.45, 0, -1.7);
  root.add(globe.group);
  root.add(group([buildPlant(r)], 3.4, 0, 2.4));
  root.add(group([buildChest()], -1.3, 0, 2.3, 0.12));
  root.add(group([buildFireTools()], 1.3, 0, -2.4));
  root.add(group([buildLogBasket()], -1.3, 0, -2.35, 0.2));
  bookStack(r, books, 2.75, 0, 1.45, 5);
  root.add(makeBooks(books));

  return {
    root,
    fx,
    bounds: new THREE.Box3(new THREE.Vector3(-4.2, -0.3, -3.2), new THREE.Vector3(4.0, 3.25, 3.0)),
    // Compass: the room is turned so the left wall faces south-east and the back wall
    // faces south-west (sun through the left window in the morning, the back window in
    // the afternoon, both around noon). See sun.js → compassDir().
    compassTurn: 135,
    animate(t, hours) {
      // flames flicker
      for (const f of fx.flames) {
        const u = f.userData;
        f.scale.y = u.base * (1 + 0.18 * Math.sin(t * 9 + u.phase) + 0.08 * Math.sin(t * 23 + u.phase * 2));
      }
      // clock: real time, and a swinging pendulum
      clock.pend.rotation.z = 0.085 * (TEST_SWING ?? Math.sin(t * Math.PI)); // stays inside the visible opening
      // (follows the test clock when it is in use)
      const m = (hours * 60) % 60;
      clock.minute.rotation.z = -(m / 60) * Math.PI * 2;
      clock.hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
      // globe turns slowly
      globe.ball.rotation.y = t * 0.12;
    },
  };
}

// ---------------------------------------------------------------- floor & walls
function buildFloor(r) {
  const g = new THREE.Group();
  g.add(box(8.2, 0.28, 6.2, C.slab, -0.1, -0.3, -0.1));
  const rows = 15, pw = 6 / rows, shades = [C.floorA, C.floorB, C.floorC];
  for (let i = 0; i < rows; i++) {
    const z = -3 + pw * (i + 0.5);
    const cut = range(r, -2.5, 2.5); // planks are joined at a random point in each row
    const a = box(cut + 4 - 0.005, 0.02, pw - 0.012, pick(r, shades), (-4 + cut) / 2, -0.02, z);
    const b = box(4 - cut - 0.005, 0.02, pw - 0.012, pick(r, shades), (cut + 4) / 2, -0.02, z);
    a.castShadow = b.castShadow = false;
    g.add(a, b);
  }
  return g;
}

function buildWalls(fx) {
  const g = new THREE.Group();
  const H = 3.2;
  // back wall, built around a tall narrow window opening (x 3.3..3.9, y 0.9..2.6)
  const bw = (x0, x1, y0, y1) => g.add(box(x1 - x0, y1 - y0, 0.2, C.wall, (x0 + x1) / 2, y0, -3.1));
  bw(-4.2, 3.3, 0, H); bw(3.9, 4.0, 0, H); bw(3.3, 3.9, 0, 0.9); bw(3.3, 3.9, 2.6, H);
  // left wall, built around a window opening (z 0..1.6, y 0.9..2.6)
  const lw = (z0, z1, y0, y1) => g.add(box(0.2, y1 - y0, z1 - z0, C.wall, -4.1, y0, (z0 + z1) / 2));
  lw(-3.0, 0.0, 0, H); lw(1.6, 3.0, 0, H); lw(0.0, 1.6, 0, 0.9); lw(0.0, 1.6, 2.6, H);
  // cut-away caps on top of the walls (the classic diorama look)
  const capB = box(8.2, 0.02, 0.2, C.cap, -0.1, H, -3.1), capL = box(0.2, 0.02, 6, C.cap, -4.1, H, 0);
  capB.castShadow = capL.castShadow = false;
  g.add(capB, capL);
  // wood panelling on the lower walls
  g.add(box(8.0, 0.9, 0.03, C.wainscot, 0, 0, -2.985));
  g.add(box(8.0, 0.05, 0.07, C.rail, 0, 0.88, -2.965));
  g.add(box(0.03, 0.9, 6.0, C.wainscot, -3.985, 0, 0));
  g.add(box(0.07, 0.05, 6.0, C.rail, -3.965, 0.88, 0));
  for (let x = -3.6; x < 4; x += 0.8) g.add(box(0.05, 0.74, 0.02, C.rail, x, 0.07, -2.96));
  for (let z = -2.6; z < 3; z += 0.8) g.add(box(0.02, 0.74, 0.05, C.rail, -3.96, 0.07, z));
  // picture rail
  g.add(box(8.0, 0.04, 0.04, C.rail, 0, 2.7, -2.98));
  g.add(box(0.04, 0.04, 6.0, C.rail, -3.98, 2.7, 0));

  // window frame, glass, sill
  const fm = C.cream;
  g.add(box(0.22, 0.07, 1.6, fm, -4.1, 2.53, 0.8));
  g.add(box(0.22, 0.07, 1.6, fm, -4.1, 0.9, 0.8));
  g.add(box(0.22, 1.7, 0.07, fm, -4.1, 0.9, 0.035));
  g.add(box(0.22, 1.7, 0.07, fm, -4.1, 0.9, 1.565));
  g.add(box(0.05, 1.7, 0.04, fm, -4.1, 0.9, 0.8));
  g.add(box(0.05, 0.04, 1.6, fm, -4.1, 1.72, 0.8));
  g.add(box(0.32, 0.07, 1.8, fm, -3.95, 0.875, 0.8));   // sill top 0.945, above the chair rail (0.93)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcfe6f2, emissive: 0xdff3ff, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.35, roughness: 0.1, flatShading: true,
  });
  const glass = mesh(new THREE.BoxGeometry(0.01, 1.7, 1.6), glassMat, false);
  glass.position.set(-4.12, 1.75, 0.8);
  g.add(glass);
  fx.windowMats.push(glassMat);
  // back window (south-west facing): frame, glass, sill
  g.add(box(0.6, 0.07, 0.22, fm, 3.6, 2.53, -3.1));
  g.add(box(0.6, 0.07, 0.22, fm, 3.6, 0.9, -3.1));
  g.add(box(0.07, 1.7, 0.22, fm, 3.335, 0.9, -3.1));
  g.add(box(0.07, 1.7, 0.22, fm, 3.865, 0.9, -3.1));
  g.add(box(0.04, 1.7, 0.05, fm, 3.6, 0.9, -3.1));
  g.add(box(0.6, 0.04, 0.05, fm, 3.6, 1.72, -3.1));
  g.add(box(0.74, 0.07, 0.3, fm, 3.6, 0.875, -2.95));
  const glass2 = mesh(new THREE.BoxGeometry(0.6, 1.7, 0.01), glassMat.clone(), false);
  glass2.position.set(3.6, 1.75, -3.12);
  g.add(glass2);
  fx.windowMats.push(glass2.material);
  // Where sunlight can come in (used for the light shafts). n = outward direction.
  fx.openings.push(
    { c: new THREE.Vector3(-4.1, 1.75, 0.8), u: new THREE.Vector3(0, 0, 0.76), v: new THREE.Vector3(0, 0.81, 0), n: new THREE.Vector3(-1, 0, 0) },
    { c: new THREE.Vector3(3.6, 1.75, -3.1), u: new THREE.Vector3(0.26, 0, 0), v: new THREE.Vector3(0, 0.81, 0), n: new THREE.Vector3(0, 0, -1) },
  );
  // Invisible "shadow-only" shell: the open (cut-away) sides and the missing ceiling
  // still block sunlight, so the sun only gets in through real windows and doors.
  const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const shell = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shadowOnly);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.raycast = () => {}; // never catches taps
    g.add(m);
  };
  shell(0.2, H + 0.6, 6.6, 4.2, -0.3, 0);      // right side
  shell(8.6, H + 0.6, 0.2, 0, -0.3, 3.2);       // front side
  shell(8.6, 0.1, 6.6, 0, H + 0.05, 0);         // ceiling
  // curtains, rod and finials
  for (const z of [-0.22, 1.82]) {
    g.add(box(0.1, 2.1, 0.12, C.red, -3.9, 0.75, z - 0.1));
    g.add(box(0.1, 2.1, 0.12, C.redDark, -3.9, 0.75, z));
    g.add(box(0.1, 2.1, 0.12, C.red, -3.9, 0.75, z + 0.1));
    g.add(box(0.12, 0.05, 0.36, C.brass, -3.89, 1.45, z));
  }
  const rod = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.7, 6), mat(C.brass, { rough: 0.4, metal: 0.3 }));
  rod.rotation.x = Math.PI / 2;
  rod.position.set(-3.86, 2.88, 0.8);
  g.add(rod);
  for (const z of [-0.55, 2.15]) {
    const f = mesh(new THREE.IcosahedronGeometry(0.05, 0), C.brass);
    f.position.set(-3.86, 2.88, z);
    g.add(f);
  }

  // small framed picture on the left wall
  g.add(box(0.05, 0.66, 0.86, C.brass, -3.955, 1.4, -1.6));
  const pic = mesh(new THREE.PlaneGeometry(0.74, 0.54), mat(0xffffff, { map: stillLifeTexture(), rough: 0.9 }), false);
  pic.rotation.y = Math.PI / 2;
  pic.position.set(-3.924, 1.73, -1.6);
  g.add(pic);
  return g;
}

// ---------------------------------------------------------------- fireplace
function buildFireplace(r, fx) {
  const g = new THREE.Group();
  const zf = -3.0; // face of the back wall
  g.add(box(1.7, 3.2 - 1.24, 0.25, C.plaster, 0, 1.24, zf + 0.125)); // chimney breast
  g.add(box(0.38, 0.92, 0.42, C.stone, -0.72, 0, zf + 0.21));
  g.add(box(0.38, 0.92, 0.42, C.stone, 0.72, 0, zf + 0.21));
  g.add(box(1.82, 0.24, 0.42, C.stone, 0, 0.92, zf + 0.21));
  g.add(box(2.1, 0.08, 0.52, C.woodDark, 0, 1.16, zf + 0.26)); // mantel shelf (top at 1.24)
  g.add(box(1.12, 0.92, 0.04, C.soot, 0, 0, zf + 0.03));   // wider than the opening: edges hidden in the pillars (no flicker)
  const hearth = box(2.2, 0.05, 0.62, C.stoneDark, 0, 0, zf + 0.58); // hearth
  hearth.userData.grain = 'z';                                      // knit runs across it, unlike the floor boards
  g.add(hearth);
  g.add(box(1.12, 0.02, 0.4, C.soot, 0, 0.05, zf + 0.22));
  // andirons and logs
  for (const x of [-0.3, 0.3]) g.add(box(0.04, 0.16, 0.36, C.iron, x, 0.05, zf + 0.25));
  [-0.32, 0.28].forEach((ry, i) => {
    const log = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 6), C.logs);
    log.rotation.set(0, ry, Math.PI / 2);
    log.position.set(0, 0.19 + i * 0.1, zf + 0.25);
    g.add(log);
  });
  // flames (always bright) + flickering firelight
  const fa = glow(0xff8a2a), fb = glow(0xffd36a);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.36, 5), i % 2 ? fb : fa);
    f.position.set(-0.24 + i * 0.16, 0.42, zf + 0.25);
    f.userData = { base: range(r, 0.8, 1.2), phase: r() * 10 };
    g.add(f);
    fx.flames.push(f);
  }
  const fire = new THREE.PointLight(0xff8a3a, 4, 9, 1.4);
  fire.position.set(0, 0.55, zf + 0.7);
  g.add(fire);
  fx.fireLight = fire;
  // mantel ornaments: candlesticks, small clock, vase
  for (const x of [-0.88, 0.88]) {
    g.add(cyl(0.05, 0.06, 0.04, 8, C.brass, x, 1.24, zf + 0.26));
    g.add(cyl(0.015, 0.02, 0.12, 6, C.brass, x, 1.28, zf + 0.26));
    g.add(cyl(0.028, 0.028, 0.2, 8, C.cream, x, 1.4, zf + 0.26));
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), fb);
    fl.position.set(x, 1.64, zf + 0.26);
    fl.userData = { base: 1, phase: r() * 10 };
    g.add(fl);
    fx.flames.push(fl);
  }
  g.add(box(0.22, 0.2, 0.12, C.woodDark, 0.4, 1.24, zf + 0.22));
  const face = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 12), C.cream, false);
  face.rotation.x = Math.PI / 2;
  face.position.set(0.4, 1.35, zf + 0.285);
  g.add(face);
  g.add(lathe([[0, 0], [0.05, 0], [0.07, 0.05], [0.045, 0.15], [0.03, 0.2], [0.045, 0.24]], C.blueGlaze, -0.42, 1.24, zf + 0.24));
  // painting above the mantel
  g.add(box(1.12, 0.8, 0.05, C.brass, 0, 1.5, zf + 0.275));     // frame clear of the mantel clock (no flicker)
  const paint = mesh(new THREE.PlaneGeometry(0.98, 0.66), mat(0xffffff, { map: landscapeTexture(), rough: 0.9 }), false);
  paint.position.set(0, 1.9, zf + 0.306);
  g.add(paint);
  return g;
}

// ---------------------------------------------------------------- bookcases & books
function buildBookcase(r, books, cx, opt) {
  const g = new THREE.Group();
  const W = 1.8, H = 2.6, D = 0.4, t = 0.05, z0 = -3.0, cz = z0 + D / 2;
  g.add(box(t, H, D, C.wood, cx - W / 2 + t / 2, 0, cz));
  g.add(box(t, H, D, C.wood, cx + W / 2 - t / 2, 0, cz));
  g.add(box(W, t, D, C.wood, cx, H - t, cz));
  g.add(box(W + 0.12, 0.08, D + 0.06, C.woodDark, cx, H, cz + 0.01));
  g.add(box(W, 0.12, D, C.woodDark, cx, 0, cz));
  g.add(box(W, H, 0.02, C.woodDark, cx, 0, z0 + 0.055));        // in front of the wall panelling
  const levels = [0.12, 0.62, 1.12, 1.62, 2.12];
  levels.slice(1).forEach((y) => g.add(box(W - 2 * t, 0.04, D - 0.02, C.wood, cx, y - 0.04, cz)));
  const xa = cx - W / 2 + t + 0.02, xb = cx + W / 2 - t - 0.02;
  levels.forEach((y, i) => {
    const top = i < levels.length - 1 ? levels[i + 1] - 0.04 : H - t;
    let end = xb;
    if (i === opt.level) {
      end = xa + (xb - xa) * opt.keep;
      const ox = (end + xb) / 2;
      if (opt.ornament === 'vase') {
        g.add(lathe([[0, 0], [0.07, 0], [0.1, 0.08], [0.07, 0.22], [0.045, 0.3], [0.06, 0.34]], C.blueGlaze, ox - 0.1, y, z0 + 0.2));
        g.add(box(0.14, 0.09, 0.1, C.woodLight, ox + 0.17, y, z0 + 0.22));
      } else {
        g.add(hourglass(ox, y, z0 + 0.2));
        bookStack(r, books, ox + 0.25, y, z0 + 0.2, 2);
      }
    }
    fillShelf(r, books, xa, end, y, top - y, z0 + 0.03);
  });
  return g;
}

function fillShelf(r, books, xa, xb, y, gapH, zBack) {
  let x = xa;
  while (x < xb - 0.04) {
    const roll = r();
    if (roll < 0.07) { x += range(r, 0.08, 0.18); continue; } // a gap
    if (roll < 0.14 && xb - x > 0.34) { // a pile of books lying flat
      const L = range(r, 0.24, 0.3);
      let yy = y;
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const th = range(r, 0.035, 0.06), d = range(r, 0.18, 0.26);
        books.push({ x: x + L / 2, y: yy, z: zBack + d / 2, w: L, h: th, d, ry: range(r, -0.08, 0.08), color: pick(r, BOOK_COLORS) });
        yy += th;
      }
      x += L + 0.02;
      continue;
    }
    const w = range(r, 0.035, 0.08);
    if (x + w > xb) break;
    const h = Math.min(gapH - 0.03, range(r, 0.24, 0.42)), d = range(r, 0.2, 0.3);
    books.push({ x: x + w / 2, y, z: zBack + d / 2, w, h, d, color: pick(r, BOOK_COLORS) });
    x += w + 0.003;
  }
}

function bookStack(r, books, x, y, z, n) {
  let yy = y;
  for (let k = 0; k < n; k++) {
    const th = range(r, 0.04, 0.07), w = range(r, 0.22, 0.3), d = range(r, 0.16, 0.22);
    books.push({ x: x + range(r, -0.02, 0.02), y: yy, z, w, h: th, d, ry: range(r, -0.4, 0.4), color: pick(r, BOOK_COLORS) });
    yy += th;
  }
}

// All books are drawn as ONE object (an "instanced mesh") – much faster on tablets.
function makeBooks(books) {
  const im = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }),
    books.length,
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  books.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.ry || 0, 0));
    m.compose(p.set(b.x, b.y + b.h / 2, b.z), q, s.set(b.w, b.h, b.d));
    im.setMatrixAt(i, m);
    im.setColorAt(i, col.setHex(b.color));
  });
  im.castShadow = im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  im.instanceColor.needsUpdate = true;
  return im;
}

// ---------------------------------------------------------------- furniture
function buildClock() {
  const g = new THREE.Group();
  g.add(box(0.56, 0.5, 0.4, C.wood, 0, 0, 0));
  // trunk: a SHALLOW hollow case (window x ±0.15, y 0.7..1.6). The camera looks from the front-right,
  // so a deep case shows its inner left wall; the pendulum hangs close to the back panel and the
  // case is shallow, so the bob stays inside the visible opening on both sides.
  g.add(box(0.46, 1.3, 0.2, C.wood, 0, 0.5, -0.06));             // back part (front face z 0.04)
  for (const s of [-1, 1]) g.add(box(0.08, 1.3, 0.06, C.wood, s * 0.19, 0.5, 0.07)); // side stiles (z 0.04..0.10)
  g.add(box(0.3, 0.2, 0.06, C.wood, 0, 0.5, 0.07));              // bottom rail
  g.add(box(0.3, 0.2, 0.06, C.wood, 0, 1.6, 0.07));              // top rail
  g.add(box(0.3, 0.9, 0.01, mat(0x1d1a18, { rough: 0.6 }), 0, 0.7, 0.045)); // dark back of the cavity
  g.add(box(0.56, 0.62, 0.4, C.wood, 0, 1.8, 0));
  g.add(box(0.62, 0.1, 0.44, C.woodDark, 0, 2.42, 0));
  g.add(box(0.32, 0.12, 0.42, C.woodDark, 0, 2.52, 0));
  const face = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), C.cream, false);
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 2.11, 0.205);
  g.add(face);
  const ring = mesh(new THREE.TorusGeometry(0.19, 0.018, 4, 16), C.brass, false);
  ring.position.set(0, 2.11, 0.21);
  g.add(ring);
  const hand = (len, w) => {
    const p = new THREE.Group();
    const h = box(w, len, 0.008, C.ink, 0, -0.02, 0);
    h.castShadow = false;
    p.add(h);
    p.position.set(0, 2.11, 0.222);
    g.add(p);
    return p;
  };
  const minute = hand(0.16, 0.014), hour = hand(0.1, 0.022);
  // glass in front of the cavity
  const glass = mesh(new THREE.BoxGeometry(0.3, 0.9, 0.006),
    mat(0xcfe0e8, { rough: 0.05, transparent: true, opacity: 0.18 }), false);
  glass.position.set(0, 1.15, 0.095);
  g.add(glass);
  const pend = new THREE.Group();
  pend.position.set(0, 1.56, 0.064);                               // just in front of the back panel
  pend.add(box(0.014, 0.62, 0.006, C.brass, 0, -0.62, 0));
  const bob = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), mat(C.brass, { rough: 0.35, metal: 0.4 }), false);
  bob.rotation.x = Math.PI / 2;
  bob.position.set(0, -0.66, 0);
  pend.add(bob);
  g.add(pend);
  return { group: g, pend, minute, hour };
}

function buildRug() {
  const tex = canvasTex(512, 400, (c, w, h) => {
    const rect = (col, m) => { c.fillStyle = col; c.fillRect(m, m, w - 2 * m, h - 2 * m); };
    rect('#5e1f1f', 0); rect('#d4ad62', 16); rect('#7a2828', 26); rect('#2d3f5f', 50); rect('#8a3030', 62);
    const diamond = (x, y, rx, ry, col) => {
      c.fillStyle = col; c.beginPath();
      c.moveTo(x, y - ry); c.lineTo(x + rx, y); c.lineTo(x, y + ry); c.lineTo(x - rx, y); c.closePath(); c.fill();
    };
    diamond(w / 2, h / 2, 120, 95, '#d4ad62'); diamond(w / 2, h / 2, 95, 72, '#2d3f5f'); diamond(w / 2, h / 2, 40, 30, '#d4ad62');
    for (let x = 100; x < w - 80; x += 52) for (const y of [92, h - 92]) diamond(x, y, 12, 12, '#c48a4a');
    for (const x of [92, w - 92]) for (let y = 140; y < h - 120; y += 52) diamond(x, y, 12, 12, '#c48a4a');
  });
  // a real layer on the floor: 3 cm thick, casts its own small shadow at the edges
  const rug = mesh(new THREE.BoxGeometry(3.6, 0.03, 2.8), mat(0xffffff, { map: tex, rough: 1 }), true);
  rug.userData.grain = 'z';
  rug.position.set(1.1, 0.015, 0.35);
  return rug;
}

function buildDesk(r, fx, books) {
  const g = new THREE.Group();
  const W = 1.8, D = 0.85, H = 0.78, front = (D - 0.08) / 2;
  g.add(box(W, 0.06, D, C.woodDark, 0, H - 0.06, 0));
  for (const s of [-1, 1]) {
    const px = s * (W / 2 - 0.25);
    g.add(box(0.46, H - 0.06, D - 0.08, C.wood, px, 0, 0));
    for (let i = 0; i < 3; i++) {
      const dy = 0.05 + i * 0.22;
      g.add(box(0.4, 0.19, 0.02, C.woodLight, px, dy, front + 0.01));
      g.add(box(0.07, 0.02, 0.03, C.brass, px, dy + 0.085, front + 0.03));
    }
  }
  g.add(box(W - 0.96, 0.13, 0.02, C.woodLight, 0, H - 0.2, front + 0.01));
  g.add(box(W - 0.96, 0.45, 0.03, C.wood, 0, 0.2, -front + 0.02));
  // desktop items
  const leather = box(1.1, 0.005, 0.5, C.green, 0, H, 0.08);
  leather.castShadow = false;
  g.add(leather);
  [[-0.1, 0.12, 0.3], [0.05, 0.1, -0.15], [0.2, 0.2, 0.1]].forEach(([x, z, ry]) => {
    const p = box(0.21, 0.004, 0.29, C.paper, x, H + 0.006, z);
    p.rotation.y = ry;
    p.castShadow = false;
    g.add(p);
  });
  g.add(cyl(0.035, 0.042, 0.06, 6, C.ink, -0.45, H, -0.18));
  const quill = box(0.015, 0.003, 0.26, C.cream, -0.43, H + 0.07, -0.12);
  quill.rotation.set(0.9, 0.3, 0);
  g.add(quill);
  // open book (two pages tilted up)
  for (const s of [-1, 1]) {
    const pg = box(0.16, 0.012, 0.22, C.paper, -0.22 + s * 0.08, H + 0.005, 0.18);
    pg.rotation.z = s * -0.1;
    g.add(pg);
  }
  bookStack(r, books, -0.72, H, -0.22, 3);
  for (const b of books.slice(-3)) { b.x += 1.5; } // desk sits at x = 1.5 (books are in room coordinates)
  // banker's lamp
  const lamp = new THREE.Group();
  lamp.position.set(0.62, H, -0.2);
  lamp.add(cyl(0.08, 0.1, 0.03, 8, C.brass));
  lamp.add(cyl(0.015, 0.015, 0.36, 6, C.brass, 0, 0.03, 0));
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0x2f6b4a, roughness: 0.35, flatShading: true, side: THREE.DoubleSide, emissive: 0x6fbf8a, emissiveIntensity: 0,
  });
  const shade = mesh(new THREE.ConeGeometry(0.17, 0.14, 10, 1, true), shadeMat);
  shade.position.set(0, 0.42, 0);
  lamp.add(shade);
  const bulbMat = glow(0x333333);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), bulbMat);
  bulb.position.set(0, 0.37, 0);
  lamp.add(bulb);
  const light = new THREE.PointLight(0xffd59a, 0, 4, 1.6);
  light.position.set(0, 0.32, 0);
  lamp.add(light);
  g.add(lamp);
  fx.lamps.push({ light, base: 3.2 });
  fx.bulbMats.push(bulbMat);
  fx.shadeMats.push(shadeMat);
  return g;
}

function buildDeskChair() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.06, 0.48, C.wood, 0, 0.44, 0));
  g.add(box(0.44, 0.05, 0.42, C.red, 0, 0.5, 0.01));
  for (const x of [-0.21, 0.21]) for (const z of [-0.2, 0.2]) g.add(cyl(0.022, 0.018, 0.44, 6, C.woodDark, x, 0, z));
  g.add(box(0.48, 0.06, 0.04, C.wood, 0, 0.95, -0.22));
  for (const x of [-0.21, 0.21]) g.add(box(0.04, 0.5, 0.04, C.wood, x, 0.5, -0.22));
  for (const x of [-0.1, 0, 0.1]) g.add(box(0.025, 0.42, 0.02, C.woodDark, x, 0.52, -0.22));
  return g;
}

function buildArmchair() {
  const g = new THREE.Group();
  for (const x of [-0.4, 0.4]) for (const z of [-0.36, 0.36]) g.add(cyl(0.035, 0.03, 0.1, 6, C.woodDark, x, 0, z));
  g.add(box(0.95, 0.28, 0.88, C.green, 0, 0.1, 0));
  g.add(box(0.66, 0.12, 0.68, C.greenDark, 0, 0.38, 0.06));
  g.add(box(0.95, 0.68, 0.22, C.green, 0, 0.38, -0.34));
  for (const x of [-0.4, 0.4]) g.add(box(0.16, 0.3, 0.84, C.green, x, 0.38, 0.02));
  const pillow = box(0.36, 0.3, 0.1, C.cream, 0.12, 0.48, -0.17);
  pillow.rotation.set(-0.2, 0.15, 0.12);
  g.add(pillow);
  return g;
}

function buildSideTable(r, books) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.22, 0.03, 10, C.woodDark));
  g.add(cyl(0.035, 0.045, 0.56, 6, C.wood, 0, 0.03, 0));
  g.add(cyl(0.29, 0.29, 0.04, 12, C.woodDark, 0, 0.58, 0));
  g.add(cyl(0.075, 0.075, 0.01, 12, C.cream, 0.08, 0.62, 0.06));
  g.add(cyl(0.045, 0.034, 0.055, 10, C.cream, 0.08, 0.63, 0.06));
  const handle = mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 8), C.cream, false);
  handle.position.set(0.135, 0.66, 0.06);
  g.add(handle);
  bookStack(r, books, -3.4 - 0.08, 0.62, 2.15 - 0.06, 1); // a book on the table (room coordinates)
  return g;
}

function buildFloorLamp(fx) {
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.18, 0.04, 10, C.brass));
  g.add(cyl(0.018, 0.018, 1.5, 6, C.brass, 0, 0.04, 0));
  const shadeMat = new THREE.MeshStandardMaterial({
    color: C.cream, roughness: 0.9, flatShading: true, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0,
  });
  const shade = mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.32, 10, 1, true), shadeMat);
  shade.position.set(0, 1.58, 0);
  g.add(shade);
  const bulbMat = glow(0x333333);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), bulbMat);
  bulb.position.set(0, 1.52, 0);
  g.add(bulb);
  const light = new THREE.PointLight(0xffd59a, 0, 5, 1.5);
  light.position.set(0, 1.45, 0);
  g.add(light);
  fx.lamps.push({ light, base: 3.5 });
  fx.bulbMats.push(bulbMat);
  fx.shadeMats.push(shadeMat);
  return g;
}

function buildGlobe(r) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = box(0.04, 0.5, 0.04, C.woodDark, 0, 0, 0);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.16, 0.25, Math.sin(a) * 0.16);
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    g.add(leg);
  }
  g.add(cyl(0.12, 0.08, 0.05, 8, C.wood, 0, 0.48, 0));
  g.add(cyl(0.02, 0.02, 0.2, 6, C.brass, 0, 0.53, 0));
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.98, 0);
  tilt.rotation.z = 0.41;
  const ring = mesh(new THREE.TorusGeometry(0.33, 0.014, 4, 24), mat(C.brass, { rough: 0.4, metal: 0.3 }));
  ring.rotation.y = Math.PI / 2;
  tilt.add(ring);
  const tex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#2f5f86'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9b77a';
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.ellipse(r() * w, 18 + r() * (h - 36), 8 + r() * 26, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  const ball = mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(0xffffff, { map: tex, rough: 0.6 }));
  tilt.add(ball);
  g.add(tilt);
  return { group: g, ball };
}

function buildPlant(r) {
  const g = new THREE.Group();
  g.add(cyl(0.25, 0.18, 0.42, 8, C.terracotta));
  g.add(cyl(0.27, 0.27, 0.05, 8, C.terracotta, 0, 0.42, 0));
  g.add(cyl(0.23, 0.23, 0.02, 8, 0x3b2a1e, 0, 0.44, 0));
  g.add(cyl(0.025, 0.03, 0.5, 5, C.logs, 0, 0.45, 0));
  for (let i = 0; i < 7; i++) {
    const s = range(r, 0.18, 0.3);
    const leaf = mesh(new THREE.IcosahedronGeometry(s, 0), i % 2 ? C.leaf : C.leafDark);
    leaf.position.set(range(r, -0.2, 0.2), range(r, 0.75, 1.25), range(r, -0.2, 0.2));
    leaf.rotation.set(r() * 3, r() * 3, r() * 3);
    leaf.scale.y = range(r, 0.8, 1.2);
    g.add(leaf);
  }
  return g;
}

function buildChest() {
  const g = new THREE.Group();
  g.add(box(0.95, 0.42, 0.52, C.woodLight, 0, 0, 0));
  g.add(box(0.99, 0.12, 0.56, C.wood, 0, 0.42, 0));
  for (const x of [-0.3, 0.3]) g.add(box(0.05, 0.55, 0.575, C.iron, x, 0, 0));
  g.add(box(0.1, 0.12, 0.03, C.brass, 0, 0.32, 0.27));
  return g;
}

function buildFireTools() {
  const g = new THREE.Group();
  g.add(cyl(0.11, 0.13, 0.03, 8, C.iron));
  g.add(cyl(0.012, 0.012, 0.8, 5, C.iron, 0, 0.03, 0));
  for (const [x, z] of [[0.05, 0], [-0.03, 0.04], [-0.02, -0.05]]) {
    const t = cyl(0.008, 0.008, 0.7, 4, C.iron, x, 0.05, z);
    t.rotation.z = x * 1.5;
    g.add(t);
  }
  g.add(cyl(0.05, 0.05, 0.03, 8, C.brass, 0, 0.83, 0));
  return g;
}

function buildLogBasket() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.25, 0.34, 0x8a6a3a, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), C.logs);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.3 + (i === 2 ? 0.08 : 0), -0.07 + (i % 2) * 0.13 + (i === 2 ? -0.06 : 0));
    g.add(log);
  }
  return g;
}

// ---------------------------------------------------------------- small helpers
function lathe(points, color, x, y, z) {
  const geo = new THREE.LatheGeometry(points.map(([px, py]) => new THREE.Vector2(px, py)), 8);
  const m = mesh(geo, mat(color, { rough: 0.35, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  return m;
}

function hourglass(x, y, z) {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.07, 0.02, 6, C.woodDark));
  g.add(cyl(0.07, 0.07, 0.02, 6, C.woodDark, 0, 0.22, 0));
  const glassM = mat(0xd8eef5, { transparent: true, opacity: 0.5, rough: 0.1 });
  const top = mesh(new THREE.ConeGeometry(0.055, 0.1, 6), glassM, false);
  top.rotation.x = Math.PI;
  top.position.y = 0.17;
  const bot = mesh(new THREE.ConeGeometry(0.055, 0.1, 6), glassM, false);
  bot.position.y = 0.07;
  g.add(top, bot, cyl(0.03, 0.045, 0.03, 6, 0xe0c080, 0, 0.02, 0));
  for (const a of [0, 2.1, 4.2]) g.add(cyl(0.006, 0.006, 0.2, 4, C.woodDark, Math.cos(a) * 0.06, 0.02, Math.sin(a) * 0.06));
  g.position.set(x, y, z);
  return g;
}

function landscapeTexture() {
  return canvasTex(256, 172, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#f3c98e'); sky.addColorStop(0.6, '#e49a62');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff1c2'; c.beginPath(); c.arc(w * 0.7, h * 0.42, 16, 0, Math.PI * 2); c.fill();
    const hill = (col, pts) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); pts.forEach(([px, py]) => c.lineTo(px * w, py * h)); c.lineTo(w, h); c.fill(); };
    hill('#8a9a62', [[0, 0.6], [0.25, 0.48], [0.5, 0.58], [0.8, 0.5], [1, 0.56]]);
    hill('#56704a', [[0, 0.72], [0.3, 0.64], [0.6, 0.74], [1, 0.66]]);
    hill('#33493a', [[0, 0.86], [0.4, 0.8], [0.7, 0.88], [1, 0.82]]);
    c.fillStyle = '#22352a';
    for (const [tx, ty] of [[0.15, 0.7], [0.2, 0.72], [0.82, 0.68]]) {
      c.beginPath(); c.moveTo(tx * w, ty * h - 26); c.lineTo(tx * w + 9, ty * h); c.lineTo(tx * w - 9, ty * h); c.fill();
    }
  });
}

function stillLifeTexture() {
  return canvasTex(200, 146, (c, w, h) => {
    c.fillStyle = '#3b2f2a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6b4a2e'; c.fillRect(0, h * 0.72, w, h * 0.28);
    c.fillStyle = '#3d6f8f'; c.beginPath(); c.ellipse(w * 0.45, h * 0.6, 22, 30, 0, 0, Math.PI * 2); c.fill();
    for (const [fx, fy, col] of [[0.38, 0.28, '#c94a3a'], [0.5, 0.22, '#e8c24a'], [0.46, 0.34, '#d9d0c0'], [0.56, 0.32, '#c94a3a']]) {
      c.fillStyle = col; c.beginPath(); c.arc(fx * w, fy * h, 9, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#c9a14a'; c.beginPath(); c.arc(w * 0.75, h * 0.7, 12, 0, Math.PI * 2); c.fill();
  });
}
