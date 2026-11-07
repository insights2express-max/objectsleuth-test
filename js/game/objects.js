// TARGET OBJECT ASSETS (Draft 1): six small objects, each with
//   build()  → the 3D object, lying in its natural rest pose: length along x, thickness along y,
//              bottom at y = 0 (the chess knight stands on its base);
//   shapes() → its flat outline (metres; x = length, y = across) for the FIGURATIVE forms:
//              knotted into the rug, painted into a picture, or embossed into furniture.
import * as THREE from '../../vendor/three/three.module.js';
import { mat, mesh, box } from '../art/kit.js';

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

// lean / wedge: may stand on its edge or lean · upright: its rest pose already stands up (knight)
export const OBJECT_DEFS = [
  { id: 'watch', name: 'Pocket watch', icon: '⌚', build: pocketWatch, shapes: watchShapes, lean: true },
  { id: 'key', name: 'Brass key', icon: '🔑', build: brassKey, shapes: keyShapes, lean: true, socket: ['key-lock', 'globe-top'] },
  { id: 'magnifier', name: 'Magnifying glass', icon: '🔍', build: magnifier, shapes: magnifierShapes, lean: true },
  { id: 'spectacles', name: 'Reading spectacles', icon: '👓', build: spectacles, shapes: spectaclesShapes, lean: true },
  { id: 'knight', name: 'Chess knight', icon: '♞', build: chessKnight, shapes: knightShapes, lean: false, upright: true },
  { id: 'scissors', name: 'Scissors', icon: '✂️', build: scissors, shapes: scissorsShapes, lean: true },
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
