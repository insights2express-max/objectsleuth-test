// The Estate – Study (placeholder Scene for Draft 1).
// A cut-away low-poly diorama: back wall + left wall, open to the front and right.
// Units are roughly metres. Floor is y = 0. Room spans x -4..4, z -3..3, walls 3.2 high.
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
  const fx = { lamps: [], bulbMats: [], shadeMats: [], flames: [], windowMats: [], openings: [], fireLight: null, paintings: [], sockets: [], candleLights: [],
    room: new THREE.Box3(new THREE.Vector3(-4.0, 0, -3.0), new THREE.Vector3(4.0, 3.2, 3.0)) };
  const books = [];

  root.add(buildFloor(r));
  root.add(buildWalls(fx));
  root.add(buildFireplace(r, fx));
  // hostKind: what a piece of furniture is, so embossed Target Objects go somewhere that makes sense (TO v3)
  const tag = (o, kind) => { o.userData.hostKind = kind; return o; };
  root.add(tag(buildBookcase(r, books, -2.3, { level: 2, keep: 0.55, ornament: 'vase' }), 'bookcase'));
  root.add(tag(buildBookcase(r, books, 2.3, { level: 3, keep: 0.5, ornament: 'hourglass' }), 'bookcase'));
  const clock = buildClock();
  clock.group.position.set(-3.62, 0, -2.745);                       // back clear of the wall panelling
  tag(clock.group, 'clock');
  root.add(clock.group);
  root.add(buildRug(fx, r));
  root.add(tag(group([buildDesk(r, fx, books)], 1.5, 0, 0.0), 'desk'));
  root.add(group([buildDeskChair()], 1.5, 0, 0.85, Math.PI));
  root.add(group([buildArmchair()], -3.3, 0, 0.8, Math.PI / 2));     // back clear of the window sill
  root.add(group([buildSideTable(r, books)], -3.4, 0, 2.15));
  root.add(group([buildFloorLamp(fx)], -3.55, 0, -0.6));
  const globe = buildGlobe(r);
  globe.group.position.set(3.45, 0, -1.7);
  // SOCKET: a small object (the key) may rest on top of the globe, just off the meridian ring (OS-19: 5.4.1)
  fx.sockets.push({ kind: 'globe-top', parent: globe.group, pos: new THREE.Vector3(0, 1.272, 0.07), out: new THREE.Vector3(0, 1, 0), flat: true });
  root.add(globe.group);
  root.add(group([buildPlant(r)], 3.4, 0, 2.4));
  root.add(tag(group([buildChest(fx)], -1.3, 0, 2.3, 0.12), 'chest'));
  root.add(group([buildFireTools()], 1.3, 0, -2.4));
  root.add(group([buildLogBasket()], -1.43, 0, -2.36, 0.2));     // clear of the hearth
  bookStack(r, books, 2.75, 0, 1.45, 5);
  root.add(makeBooks(books));
  seatIntoRoom(root);
  fx.globeBall = globe.ball;
  // things that move: never merged into the big batched pieces (art/batch.js)
  for (const o of [clock.pend, clock.minute, clock.hour, globe.ball, ...fx.fireFlames, ...fx.flames, ...fx.embers]) o.userData.dynamic = true;

  return {
    root,
    fx,
    bounds: new THREE.Box3(new THREE.Vector3(-4.2, -0.3, -3.2), new THREE.Vector3(4.0, 3.25, 3.0)),
    // Compass: the room is turned so the left wall faces south-east and the back wall
    // faces south-west (sun through the left window in the morning, the back window in
    // the afternoon, both around noon). See sun.js → compassDir().
    compassTurn: 135,
    animate(t, hours) {
      const dt = Math.min(0.1, Math.max(0, t - (this.lastT ?? t)));
      this.lastT = t;
      animateFire(fx, t, dt, hours);
      // candle flames flicker
      for (const f of fx.flames) {
        const u = f.userData;
        f.scale.y = u.base * (1 + 0.18 * Math.sin(t * 9 + u.phase) + 0.08 * Math.sin(t * 23 + u.phase * 2));
      }
      // clock: real time, and a swinging pendulum
      // (v13: no pendulum swing – the case has a solid door)
      // (follows the test clock when it is in use)
      const m = (hours * 60) % 60;
      clock.minute.rotation.z = -(m / 60) * Math.PI * 2;
      clock.hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
      // (v13: the globe stands still; it gets a new random turn each round – see targets.newRound)
    },
  };
}

