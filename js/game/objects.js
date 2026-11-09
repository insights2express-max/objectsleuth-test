// TARGET OBJECT ASSETS (Draft 1): six small objects, each with
//   build()  → the 3D object, lying in its natural rest pose: length along x, thickness along y,
//              bottom at y = 0 (the chess knight stands on its base);
//   shapes() → its flat outline (metres; x = length, y = across) for the FIGURATIVE forms:
//              knotted into the rug, painted into a picture, or embossed into furniture.
import * as THREE from '../../vendor/three/three.module.js';
import { mat, mesh, box, cyl } from '../art/kit.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

const BRASS = 0xc9a14a, GOLD = 0xd9b45a, CREAM = 0xf3ead2, WOOD = 0x4a2c19, STEEL = 0x9aa0a8, LENS = 0xbfd8e2, INK = 0x1d2236;

// --- outline helpers
const circle = (cx, cy, r, hole = 0) => {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  if (hole) { const h = new THREE.Path(); h.absarc(cx, cy, hole, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
};
const rect = (x0, y0, x1, y1) => {
  const s = new THREE.Shape();
  s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
  return s;
};
const poly = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };

// ---------------------------------------------------------------- the six objects
function pocketWatch() {
  const g = new THREE.Group();
  const gold = mat(GOLD, { rough: 0.35, metal: 0.6 });
  const c = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.009, 16), gold);
  c.position.y = 0.0045;
  const face = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.0015, 16), mat(CREAM, { rough: 0.5 }), false);
  face.position.y = 0.0095;
  const crown = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8), gold);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(-0.028, 0.0045, 0);
  const bow = mesh(new THREE.TorusGeometry(0.007, 0.0016, 4, 10), gold);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(-0.036, 0.0045, 0);
  const h1 = box(0.014, 0.0006, 0.0015, mat(INK), -0.005, 0.0102, 0);
  const h2 = box(0.01, 0.0006, 0.0018, mat(INK), 0.002, 0.0102, 0.003);
  h2.rotation.y = 1.2;
  g.add(c, face, crown, bow, h1, h2);
  return g;
}
function watchShapes() {
  return [circle(0, 0, 0.025), circle(-0.0335, 0, 0.0075, 0.0042), rect(-0.031, -0.0035, -0.024, 0.0035)];
}

function brassKey() {
  const g = new THREE.Group();
  const m = mat(BRASS, { rough: 0.4, metal: 0.5 });
  const bowR = mesh(new THREE.TorusGeometry(0.011, 0.0032, 5, 12), m);
  bowR.rotation.x = Math.PI / 2;
  bowR.position.set(-0.034, 0.0032, 0);
  const shaft = box(0.052, 0.0045, 0.0045, m, 0, 0.001, 0);
  const t1 = box(0.004, 0.003, 0.009, m, 0.018, 0.001, 0.006);
  const t2 = box(0.006, 0.003, 0.006, m, 0.024, 0.001, 0.005);
  g.add(bowR, shaft, t1, t2);
  return g;
}
function keyShapes() {
  return [circle(-0.034, 0, 0.0135, 0.0075), rect(-0.022, -0.0028, 0.026, 0.0028), rect(0.016, 0.0028, 0.020, 0.0095), rect(0.0215, 0.0028, 0.027, 0.0072)];
}

function magnifier() {
  const g = new THREE.Group();
  const brass = mat(BRASS, { rough: 0.35, metal: 0.5 });
  const ring = mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 20), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.006;
  const lens = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 20), mat(LENS, { rough: 0.08, metal: 0.1 }), false);
  lens.position.y = 0.006;
  const collar = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.02, 8), brass);
  collar.rotation.z = Math.PI / 2;
  collar.position.set(0.056, 0.009, 0);
  const handle = mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.1, 8), mat(WOOD, { rough: 0.6 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.115, 0.011, 0);
  g.add(ring, lens, collar, handle);
  return g;
}
function magnifierShapes() {
  return [circle(0, 0, 0.048, 0.037), rect(0.046, -0.007, 0.07, 0.007), poly([[0.07, -0.009], [0.165, -0.011], [0.168, 0], [0.165, 0.011], [0.07, 0.009]])];
}

function spectacles() {
  const g = new THREE.Group();
  const wire = mat(0x6b5a3a, { rough: 0.4, metal: 0.6 });
  for (const s of [-1, 1]) {
    const rim = mesh(new THREE.TorusGeometry(0.02, 0.0018, 4, 18), wire);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(s * 0.027, 0.002, 0);
    const glass = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.0012, 16), mat(LENS, { rough: 0.05, metal: 0.1 }), false);
    glass.position.set(s * 0.027, 0.002, 0);
    const temple = box(0.002, 0.002, 0.1, wire, s * 0.047, 0.001, -0.05);
    temple.rotation.y = s * 0.08;
    g.add(rim, glass, temple);
  }
  const bridge = mesh(new THREE.TorusGeometry(0.0055, 0.0015, 4, 8, Math.PI), wire);
  bridge.rotation.x = -Math.PI / 2;
  bridge.position.set(0, 0.002, 0.004);
  g.add(bridge);
  return g;
}
function spectaclesShapes() {
  return [circle(-0.027, 0, 0.021, 0.017), circle(0.027, 0, 0.021, 0.017), rect(-0.0075, 0.004, 0.0075, 0.0075), rect(-0.052, 0.002, -0.046, 0.007), rect(0.046, 0.002, 0.052, 0.007)];
}

// Chess knight: a turned base and a horse-head profile.
const KNIGHT = [[-0.016, 0.012], [0.016, 0.012], [0.014, 0.022], [0.012, 0.036], [0.017, 0.046], [0.016, 0.058], [0.007, 0.072],
  [0.0, 0.074], [-0.004, 0.082], [-0.009, 0.071], [-0.019, 0.066], [-0.024, 0.058], [-0.02, 0.052], [-0.008, 0.054], [-0.012, 0.036], [-0.014, 0.022]];
function chessKnight() {
  const g = new THREE.Group();
  const ebony = Math.random() < 0.5;
  const m = mat(ebony ? 0x2a2420 : 0xe8dcc0, { rough: 0.35 });
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.008, 14), m));
  g.children[0].position.y = 0.004;
  const ring = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.005, 14), m);
  ring.position.y = 0.0105;
  g.add(ring);
  const head = mesh(new THREE.ExtrudeGeometry(poly(KNIGHT), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 1 }), m);
  head.position.z = -0.007;
  g.add(head);
  return g;
}
function knightShapes() {
  return [poly([[-0.021, 0], [0.021, 0], [0.019, 0.008], [0.016, 0.012], ...KNIGHT.slice(2), [-0.016, 0.012], [-0.019, 0.008]])];
}

function scissors() {
  const g = new THREE.Group();
  const steel = mat(STEEL, { rough: 0.25, metal: 0.8 });
  for (const s of [-1, 1]) {
    const blade = mesh(new THREE.ExtrudeGeometry(poly([[-0.018, s * 0.002], [0.07, s * -0.003], [0.068, s * 0.002], [-0.01, s * 0.008]]), { depth: 0.0018, bevelEnabled: false }), steel);
    blade.rotation.x = -Math.PI / 2;
    blade.position.y = s > 0 ? 0.0018 : 0.0036;
    const ringM = mesh(new THREE.TorusGeometry(0.011, 0.0025, 4, 12), steel);
    ringM.rotation.x = Math.PI / 2;
    ringM.position.set(-0.032, 0.0025, -s * 0.012);
    g.add(blade, ringM);
  }
  const pin = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.006, 6), steel);
  pin.position.set(0, 0.003, 0);
  g.add(pin);
  return g;
}
function scissorsShapes() {
  return [circle(-0.032, 0.012, 0.0125, 0.0085), circle(-0.032, -0.012, 0.0125, 0.0085),
    poly([[-0.022, 0.006], [0.07, -0.004], [0.068, 0.0015], [-0.015, 0.011]]), poly([[-0.022, -0.006], [0.07, 0.004], [0.068, -0.0015], [-0.015, -0.011]])];
}