// Anything standing on the floor or set against a wall is extended 10 cm INTO the floor / wall,
// where nobody can see it. Otherwise the rounded, slightly uneven edges of the art styles (Clay,
// Felt…) leave hairline gaps that firelight and sunlight leak through. The piece keeps its original
// edge rounding (userData.roundMin), so it looks exactly the same.
function seatIntoRoom(root) {
  root.updateMatrixWorld(true);
  const SINK = 0.1, eps = 0.004, b = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.geometry.type !== 'BoxGeometry') return; // (not the books: one shared shape)
    const m = o.material;
    if (m.colorWrite === false || m.transparent || m.map) return;     // not the invisible shell, glass, rug or pictures
    let turned = false;
    for (let p = o; p && p !== root; p = p.parent) {
      if (Math.abs(p.rotation.x) > 1e-6 || Math.abs(p.rotation.z) > 1e-6 || p.scale.x !== 1) return; // upright pieces only
      if (p !== o && Math.abs(p.rotation.y) > 1e-6) turned = true;
    }
    if (Math.abs(o.rotation.y) > 1e-6) turned = true;
    b.setFromObject(o);
    let { width: w, height: h, depth: d } = o.geometry.parameters;
    const min0 = Math.min(w, h, d);
    let dx = 0, dy = 0, dz = 0;
    if (b.max.x > 3.995 || b.max.z > 2.995 || b.max.y > 3.19) return;   // leave the cut-away edges and wall tops alone
    if (Math.abs(b.min.y) < eps && b.max.y > 0.01 && b.max.y < 2.5) { h += SINK; dy = -SINK / 2; }  // on the floor (not walls)
    if (!turned && Math.abs(b.min.z + 3.0) < eps && b.max.z > -2.9) { d += SINK; dz = -SINK / 2; }     // against the back wall (≥10 cm deep: not panelling)
    if (!turned && Math.abs(b.min.x + 4.0) < eps && b.max.x > -3.9) { w += SINK; dx = -SINK / 2; }     // against the left wall (≥10 cm deep)
    if (!dx && !dy && !dz) return;
    o.geometry = new THREE.BoxGeometry(w, h, d);
    o.position.x += dx; o.position.y += dy; o.position.z += dz;
    o.userData.roundMin = min0;
  });
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
  // Back wall: the panelling stops where the fireplace and the bookcases stand, so it never pokes
  // through them (it used to show as thin flickering streaks in Low-poly).
  const covered = [[-3.2, -1.4], [-0.91, 0.91], [1.4, 3.2]];   // bookcase, fireplace, bookcase
  const gaps = [[-4.0, -3.2], [-1.4, -0.91], [0.91, 1.4], [3.2, 4.0]];
  for (const [x0, x1] of gaps) {
    g.add(box(x1 - x0, 0.9, 0.03, C.wainscot, (x0 + x1) / 2, 0, -2.985));
    g.add(box(x1 - x0 - 0.004, 0.05, 0.07, C.rail, (x0 + x1) / 2, 0.88, -2.965)); // 2 mm short at each end: no flush ends
  }
  g.add(box(0.03, 0.9, 5.97, C.wainscot, -3.985, 0, 0.015));        // left wall starts after the corner
  g.add(box(0.07, 0.05, 5.926, C.rail, -3.965, 0.88, 0.035));
  for (let x = -3.6; x < 4; x += 0.8) {
    if (covered.some(([a, b]) => x > a - 0.05 && x < b + 0.05)) continue;
    g.add(box(0.05, 0.74, 0.02, C.rail, x, 0.07, -2.96));
  }
  for (let z = -2.6; z < 3; z += 0.8) g.add(box(0.02, 0.74, 0.05, C.rail, -3.96, 0.07, z));
  // picture rail
  for (const [x0, x1] of [[-4.0, -0.85], [0.85, 4.0]]) g.add(box(x1 - x0, 0.04, 0.04, C.rail, (x0 + x1) / 2, 2.7, -2.98)); // stops at the chimney breast
  g.add(box(0.04, 0.04, 5.96, C.rail, -3.98, 2.7, 0.02));

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
  // v14 (OS-19: 1.7.1): the curtains end just above the sill (top 0.945), so closed they would fall
  // onto nothing – and can hang right beside the window frame again
  for (const z of [-0.22, 1.82]) {
    g.add(box(0.1, 1.9, 0.12, C.red, -3.9, 0.95, z - 0.1));
    g.add(box(0.1, 1.88, 0.12, C.redDark, -3.92, 0.95, z));     // set back and a little lower: folds, no flush faces
    g.add(box(0.1, 1.9, 0.12, C.red, -3.9, 0.95, z + 0.1));
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
  const still = painting(600, 438, drawStillLife, [[0.05, 0.95, 0.76, 0.97]]); // [x0, x1, y0, y1]: where a TO may be painted (the table)
  const pic = mesh(new THREE.PlaneGeometry(0.74, 0.54), new THREE.MeshStandardMaterial({ map: still.tex, roughness: 0.9 }), false);
  fx.paintings.push({ ...still, id: 'still', mesh: pic, wM: 0.74, hM: 0.54 });
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
  g.add(box(1.12, 0.02, 0.38, C.soot, 0, 0.05, zf + 0.21));       // stops short of the pillar fronts
  // andirons and logs
  for (const x of [-0.3, 0.3]) g.add(box(0.04, 0.08, 0.36, C.iron, x, 0.05, zf + 0.25));   // andirons (top 0.13)
  [-0.32, 0.28].forEach((ry, i) => {
    const log = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 6), 0x3a2a20);   // charred
    log.rotation.set(0, ry, Math.PI / 2);
    log.position.set(0, 0.205 + i * 0.15, zf + 0.25);             // the first rests on the andirons, the second on the first
    g.add(log);
  });
  // v13 "zero-idle" (OS-18): a COLD fireplace – no flames, embers or fire light. Anything that moves
  // forces the whole room to be redrawn many times a second, which heated the iPad. A bed of grey ash
  // under charred logs; the logs above already sit on the andirons.
  fx.embers = [];
  fx.fireFlames = [];
  const ash = box(1.0, 0.012, 0.34, mat(0x6e6a66, { rough: 1 }), 0, 0.07, zf + 0.22);
  ash.castShadow = false;
  g.add(ash);
  for (let i = 0; i < 7; i++) { // a few charred chunks in the ash
    const c = mesh(new THREE.IcosahedronGeometry(range(r, 0.02, 0.035), 0), mat(0x2a2422, { rough: 1 }));
    c.position.set(range(r, -0.35, 0.35), 0.085, zf + range(r, 0.12, 0.34));
    c.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(c);
  }
  // The fire and bounce lights still exist (lighting.js reads them) but are NOT added to the room,
  // so they cost nothing.
  fx.fireLight = new THREE.PointLight(0xff8a3a, 0, 9, 1.4);
  fx.fireLight.position.set(0, 0.55, zf + 0.7);
  fx.bounceLight = new THREE.PointLight(0xff9a55, 0, 3.0, 2);
  fx.bounceLight.visible = false;
  // mantel ornaments: unlit candles in candlesticks (OS-18: 1.4), small clock, vase
  for (const x of [-0.88, 0.88]) {
    g.add(cyl(0.05, 0.06, 0.04, 8, C.brass, x, 1.24, zf + 0.36));
    g.add(cyl(0.015, 0.02, 0.12, 6, C.brass, x, 1.28, zf + 0.36));
    g.add(cyl(0.028, 0.028, 0.2, 8, C.cream, x, 1.4, zf + 0.36));
    g.add(cyl(0.002, 0.002, 0.014, 4, C.soot, x, 1.6, zf + 0.36));   // the black wick
  }
  g.add(box(0.22, 0.2, 0.12, C.woodDark, 0.4, 1.24, zf + 0.33));   // (all mantel items stand in front of the chimney breast)
  const face = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 12), C.cream, false);
  face.rotation.x = Math.PI / 2;
  face.position.set(0.4, 1.35, zf + 0.395);
  g.add(face);
  g.add(lathe([[0, 0], [0.05, 0], [0.07, 0.05], [0.045, 0.15], [0.03, 0.2], [0.045, 0.24]], C.blueGlaze, -0.42, 1.24, zf + 0.36));
  // painting above the mantel
  g.add(box(1.12, 0.8, 0.05, C.brass, 0, 1.5, zf + 0.275));     // frame clear of the mantel clock (no flicker)
  const land = painting(768, 516, drawLandscape, [[0.05, 0.95, 0.74, 0.96]]); // the foreground hills
  const paint = mesh(new THREE.PlaneGeometry(0.98, 0.66), new THREE.MeshStandardMaterial({ map: land.tex, roughness: 0.9 }), false);
  fx.paintings.push({ ...land, id: 'land', mesh: paint, wM: 0.98, hM: 0.66 });
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
  // top, bottom and back fit BETWEEN the sides (no faces flush with the sides → no flicker)
  const Wi = W - 2 * t - 0.002;
  g.add(box(Wi, t, D - 0.004, C.wood, cx, H - t, cz));
  g.add(box(W + 0.12, 0.08, D + 0.06, C.woodDark, cx, H, cz + 0.01));
  g.add(box(Wi, 0.12, D - 0.004, C.woodDark, cx, 0, cz));
  g.add(box(Wi, H - 0.004, 0.02, C.woodDark, cx, 0, z0 + 0.055));  // in front of the wall
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
  // v13 (OS-18: 1.2): a solid trunk door instead of the pendulum window – nothing swings, so nothing
  // forces the room to be redrawn. A raised panel and a small brass keyhole plate.
  g.add(box(0.3, 0.9, 0.03, C.wood, 0, 0.7, 0.09));               // the door (front 0.105, just proud of the stiles)
  g.add(box(0.22, 0.72, 0.012, C.woodLight, 0, 0.79, 0.111));      // raised panel
  g.add(box(0.03, 0.05, 0.004, C.brass, 0.1, 1.08, 0.119));        // keyhole plate
  const pend = new THREE.Group();                                  // (kept empty: nothing to swing)
  return { group: g, pend, minute, hour };
  return { group: g, pend, minute, hour };
}