// ================================================================ v15 LIBRARY (M2)
// 22 more objects, classic and modern (OS-19: 5.5 – laptops, phones, chargers…). Each round picks 6 of
// the whole library as Target Objects; others appear as Passive Objects (decoys / cover).
const rrect = (x0, y0, x1, y1, r) => {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
};
const ellipse = (cx, cy, rx, ry) => { const s = new THREE.Shape(); s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false); return s; };
const holeCircle = (cx, cy, r) => { const h = new THREE.Path(); h.absarc(cx, cy, r, 0, Math.PI * 2, true); return h; };
// a band of width w around a polyline (cables)
function strip(pts, w) {
  const L = [], R = [];
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1, ox = (-dy / n) * w / 2, oy = (dx / n) * w / 2;
    L.push([x + ox, y + oy]); R.unshift([x - ox, y - oy]);
  });
  return poly([...L, ...R]);
}
function heartShape(cx, cy, s, path = new THREE.Shape()) {
  path.moveTo(cx, cy - s * 0.45);
  path.bezierCurveTo(cx - s * 0.1, cy - s * 0.3, cx - s * 0.5, cy - s * 0.05, cx - s * 0.5, cy + s * 0.18);
  path.bezierCurveTo(cx - s * 0.5, cy + s * 0.45, cx - s * 0.12, cy + s * 0.5, cx, cy + s * 0.25);
  path.bezierCurveTo(cx + s * 0.12, cy + s * 0.5, cx + s * 0.5, cy + s * 0.45, cx + s * 0.5, cy + s * 0.18);
  path.bezierCurveTo(cx + s * 0.5, cy - s * 0.05, cx + s * 0.1, cy - s * 0.3, cx, cy - s * 0.45);
  return path;
}
const along = (m) => { m.rotation.z = Math.PI / 2; return m; };            // cylinder lying along x
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const STEEL_M = () => mat(STEEL, { rough: 0.3, metal: 0.8 });

// ---------- modern
function smartphone() {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(0.146, 0.008, 0.071, 1, 0.003), mat(0x2b2d31, { rough: 0.35, metal: 0.4 })), 0, 0.004, 0));
  g.add(box(0.134, 0.0009, 0.063, mat(0x0d1220, { rough: 0.12 }), 0, 0.0078, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.0012, 10), mat(0x050505, { rough: 0.2 }), false), 0.062, 0.0088, 0.022));
  return g;
}
const phoneShapes = () => [rrect(-0.073, -0.0355, 0.073, 0.0355, 0.007), circle(0.062, 0.022, 0.0045, 0.0022)];

function charger() {
  const g = new THREE.Group(), white = mat(0xf2f2f0, { rough: 0.5 });
  g.add(box(0.034, 0.026, 0.034, white, 0, 0, 0));
  for (const z of [-0.006, 0.006]) g.add(box(0.017, 0.003, 0.0016, STEEL_M(), -0.0235, 0.011, z));
  const pts = [[0.016, 0.006, 0], [0.05, 0.003, 0.014], [0.09, 0.003, -0.016], [0.13, 0.003, 0.012], [0.16, 0.003, -0.004]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.0025, 5), white));
  g.add(box(0.014, 0.005, 0.008, white, 0.166, 0.0005, -0.004));
  return g;
}
const chargerShapes = () => [rect(-0.017, -0.017, 0.017, 0.017), rect(-0.032, -0.0068, -0.017, -0.0052), rect(-0.032, 0.0052, -0.017, 0.0068),
  strip([[0.016, 0], [0.05, -0.014], [0.09, 0.016], [0.13, -0.012], [0.16, 0.004]], 0.005), rect(0.159, -0.0005, 0.173, 0.0085)];

function earbuds() {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(0.062, 0.026, 0.048, 2, 0.012), mat(0xf7f7f5, { rough: 0.25 })), 0, 0.013, 0));
  g.add(box(0.0626, 0.0008, 0.0484, mat(0xc8c8c4, { rough: 0.4 }), 0, 0.0172, 0));
  g.add(box(0.003, 0.0012, 0.004, mat(0x3fd16a, { emissive: 0x2a8a46 }), 0.0312, 0.008, 0));
  return g;
}
const earbudsShapes = () => [rrect(-0.031, -0.024, 0.031, 0.024, 0.014)];

function usbStick() {
  const g = new THREE.Group();
  g.add(box(0.042, 0.008, 0.017, mat(0xb03030, { rough: 0.45 }), 0, 0, 0));
  g.add(box(0.013, 0.0045, 0.012, STEEL_M(), 0.0265, 0.0018, 0));
  return g;
}
const usbShapes = () => [rect(-0.021, -0.0085, 0.021, 0.0085), rect(0.02, -0.006, 0.033, 0.006)];

function laptop() {
  const g = new THREE.Group();
  g.add(box(0.31, 0.01, 0.215, mat(0xaeb3b9, { rough: 0.35, metal: 0.5 }), 0, 0, 0));
  g.add(box(0.306, 0.007, 0.211, mat(0xc3c7cc, { rough: 0.3, metal: 0.5 }), 0, 0.0095, 0));
  g.add(cyl(0.012, 0.012, 0.0008, 12, mat(0xf4f4f4, { rough: 0.2 }), 0, 0.0163, 0));
  return g;
}
const laptopShapes = () => { const s = rrect(-0.155, -0.1075, 0.155, 0.1075, 0.01); s.holes.push(holeCircle(0, 0, 0.012)); return [s]; };