// ---------------------------------------------------------------- the rug (a hand-knotted design)
// The pattern is designed on a grid of KNOTS (512 × 400, about 7 mm each), like a real rug, then each
// knot is drawn as a little rounded tuft with its own slight colour variation, and every motif is
// carved slightly higher than the ground (relief). A Target Object can be knotted into one of the
// ornament places, in the same yarn colours and relief, so it reads as part of the design (OS-10: 2.3).
const RUG = { KW: 512, KH: 400, PX: 3, W: 3.6, D: 2.8, X: 1.1, Z: 0.35 };
const RUG_INK = '#4a1616';
function rugOrnament(c, type, s) { // centred at 0,0, size s (knots)
  const h = s / 2;
  c.beginPath();
  if (type === 0) { c.moveTo(0, -h); c.lineTo(h, 0); c.lineTo(0, h); c.lineTo(-h, 0); c.closePath(); c.moveTo(0, -h * 0.4); c.lineTo(-h * 0.4, 0); c.lineTo(0, h * 0.4); c.lineTo(h * 0.4, 0); c.closePath(); }
  else if (type === 1) { const a = h * 0.3; c.moveTo(-a, -h); c.lineTo(a, -h); c.lineTo(a, -a); c.lineTo(h, -a); c.lineTo(h, a); c.lineTo(a, a); c.lineTo(a, h); c.lineTo(-a, h); c.lineTo(-a, a); c.lineTo(-h, a); c.lineTo(-h, -a); c.lineTo(-a, -a); c.closePath(); }
  else if (type === 2) { c.arc(0, 0, h * 0.42, 0, Math.PI * 2); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.moveTo(Math.cos(a) * h * 0.78 + h * 0.2, Math.sin(a) * h * 0.78); c.arc(Math.cos(a) * h * 0.78, Math.sin(a) * h * 0.78, h * 0.2, 0, Math.PI * 2); } }
  else if (type === 3) { for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? h * 0.45 : h; k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); } c.closePath(); }
  else { c.moveTo(-h, h * 0.15); c.bezierCurveTo(-h, -h, h * 0.2, -h, 0, 0); c.bezierCurveTo(-h * 0.2, h, h, h, h, -h * 0.15); c.lineTo(h * 0.8, -h * 0.15); c.bezierCurveTo(h * 0.8, h * 0.75, -h * 0.05, h * 0.75, 0.15 * h, 0.05 * h); c.bezierCurveTo(h * 0.35, -h * 0.75, -h * 0.8, -h * 0.75, -h * 0.8, h * 0.15); c.closePath(); }
}

function buildRug(fx, r) {
  const { KW, KH, PX } = RUG;
  const design = document.createElement('canvas'); design.width = KW; design.height = KH;
  const mask = document.createElement('canvas'); mask.width = KW; mask.height = KH;
  const out = document.createElement('canvas'); out.width = KW * PX; out.height = KH * PX;
  const bump = document.createElement('canvas'); bump.width = KW * PX; bump.height = KH * PX;
  // ornament places: a lattice in the field (around the medallion) and a row along the border band
  const slots = [];
  const cx = KW / 2, cy = KH / 2;
  for (let y = 86; y <= KH - 86; y += 38) {
    for (let x = 86; x <= KW - 86; x += 40) {
      const ox = (Math.round((y - 86) / 38) % 2) * 20;           // offset rows, like a real lattice
      const px = x + ox;
      if (px > KW - 80) continue;
      if (Math.abs(px - cx) / 140 + Math.abs(y - cy) / 112 < 1) continue; // keep clear of the medallion
      slots.push({ x: px, y, s: 17, rot: 0, col: Math.round((y - 86) / 38) % 2 ? '#e3cc92' : '#c48a4a', type: Math.floor(r() * 5) });
    }
  }
  for (let x = 60; x <= KW - 60; x += 34) for (const y of [38, KH - 38]) slots.push({ x, y, s: 14, rot: 0, col: '#d4ad62', type: (x / 34) % 2 ? 0 : 2 });
  for (let y = 72; y <= KH - 72; y += 34) for (const x of [38, KW - 38]) slots.push({ x, y, s: 14, rot: Math.PI / 2, col: '#d4ad62', type: (y / 34) % 2 ? 0 : 2 });
  // the medallion's centre: a designed, central place for a knotted-in Target Object (TO v3)
  slots.unshift({ x: cx, y: cy, s: 28, rot: 0, col: '#d4ad62', type: -1, feature: true });
  const knotNoise = new Float32Array(KW * KH);
  for (let i = 0; i < knotNoise.length; i++) knotNoise[i] = 0.93 + r() * 0.12;

  // replace: { slot, draw(ctx) } knots a Target Object's outline into that ornament place instead.
  function render(replace) {
    if (!replace && !fx.rug?.replaced && fx.rug?.drawn) return;   // already the plain design
    if (fx.rug) { fx.rug.replaced = !!replace; fx.rug.drawn = true; }
    const c = design.getContext('2d'), m = mask.getContext('2d');
    const rect = (col, k) => { c.fillStyle = col; c.fillRect(k, k, KW - 2 * k, KH - 2 * k); };
    rect('#5e1f1f', 0); rect('#d4ad62', 16); rect('#7a2828', 22); rect('#2d3f5f', 54); rect('#8a3030', 60);
    m.fillStyle = '#000'; m.fillRect(0, 0, KW, KH);
    const diamond = (ctx, x, y, rx, ry, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.closePath(); ctx.fill();
    };
    diamond(c, cx, cy, 120, 95, '#d4ad62'); diamond(c, cx, cy, 108, 85, RUG_INK); diamond(c, cx, cy, 104, 81, '#2d3f5f');
    diamond(c, cx, cy, 60, 46, '#8a3030'); diamond(c, cx, cy, 40, 30, '#d4ad62'); diamond(c, cx, cy, 14, 11, RUG_INK);
    diamond(m, cx, cy, 120, 95, '#666'); diamond(m, cx, cy, 104, 81, '#000'); diamond(m, cx, cy, 40, 30, '#888');
    slots.forEach((s, i) => {
      for (const [ctx, fill, ink] of [[c, s.col, RUG_INK], [m, '#fff', '#fff']]) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
        if (replace && replace.slot === i) replace.draw(ctx, s.s);
        else if (s.type >= 0) { rugOrnament(ctx, s.type, s.s); ctx.fill('evenodd'); ctx.stroke(); }
        ctx.restore();
      }
    });
    // knots: every knot becomes a small rounded tuft (light centre, darker edge) with its own shade
    const src = c.getImageData(0, 0, KW, KH).data, msk = m.getImageData(0, 0, KW, KH).data;
    const oc = out.getContext('2d'), bc = bump.getContext('2d');
    const od = oc.createImageData(KW * PX, KH * PX), bd = bc.createImageData(KW * PX, KH * PX);
    const tuft = [0.87, 1.0, 0.87];
    for (let ky = 0; ky < KH; ky++) {
      for (let kx = 0; kx < KW; kx++) {
        const k = ky * KW + kx, j = k * 4, n = knotNoise[k], lift = msk[j] / 255;
        for (let py = 0; py < PX; py++) {
          for (let px = 0; px < PX; px++) {
            const t = tuft[px] * tuft[py], o = ((ky * PX + py) * KW * PX + kx * PX + px) * 4;
            od.data[o] = src[j] * t * n; od.data[o + 1] = src[j + 1] * t * n; od.data[o + 2] = src[j + 2] * t * n; od.data[o + 3] = 255;
            const hgt = 255 * (0.35 * t + 0.45 * lift);
            bd.data[o] = bd.data[o + 1] = bd.data[o + 2] = hgt; bd.data[o + 3] = 255;
          }
        }
      }
    }
    oc.putImageData(od, 0, 0); bc.putImageData(bd, 0, 0);
    tex.needsUpdate = true; btex.needsUpdate = true;
  }
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const btex = new THREE.CanvasTexture(bump);
  btex.anisotropy = 8;
  render(null);
  // a real layer on the floor: 3 cm thick, casts its own small shadow at the edges
  const material = new THREE.MeshStandardMaterial({ map: tex, bumpMap: btex, bumpScale: 2.5, roughness: 1, flatShading: true });
  const rug = mesh(new THREE.BoxGeometry(RUG.W, 0.03, RUG.D), material, true);
  rug.userData.grain = 'z';
  rug.position.set(RUG.X, 0.015, RUG.Z);
  // knot (x, y) → room position on the rug's top
  const toWorld = (x, y) => new THREE.Vector3(RUG.X - RUG.W / 2 + (x / KW) * RUG.W, 0.03, RUG.Z - RUG.D / 2 + (y / KH) * RUG.D);
  fx.rug = { mesh: rug, slots, render, toWorld, KW, KH, metresPerKnot: RUG.W / KW };
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
  // inkwell (squat glass pot with a neck) and a quill dipped in it
  g.add(cyl(0.032, 0.04, 0.045, 10, C.ink, -0.45, H, -0.18));
  g.add(cyl(0.018, 0.024, 0.014, 10, C.ink, -0.45, H + 0.045, -0.18));
  g.add(cyl(0.021, 0.021, 0.005, 10, C.brass, -0.45, H + 0.059, -0.18));
  g.add(buildQuill(-0.45, H + 0.062, -0.18));
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
  g.add(box(0.6, 0.12, 0.68, C.greenDark, 0, 0.38, 0.06));          // 2 cm gaps at the arms (things can slip in)
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