function remote() {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(0.17, 0.018, 0.045, 1, 0.006), mat(0x1e1f22, { rough: 0.5 })), 0, 0.009, 0));
  const grey = mat(0x6a6d72, { rough: 0.5 });
  for (const [x, z] of [[0.035, 0], [0.005, -0.011], [0.005, 0.011], [-0.025, 0]]) g.add(cyl(0.005, 0.005, 0.003, 8, grey, x, 0.0165, z));
  g.add(cyl(0.0045, 0.0045, 0.003, 8, mat(0xc0392b, { rough: 0.4 }), 0.068, 0.0165, 0.012));
  return g;
}
const remoteShapes = () => { const s = rrect(-0.085, -0.0225, 0.085, 0.0225, 0.008); [[0.035, 0], [0.005, -0.011], [0.005, 0.011], [-0.025, 0], [0.068, 0.012]].forEach(([x, y]) => s.holes.push(holeCircle(x, y, 0.0045))); return [s]; };

function battery() {
  const g = new THREE.Group();
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.0355, 12), mat(0x222326, { rough: 0.4, metal: 0.3 }))), -0.0075, 0.007, 0));
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.0155, 12), mat(0xc77a3a, { rough: 0.35, metal: 0.6 }))), 0.0175, 0.007, 0));
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.003, 8), STEEL_M())), 0.0262, 0.007, 0));
  return g;
}
const batteryShapes = () => [rect(-0.025, -0.007, 0.025, 0.007), rect(0.025, -0.0025, 0.0276, 0.0025)];

function keyFob() {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(0.058, 0.014, 0.032, 1, 0.006), mat(0x16171a, { rough: 0.45 })), 0, 0.007, 0));
  const grey = mat(0x55585e, { rough: 0.5 });
  for (const x of [-0.012, 0.008]) g.add(cyl(0.006, 0.006, 0.002, 10, grey, x, 0.0132, 0));
  g.add(box(0.05, 0.003, 0.009, STEEL_M(), 0.052, 0.0055, 0));
  return g;
}
const fobShapes = () => { const s = rrect(-0.029, -0.016, 0.029, 0.016, 0.007); s.holes.push(holeCircle(-0.012, 0, 0.005), holeCircle(0.008, 0, 0.005)); return [s, rect(0.027, -0.0045, 0.077, 0.0045)]; };

// ---------- classic
function teacup() {
  const g = new THREE.Group(), china = mat(0xf4efe6, { rough: 0.3, side: THREE.DoubleSide });
  const prof = [[0, 0], [0.02, 0], [0.022, 0.004], [0.03, 0.02], [0.034, 0.04], [0.035, 0.046], [0.032, 0.046], [0.031, 0.04], [0.027, 0.02], [0.019, 0.007], [0, 0.007]];
  g.add(mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14), china));
  g.add(at(mesh(new THREE.TorusGeometry(0.0105, 0.0028, 5, 12), china), 0.0405, 0.026, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.0342, 0.0332, 0.004, 14, 1, true), mat(0x2f5f9a, { rough: 0.3, side: THREE.DoubleSide }), false), 0, 0.039, 0));
  return g;
}
const teacupShapes = () => [poly([[-0.035, 0.046], [0.035, 0.046], [0.022, 0.004], [0.02, 0], [-0.02, 0], [-0.022, 0.004]]), circle(0.042, 0.026, 0.0125, 0.007)];

function thimble() {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.0095, 0], [0.0098, 0.002], [0.0088, 0.016], [0.006, 0.021], [0, 0.022]];
  g.add(mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 12), mat(0xc9ccd2, { rough: 0.3, metal: 0.8 })));
  return g;
}
const thimbleShapes = () => [poly([[-0.0098, 0], [0.0098, 0], [0.0088, 0.016], [0.006, 0.021], [0, 0.022], [-0.006, 0.021], [-0.0088, 0.016]])];

const PIPS = [[0, 0], [-0.0045, -0.0045], [0.0045, 0.0045], [-0.0045, 0.0045], [0.0045, -0.0045]];
function die() {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(0.017, 0.017, 0.017, 1, 0.0022), mat(0xf3efe2, { rough: 0.4 })), 0, 0.0085, 0));
  const pips = mergeGeometries(PIPS.map(([x, z]) => new THREE.CylinderGeometry(0.0016, 0.0016, 0.0006, 8).translate(x, 0.0169, z)));
  g.add(mesh(pips, mat(0x1d1d1d, { rough: 0.5 }), false));
  return g;
}
const dieShapes = () => { const s = rrect(-0.0085, -0.0085, 0.0085, 0.0085, 0.002); PIPS.forEach(([x, y]) => s.holes.push(holeCircle(x, y, 0.0016))); return [s]; };

function playingCard() {
  const g = new THREE.Group();
  g.add(box(0.089, 0.0007, 0.064, mat(0xfaf6ec, { rough: 0.6 }), 0, 0, 0));
  const heart = mesh(new THREE.ExtrudeGeometry(heartShape(0, 0, 0.022), { depth: 0.0003, bevelEnabled: false }), mat(0xc0282d, { rough: 0.5 }), false);
  heart.rotation.x = -Math.PI / 2;
  heart.position.y = 0.0007;
  g.add(heart);
  return g;
}
const cardShapes = () => { const s = rrect(-0.0445, -0.032, 0.0445, 0.032, 0.004); s.holes.push(heartShape(0, 0, 0.022, new THREE.Path())); return [s]; };

const FEATHER = (L) => { // length along x, width along y
  const s = new THREE.Shape();
  s.moveTo(0.28 * L, 0.0015); s.bezierCurveTo(0.42 * L, 0.012, 0.62 * L, 0.024, 0.86 * L, 0.02);
  s.bezierCurveTo(0.95 * L, 0.017, 0.995 * L, 0.006, L, 0); s.bezierCurveTo(0.97 * L, -0.006, 0.86 * L, -0.016, 0.62 * L, -0.017);
  s.bezierCurveTo(0.45 * L, -0.016, 0.33 * L, -0.006, 0.28 * L, -0.0015);
  return s;
};
function feather() {
  const g = new THREE.Group(), L = 0.17;
  const vane = mesh(new THREE.ShapeGeometry(FEATHER(L), 10), mat(0xe2dccf, { rough: 0.85, side: THREE.DoubleSide }));
  vane.rotation.x = -Math.PI / 2; vane.position.set(-L / 2, 0.0013, 0);
  g.add(vane);
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0011, 0.0011, L * 0.98, 5), mat(0xbfae8a, { rough: 0.6 }))), -0.005, 0.0011, 0));
  return g;
}
const featherShapes = () => { const L = 0.17, s = FEATHER(L); return [s, rect(0, -0.001, 0.98 * L, 0.001)]; };