// A rod (cylinder) running from point a to point b.
function rod(a, b, r0, r1, color, sides = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r1, r0, d.length(), sides), color);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// Desk globe: a tripod whose legs splay OUT to the floor, a turned stem, and a brass meridian
// ring (in the plane of the tilted axis) that holds the globe by pins at both poles.
function buildGlobe(r) {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5, c = Math.cos(a), s = Math.sin(a);
    g.add(rod(V(c * 0.06, 0.5, s * 0.06), V(c * 0.27, 0.0, s * 0.27), 0.022, 0.016, C.woodDark));
    g.add(cyl(0.028, 0.03, 0.02, 6, C.woodDark, c * 0.27, 0, s * 0.27));          // feet
    g.add(rod(V(c * 0.13, 0.27, s * 0.13), V(Math.cos(a + 2.094) * 0.13, 0.27, Math.sin(a + 2.094) * 0.13), 0.008, 0.008, C.wood, 5)); // stretcher
  }
  g.add(cyl(0.075, 0.09, 0.07, 8, C.wood, 0, 0.47, 0));                            // hub
  g.add(cyl(0.025, 0.04, 0.12, 8, C.wood, 0, 0.54, 0));                            // turned stem
  g.add(cyl(0.03, 0.03, 0.02, 8, C.brass, 0, 0.64, 0));                            // brass collar
  const brass = mat(C.brass, { rough: 0.4, metal: 0.3 });
  const meridian = mesh(new THREE.TorusGeometry(0.33, 0.012, 5, 32), brass);       // in the axis plane: its lowest point
  meridian.position.set(0, 0.98, 0);                                               // sits right on the stem
  g.add(meridian);
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.98, 0);
  tilt.rotation.z = 0.41;
  for (const sy of [-1, 1]) tilt.add(cyl(0.008, 0.008, 0.04, 6, C.brass, 0, sy > 0 ? 0.295 : -0.335, 0)); // pole pins
  // v14 (OS-19: 1.6.1): Earth's real continents (simplified outlines, longitude/latitude in degrees),
  // in the parchment-and-sea colours of an antique globe
  const tex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#2f5f86'; c.fillRect(0, 0, w, h);
    const X = (lon) => ((lon + 180) / 360) * w, Y = (lat) => ((90 - lat) / 180) * h;
    const land = (pts) => { c.beginPath(); pts.forEach(([lo, la], i) => (i ? c.lineTo(X(lo), Y(la)) : c.moveTo(X(lo), Y(la)))); c.closePath(); c.fill(); c.stroke(); };
    c.fillStyle = '#d9c48a'; c.strokeStyle = '#8a6f3a'; c.lineWidth = 1.2;
    land([[-168, 65], [-156, 71], [-125, 70], [-95, 72], [-80, 68], [-62, 58], [-56, 50], [-66, 44], [-76, 35], [-81, 25], [-90, 29], [-97, 25], [-97, 18], [-87, 15], [-79, 8], [-85, 11], [-105, 20], [-117, 32], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 60]]); // North America
    land([[-78, 9], [-62, 11], [-50, 0], [-35, -6], [-39, -16], [-48, -26], [-58, -36], [-65, -42], [-68, -54], [-74, -51], [-73, -37], [-71, -18], [-81, -5]]); // South America
    land([[-52, 61], [-42, 60], [-20, 70], [-20, 80], [-40, 83], [-62, 80], [-72, 77]]);                                        // Greenland
    land([[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [5, 58], [12, 66], [25, 71], [40, 68], [44, 46], [36, 41], [26, 40], [22, 37], [12, 38], [3, 42]]); // Europe
    land([[-17, 21], [-16, 12], [-8, 4], [8, 4], [9, -2], [13, -12], [12, -18], [18, -34], [27, -34], [35, -23], [40, -15], [40, -3], [51, 11], [43, 12], [33, 30], [22, 32], [10, 37], [-6, 36]]); // Africa
    land([[44, 46], [40, 68], [60, 70], [80, 73], [105, 78], [140, 72], [170, 66], [178, 64], [160, 58], [142, 50], [140, 40], [122, 30], [120, 22], [108, 15], [104, 2], [100, 14], [92, 22], [80, 10], [73, 20], [66, 25], [57, 25], [52, 28], [48, 30], [50, 37]]); // Asia
    land([[43, 13], [52, 16], [58, 22], [56, 25], [50, 26], [48, 30], [36, 32], [38, 22]]);                                     // Arabia
    land([[114, -22], [123, -16], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [151, -34], [146, -39], [138, -35], [130, -32], [118, -35], [115, -33]]); // Australia
    land([[166, -46], [174, -41], [178, -38], [172, -34]]);                                                                    // New Zealand
    land([[130, 31], [136, 34], [141, 41], [142, 45], [138, 37], [132, 33]]);                                                   // Japan
    land([[-6, 50], [2, 51], [-2, 56], [-5, 58], [-6, 55]]);                                                                    // Britain
    land([[44, -25], [50, -16], [49, -12], [44, -17]]);                                                                         // Madagascar
    c.fillRect(0, Y(-68), w, h - Y(-68)); c.beginPath(); c.moveTo(0, Y(-68)); c.lineTo(w, Y(-68)); c.stroke(); // Antarctica
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.8;                                               // faint grid
    for (let lo = -150; lo <= 180; lo += 30) { c.beginPath(); c.moveTo(X(lo), 0); c.lineTo(X(lo), h); c.stroke(); }
    for (let la = -60; la <= 60; la += 30) { c.beginPath(); c.moveTo(0, Y(la)); c.lineTo(w, Y(la)); c.stroke(); }
  });
  const ball = mesh(new THREE.SphereGeometry(0.3, 22, 14), mat(0xffffff, { map: tex, rough: 0.6 }));
  tilt.add(ball);
  g.add(tilt);
  return { group: g, ball };
}