const SHELL = () => {
  const s = new THREE.Shape();
  s.moveTo(-0.006, -0.02); s.lineTo(-0.014, -0.02); s.lineTo(-0.014, -0.012); s.lineTo(-0.006, -0.012);
  for (let i = 0; i <= 10; i++) { const a = -1.15 + (2.3 * i) / 10, r = i % 2 ? 0.03 : 0.0285; s.lineTo(Math.sin(a) * r - 0.0, Math.cos(a) * r - 0.018); }
  s.lineTo(0.006, -0.012); s.lineTo(0.014, -0.012); s.lineTo(0.014, -0.02); s.lineTo(0.006, -0.02); s.closePath();
  return s;
};
function seashell() {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(SHELL(), { depth: 0.002, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6 });
  const m = mesh(geo, mat(0xefcfae, { rough: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003;
  g.add(m);
  return g;
}
const shellShapes = () => [SHELL()];

function matchbox() {
  const g = new THREE.Group();
  g.add(box(0.053, 0.016, 0.036, mat(0xf0e0b0, { rough: 0.7 }), 0, 0, 0));
  g.add(box(0.05, 0.0006, 0.033, mat(0xc23b2a, { rough: 0.6 }), 0, 0.016, 0));
  for (const s of [-1, 1]) g.add(box(0.045, 0.01, 0.0008, mat(0x5a3a2a, { rough: 1 }), 0, 0.003, s * 0.0182));
  return g;
}
const matchboxShapes = () => { const s = rect(-0.0265, -0.018, 0.0265, 0.018); s.holes.push(new THREE.Path().moveTo(-0.02, -0.011).lineTo(-0.02, 0.011).lineTo(0.02, 0.011).lineTo(0.02, -0.011).lineTo(-0.02, -0.011)); return [s]; };

function padlock() {
  const g = new THREE.Group(), brass = mat(BRASS, { rough: 0.35, metal: 0.6 });
  g.add(at(mesh(new RoundedBoxGeometry(0.04, 0.014, 0.034, 1, 0.004), brass), 0.008, 0.007, 0));
  const shackle = mesh(new THREE.TorusGeometry(0.0115, 0.0028, 5, 12, Math.PI), STEEL_M());
  shackle.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  shackle.position.set(-0.01, 0.007, 0);
  g.add(shackle);
  g.add(box(0.003, 0.0006, 0.008, mat(0x2a2422), 0.012, 0.014, 0));
  return g;
}
const padlockShapes = () => {
  const arc = new THREE.Shape(); arc.absarc(-0.01, 0, 0.0143, Math.PI / 2, (3 * Math.PI) / 2, false); arc.absarc(-0.01, 0, 0.0087, (3 * Math.PI) / 2, Math.PI / 2, true);
  return [rect(-0.012, -0.017, 0.028, 0.017), arc];
};

function pocketCompass() {
  const g = new THREE.Group(), brass = mat(BRASS, { rough: 0.35, metal: 0.6 });
  g.add(cyl(0.026, 0.026, 0.01, 18, brass, 0, 0, 0));
  g.add(cyl(0.022, 0.022, 0.0012, 18, mat(CREAM, { rough: 0.5 }), 0, 0.0094, 0));
  const red = box(0.018, 0.0007, 0.004, mat(0xb8282d), 0.009, 0.0106, 0); red.rotation.y = 0.5;
  const wht = box(0.018, 0.0007, 0.004, mat(0x9aa0a8), -0.009, 0.0106, 0); wht.rotation.y = 0.5;
  red.position.set(Math.cos(0.5) * 0.009, 0.0106, -Math.sin(0.5) * 0.009); wht.position.set(-Math.cos(0.5) * 0.009, 0.0106, Math.sin(0.5) * 0.009);
  g.add(red, wht);
  const bow = mesh(new THREE.TorusGeometry(0.007, 0.0017, 4, 10), brass); bow.rotation.x = Math.PI / 2; bow.position.set(-0.032, 0.005, 0);
  g.add(bow);
  return g;
}
const compassShapes = () => { const s = circle(0, 0, 0.026); s.holes.push(new THREE.Path().moveTo(-0.018, 0).lineTo(0, 0.003).lineTo(0.018, 0).lineTo(0, -0.003).lineTo(-0.018, 0)); return [s, circle(-0.0335, 0, 0.0085, 0.005)]; };

function coin() {
  const g = new THREE.Group(), gold = mat(GOLD, { rough: 0.3, metal: 0.7 });
  g.add(cyl(0.0125, 0.0125, 0.0024, 20, gold, 0, 0, 0));
  g.add(cyl(0.0075, 0.0075, 0.0004, 16, gold, 0, 0.0023, 0));
  return g;
}
const coinShapes = () => [circle(0, 0, 0.0125, 0.0098), circle(0, 0, 0.0075)];

function lipstick() {
  const g = new THREE.Group();
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.045, 12), mat(GOLD, { rough: 0.3, metal: 0.7 }))), -0.0075, 0.0095, 0));
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.019, 12), mat(0xa3122b, { rough: 0.45 }))), 0.0235, 0.0095, 0));
  const tip = mesh(new THREE.ConeGeometry(0.0072, 0.009, 12), mat(0xa3122b, { rough: 0.45 }));
  tip.rotation.z = -Math.PI / 2; tip.position.set(0.0374, 0.0095, 0);
  g.add(tip);
  return g;
}
const lipstickShapes = () => [rect(-0.03, -0.0095, 0.015, 0.0095), poly([[0.014, -0.0072], [0.033, -0.0072], [0.042, 0], [0.033, 0.0072], [0.014, 0.0072]])];

function fountainPen() {
  const g = new THREE.Group(), gold = mat(GOLD, { rough: 0.3, metal: 0.7 });
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0062, 0.0055, 0.11, 10), mat(0x15161a, { rough: 0.25 }))), -0.005, 0.0062, 0));
  g.add(at(along(mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.006, 10), gold)), 0.02, 0.0062, 0));
  const nib = mesh(new THREE.ConeGeometry(0.0048, 0.022, 8), gold);
  nib.rotation.z = -Math.PI / 2; nib.position.set(0.0605, 0.0062, 0);
  g.add(nib);
  g.add(box(0.045, 0.0018, 0.003, gold, -0.038, 0.0118, 0));
  return g;
}
const penShapes = () => [poly([[-0.06, -0.0062], [0.05, -0.0055], [0.05, 0.0055], [-0.06, 0.0062]]), poly([[0.05, -0.0048], [0.0715, 0], [0.05, 0.0048]]), rect(-0.06, 0.006, -0.016, 0.0085)];