// Quill pen: a feather about 7× wider near the top than at the nib; the lowest 20 % sits in the ink.
function buildQuill(x, y, z) {
  const L = 0.26, g = new THREE.Group();
  const q = new THREE.Group();
  q.position.y = -0.2 * L;                                   // the tip goes 20 % into the inkwell
  const sh = new THREE.Shape();                              // the vane, one side wider (like a real feather)
  sh.moveTo(0.0015, 0.28 * L);
  sh.bezierCurveTo(0.012, 0.42 * L, 0.024, 0.62 * L, 0.02, 0.86 * L);
  sh.bezierCurveTo(0.017, 0.95 * L, 0.006, 0.995 * L, 0, L);
  sh.bezierCurveTo(-0.006, 0.97 * L, -0.016, 0.86 * L, -0.017, 0.62 * L);
  sh.bezierCurveTo(-0.016, 0.45 * L, -0.006, 0.33 * L, -0.0015, 0.28 * L);
  const vane = mesh(new THREE.ShapeGeometry(sh, 10), mat(C.cream, { rough: 0.8, side: THREE.DoubleSide }));
  q.add(vane);
  q.add(cyl(0.0012, 0.0028, L * 0.98, 5, 0xe8dcc0, 0, 0.01, 0));                  // the shaft
  q.add(cyl(0.0028, 0.0005, 0.012, 5, C.ink, 0, 0, 0));                            // inked nib
  g.add(q);
  g.position.set(x, y, z);
  g.rotation.set(0.15, 0.6, -0.42);                         // leaning out of the pot
  return g;
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

function buildChest(fx) {
  const g = new THREE.Group();
  g.add(box(0.95, 0.42, 0.52, C.woodLight, 0, 0, 0));
  g.add(box(0.99, 0.12, 0.56, C.wood, 0, 0.42, 0));
  for (const x of [-0.3, 0.3]) g.add(box(0.05, 0.55, 0.575, C.iron, x, 0, 0));
  g.add(box(0.1, 0.12, 0.03, C.brass, 0, 0.32, 0.27));
  g.add(box(0.008, 0.022, 0.002, C.soot, 0, 0.365, 0.2855)); // keyhole
  // SOCKET: a place on a PO/BG that can hold a TO inside it (here: a key in the lock).
  // It moves with the trunk if the room is ever re-arranged.
  fx.sockets.push({ kind: 'key-lock', parent: g, pos: new THREE.Vector3(0, 0.376, 0.287), out: new THREE.Vector3(0, 0, 1) });
  return g;
}

// Fireplace companion set: a stand with three hanging tools – poker, tongs and shovel.
function buildFireTools() {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const iron = C.iron, brass = mat(C.brass, { rough: 0.4, metal: 0.4 });
  g.add(cyl(0.11, 0.13, 0.03, 8, iron));                                    // base
  g.add(cyl(0.011, 0.011, 0.82, 6, iron, 0, 0.03, 0));                     // post
  g.add(cyl(0.035, 0.035, 0.025, 8, brass, 0, 0.85, 0));                   // brass finial
  const hooks = [0.3, 2.4, 4.5];                                            // three arms near the top
  hooks.forEach((a) => g.add(rod(V(0, 0.8, 0), V(Math.cos(a) * 0.075, 0.82, Math.sin(a) * 0.075), 0.005, 0.005, iron, 4)));
  const at = (a, r = 0.075) => [Math.cos(a) * r, Math.sin(a) * r];
  // 1) POKER: straight rod, ring handle, a hooked spur at the tip
  {
    const [x, z] = at(hooks[0]);
    g.add(cyl(0.006, 0.006, 0.66, 6, iron, x, 0.1, z));
    const ring = mesh(new THREE.TorusGeometry(0.022, 0.005, 4, 10), brass);
    ring.position.set(x, 0.79, z);
    ring.rotation.y = hooks[0];
    g.add(ring);
    g.add(rod(V(x, 0.14, z), V(x + 0.03, 0.1, z), 0.005, 0.004, iron, 4));    // spur
    g.add(rod(V(x, 0.1, z), V(x, 0.06, z), 0.006, 0.003, iron, 4));          // point
  }
  // 2) TONGS: two arms hinged near the top, slightly open, with flat grips at the bottom
  {
    const [x, z] = at(hooks[1]);
    const t = Math.atan2(z, x) + Math.PI / 2, ox = Math.cos(t) * 0.012, oz = Math.sin(t) * 0.012;
    for (const s of [-1, 1]) {
      g.add(rod(V(x, 0.62, z), V(x + s * ox, 0.12, z + s * oz), 0.005, 0.005, iron, 4));
      const grip = box(0.012, 0.05, 0.012, iron, x + s * ox * 1.05, 0.07, z + s * oz * 1.05);
      g.add(grip);
    }
    g.add(cyl(0.008, 0.008, 0.015, 6, brass, x, 0.61, z));                  // hinge
    g.add(cyl(0.005, 0.005, 0.15, 6, iron, x, 0.63, z));
    const loop = mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), brass);
    loop.position.set(x, 0.8, z);
    loop.rotation.y = hooks[1];
    g.add(loop);
  }
  // 3) SHOVEL: handle, rod, and a flat blade with a raised back lip
  {
    const [x, z] = at(hooks[2]);
    g.add(cyl(0.006, 0.006, 0.6, 6, iron, x, 0.2, z));
    g.add(cyl(0.012, 0.012, 0.06, 6, brass, x, 0.74, z));                   // handle
    const blade = new THREE.Group();
    blade.position.set(x, 0.05, z);
    blade.rotation.y = -hooks[2];
    blade.add(box(0.012, 0.15, 0.11, iron, 0, 0, 0));                       // the blade (thin plate)
    blade.add(box(0.03, 0.02, 0.11, iron, 0.012, 0, 0));                    // turned-up lip
    g.add(blade);
  }
  return g;
}

function buildLogBasket() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.25, 0.34, 0x8a6a3a, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), C.logs);
    log.rotation.z = Math.PI / 2;
    // two side by side, the third resting in the groove on top (no log passes through another)
    log.position.set(0, i === 2 ? 0.401 : 0.3, i === 2 ? -0.005 : -0.07 + i * 0.13);
    g.add(log);
  }
  return g;
}

// ---------------------------------------------------------------- the fire's day (OS-8: 5)
// level = fire intensity (light it gives), embers = how brightly the embers glow. Times are hours.
//   9:00–9:15  a new fire is lit: kindling grows to full
//   9:15–21:00 full fire (each flame varies, so it moves between ~80 and 100 %)
//   21:00–24:00 dies down to low flames (→ 50 %)
//   0:00–3:00  flames shrink away; bright glowing embers by 3:00 (→ 10 %), slowly pulsing
//   3:00–6:00  embers fade to a low glow; 6:00–9:00 a steady faint glow inside the firebox only
export function fireState(h) {
  const k = (a, b) => Math.min(1, Math.max(0, (h - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  let level, embers;
  if (h >= 9 && h < 9.25) { level = 0.06 + 0.84 * ease(k(9, 9.25)); embers = 0.35 + 0.25 * k(9, 9.25); }
  else if (h >= 9.25 && h < 21) { level = 0.9; embers = 0.6; }
  else if (h >= 21) { level = 0.9 - 0.4 * k(21, 24); embers = 0.6; }
  else if (h < 3) { level = 0.5 - 0.4 * k(0, 3); embers = 0.6 + 0.4 * k(0, 3); }
  else if (h < 6) { level = 0.1 - 0.04 * k(3, 6); embers = 1.0 - 0.65 * k(3, 6); }
  else { level = 0.06; embers = 0.35; }
  const flames = Math.min(1, Math.max(0, (level - 0.1) / 0.8)); // how big the flames are (0 = none)
  return { level, embers, flames };
}

const FLAME_DIM = new THREE.Color(0xff5a14), FLAME_BRIGHT = new THREE.Color(0xffe28a);
const EMBER_DIM = new THREE.Color(0x3a0c04), EMBER_HOT = new THREE.Color(0xff7a2a);

function animateFire(fx, t, dt, hours) {
  const st = fireState(hours);
  let sum = 0;
  for (const f of fx.fireFlames) {
    const u = f.userData;
    if (t >= u.next) { // each flame picks a new random "mood" for a random while
      u.th = 0.55 + Math.random() * 0.7;
      u.tw = 0.75 + Math.random() * 0.5;
      u.tb = Math.min(1, 0.25 + 0.6 * (u.th - 0.55) / 0.7 + Math.random() * 0.3); // taller → brighter
      u.rate = 3 + Math.random() * 9;
      u.next = t + 0.12 + Math.random() * 0.9;
    }
    const k = 1 - Math.exp(-dt * u.rate);
    u.h += (u.th - u.h) * k; u.w += (u.tw - u.w) * k; u.b += (u.tb - u.b) * k;
    const lick = 1 + 0.07 * Math.sin(t * 19 + u.phase) + 0.04 * Math.sin(t * 31 + u.phase * 2);
    const F = st.flames;
    f.visible = F > 0.02;
    f.scale.set(u.w * (0.45 + 0.55 * F), Math.max(0.001, u.h * F * lick), u.w * (0.45 + 0.55 * F));
    f.material.color.copy(FLAME_DIM).lerp(FLAME_BRIGHT, u.b);
    sum += u.h * u.b;
  }
  for (const e of fx.embers) { // slow pulsing glow
    const u = e.userData;
    const p = 0.8 + 0.2 * Math.sin(t * u.speed + u.phase);
    e.material.color.copy(EMBER_DIM).lerp(EMBER_HOT, Math.min(1, st.embers * p));
  }
  const avg = sum / fx.fireFlames.length;                 // ~0.45 on average
  const ember = 0.85 + 0.15 * Math.sin(t * 0.7);
  fx.fire = {
    level: st.level,
    flames: st.flames,
    // brighter flames → more light; with no flames, the slow ember pulse
    flicker: st.flames > 0.02 ? (0.7 + 0.65 * avg) * st.flames + ember * (1 - st.flames) : ember,
  };
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

// ---------------------------------------------------------------- paintings (repaintable)
// A painting can have a Target Object painted into it (a "nested" target, SDD 9.02.2).
// render(extra) repaints the picture, then lets extra(ctx, w, h) paint something into it.
function painting(w, h, base, regions) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let replaced = false, drawn = false;
  const render = (extra) => {
    if (!extra && !replaced && drawn) return;            // already the plain picture
    replaced = !!extra; drawn = true;
    const ctx = c.getContext('2d');
    ctx.save(); base(ctx, w, h); ctx.restore();
    if (extra) { ctx.save(); extra(ctx, w, h); ctx.restore(); }
    tex.needsUpdate = true;
  };
  render(null);
  return { canvas: c, tex, render, regions };
}

function drawLandscape(c, w, h) {
  const s = w / 256;
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f3c98e'); sky.addColorStop(0.6, '#e49a62');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff1c2'; c.beginPath(); c.arc(w * 0.7, h * 0.42, 16 * s, 0, Math.PI * 2); c.fill();
  const hill = (col, pts) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); pts.forEach(([px, py]) => c.lineTo(px * w, py * h)); c.lineTo(w, h); c.fill(); };
  hill('#8a9a62', [[0, 0.6], [0.25, 0.48], [0.5, 0.58], [0.8, 0.5], [1, 0.56]]);
  hill('#56704a', [[0, 0.72], [0.3, 0.64], [0.6, 0.74], [1, 0.66]]);
  hill('#33493a', [[0, 0.86], [0.4, 0.8], [0.7, 0.88], [1, 0.82]]);
  c.fillStyle = '#22352a';
  for (const [tx, ty] of [[0.15, 0.7], [0.2, 0.72], [0.82, 0.68]]) {
    c.beginPath(); c.moveTo(tx * w, ty * h - 26 * s); c.lineTo(tx * w + 9 * s, ty * h); c.lineTo(tx * w - 9 * s, ty * h); c.fill();
  }
  // painterly brush texture over everything
  brushTexture(c, w, h, 0x4c11);
}

function drawStillLife(c, w, h) {
  const s = w / 200;
  c.fillStyle = '#3b2f2a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#6b4a2e'; c.fillRect(0, h * 0.72, w, h * 0.28);
  c.fillStyle = '#3d6f8f'; c.beginPath(); c.ellipse(w * 0.45, h * 0.6, 22 * s, 30 * s, 0, 0, Math.PI * 2); c.fill();
  for (const [fx, fy, col] of [[0.38, 0.28, '#c94a3a'], [0.5, 0.22, '#e8c24a'], [0.46, 0.34, '#d9d0c0'], [0.56, 0.32, '#c94a3a']]) {
    c.fillStyle = col; c.beginPath(); c.arc(fx * w, fy * h, 9 * s, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#c9a14a'; c.beginPath(); c.arc(w * 0.75, h * 0.7, 12 * s, 0, Math.PI * 2); c.fill();
  brushTexture(c, w, h, 0x7a21);
}

// Short, faint strokes in random directions, so a painting reads as brushwork (and anything
// painted into it later gets the same treatment).
function brushTexture(c, w, h, seed) {
  const r = rng(seed);
  c.save();
  c.globalAlpha = 0.06;
  c.lineCap = 'round';
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 4 + r() * 10;
    c.strokeStyle = r() < 0.5 ? '#000' : '#fff';
    c.lineWidth = 1 + r() * 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.restore();
}