function goldRing() {
  const g = new THREE.Group();
  const band = mesh(new THREE.TorusGeometry(0.0095, 0.0022, 6, 18), mat(GOLD, { rough: 0.25, metal: 0.8 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.0022;
  g.add(band);
  g.add(at(mesh(new THREE.IcosahedronGeometry(0.0034, 0), mat(0xa3122b, { rough: 0.15, metal: 0.2 })), 0.0112, 0.0042, 0));
  return g;
}
const ringShapes = () => [circle(0, 0, 0.0117, 0.0073), circle(0.0112, 0, 0.0036)];

function spoon() {
  const g = new THREE.Group(), silver = mat(0xc9ccd2, { rough: 0.25, metal: 0.8, side: THREE.DoubleSide });
  const bowl = mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), silver);
  bowl.scale.set(0.022, 0.006, 0.015); bowl.position.set(-0.045, 0.006, 0);
  g.add(bowl);
  const handle = mesh(new THREE.ExtrudeGeometry(poly([[-0.025, -0.0025], [0.07, -0.0055], [0.075, 0], [0.07, 0.0055], [-0.025, 0.0025]]), { depth: 0.0022, bevelEnabled: false }), silver);
  handle.rotation.x = -Math.PI / 2; handle.position.y = 0.0045;
  g.add(handle);
  return g;
}
const spoonShapes = () => [ellipse(-0.045, 0, 0.022, 0.015), poly([[-0.025, -0.0025], [0.07, -0.0055], [0.075, 0], [0.07, 0.0055], [-0.025, 0.0025]])];

function rubberDuck() {
  const g = new THREE.Group(), yellow = mat(0xf5c518, { rough: 0.45 });
  const body = mesh(new THREE.SphereGeometry(1, 12, 8), yellow); body.scale.set(0.03, 0.021, 0.024); body.position.y = 0.021;
  const head = at(mesh(new THREE.SphereGeometry(0.0145, 10, 8), yellow), 0.017, 0.049, 0);
  const beak = mesh(new THREE.ConeGeometry(0.0058, 0.014, 8), mat(0xe8731c, { rough: 0.45 }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.036, 0.047, 0);
  g.add(body, head, beak);
  for (const s of [-1, 1]) g.add(at(mesh(new THREE.SphereGeometry(0.0022, 6, 4), mat(0x111111, { rough: 0.3 }), false), 0.027, 0.054, s * 0.008));
  return g;
}
const duckShapes = () => [ellipse(0, 0.021, 0.03, 0.021), circle(0.017, 0.049, 0.0145), poly([[0.029, 0.044], [0.043, 0.047], [0.029, 0.05]])];

// lean / wedge: may stand on its edge or lean · upright: its rest pose already stands up (knight)
// modern: literal forms only (a phone painted in an old still life, knotted into an antique rug or
//         embossed on a Victorian desk would make no sense – OS-18 "logical context")
// still: why it could be in the still-life painting (lying on the table) – lets it be painted there
export const OBJECT_DEFS = [
  { id: 'watch', name: 'Pocket watch', icon: '⌚', build: pocketWatch, shapes: watchShapes, lean: true },
  { id: 'key', name: 'Brass key', icon: '🔑', build: brassKey, shapes: keyShapes, lean: true, socket: ['key-lock', 'globe-top'] },
  { id: 'magnifier', name: 'Magnifying glass', icon: '🔍', build: magnifier, shapes: magnifierShapes, lean: true },
  { id: 'spectacles', name: 'Reading spectacles', icon: '👓', build: spectacles, shapes: spectaclesShapes, lean: true },
  { id: 'knight', name: 'Chess knight', icon: '♞', build: chessKnight, shapes: knightShapes, lean: false, upright: true },
  { id: 'scissors', name: 'Scissors', icon: '✂️', build: scissors, shapes: scissorsShapes, lean: true },
  // v15 library
  { id: 'phone', name: 'Smartphone', icon: '📱', build: smartphone, shapes: phoneShapes, lean: true, modern: true },
  { id: 'charger', name: 'Phone charger', icon: '🔌', build: charger, shapes: chargerShapes, lean: false, modern: true },
  { id: 'earbuds', name: 'Earbuds case', icon: '🎧', build: earbuds, shapes: earbudsShapes, lean: true, modern: true },
  { id: 'usb', name: 'USB stick', icon: '💾', build: usbStick, shapes: usbShapes, lean: true, modern: true },
  { id: 'laptop', name: 'Laptop', icon: '💻', build: laptop, shapes: laptopShapes, lean: true, modern: true },
  { id: 'remote', name: 'TV remote', icon: '📺', build: remote, shapes: remoteShapes, lean: true, modern: true },
  { id: 'battery', name: 'AA battery', icon: '🔋', build: battery, shapes: batteryShapes, lean: true, modern: true },
  { id: 'fob', name: 'Car key fob', icon: '🚗', build: keyFob, shapes: fobShapes, lean: true, modern: true },
  { id: 'teacup', name: 'Teacup', icon: '☕', build: teacup, shapes: teacupShapes, lean: false, upright: true, still: 'tea beside the flowers' },
  { id: 'thimble', name: 'Thimble', icon: '🪡', build: thimble, shapes: thimbleShapes, lean: false, upright: true, still: 'left from some sewing' },
  { id: 'die', name: 'Die', icon: '🎲', build: die, shapes: dieShapes, lean: false, still: 'a game left on the table' },
  { id: 'card', name: 'Playing card', icon: '🃏', build: playingCard, shapes: cardShapes, lean: true, still: 'a card from a game of patience' },
  { id: 'feather', name: 'Feather', icon: '🪶', build: feather, shapes: featherShapes, lean: true, still: 'a feather among the fruit' },
  { id: 'shell', name: 'Seashell', icon: '🐚', build: seashell, shapes: shellShapes, lean: true, still: 'a keepsake from the seaside' },
  { id: 'matchbox', name: 'Matchbox', icon: '🔥', build: matchbox, shapes: matchboxShapes, lean: true },
  { id: 'padlock', name: 'Padlock', icon: '🔒', build: padlock, shapes: padlockShapes, lean: true },
  { id: 'compass', name: 'Pocket compass', icon: '🧭', build: pocketCompass, shapes: compassShapes, lean: true, still: 'an explorer’s keepsake' },
  { id: 'coin', name: 'Gold coin', icon: '🪙', build: coin, shapes: coinShapes, lean: true, still: 'a coin by the fruit bowl' },
  { id: 'lipstick', name: 'Lipstick', icon: '💄', build: lipstick, shapes: lipstickShapes, lean: true, modern: true },
  { id: 'pen', name: 'Fountain pen', icon: '🖋️', build: fountainPen, shapes: penShapes, lean: true, still: 'set down after writing' },
  { id: 'ring', name: 'Gold ring', icon: '💍', build: goldRing, shapes: ringShapes, lean: true, still: 'a ring slipped off and left' },
  { id: 'spoon', name: 'Silver spoon', icon: '🥄', build: spoon, shapes: spoonShapes, lean: true, still: 'a teaspoon by the cup' },
  { id: 'duck', name: 'Rubber duck', icon: '🦆', build: rubberDuck, shapes: duckShapes, lean: false, upright: true, modern: true },
];

// Draws an outline (from shapes()) on a 2D canvas with the current fill/stroke styles:
// centred, longest side = size (canvas units). Each piece is filled on its own, so pieces that
// overlap (a key's bow and shaft) don't cut holes into each other.
export function drawOutline(ctx, shapes, size, stroke = true) {
  const b = new THREE.Box2();
  shapes.forEach((s) => s.getPoints(16).forEach((p) => b.expandByPoint(p)));
  const c = b.getCenter(new THREE.Vector2()), d = b.getSize(new THREE.Vector2());
  const k = size / Math.max(d.x, d.y);
  const trace = (pts) => { pts.forEach((p, i) => (i ? ctx.lineTo((p.x - c.x) * k, -(p.y - c.y) * k) : ctx.moveTo((p.x - c.x) * k, -(p.y - c.y) * k))); ctx.closePath(); };
  for (const s of shapes) {
    ctx.beginPath();
    trace(s.getPoints(20));
    s.holes.forEach((h) => trace(h.getPoints(20)));
    ctx.fill('evenodd');
    if (stroke) ctx.stroke();
  }
  return k;
}
