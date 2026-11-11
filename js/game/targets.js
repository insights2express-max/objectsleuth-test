// TARGET OBJECTS v4 (v16): 15 Target Objects per round from the imported model library (assetlib.js),
// shown 6 at a time in a rolling list (OS-27), all hidden at the start of the round.
//
// FORMS (SDD 7.04.6 variants): some Target Objects appear in a figurative form, drawn from the model's
// automatic outline (library.js – OS-30: 3.1):
//   woven   – knotted into the rug's pattern, in its yarn colours and relief
//   painted – painted into a picture (still life, landscape) or a stamp in the stamp collection
//   relief  – embossed into the side of a piece of furniture, in that furniture's own material
// The others are the real 3D objects, placed by one of these (random spots, with collision checks):
//   flat    – lying or standing on a surface, never out in the open (the cover rule, OS-9: 3.5.2)
//   lean    – on its edge, leaning on something, any angle, either way up
//   wedge   – slipped upright into a narrow gap
//   socket  – resting on the globe
//   wall    – hung on a wall, as the collector displays things (OS-31: 1.2.1)
// WHERE a model may go follows the catalogue (assetlib.js "at"): desk, small tables, shelves, mantel,
// bookcase tops, floor, walls, beside the hearth. Food never on the floor or in the firebox.
// Passive Objects (POs) fill the room the same way and are hidden by the same rules (OS-25: 7).
// LOOK-ALIKES (OS-30: 1.2): at Medium 1, at High 2 POs share a listed word ("Close, but not this one.").
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { drawOutline } from './objects.js';
import { shapesOf, silhouetteOfObject, silhouetteOfShapes } from './library.js';
import { accelerate, accelerateInstanced } from './fastray.js';

const UP = new THREE.Vector3(0, 1, 0);
// v16.1 (OS-36): the figurative forms (woven / painted / embossed) are PARKED – figurative: 0 on every level.
// The code stays, to be switched back on in a later build.
export const LEVELS = {
  low: { label: 'Low', mult: 1, size: [1.0, 1.15], figurative: 0, minVis: 0.35, pos: 10, lookalikes: 0, modes: { flat: 0.55, lean: 0.35, wedge: 0.05, socket: 0.05 } },
  med: { label: 'Medium', mult: 1.5, size: [0.85, 1.0], figurative: 0, minVis: 0.3, pos: 14, lookalikes: 1, modes: { flat: 0.4, lean: 0.35, wedge: 0.15, socket: 0.1 } },
  high: { label: 'High', mult: 2, size: [0.72, 0.9], figurative: 0, minVis: 0.22, pos: 18, lookalikes: 2, modes: { flat: 0.3, lean: 0.35, wedge: 0.2, socket: 0.15 } },
};
// v16.1 LOGIC / USE CASE (OS-37: 3.1a, OS-38): where things may go and how they rest
const REACH = 1.75, REACH_WALL = 2.0;          // everyday things stay within reach (top of the object on a wall)
// how many things a top may hold (small tables and seats: one; large tops more) – never two Target Objects
const HOST_CAP = { table: 1, seat: 1, chest: 2, sideboard: 3, desk: 3 };
// wall mounting (OS-39: 2.1.1): tools, weapons and lanterns hang on their own iron hardware – two pegs under
// long things, one under short ones, a bracket for a lantern, a nail for a clipboard or a mask. Frames,
// mirrors, the dartboard, the shield and the sconce have their hardware hidden behind them (2.1.1.2).
const CONCEALED = new Set(['ph-ornate_mirror_01', 'ph-dartboard', 'ph-kite_shield', 'ph-industrial_wall_sconce']);
const BRACKET = { 'ph-Lantern_01': 0.035 };                        // hangs from an arm (stand-off from the wall)
const NAIL = new Set(['ph-old_gas_mask']);              // (v16.2, OS-40: 1.1 – the clipboard is never on a wall)
// v16.2 PHYSICS (OS-41: 1.1)
const TIP = 0.17;         // a rest pose is stable when its centre of mass sits inside its footprint by ≥ 17 % of its height (tips at ~10°)
const HEAVY = 0.22;       // longest side (m) from which a thing counts as heavy: ~100 % of its footprint must be supported
// 62 directions, evenly spread over a sphere (collision lines follow the model's real shape – was 14)
const SPHERE = (() => { const out = [], n = 62, g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y); out.push(new THREE.Vector3(Math.cos(g * i) * r, y, Math.sin(g * i) * r)); } return out; })();
// 2-D convex hull (x, z pairs) and how far a point lies inside it (negative = outside)
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function insideBy(h, x, z) {
  if (h.length < 3) return -1;
  let m = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1e-9;
    m = Math.min(m, ((x - a[0]) * ez - (z - a[1]) * ex) / -L);     // (counter-clockwise hull: inside = positive)
  }
  return m;
}
const HOOK_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.55, metalness: 0.3 });
export const TO_COUNT = 15, LIST_ROWS = 6;
export const ODD = { low: [0, 1], med: [1, 3], high: [2, 6] };      // v16.2: odd sizes per round (OS-41: 5.2b)
// cover rule per level: adj = sides touching something (of 8), vis = share visible from the main view
const COVER = {
  low: (adj, vis) => adj >= 1 || vis <= 0.85,
  med: (adj, vis) => adj >= 2 || vis <= 0.7,
  high: (adj, vis) => (adj >= 2 && vis <= 0.85) || vis <= 0.6,
};
const FOOD = new Set(['bananas', 'apple', 'pomegranate', 'lemon', 'croissant', 'cake']);
// the collector's weapons display over the fireplace (OS-31: 1.2.1)
const WEAPONS = new Set(['ph-antique_estoc', 'ph-wooden_handle_saber', 'ph-kite_shield', 'ph-ornate_medieval_mace', 'ph-ornate_war_hammer',
  'ph-bolt_action_rifle_7_62', 'ph-stick_grenade', 'ph-machete', 'ph-old_gas_mask']);
const RELIEF_OK = new Set(['desk', 'chest', 'bookcase', 'clock', 'sideboard', 'fireplace']);
export const longest = (d) => d.size || Math.max(...d.dims);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SHADOW_TEX = radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.45, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
const RING_TEX = radialTexture([[0, 'rgba(255,220,140,0)'], [0.55, 'rgba(255,220,140,0)'], [0.72, 'rgba(255,236,170,1)'], [0.8, 'rgba(255,210,120,0.7)'], [1, 'rgba(255,200,90,0)']]);
const xorshift = (seed) => { let st = seed >>> 0 || 1; return () => { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return (st >>> 0) / 4294967296; }; };
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Targets {
  // root: the Scene group · fx: Scene extras (rug, paintings, sockets, spots) · viewDir: towards the main camera
  constructor(root, fx, viewDir, library) {
    this.root = root;
    this.fx = fx;
    this.library = library;
    this.viewDir = viewDir.clone().normalize();
    this.level = 'med';
    this.items = [];          // everything placed this round (TOs + POs)
    this.list = [];           // this round's 15 Target Objects, in list order
    this.bg = [];             // imported furniture (fixed; nudged a little each round)
    this.reliefs = [];
    this.pops = [];
    this.avoid = new Set();   // OS-25 (5.1): zones used by Target Objects in recent rounds
    this.ray = new THREE.Raycaster();
    this.onChange = null;
    this.onFound = null;
    this.shadowMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      map: SHADOW_TEX, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.shadowMesh.userData.decor = true;
    this.shadowMesh.raycast = () => {};
    this.shadowMesh.frustumCulled = false;
    root.add(this.shadowMesh);
    this.towardCam = () => this.viewDir;
    this.camDist = () => 60;
    this.pxAt = () => 400;
  }

  resolved(it) { return it.found || it.revealed; }
  animating() { return this.pops.some((p) => p.mode === 'find' || (p.mode === 'reveal' && p.t < 0.35)); }
  shapes(it) { return shapesOf(it.group); }
  shownList() { return this.list.filter((it) => it.shown); }

  // ---------------------------------------------------------------- choosing the round's models
  // Returns the models to load: 15 Target Objects (all different list words), Passive Objects (by display
  // spot: walls, bookcase tops, floor, surfaces), look-alikes, plants and the fixed furniture.
  pick(seed, level = this.level) {
    const rnd = xorshift(seed ^ 0x51ed);
    const L = LEVELS[level], defs = this.library.defs;
    const all = shuffle(defs.filter((d) => d.role === 'to'), rnd);
    const tos = [], words = new Set();
    let large = 0;
    for (const d of all) {
      if (tos.length >= TO_COUNT) break;
      if (words.has(d.word)) continue;
      const big = longest(d) > 0.8;
      if (big && (large >= 2 || rnd() < 0.6)) continue;
      tos.push(d); words.add(d.word); if (big) large++;
    }
    const look = [];
    for (const t of shuffle(tos.slice(), rnd)) {
      if (look.length >= L.lookalikes) break;
      const alt = all.find((d) => d.word === t.word && d !== t && !tos.includes(d) && !look.includes(d));
      if (alt) look.push(alt);
    }
    const rest = all.filter((d) => !tos.includes(d) && !look.includes(d) && !words.has(d.word));
    const pos = [];
    const take = (ok, n) => { for (const d of rest) { if (n <= 0) break; if (pos.includes(d) || !ok(d)) continue; pos.push(d); n--; } };
    take((d) => d.at.includes('w'), 4 + Math.floor(rnd() * 3));
    take((d) => d.at.includes('k') && !d.at.includes('w'), 2);
    take((d) => d.at.length <= 2 && d.at.includes('f') && longest(d) > 0.35, 2 + Math.floor(rnd() * 2));
    take(() => true, Math.max(0, L.pos - pos.length));
    // plants always stand in their corner (as TO or PO); the fixed furniture always loads
    for (const id of ['ph-potted_plant_01', 'ph-potted_plant_02']) { const d = defs.find((x) => x.id === id); if (d && !tos.includes(d) && !pos.includes(d)) pos.push(d); }
    const bg = (this.fx.bgSpots || []).map((s) => defs.find((d) => d.id === s.id)).filter(Boolean);
    return { tos, pos: [...pos, ...look], look: new Set(look.map((d) => d.id)), bg, order: shuffle(tos.slice(), rnd) };
  }

  // ---------------------------------------------------------------- helpers
  // placing = true: the walls a view cuts away (and the door) still count as solid – nothing may poke
  // into them – but they never block the view (list.view is used for the "can it be seen" test)
  solids(placing = false) {
    const list = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.proxy) { // an imported object in the room: its box stands in for it
        for (let p = o.parent; p; p = p.parent) { if (!p.visible) return; if (p === this.root) break; }
        if (o.parent && o.parent.parent) list.push(o);
        return;
      }
      if (o.userData.imported && !o.userData.solidMesh) return;
      if (o.userData.cutHidden && !placing) return;
      if ((!o.visible && !o.userData.batched && !o.userData.cutHidden) || o.userData.merged || o.userData.target || o.userData.decor) return;
      if (o.userData.off) return;
      for (let p = o.parent; p && p !== this.root; p = p.parent) if (!p.visible) return;
      const m = o.material;
      if (m.transparent || m.colorWrite === false || m.isMeshBasicMaterial) return;
      if (o.isInstancedMesh) accelerateInstanced(o); else accelerate(o);   // (fast rays – the rounded Clay boxes have 300 triangles each; v16.2: the books too)
      if (o.userData.open === undefined) o.userData.open = m.side === THREE.DoubleSide;   // an open, two-sided shape (a lamp shade): never a "lid"
      list.push(o);
    });
    const ball = (o) => {
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); return o.boundingSphere.clone().applyMatrix4(o.matrixWorld); }
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      return o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    };
    list.balls = list.map(ball);
    if (placing) { list.view = list.filter((o) => !o.userData.cutHidden); list.view.balls = list.view.map(ball); }
    return list;
  }
  // v16.2 (speed): only the solid pieces within r of a point – picked once, then every ray test round one object looks
  // at a handful of pieces instead of all ~300 in the room
  nearSolids(solids, c, r) {
    const balls = solids.balls;
    if (!balls) return solids;
    const out = [], ob = [];
    for (let i = 0; i < solids.length; i++) { const b = balls[i]; if (b.center.distanceTo(c) < r + b.radius) { out.push(solids[i]); ob.push(b); } }
    out.balls = ob;
    if (solids.view) out.view = solids.view;
    return out;
  }
  cast(origin, dir, far, solids) {
    this.ray.set(origin, dir);
    this.ray.far = far;
    const balls = solids.balls;
    if (!balls) return this.ray.intersectObjects(solids, false);
    const near = [], v = this._v || (this._v = new THREE.Vector3());
    for (let i = 0; i < solids.length; i++) {
      const b = balls[i];
      v.subVectors(b.center, origin);
      const along = v.dot(dir);
      if (along < -b.radius || along > far + b.radius) continue;
      if (v.lengthSq() - along * along > b.radius * b.radius) continue;
      near.push(solids[i]);
    }
    return near.length ? this.ray.intersectObjects(near, false) : [];
  }
  normalOf(hit) {
    const n = hit.face.normal.clone();
    if (hit.instanceId !== undefined) { const m = new THREE.Matrix4(); hit.object.getMatrixAt(hit.instanceId, m); n.transformDirection(m); }
    return n.transformDirection(hit.object.matrixWorld);
  }
  // inside something? – the first surface above faces up (its lid, seen from inside), or (v16.1) more surfaces
  // above face up than down: inside one of two pieces set into each other (a drawer set into the desktop)
  inside(p, solids) {
    const hs = this.cast(p, UP, 4, solids).filter((h) => !h.object.userData.open);
    if (!hs.length) return false;
    if (this.normalOf(hs[0]).y > 0.2) return true;
    let s = 0;
    for (const h of hs) s += this.normalOf(h).y > 0 ? 1 : -1;     // (every crossing, steep ones too)
    return s > 0;
  }
  visible(points, solids) {
    let seen = 0;
    const view = solids.view || solids;
    for (const p of points) if (!this.cast(p.clone().addScaledVector(this.viewDir, 0.002), this.viewDir, 60, view).length) seen++;
    return seen / points.length;
  }
  posePoints(it, m, shrink = 0.9) {
    const b = it.box, c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * shrink);
    const pts = [c.clone()];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(c.x + (i & 1 ? h.x : -h.x), c.y + (i & 2 ? h.y : -h.y), c.z + (i & 4 ? h.z : -h.z)));
    return pts.map((p) => p.applyMatrix4(m));
  }
  // the model's outermost real points in 62 directions (v16.2, OS-41: 1.1 – was 14: thin table legs slipped between)
  hull(it) {
    const g = it.group;
    const P = this.restPts(it);
    if (g.userData.hull) return g.userData.hull;
    const dirs = SPHERE;
    g.userData.hull = dirs.map((d) => {
      let best = -Infinity, bi = 0;
      for (let i = 0; i < P.length; i += 3) { const s = P[i] * d.x + P[i + 1] * d.y + P[i + 2] * d.z; if (s > best) { best = s; bi = i; } }
      return new THREE.Vector3(P[bi], P[bi + 1], P[bi + 2]);
    });
    return g.userData.hull;
  }
  clear(it, m, solids, onWall = false) {
    // (the look's surface relief – Clay, Knit – may reach a few mm past the model's base: those points sit on the surface)
    // v16.2: 62 shape-following lines from its middle (was 14), then – for things over 12 cm – upright lines through its
    // lower body (a table or chair leg standing inside a barrel or a boot) and level lines round it at two heights
    const c0 = it.box.getCenter(new THREE.Vector3()).applyMatrix4(m);
    const H = this.hull(it).map((p) => p.clone().applyMatrix4(m));
    let lo = Infinity, hi = -Infinity;
    for (const p of H) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    const floor = lo + 0.006;
    const pts = [c0, ...H.map((p) => { const q = p.clone().lerp(c0, 0.05); q.y = Math.max(q.y, floor); return q; })];
    if (this.inside(pts[0], solids)) return false;

    let rad = 0; for (const p of H) rad = Math.max(rad, p.distanceTo(c0));
    solids = this.nearSolids(solids, c0, rad + 0.02);                 // (every line below stays within its own reach)
    const d = new THREE.Vector3();
    const line = (a, b) => { d.subVectors(b, a); const len = d.length(); return len > 1e-6 && this.cast(a, d.normalize(), len, solids).length > 0; };
    for (let i = 1; i < pts.length; i++) if (line(pts[0], pts[i])) return false;
    const big = Math.max(...it.box.getSize(new THREE.Vector3()).toArray()) * new THREE.Vector3().setFromMatrixScale(m).x;
    if (!onWall && big > 0.12 && hi - lo > 0.03) {          // (not for things hung on a wall: the wall is checked behind them – placeWall)
      // upright lines over its lower body's outline (a plant: its pot), every ≤ 4 cm (at most 6 × 6)
      const low = hull2(H.filter((p) => p.y < lo + 0.5 * (hi - lo)).map((p) => [p.x, p.z]));
      if (low.length >= 3) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of low) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const nx = Math.min(5, Math.max(2, Math.ceil((x1 - x0) / 0.04))), nz = Math.min(5, Math.max(2, Math.ceil((z1 - z0) / 0.04)));
        const down = new THREE.Vector3(0, -1, 0);
        for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
          const x = x0 + (x1 - x0) * a / nx, z = z0 + (z1 - z0) * b / nz;
          if (insideBy(low, x, z) < 0.004) continue;
          if (this.cast(new THREE.Vector3(x, hi - 0.004, z), down, hi - lo - 0.012, solids).length) return false;
        }
      }
      // level lines from its middle axis to its outline, 12 ways round, at 30 % and 70 % of its height
      for (const k of [0.3, 0.7]) {
        const y = lo + k * (hi - lo), band = H.filter((p) => Math.abs(p.y - y) < 0.3 * (hi - lo));
        if (band.length < 3) continue;
        const cx = band.reduce((s, p) => s + p.x, 0) / band.length, cz = band.reduce((s, p) => s + p.z, 0) / band.length;
        const o = new THREE.Vector3(cx, y, cz);
        // (no extra "inside" test here: placing, every piece is two-sided, so a line from inside one meets its walls)
        for (let a = 0; a < 12; a++) {
          const dir = new THREE.Vector3(Math.cos(a * Math.PI / 6), 0, Math.sin(a * Math.PI / 6));
          let r = 0; for (const p of band) r = Math.max(r, (p.x - cx) * dir.x + (p.z - cz) * dir.z);
          if (r > 0.004 && this.cast(o, dir, r * 0.95, solids).length) return false;
        }
      }
    }
    return true;
  }
  // ---------------------------------------------------------------- v16.2 PHYSICS (OS-41: 1.1)
  // REST POSE: the centre of mass (the middle of its surface points) must sit over its footprint (the outline of the
  // points it stands on), with a margin of ≥ 17 % of its height – a saw never balances on its handle with the blade
  // up, a cassette player never stands on its thin edge. When the model's own pose fails, it SETTLES the way a real
  // one would: tipped over its footprint's edge until it rests stably (allowed by the catalogue's "up" rule; upright-only and round things keep their pose).
  rest(it) {
    const g = it.group, P = this.restPts(it);
    if (g.userData.rest) return g.userData.rest;
    const up = it.def.up, H = Math.PI / 2, v = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
    // one pose: its footprint (points within 2 % of its height of the lowest), centre of mass, and how safely it stands
    const measure = (R) => {
      let minY = Infinity, maxY = -Infinity; const com = new THREE.Vector3(); const n = P.length / 3;
      const W = new Float32Array(P.length);
      for (let k = 0; k < P.length; k += 3) {
        v.set(P[k], P[k + 1], P[k + 2]).applyMatrix4(R); W[k] = v.x; W[k + 1] = v.y; W[k + 2] = v.z;
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); com.add(v);
      }
      com.multiplyScalar(1 / n);
      const tol = Math.max(0.003, 0.04 * (maxY - minY)), foot = [];   // (scanned feet are never quite level)
      for (let k = 0; k < W.length; k += 3) if (W[k + 1] < minY + tol) foot.push([W[k], W[k + 2]]);
      const h = hull2(foot), margin = insideBy(h, com.x, com.z), lift = com.y - minY;
      return { R, W, minY, maxY, com, foot, hull: h, margin, lift, tol, stable: margin > 0 && margin >= TIP * lift };
    };
    // SETTLE like a real one: while it would tip, roll it over the edge of its footprint nearest to (or beyond) its
    // centre of mass until another point touches the table – a saw ends on its handle and the tip of its blade
    const settle = (R0) => {
      let s = measure(R0.clone());
      for (let k = 0; k < 14 && !s.stable; k++) {
        const c = [s.com.x, s.com.z], h = s.hull;
        let a, t;                                                     // pivot point (on the edge) and tipping direction
        if (h.length >= 2) {
          let bestD = Infinity;
          for (let i = 0; i < h.length; i++) {
            const p = h[i], q = h[(i + 1) % h.length], ex = q[0] - p[0], ez = q[1] - p[1], L = Math.hypot(ex, ez) || 1e-9;
            if (h.length === 2 && i === 1) break;
            const nx = ez / L, nz = -ex / L;                            // outward normal (counter-clockwise hull)
            const d = -((c[0] - p[0]) * nx + (c[1] - p[1]) * nz);     // how far inside (negative = beyond this edge)
            if (d < bestD) { bestD = d; a = p; t = [nx, nz]; }
          }
          if (h.length === 2) {                                       // a line: tip to the side the centre of mass is on
            const p = h[0], q = h[1], ex = q[0] - p[0], ez = q[1] - p[1], L = Math.hypot(ex, ez) || 1e-9;
            let nx = ez / L, nz = -ex / L;
            if ((c[0] - p[0]) * nx + (c[1] - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
            a = p; t = [nx, nz];
          }
        } else {
          a = h[0] || [s.com.x, s.com.z];
          const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
          t = L > 1e-6 ? [dx / L, dz / L] : [1, 0];
        }
        // the smallest turn about that edge that brings another point down to the table
        let th = H;
        for (let i = 0; i < s.W.length; i += 3) {
          const w = (s.W[i] - a[0]) * t[0] + (s.W[i + 2] - a[1]) * t[1], hh = s.W[i + 1] - s.minY;
          if (w > 0.002 && hh > s.tol * 0.5) th = Math.min(th, Math.atan2(hh, w));
        }
        th = Math.max(th, 0.01);
        const axis = new THREE.Vector3().crossVectors(UPV, new THREE.Vector3(t[0], 0, t[1])).normalize();
        s = measure(new THREE.Matrix4().makeRotationAxis(axis, th).multiply(s.R));
      }
      return s;
    };
    const legal = (s) => up === 'any' || new THREE.Vector3(0, 1, 0).transformDirection(s.R).y > -0.3;   // ('base': never upside down)
    let best = measure(new THREE.Matrix4());
    if (!best.stable && (up === 'base' || up === 'any')) {
      // settled from its own pose and from lying on each side: the lowest stable result wins – where a real one, put
      // down or dropped, ends up (a saw lies flat, it doesn't balance on its teeth)
      const starts = [[0, 0], [H, 0], [-H, 0], [0, H], [0, -H]];
      if (up === 'any') starts.push([Math.PI, 0]);
      const ok = starts.map(([rx, rz]) => settle(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)))).filter((s) => s.stable && legal(s));
      if (ok.length) best = ok.sort((a, b) => a.lift - b.lift)[0];
    }
    // (round things – an apple, a ball – and upright-only things keep the model's own pose)
    best.i = best.R.equals(new THREE.Matrix4()) ? 0 : 1;
    best.W = null;
    // footprint sample (≤ 24 points, spread out) for the support test
    const f = best.foot, pick = [];
    const stride = Math.max(1, Math.floor(f.length / 8));
    for (let k = 0; k < f.length && pick.length < 8; k += stride) pick.push(f[k]);
    // (the outline: at most 10 of its corners, spread round)
    const hk = Math.max(1, Math.ceil(best.hull.length / 10));
    best.hull = best.hull.filter((_, k) => k % hk === 0);
    for (const q of best.hull) pick.push(q);
    best.pick = pick;
    best.size = it.box.clone().applyMatrix4(best.R).getSize(new THREE.Vector3());
    best.changed = best.i !== 0;
    if (best.changed && !g.userData.restLogged) { g.userData.restLogged = true; const u = new THREE.Vector3(0, 1, 0).transformDirection(best.R); console.info('ObjectSleuth: settles in another pose', it.def.id, `its top now points ${u.y > 0.7 ? 'up (tilted)' : u.y < -0.7 ? 'down' : 'sideways'} – ${Math.round(Math.acos(Math.max(-1, Math.min(1, u.y))) * 180 / Math.PI)}° from upright`); }
    g.userData.rest = best;
    return best;
  }
  // SUPPORT (v16.2, OS-41: 1.1.3): the surface is tested under its REAL footprint (a pot's base, a lamp's feet – not
  // its box, which leaves widen). It rests on the highest points under it (Clay table tops are a little uneven), and:
  // heavy things (≥ 22 cm) need ~100 % of the footprint on the surface; light ones need their centre of mass over
  // the supported part. Nothing may poke up into it. Returns the height it rests at, or null.
  support(it, m, y, solids, R) {
    const full = it.def.support === 'full', tol = it.def.word === 'pillow' ? 0.035 : 0.007;
    const sc = new THREE.Vector3().setFromMatrixScale(m).x;
    const heavy = full || longest(it.def) * sc >= HEAVY;
    const rise = Math.min(0.08, (R.maxY - R.minY) * sc);
    const down = new THREE.Vector3(0, -1, 0), q = new THREE.Vector3();
    const e = m.elements, at = (x, yy, z) => q.set(e[0] * x + e[4] * yy + e[8] * z + e[12], e[1] * x + e[5] * yy + e[9] * z + e[13], e[2] * x + e[6] * yy + e[10] * z + e[14]);
    // (m already includes the rest turn: the footprint is given in the turned frame, so undo it here)
    const inv = new THREE.Matrix4().copy(R.R).invert(), loc = new THREE.Vector3();
    const span = it.box.getSize(new THREE.Vector3()).length() * 0.5 * sc;
    solids = this.nearSolids(solids, new THREE.Vector3(e[12], y, e[14]), span + rise + 0.05);
    // (its outline points first: under a heavy thing one miss there already decides it)
    const order = R.pick.map((p, i) => i).sort((a, b) => (b >= R.pick.length - R.hull.length) - (a >= R.pick.length - R.hull.length));
    const hits = new Array(R.pick.length).fill(null);
    let miss = 0;
    const maxMiss = full ? 0 : heavy ? Math.floor(R.pick.length * 0.05) : Math.floor(R.pick.length * 0.4);
    for (const i of order) {
      const [fx, fz] = R.pick[i];
      loc.set(fx, R.minY, fz).applyMatrix4(inv);
      at(loc.x, loc.y, loc.z);
      const h = this.cast(new THREE.Vector3(q.x, y + rise, q.z), down, rise + 0.03, solids)[0];
      hits[i] = h ? h.point.y : null;
      if (!h || h.point.y < y - 0.012) { if (++miss > maxMiss) return null; }
      else if (h.point.y > y + 0.015) return null;                   // something pokes up into it
    }
    const ys = hits.filter((v) => v !== null);
    if (!ys.length) return null;
    const top = Math.max(...ys);
    if (top > y + 0.015) return null;                                // something pokes up into it (a strap, a book's edge)
    const on = hits.map((v) => v !== null && v > top - tol);
    const share = on.filter(Boolean).length / on.length;
    if (full ? share < 1 : heavy ? share < 0.95 : share < 0.6) return null;      // (light things: most of the footprint too – never bridging a step)
    if (!heavy) {   // light: the centre of mass over the part that is held up
      const held = [];
      R.pick.forEach((p, i) => { if (on[i]) { loc.set(p[0], R.minY, p[1]).applyMatrix4(inv); at(loc.x, loc.y, loc.z); held.push([q.x, q.z]); } });
      loc.copy(R.com).applyMatrix4(inv); at(loc.x, loc.y, loc.z);
      if (insideBy(hull2(held), q.x, q.z) < 0) return null;
    }
    return top - (this.library.look === 'lowpoly' ? 0 : 0.003);       // (Clay / Felt / Knit are soft: it settles 3 mm onto the highest bumps)
  }
  // under bigger things, a grid no wider than 8 cm: nothing may poke up into it (a suitcase never stands over a lamp
  // foot). (v16.2: run last – only for a spot that passed every other test)
  pokes(it, m, top, solids) {
    const R = this.rest(it);
    if (R.changed) return false;
    const sc = new THREE.Vector3().setFromMatrixScale(m).x, e = m.elements, q = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    const b = it.box, c = b.getCenter(new THREE.Vector3()), hs = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const nx = Math.min(6, Math.ceil(2 * hs.x * sc / 0.08)), nz = Math.min(6, Math.ceil(2 * hs.z * sc / 0.08));
    if (nx <= 2 && nz <= 2) return false;
    const rise = Math.min(0.08, (R.maxY - R.minY) * sc);
    solids = this.nearSolids(solids, new THREE.Vector3(e[12], top, e[14]), hs.length() * sc + rise + 0.05);
    for (let a = 0; a <= nx; a++) for (let b2 = 0; b2 <= nz; b2++) {
      q.set(c.x + (-0.95 + 1.9 * a / nx) * hs.x, b.min.y, c.z + (-0.95 + 1.9 * b2 / nz) * hs.z).applyMatrix4(m);
      const h = this.cast(new THREE.Vector3(q.x, top + rise, q.z), down, rise + 0.03, solids)[0];
      if (h && h.point.y > top + 0.009) return true;
    }
    return false;
  }
  // STURDY (v16.2, OS-41: 1.1.1): what a thing may lean on – walls, furniture, books, and objects bigger than itself
  // (never a quill, a pen, an inkwell or a candle)
  sturdy(o, vol) {
    if (o.userData.wallFace || o.userData.books || o.isInstancedMesh) return true;
    if (o.userData.proxy) {
      const g = o.parent, s = g.scale.x, z = g.userData.box.getSize(new THREE.Vector3()).multiplyScalar(s);
      return z.x * z.y * z.z > vol * 1.2;
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const z = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).getSize(new THREE.Vector3()).toArray().sort((a, b) => b - a);
    return z[0] >= 0.3 && z[1] >= 0.04;                              // a panel, a top, a leg – not a pen or a quill
  }
  // REAL CONTACT at the top of a lean: rays from three heights round the touching point must meet a sturdy surface
  leanContact(it, m, n, solids, vol) {
    const into = n.clone().negate();
    const { touch } = this.extremes(it, m, into);
    let ok = 0;
    for (const dy of [0, -0.012, 0.012]) {
      const o = touch.clone().addScaledVector(n, 0.03); o.y += dy;
      const h = this.cast(o, into, 0.045, solids)[0];
      if (h && Math.abs(h.distance - 0.03) < 0.008 && this.sturdy(h.object, vol)) ok++;
    }
    return ok >= 2;
  }
  near(p, taken, r = 0) { return taken.some((t) => t.p.distanceTo(p) < Math.max(0.3, t.r + r)); }

  // ---------------------------------------------------------------- where things may go
  // Every upward surface belongs to a kind of place: d desk · t small table / chest · y sideboard · s shelf
  // · k top of a bookcase · m mantel · h hearth · f floor (incl. the rug) · x seat · l window sill
  // · o on top of books · z anywhere else (on another object, a basket rim…: never used – v16.1, OS-38)
  hostOf(o) { for (let p = o; p && p !== this.root; p = p.parent) if (p.userData.hostKind) return p; return null; }
  classify(hit) {
    const p = hit.point;
    if (hit.object.userData.books) return 'o';
    const host = this.hostOf(hit.object);
    if (!host) {
      if (hit.object.userData.proxy) return 'z';
      if (p.y < 0.045) return Math.abs(p.x) < 1.2 && p.z < -1.85 ? 'h' : 'f';   // (v16.2: the rug's top is uneven in Clay – up to 3.5 cm)
      return 'z';
    }
    const k = host.userData.hostKind;
    if (k === 'desk') return 'd';
    if (k === 'bookcase') { const b = host.userData.hostBox || (host.userData.hostBox = new THREE.Box3().setFromObject(host)); return p.y > b.max.y - 0.05 ? 'k' : 's'; }
    if (k === 'fireplace') return p.y > 1.15 ? 'm' : p.y < 0.12 && p.z > -2.8 ? 'h' : 'z';
    if (k === 'table' || k === 'chest') return 't';
    if (k === 'sideboard') return 'y';
    if (k === 'seat') return 'x';
    if (k === 'sill') return 'l';
    return 'z';
  }
  // regions to look in for each kind of place (so small places are found quickly)
  regions() {
    const R = [];
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      const k = o.userData.hostKind;
      if (!k) return;
      const b = new THREE.Box3().setFromObject(o);
      o.userData.hostBox = b;
      const code = { desk: 'd', bookcase: 's', fireplace: 'm', table: 't', sideboard: 'y', chest: 't', seat: 'x', sill: 'l' }[k];
      if (!code) return;
      R.push({ code, box: b });
      if (k === 'bookcase') R.push({ code: 'k', box: b }, { code: 'o', box: b });
      if (k === 'desk') R.push({ code: 'o', box: b });
      if (k === 'fireplace') R.push({ code: 'h', box: new THREE.Box3(new THREE.Vector3(-1.15, 0, -2.75), new THREE.Vector3(1.15, 0.2, -1.85)) });
    });
    for (const b of this.fx.bookZones || []) R.push({ code: 'o', box: b });
    R.push({ code: 'f', box: new THREE.Box3(new THREE.Vector3(-3.9, 0, -2.9), new THREE.Vector3(3.9, 0.05, 2.9)) });
    this.regionList = R;
  }
  // the places a model may go (catalogue "at"): t (tables) includes the sideboard (y); b (fruit bowl) stands
  // on a table; food never on the floor or the hearth; everyday things only within reach
  codesFor(it) {
    if (it.odd > 1.2) return ['f'];                                  // v16.2 SIZE RANGE: a giant stands on the floor only
    const d = it.def, codes = d.at.filter((c) => c !== 'w' && c !== 'b' && c !== 'g');
    if (d.at.includes('b') && !codes.includes('t')) codes.push('t');
    if (codes.includes('t') && !codes.includes('y')) codes.push('y');
    const out = FOOD.has(d.word) ? codes.filter((c) => c !== 'f' && c !== 'h') : codes;
    if (d.use === 'e') out.reach = true;
    return out;
  }
  // size at a place (catalogue "scale", e.g. plants: full size on the floor, smaller on tables)
  scaleAt(d, code) {
    const s = d.scale;
    if (!s) return 1;
    return s[code] ?? (code === 'y' ? s.t : undefined) ?? 1;
  }
  minScale(d) { return d.scale ? Math.min(1, ...Object.values(d.scale)) : 1; }
  // a top with room left (one thing on a small table or a seat, a few on large tops, never two Target Objects)
  hostFree(host) {
    if (!host) return true;
    const cap = HOST_CAP[host.userData.hostKind];
    if (!cap) return true;
    const u = this.hostUse.get(host);
    return !u || (u.n < cap && (this.passive || !u.to));
  }
  useHost(host, isTO) {
    if (!host || !HOST_CAP[host.userData.hostKind]) return;
    const u = this.hostUse.get(host) || { n: 0, to: 0 };
    u.n++; if (isTO) u.to++;
    this.hostUse.set(host, u);
  }
  surfacePoint(rnd, solids, minRoom, codes) {
    const down = new THREE.Vector3(0, -1, 0);
    const regs = this.regionList.filter((r) => codes.includes(r.code));
    if (!regs.length) return null;
    for (let n = 0; n < 15; n++) {
      const r = regs[Math.floor(rnd() * regs.length)], b = r.box;
      // v16.2 (speed): up to 60 probes per region are kept for the round and reused (the later tests still check
      // everything placed since – a probe never lets anything through)
      const pool = this.probes.get(r) || (this.probes.set(r, []), this.probes.get(r));
      let hits;
      if (pool.length < 60 || rnd() < 0.15) {
        const x = b.min.x + rnd() * (b.max.x - b.min.x), z = b.min.z + rnd() * (b.max.z - b.min.z);
        const top = Math.min(3.1, b.max.y + 0.4);
        hits = this.cast(new THREE.Vector3(x, top, z), down, top + 0.2, solids);
        if (pool.length < 60) pool.push(hits);
      } else hits = pool[Math.floor(rnd() * pool.length)];
      const ok = [];
      hits.forEach((h, i) => {
        if (this.normalOf(h).y < 0.9) return;
        if (codes.reach && h.point.y > REACH) return;
        const code = this.classify(h);
        if (!codes.includes(code)) return;
        const host = code === 'o' ? null : this.hostOf(h.object);
        if (!this.hostFree(host)) return;
        const above = i > 0 ? hits[i - 1].point.y : 3.1;
        if (above - h.point.y >= minRoom) { const p = h.point.clone(); p.room = above - h.point.y; p.code = code; p.obj = h.object; p.host = host; ok.push(p); }
      });
      if (ok.length) return ok[Math.floor(rnd() * ok.length)];
    }
    return null;
  }
  zoneKey(p) { return (p.code || '?') + ':' + Math.floor((p.x + 4) / 1.3) + ',' + Math.floor((p.z + 3) / 1.3) + ',' + Math.floor(p.y / 0.8); }
  // OS-25 (5.2): never so close in colour to what it lies on that it can't be seen (Medium and High)
  tooAlike(it, p) {
    if (this.level === 'low' || !p.obj || !p.obj.material || !p.obj.material.color) return false;
    const a = it.group.userData.color, b = p.obj.material.color;
    return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 0.1;
  }

  // ---------------------------------------------------------------- literal placements
  placeFlat(it, rnd, solids, taken, s0, L) {
    const d = it.def, R = this.rest(it), b0 = R.size;                // v16.2: in its stable rest pose
    const codes = this.codesFor(it);
    for (let a = 0; a < 60; a++) {
      const p = this.surfacePoint(rnd, solids, b0.y * s0 * this.minScale(d) + 0.03, codes);
      if (!p) continue;
      const s = s0 * this.scaleAt(d, p.code);                       // e.g. a houseplant: smaller on a table
      const bs = b0.clone().multiplyScalar(s), r = Math.max(bs.x, bs.z) / 2;
      if (p.room < bs.y + 0.03 || this.near(p, taken, r)) continue;
      if (!this.passive && this.avoid.has(this.zoneKey(p)) && rnd() < 0.75) continue;
      if (!this.passive && this.tooAlike(it, p) && rnd() < 0.8) continue;
      const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(UP, rnd() * Math.PI * 2), new THREE.Vector3(s, s, s)).multiply(R.R);
      m.elements[13] -= R.minY * s;                                  // its real lowest point on the surface
      const top = this.support(it, m, p.y, solids, R);
      if (top === null) continue;
      m.elements[13] += top - p.y + 0.0008;                           // resting on the highest points under it
      const adj = this.touching(it, m, solids, bs);
      if ((p.code === 'f' || p.code === 'h') && adj < 1) continue;   // never out on the open floor (OS-36: 4.3.2)
      const vis = this.visible(this.posePoints(it, m, 0.8), solids);
      const tucked = p.room !== undefined && p.room < 0.6 && vis <= (this.level === 'high' ? 0.75 : 0.95);
      // on display (no cover rule): big things, bookcase tops, and collectibles on the mantel, shelves or sideboard
      const display = r > 0.15 || p.code === 'k' || (d.use === 'c' && (p.code === 'm' || p.code === 's' || p.code === 'y'));
      if (vis < L.minVis || !(this.relaxed || display || COVER[this.level](adj, vis) || tucked)) continue;
      if (!this.clear(it, m, solids) || this.pokes(it, m, top, solids)) continue;
      return { m, kind: 'flat', at: p, vis, adj, r, host: p.host, bs };
    }
    return null;
  }
  // which way up (catalogue "up"): upright things and faces never turned over; others only when propped
  canFlip(it) { const u = it.def.up; return u !== 'upright' && u !== 'faceup' && u !== 'hang'; }
  // the model's own surface points (a sample of its vertices) – it rests on its real shape, not its box
  // v16.2 (OS-41: 1.1.5): taken from the shape in the CURRENT look – Clay / Felt / Knit make things a little uneven
  // and push their undersides 6–8 mm below the file's base: measured from the old shape they sank in that far
  restPts(it) {
    const g = it.group, key = g.userData.sampler ? g.userData.sampler.name : '';
    if (g.userData.restPts && g.userData.restKey === key) return g.userData.restPts;
    g.userData.restKey = key; g.userData.hull = null; g.userData.rest = null; g.userData.wallOrient = null;
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3(), out = [];
    let total = 0;
    for (const o of g.userData.meshes) total += o.geometry.attributes.position.count;
    const step = Math.max(1, Math.floor(total / 2500));
    for (const o of g.userData.meshes) {
      const M = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(M); out.push(v.x, v.y, v.z); }
    }
    g.userData.restPts = new Float32Array(out);
    return g.userData.restPts;
  }
  // lowest point, and deepest point along a direction, of the model in pose m
  extremes(it, m, into = null) {
    const P = this.restPts(it), e = m.elements, v = new THREE.Vector3();
    let minY = Infinity, maxIn = -Infinity;
    const low = new THREE.Vector3(), touch = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      v.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      if (v.y < minY) { minY = v.y; low.copy(v); }
      if (into) { const s = v.dot(into); if (s > maxIn) { maxIn = s; touch.copy(v); } }
    }
    return { minY, maxIn, low, touch };
  }
  touching(it, m, solids, size = null) {
    const r = (size ? size.clone() : it.box.getSize(new THREE.Vector3()).multiplyScalar(new THREE.Vector3().setFromMatrixScale(m).x)).multiplyScalar(0.5);
    const o = it.box.getCenter(new THREE.Vector3()).applyMatrix4(m);   // (its middle, in any rest pose)
    const reach = Math.max(r.x, r.z) + 0.03;
    solids = this.nearSolids(solids, o, reach + 0.02);
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.cast(o, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), reach, solids).length) n++;
    }
    return n;
  }

  placeLean(it, rnd, solids, taken, s, L) {
    const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
    const len = size.x, codes = this.codesFor(it), vol = size.x * size.y * size.z;
    for (let a = 0; a < 50; a++) {
      const p = this.surfacePoint(rnd, solids, len + 0.03, codes);
      if (!p || this.near(p, taken, len / 2)) continue;
      if (!this.passive && this.avoid.has(this.zoneKey(p)) && rnd() < 0.75) continue;
      const o = p.clone().setY(p.y + 0.03);
      let best = null;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + rnd() * 0.3;
        const d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        const h = this.cast(o, d, 0.35, solids)[0];
        if (!h) continue;
        const n = this.normalOf(h);
        if (Math.abs(n.y) > 0.3 || n.dot(d) > -0.3) continue;
        if (!this.sturdy(h.object, vol)) continue;                      // v16.2: never against a quill, a pen, a candle
        if (!best || h.distance < best.h.distance) best = { h, n: n.setY(0).normalize() };
      }
      if (!best) continue;
      const tilt = (0.12 + rnd() * 0.55);
      const up = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(best.n, -Math.sin(tilt)).normalize();
      if (rnd() < 0.5 && this.canFlip(it)) up.negate();
      let thin = best.n.clone().sub(up.clone().multiplyScalar(best.n.dot(up))).normalize();
      thin.applyAxisAngle(up, (rnd() - 0.5) * 1.6);
      const third = new THREE.Vector3().crossVectors(up, thin).normalize();
      thin = new THREE.Vector3().crossVectors(third, up).normalize();
      const rot = new THREE.Matrix4().makeBasis(up, thin, third);
      const m = this.fitPose(it, rot, s, p.y, best.h.point, best.n, rnd() * 0.04 - 0.02);
      if (!this.clear(it, m, solids) || !this.baseRests(it, m, solids)) continue;
      if (!this.leanContact(it, m, best.n, solids, vol)) continue;     // v16.2: really touching at the top (never hovering)
      const vis = this.visible(this.posePoints(it, m, 0.8), solids);
      if (vis < L.minVis) continue;
      if (this.level !== 'low' && vis > 0.92 && rnd() < 0.6) continue;
      return { m, kind: 'lean', at: p, vis, r: len / 2, host: p.host };
    }
    return null;
  }
  // its lowest real point touches the surface (v16.1: the model's own shape – a round pocket watch no longer floats)
  baseRests(it, m, solids) {
    const { low } = this.extremes(it, m);
    const h = this.cast(low.clone().setY(low.y + 0.02), new THREE.Vector3(0, -1, 0), 0.05, solids)[0];
    return !!h && Math.abs(h.point.y - low.y) < 0.006;
  }
  fitPose(it, rot, s, y, facePoint, faceN, slide = 0) {
    const m = rot.clone().scale(new THREE.Vector3(s, s, s));
    const pts = this.posePoints(it, m, 1);
    const into = faceN ? faceN.clone().negate() : null;
    const { minY, maxIn } = this.extremes(it, m, into);            // its real shape, not its box
    const t = new THREE.Vector3(0, y - minY + 0.0008, 0);
    if (into) {
      const want = facePoint.dot(into) - 0.001;
      const along = new THREE.Vector3().crossVectors(UP, faceN).normalize();
      t.addScaledVector(into, want - maxIn);
      t.add(facePoint.clone().projectOnVector(along).sub(pts[0].clone().projectOnVector(along)));
      t.addScaledVector(along, slide);
    }
    return new THREE.Matrix4().makeTranslation(t.x, t.y, t.z).multiply(m);
  }
  placeWedge(it, rnd, solids, taken, s, L) {
    const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s), codes = this.codesFor(it);
    for (let a = 0; a < 40; a++) {
      const p = this.surfacePoint(rnd, solids, size.x * 0.5, codes);
      if (!p || this.near(p, taken)) continue;
      const o = p.clone().setY(p.y + 0.02);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI + rnd() * 0.4, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        const h1 = this.cast(o, d, 0.08, solids)[0], h2 = this.cast(o, d.clone().negate(), 0.08, solids)[0];
        if (!h1 || !h2) continue;
        const vol = size.x * size.y * size.z;
        if (!this.sturdy(h1.object, vol) || !this.sturdy(h2.object, vol)) continue;   // v16.2: held by sturdy things only
        const gap = h1.distance + h2.distance;
        if (gap < size.y + 0.003 || gap > size.y + 0.035) continue;
        const mid = o.clone().addScaledVector(d, (h1.distance - h2.distance) / 2);
        const up = UP.clone().applyAxisAngle(d, (rnd() - 0.5) * 0.8);
        if (rnd() < 0.5 && this.canFlip(it)) up.negate();
        const third = new THREE.Vector3().crossVectors(up, d).normalize();
        const rot = new THREE.Matrix4().makeBasis(up, d.clone(), third);
        const m = this.fitPose(it, rot, s, p.y, null, null);
        const c = this.posePoints(it, m, 1)[0], off = mid.clone().setY(0).sub(c.clone().setY(0));
        m.premultiply(new THREE.Matrix4().makeTranslation(off.x, 0, off.z));
        if (!this.clear(it, m, solids)) continue;
        const vis = this.visible(this.posePoints(it, m, 0.8), solids);
        if (vis < L.minVis * 0.7) continue;
        mid.code = p.code;
        return { m, kind: 'wedge', at: mid, vis, r: size.x / 2, host: p.host };
      }
    }
    return null;
  }
  // THE GLOBE (catalogue "g", OS-38/39): standing on its top, or lying on its side on the rim of its base –
  // the round cap on the three legs, around the stem. Sized by the catalogue (chess pieces 80 %).
  placeSocket(it, rnd, solids) {
    const d = it.def, s = this.scaleAt(d, 'g');
    const free = (this.fx.sockets || []).filter((k) => (k.kind === 'globe-top' || k.kind === 'globe-lip') && !this.socketsUsed.has(k));
    for (const sk of shuffle(free, rnd)) {
      sk.parent.updateMatrixWorld(true);
      const at = sk.pos.clone().applyMatrix4(sk.parent.matrixWorld);
      if (sk.kind === 'globe-top') {   // the globe's real surface there (its look may round it a little higher)
        const h = this.cast(at.clone().setY(at.y + 0.3), new THREE.Vector3(0, -1, 0), 0.4, solids)[0];
        if (h) at.y = h.point.y;
      }
      for (let k = 0; k < 8; k++) {
        const a = rnd() * Math.PI * 2;
        let m;
        if (sk.kind === 'globe-top') {
          m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(UP, a), new THREE.Vector3(s, s, s));
        } else {
          // lying across the rim: its height runs round the stem, its side rests on the cap
          const R = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), T = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
          m = new THREE.Matrix4().makeBasis(R, T, new THREE.Vector3().crossVectors(R, T)).scale(new THREE.Vector3(s, s, s));
          const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
          const half = Math.max(size.x, size.z) / 2, r0 = sk.inner + half + 0.004;
          if (Math.hypot(r0, size.y / 2) > sk.outer + 0.008) break;   // too long for the rim
          const mid = it.box.getCenter(new THREE.Vector3()).applyMatrix4(m);
          const { minY } = this.extremes(it, m);
          const want = at.clone().addScaledVector(R, r0);
          m.premultiply(new THREE.Matrix4().makeTranslation(want.x - mid.x, at.y - minY + 0.0008, want.z - mid.z));
        }
        if (!this.clear(it, m, solids)) continue;
        this.socketsUsed.add(sk);
        const p = at.clone(); p.code = 'g';
        return { m, kind: 'socket', at: p, vis: 1, r: 0.05 };
      }
    }
    return null;
  }

  // WALL (v16, OS-31: 1.2.1): hung flat against a wall, its thinnest side to the wall; weapons often over
  // the fireplace, crossed at an angle. The wall must be behind the whole object (no windows, doors,
  // bookcases or pictures), and nothing may overlap it.
  placeWall(it, rnd, solids, taken) {
    const W = [
      { n: [0, 0, 1], o: [0, 0, -3.0], u: [1, 0, 0], a: [-3.9, 3.9], w: 1 },     // back wall
      { n: [1, 0, 0], o: [-4.0, 0, 0], u: [0, 0, -1], a: [-2.9, 2.9], w: 1 },    // left wall
      { n: [0, 0, -1], o: [0, 0, 3.0], u: [-1, 0, 0], a: [-3.9, 3.9], w: 0.8, cut: 'front' }, // front wall (OS-25 5.4: may hold TOs)
      { n: [-1, 0, 0], o: [4.0, 0, 0], u: [0, 0, 1], a: [-2.9, 2.9], w: 0.8, cut: 'right' },  // right wall
    ];
    const chimney = { n: [0, 0, 1], o: [0, 0, -2.75], u: [1, 0, 0], a: [-0.8, 0.8], y: [1.35, 3.05], chimney: true };
    const d = it.def, id = d.id;
    const weapon = WEAPONS.has(id);
    const size = it.box.getSize(new THREE.Vector3());
    const thinAxis = size.y < size.z ? 'y' : 'z', thick = Math.min(size.y, size.z);
    const mount = CONCEALED.has(id) ? 'none' : BRACKET[id] ? 'bracket' : NAIL.has(id) ? 'nail' : 'pegs';
    const standoff = BRACKET[id] || 0;
    const orient = this.wallOrient(it);
    // the front and right walls are cut away in the Diorama: fewer things there, and at most one Target
    // Object per round (OS-25: 5.4 – an extra challenge, not the rule)
    const walls = W.filter((z) => !z.cut || this.passive || (!this.cutWallTO && this.level !== 'low'));
    const wsum = walls.reduce((s, z) => s + (z.cut ? 0.3 : 1), 0);
    const pickWall = () => { let x = rnd() * wsum; for (const z of walls) { x -= z.cut ? 0.3 : 1; if (x <= 0) return z; } return walls[0]; };
    for (let a = 0; a < 70; a++) {
      const Z = weapon && rnd() < 0.7 ? chimney : pickWall();
      const n = new THREE.Vector3(...Z.n), u = new THREE.Vector3(...Z.u);
      const t = Z.a[0] + rnd() * (Z.a[1] - Z.a[0]);
      const yr = orient.y || Z.y || [1.0, 2.95], y = yr[0] + rnd() * (yr[1] - yr[0]);
      const upright = (d.pose === 'upright' && thinAxis === 'z' && !weapon) || orient.th !== undefined;
      let th = upright ? (orient.th ?? (rnd() - 0.5) * 0.1) : weapon ? (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.6) : (rnd() - 0.5) * 0.5;
      if (mount === 'bracket') th = 0;                                       // a lantern hangs plumb
      if (orient.low && !upright) th = -orient.low * Math.abs(th) * (rnd() < 0.25 ? 0 : 1);   // rifle: level, or stock lower
      const along = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(UP, Math.sin(th));
      const basis = new THREE.Matrix4();
      if (thinAxis === 'y') basis.makeBasis(along, orient.flip ? n.clone().negate() : n, new THREE.Vector3().crossVectors(along, orient.flip ? n.clone().negate() : n));
      else basis.makeBasis(along, new THREE.Vector3().crossVectors(n, along), n);
      if (orient.turn) basis.multiply(orient.turn);
      if (orient.back) {   // (sconce) upright, its back panel's side onto the wall: local back → into the wall, local up → up
        const b = orient.back, l3 = new THREE.Vector3().crossVectors(b, UP), w3 = new THREE.Vector3().crossVectors(n.clone().negate(), UP);
        basis.makeBasis(n.clone().negate(), UP, w3).multiply(new THREE.Matrix4().makeBasis(b, UP, l3).transpose());
      }
      const c = new THREE.Vector3(...Z.o).addScaledVector(u, t).setY(y).addScaledVector(n, thick / 2 + 0.006 + standoff);
      const lc = it.box.getCenter(new THREE.Vector3()).applyMatrix4(basis);
      const m = new THREE.Matrix4().makeTranslation(c.x - lc.x, c.y - lc.y, c.z - lc.z).multiply(basis);
      // v16.2: its real back (not its box) 6 mm off the wall (Clay walls are up to ±5 mm uneven) – flush like a fixture, never floating or sunk in
      { const { maxIn } = this.extremes(it, m, n.clone().negate()); const gap = (-new THREE.Vector3(...Z.o).dot(n)) - maxIn;   // (wall plane: p·n = o·n)
        m.premultiply(new THREE.Matrix4().makeTranslation(...n.clone().multiplyScalar(-(gap - 0.006 - standoff)).toArray())); }
      const pts = this.posePoints(it, m, 0.85);
      if (pts.some((p) => p.y < 0.95 || p.y > 3.1)) continue;
      if (d.use === 'e' && pts.some((p) => p.y > REACH_WALL)) continue;     // everyday tools within reach
      if (this.near(c, taken, Math.max(size.x, size.y, size.z) / 2)) continue;
      // the wall right behind every corner (not a window, door, bookcase or picture)
      const back = n.clone().negate();
      // (v16.1: a grid over its whole face, not just its corners – a diagonal axe must not overlap a picture frame)
      const lb = it.box, lc0 = lb.getCenter(new THREE.Vector3()), lh = lb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const grid = [];
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) for (const b of [-0.8, 0, 0.8]) {
        grid.push(new THREE.Vector3(lc0.x + a * lh.x, thinAxis === 'y' ? lc0.y : lc0.y + b * lh.y, thinAxis === 'y' ? lc0.z + b * lh.z : lc0.z).applyMatrix4(m));
      }
      const near = this.nearSolids(solids, c, Math.max(size.x, size.y, size.z) * 0.6 + 0.35);
      const backed = [pts[0], ...pts.slice(1).filter((p, i) => p.clone().sub(c).dot(n) < 0.001 || i < 4), ...grid].every((p) => {
        const h = this.cast(p.clone().addScaledVector(n, 0.15), back, 0.15 + thick + standoff + 0.05, near)[0];
        return h && h.object.userData.wallFace && this.normalOf(h).dot(n) > 0.9;
      });
      if (!backed || !this.clear(it, m, solids, true)) continue;
      const vis = this.visible(pts, solids);
      if (vis < 0.2) continue;
      c.code = Z.chimney ? 'c' : 'w';
      if (Z.cut && !this.passive) this.cutWallTO = true;
      return { m, kind: 'wall', at: c, vis, r: Math.max(size.x, size.y) / 2, cut: Z.cut || null, n, along, wall: new THREE.Vector3(...Z.o).dot(n), mount };
    }
    return null;
  }
  // how a model must face on a wall (OS-36: 4.1.2), worked out once from its own shape:
  //   sconce – upright like a light fixture, 1.6–2.1 m up · shield – point down · rifle – stock never higher than the muzzle
  wallOrient(it) {
    const g = it.group, id = it.def.id;
    if (g.userData.wallOrient) return g.userData.wallOrient;
    let o = {};
    const P = this.restPts(it), size = it.box.getSize(new THREE.Vector3()), c = it.box.getCenter(new THREE.Vector3());
    // how wide the model is near each end of its long (x) axis: the heavy / blunt end is the wider one
    const widthAt = (sign) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < P.length; i += 3) if ((P[i] - c.x) * sign > size.x * 0.3) { const w = size.y < size.z ? P[i + 2] : P[i + 1]; lo = Math.min(lo, w); hi = Math.max(hi, w); }
      return hi - lo;
    };
    if (id === 'ph-kite_shield') o = { th: widthAt(1) < widthAt(-1) ? -Math.PI / 2 : Math.PI / 2 };   // the narrow end (the point) down
    else if (id === 'ph-bolt_action_rifle_7_62') o = { low: widthAt(1) > widthAt(-1) ? 1 : -1 };      // the wide end (the stock) lower
    else if (id === 'ph-industrial_wall_sconce') {
      // v16.2 (OS-40: 2.3): its FLAT BACK PANEL goes against the wall – found from its own shape: of the four sides,
      // the one with the largest flat area facing out at the very edge (its triangles' area – a plain plate has only
      // a few corner points, so counting points picks the wrong side)
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert(), a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), nn = new THREE.Vector3();
      const tris = [];
      for (const ms of g.userData.meshes) {
        const M = inv.clone().multiply(ms.matrixWorld), pos = ms.geometry.attributes.position, idx = ms.geometry.index;
        const cnt = idx ? idx.count : pos.count;
        for (let i = 0; i < cnt; i += 3) {
          a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(M); cc.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(M);
          nn.subVectors(cc, b).cross(a.clone().sub(b));
          const area = nn.length() / 2;
          if (area > 1e-9) tris.push([a.clone(), b.clone(), cc.clone(), nn.clone().normalize(), area]);
        }
      }
      let best = null;
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const D = new THREE.Vector3(...d);
        let mx = -Infinity;
        for (let i = 0; i < P.length; i += 3) mx = Math.max(mx, P[i] * d[0] + P[i + 2] * d[2]);
        let area = 0;
        for (const [p, q, r, n, ar] of tris) if (n.dot(D) > 0.9 && mx - p.dot(D) < 0.012 && mx - q.dot(D) < 0.012 && mx - r.dot(D) < 0.012) area += ar;
        if (!best || area > best.area) best = { area, d: D };
      }
      o = { th: 0, y: [1.6, 2.1], back: best.d };
    }
    g.userData.wallOrient = o;
    return o;
  }
  // WALL HARDWARE (OS-39: 2.1.1): iron pegs under a tool or weapon (two under long ones, so it can't tip),
  // an arm with an upturned end for a lantern's handle, a nail for a clipboard or a mask. One merged mesh.
  hooksFor(it, f) {
    if (!f.mount || f.mount === 'none') return [];
    const geos = [], n = f.n, along = f.along, meshes = it.group.userData.meshes;
    it.group.updateMatrixWorld(true);
    const s = it.group.scale.x, size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
    const thick = Math.min(size.y, size.z), c = it.box.getCenter(new THREE.Vector3()).applyMatrix4(f.m);
    const depthOf = (p) => p.dot(n) - f.wall;
    const onWall = (p, dd) => p.clone().addScaledVector(n, dd - depthOf(p));
    const rod = (from, to, r) => {
      const len = from.distanceTo(to), g = new THREE.CylinderGeometry(r, r, len, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      geos.push(g);
    };
    const ray = this.ray;
    const surface = (q, dir, depths) => {          // first point of the model met going along dir (UP or down)
      let best = null;
      for (const dd of depths) {
        ray.set(onWall(q, dd).addScaledVector(dir, -0.6), dir);
        ray.far = 1.2;
        const h = ray.intersectObjects(meshes, false)[0];
        if (h && (!best || (dir.y > 0 ? h.point.y < best : h.point.y > best))) best = h.point.y;
      }
      return best;
    };
    const depths = [0.3, 0.5, 0.7].map((k) => 0.006 + thick * k);
    if (f.mount === 'pegs') {
      // v16.2 (OS-41: 1.1): always two pegs, unless it hangs straight up and down (then one under its top)
      const L = size.x, ts = Math.abs(along.y) > 0.85 ? [0] : [-0.3 * L, 0.3 * L];
      for (const t0 of ts) {
        let y = null, q = null;
        for (const k of [1, 0.8, 1.2, 0.6, 0.4]) { q = c.clone().addScaledVector(along, t0 * k); y = surface(q, UP, depths); if (y !== null) break; }
        if (y === null) continue;
        const base = onWall(q, 0).setY(y - 0.005), front = depthOf(base) + thick + 0.02;
        rod(base, base.clone().addScaledVector(n, front), 0.005);                               // the peg
        const tip = base.clone().addScaledVector(n, front - 0.004);
        rod(tip.clone().setY(y - 0.009), tip.clone().setY(y + 0.012), 0.004);                  // its upturned end
        rod(base.clone().addScaledVector(n, -0.001), base.clone().addScaledVector(n, 0.005), 0.012);   // a round plate on the wall
      }
    } else {
      const dc = depthOf(c), top = surface(c, new THREE.Vector3(0, -1, 0), f.mount === 'bracket' ? [dc] : depths);
      if (top === null) return geos;
      if (f.mount === 'bracket') {
        const y = top - 0.006, base = onWall(c, 0).setY(y);
        rod(base, base.clone().addScaledVector(n, dc + 0.02), 0.0045);                          // the arm, through the handle
        const tip = base.clone().addScaledVector(n, dc + 0.018);
        rod(tip, tip.clone().setY(y + 0.018), 0.0045);                                           // its upturned end
        geos.push(new THREE.BoxGeometry(0.03, 0.08, 0.006).applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(n, 0.003), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), new THREE.Vector3(1, 1, 1))));
      } else {
        const y = top - Math.min(0.025, size.y * 0.1), base = onWall(c, 0).setY(y);
        rod(base, base.clone().addScaledVector(n, thick + 0.012), 0.0025);                      // the nail
        const head = base.clone().addScaledVector(n, thick + 0.012);
        rod(head, head.clone().addScaledVector(n, 0.003), 0.006);                               // its head
      }
    }
    return geos;
  }
  buildHooks() {
    for (const h of this.hookMeshes || []) { h.removeFromParent(); h.geometry.dispose(); }
    this.hookMeshes = [];
    const byCut = new Map();
    for (const it of this.items) {
      if (!it.form || it.form.kind !== 'wall') continue;
      const geos = this.hooksFor(it, it.form);
      if (!geos.length) continue;
      const key = it.form.cut || '';
      if (!byCut.has(key)) byCut.set(key, []);
      byCut.get(key).push(...geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    }
    for (const [key, geos] of byCut) {
      for (const g of geos) { for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); }
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), HOOK_MAT);
      geos.forEach((g) => g.dispose());
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.decor = true;
      mesh.userData.cutTag = key || null;
      mesh.raycast = () => {};
      this.root.add(mesh);
      this.hookMeshes.push(mesh);
    }
  }

  placeLiteral(it, rnd, solids, taken, L) {
    const d = it.def, big = longest(d) > 0.45;
    const s = it.odd ? it.odd * (0.95 + rnd() * 0.1)                 // v16.2 SIZE RANGE: an odd size this round
      : it.wall ? 1 : big ? 0.92 + rnd() * 0.08 : L.size[0] + rnd() * (L.size[1] - L.size[0]);
    const tries = [];
    const onWall = d.at.includes('w') && !it.odd;                    // (odd sizes: never on a wall)
    const surfaces = this.codesFor(it).length > 0;
    if (onWall && (!surfaces || rnd() < (this.passive ? 0.6 : 0.4))) tries.push('wall');
    if (surfaces) {
      const w = { ...L.modes };
      const lieable = d.pose === 'lie' && longest(d) <= 0.6;
      if (!lieable) { w.lean = 0; w.wedge = 0; }
      if (!d.at.includes('g')) w.socket = 0;                      // only what the catalogue allows on the globe (OS-38)
      else w.socket = Math.max(w.socket, 0.15);
      const pool = Object.entries(w).filter(([, v]) => v > 0);
      while (pool.length) {
        const sum = pool.reduce((a, [, v]) => a + v, 0);
        let x = rnd() * sum, i = 0;
        while (x > pool[i][1]) { x -= pool[i][1]; i++; }
        tries.push(pool.splice(i, 1)[0][0]);
      }
    }
    if (onWall && !tries.includes('wall')) tries.push('wall');
    for (const k of tries) {
      const f = k === 'wall' ? this.placeWall(it, rnd, solids, taken) : k === 'flat' ? this.placeFlat(it, rnd, solids, taken, s, L)
        : k === 'lean' ? this.placeLean(it, rnd, solids, taken, s, L) : k === 'wedge' ? this.placeWedge(it, rnd, solids, taken, s, L) : this.placeSocket(it, rnd, solids);
      if (f) return f;
    }
    if (it.odd) { it.odd = null; return this.placeLiteral(it, rnd, solids, taken, L); }   // (no room at that size: its usual size)
    return null;
  }

  // ---------------------------------------------------------------- figurative forms
  formWoven(it, rnd, solids) {
    const rug = this.fx.rug;
    if (!rug) return null;
    const shapes = this.shapes(it);
    if (!shapes.length) return null;
    const cx = rug.KW / 2, cy = rug.KH / 2;
    const ranked = rug.slots.map((s, i) => ({ s, i, rank: s.feature ? 0 : (Math.abs(s.x - cx) < 4 || Math.abs(s.y - cy) < 4) ? 1 : 2 }));
    ranked.sort((a, b) => (a.rank - b.rank) || (rnd() - 0.5));
    if (rnd() < 0.35) ranked.push(ranked.shift());
    for (const { s, i } of ranked) {
      const p = rug.toWorld(s.x, s.y);
      const r = s.s * rug.metresPerKnot * 0.6;
      const pts = [p, ...[0, 1, 2, 3].map((k) => p.clone().add(new THREE.Vector3(Math.cos(k * 1.57) * r, 0, Math.sin(k * 1.57) * r)))];
      const vis = this.visible(pts.map((q) => q.clone().setY(q.y + 0.004)), solids);
      if (vis < 0.6) continue;
      const turn = (Math.floor(rnd() * 4) * Math.PI) / 2, flip = rnd() < 0.5 ? -1 : 1;
      const size = s.s * (this.level === 'low' ? 1.3 : this.level === 'med' ? 1.15 : 1.0);
      rug.render({ slot: i, draw: (ctx) => { ctx.rotate(turn); ctx.scale(flip, 1); ctx.lineWidth = 0.6; drawOutline(ctx, shapes, size); } });
      p.code = 'rug';
      return { kind: 'woven', at: p, slot: i, radius: size * 0.6, colors: { fill: s.col, stroke: '#4a1616' }, turn, flip };
    }
    return null;
  }
  // which picture may show which object, and where (TO v3 context recipes, now automatic for every model)
  recipe(pt, it) {
    const d = it.def, L = longest(d), upright = d.pose === 'upright';
    if (pt.kind === 'stamps') { const cell = pt.cells[Math.floor(Math.random() * pt.cells.length)]; return { u: [cell.u, cell.u], v: [cell.v, cell.v], size: cell.size, turn: [0, 0], upright: true, why: 'a stamp of it' }; }
    if (pt.id === 'still' && L <= 0.45 && (d.at.includes('d') || d.at.includes('t'))) {
      const left = Math.random() < 0.5;
      return { u: left ? [0.12, 0.3] : [0.62, 0.86], v: upright ? [0.8, 0.82] : [0.84, 0.9], size: upright ? 0.1 : 0.12, turn: upright ? [0, 0] : [-0.4, 0.4], upright, why: 'on the table' };
    }
    if (pt.id === 'land' && (d.at.includes('f') || d.kind === 'sculpture' || d.at.includes('w')) && !FOOD.has(d.word)) {
      return { u: [0.25, 0.75], v: [0.88, 0.94], size: 0.07, turn: upright ? [0, 0] : [-0.4, 0.4], upright, why: 'lying in the grass' };
    }
    return null;
  }
  formPainted(it, rnd, solids, usedPaintings) {
    const shapes = this.shapes(it);
    if (!shapes.length) return null;
    const list = (this.fx.paintings || []).filter((pt) => !usedPaintings.has(pt) && this.recipe(pt, it));
    if (!list.length) return null;
    const pt = list[Math.floor(rnd() * list.length)];
    const R = this.recipe(pt, it), pick = ([a, b]) => a + rnd() * (b - a);
    const u = pick(R.u), v = pick(R.v);
    const W = pt.canvas.width, H = pt.canvas.height;
    const size = W * R.size * (this.level === 'high' ? 0.85 : this.level === 'med' ? 1 : 1.25);
    const turn = pick(R.turn), flip = R.upright ? 1 : (rnd() < 0.5 ? -1 : 1);
    const colors = {};
    pt.render((ctx) => {
      const px = ctx.getImageData(Math.floor(u * W), Math.floor(v * H), 1, 1).data;
      const base = `rgb(${px[0]},${px[1]},${px[2]})`;
      const dark = `rgb(${px[0] * 0.55 | 0},${px[1] * 0.55 | 0},${px[2] * 0.55 | 0})`;
      const lite = `rgb(${Math.min(255, px[0] * 1.35) | 0},${Math.min(255, px[1] * 1.35) | 0},${Math.min(255, px[2] * 1.35) | 0})`;
      colors.fill = dark; colors.stroke = lite;
      ctx.translate(u * W, v * H);
      ctx.rotate(turn); ctx.scale(flip, 1);
      ctx.save(); ctx.translate(size * 0.04, size * 0.05); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.filter = 'blur(3px)'; drawOutline(ctx, shapes, size, false); ctx.restore();
      ctx.fillStyle = dark; ctx.strokeStyle = lite; ctx.lineWidth = Math.max(1, size * 0.02);
      drawOutline(ctx, shapes, size);
      ctx.globalAlpha = 0.5; ctx.fillStyle = base; ctx.save(); ctx.translate(-size * 0.02, -size * 0.02); drawOutline(ctx, shapes, size * 0.9, false); ctx.restore();
    });
    usedPaintings.add(pt);
    pt.mesh.updateMatrixWorld(true);
    const at = pt.toWorld ? pt.toWorld(u, v) : new THREE.Vector3((u - 0.5) * pt.wM, (0.5 - v) * pt.hM, 0).applyMatrix4(pt.mesh.matrixWorld);
    at.code = 'pic:' + pt.id;
    return { kind: 'painted', at, painting: pt, u, v: pt.uvDown ? v : 1 - v, radius: size / W * 0.6, colors, why: R.why, turn, flip };
  }
  formRelief(it, rnd, solids, taken) {
    const shapes = this.shapes(it);
    if (!shapes.length) return null;
    for (let a = 0; a < 90; a++) {
      const o = new THREE.Vector3(-3.8 + rnd() * 7.6, 0.08 + rnd() * 1.7, -2.9 + rnd() * 5.8);
      if (this.inside(o, solids)) continue;
      const ang = rnd() * Math.PI * 2, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const h = this.cast(o, d, 1.5, solids)[0];
      if (!h || h.object.isInstancedMesh || h.object.userData.proxy || h.object.userData.imported || h.object.material.map) continue;
      if (!h.object.geometry.boundingSphere) h.object.geometry.computeBoundingSphere();
      if (h.object.geometry.boundingSphere.radius > 1.2) continue;
      const host = this.hostOf(h.object);
      if (!host || !RELIEF_OK.has(host.userData.hostKind)) continue;
      const n = this.normalOf(h);
      if (Math.abs(n.y) > 0.08 || n.dot(this.viewDir) < 0.25) continue;
      if (this.near(h.point, taken)) continue;
      n.setY(0).normalize();
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0009, bevelSegments: 1, curveSegments: 4 });
      geo.center();
      geo.computeBoundingBox();
      const raw = geo.boundingBox.getSize(new THREE.Vector3());
      const want = (this.level === 'low' ? 0.2 : this.level === 'med' ? 0.16 : 0.13);
      const s = Math.min(want / Math.max(raw.x, raw.y, 1e-6), 4);
      const half = raw.clone().multiplyScalar(0.5 * s);
      const tang = new THREE.Vector3().crossVectors(UP, n).normalize();
      const flat = [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([i, j]) => {
        const q = h.point.clone().addScaledVector(tang, i * half.x).addScaledVector(UP, j * half.y).addScaledVector(n, 0.02);
        const hh = this.cast(q, n.clone().negate(), 0.04, solids)[0];
        return hh && hh.object === h.object && Math.abs(hh.distance - 0.02) < 0.003;
      });
      if (!flat) { geo.dispose(); continue; }
      const vis = this.visible([h.point.clone().addScaledVector(n, 0.004)], solids);
      if (vis < 1) { geo.dispose(); continue; }
      const rel = new THREE.Mesh(geo, h.object.material);
      rel.userData.target = it;
      rel.userData.host = h.object;
      const count = geo.attributes.position.count, seed = h.object.geometry.attributes.aSeed ? h.object.geometry.attributes.aSeed.getX(0) : 0.5;
      geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(seed), 1));
      const fill = (v) => { const arr = new Float32Array(count * 3); for (let i = 0; i < count; i++) arr.set(v, i * 3); return arr; };
      geo.setAttribute('aGrain', new THREE.BufferAttribute(fill([1, 0, 0]), 3));
      geo.setAttribute('aGrain2', new THREE.BufferAttribute(fill([0, 1, 0]), 3));
      const turn = rnd() * Math.PI * 2;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), turn));
      rel.quaternion.copy(q);
      rel.scale.setScalar(s);
      rel.position.copy(h.point).addScaledVector(n, 0.0018 * s);
      rel.castShadow = true;
      rel.receiveShadow = true;
      this.root.add(rel);
      this.reliefs.push(rel);
      const at = h.point.clone(); at.code = 'relief';
      return { kind: 'relief', at, mesh: rel, turn: -turn, flip: 1 };
    }
    return null;
  }

  // ---------------------------------------------------------------- a round
  // picked: from pick() · groups: id → loaded model group
  place(seed, picked, groups) {
    const rnd = xorshift(seed);
    for (const p of this.pops) {
      p.ring.removeFromParent(); p.ring.material.dispose();
      if (p.a && p.a.saved) this.unghost(p.a);
    }
    this.pops = [];
    for (const r of this.reliefs) { r.removeFromParent(); r.geometry.dispose(); }
    this.reliefs = [];
    for (const it of this.items) { it.group.removeFromParent(); this.setRole(it, null); }
    this.items = [];
    this.socketsUsed = new Set();
    this.probes = new Map();                   // (v16.2: surface probes, reused within this round)
    this.hostUse = new Map();
    this.cutWallTO = false;
    if (this.fx.globeBall) this.fx.globeBall.rotation.y = rnd() * Math.PI * 2;
    if (this.fx.rug) this.fx.rug.render(null);
    (this.fx.paintings || []).forEach((p) => p.render(null));
    // the fixed imported furniture (OS-31): always the same pieces, nudged a little (lived-in, OS-25: 3.3.1)
    this.placeFurniture(picked.bg, groups, rnd);
    this.root.updateMatrixWorld(true);
    this.regions();
    const L = LEVELS[this.level];
    const mk = (def, role) => {
      const group = groups.get(def.id);
      if (!group) return null;
      const it = { def, group, box: group.userData.box, name: def.word, word: def.word, found: false, revealed: false, ringed: false, form: null, role: null, shown: false };
      it.shadow = group.userData.shadowRec || (group.userData.shadowRec = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true })));
      it.shadow.visible = false;
      this.setRole(it, role);
      return it;
    };
    const tos = picked.order.map((d) => mk(d, 'to')).filter(Boolean);
    const pos = picked.pos.map((d) => { const it = mk(d, 'po'); if (it) it.lookalike = picked.look.has(d.id); return it; }).filter(Boolean);
    // v16.2 SIZE RANGE (OS-41: 5.x): a few things at an odd size this round – Low 0–1 · Medium 1–3 · High 2–6 (JM's
    // numbers) – somewhere in the model's catalogue range, clearly bigger or smaller than usual (giants: floor only)
    {
      const [a, b] = ODD[this.level] || [0, 0];
      let n = a + Math.floor(rnd() * (b - a + 1));
      for (const it of shuffle([...tos, ...pos].filter((x) => x.def.range && !x.lookalike), rnd)) {
        if (n <= 0) break;
        const [lo, hi] = it.def.range, L0 = longest(it.def), ways = [];
        if (hi >= L0 * 1.6) ways.push([L0 * 1.6, hi]);
        if (lo <= L0 / 1.6) ways.push([lo, L0 / 1.6]);
        if (!ways.length) continue;
        const [x0, x1] = ways[Math.floor(rnd() * ways.length)];
        it.odd = (x0 + rnd() * (x1 - x0)) / L0;
        n--;
      }
    }
    const sides = new Map();
    const doubleSided = (list) => { for (const o of list) if (!sides.has(o.material)) { sides.set(o.material, o.material.side); o.material.side = THREE.DoubleSide; } };
    let solids = this.solids(true);
    doubleSided(solids);
    const taken = [];
    const show = (it, f) => {
      f.m.decompose(it.group.position, it.group.quaternion, it.group.scale);
      it.group.visible = true;
      it.group.userData.cutTag = f.cut || null;     // hangs on a wall a view may cut away: hidden with it
      this.root.add(it.group);
      it.group.updateMatrixWorld(true);
      this.placeShadow(it, f);
      this.items.push(it);
    };
    // (v16.1, OS-36: 5.1.1: the houseplants no longer stand in fixed corners – they are placed like everything
    // else: on the floor beside furniture or a wall, or smaller on the sideboard, mantel, desk or trunk)
    // Passive Objects: displays first (walls, bookcase tops, floor), then everything else, hidden by the
    // same rules as the Target Objects (OS-25: 7, OS-37: 3.2) – with the easiest cover rule if no spot was
    // found, never out in the open (a PO that finds no fair spot is left out this round)
    this.passive = true;
    const byDisplay = (it) => (it.def.at.includes('w') ? 0 : it.def.at.includes('k') ? 1 : longest(it.def) > 0.45 ? 2 : 3);
    for (const it of pos.filter((x) => !x.fixed).sort((a, b) => byDisplay(a) - byDisplay(b))) {
      let f = this.placeLiteral(it, rnd, solids, taken, L);
      if (!f && this.level !== 'low') { const lvl = this.level; this.level = 'low'; f = this.placeLiteral(it, rnd, solids, taken, LEVELS.low); this.level = lvl; }
      it.form = f;
      if (!f) { this.setRole(it, null); continue; }
      taken.push({ p: f.at, r: f.r || 0.1 });
      this.useHost(f.host, false);
      show(it, f);
      solids.push(it.group.userData.proxyMesh);
      solids.balls.push(new THREE.Sphere().setFromPoints(this.posePoints(it, f.m, 1)));
      solids.view.push(it.group.userData.proxyMesh);
      solids.view.balls.push(solids.balls.at(-1));
      if (!sides.has(it.group.userData.proxyMesh.material)) { sides.set(it.group.userData.proxyMesh.material, it.group.userData.proxyMesh.material.side); it.group.userData.proxyMesh.material.side = THREE.DoubleSide; }
    }
    this.passive = false;
    // Target Objects: which are figurative this round, and in which form (OS-30: 3.1)
    const canFig = (it) => longest(it.def) <= 0.6 && !it.fixed;
    const figurative = new Set(tos.filter(canFig).slice(0, L.figurative));
    let wovenUsed = false;
    const usedPaintings = new Set();
    for (const it of tos) {
      if (it.fixed) continue;
      let form = null;
      if (figurative.has(it)) {
        const kinds = ['relief', 'painted', 'woven'].filter((k) => !(k === 'woven' && wovenUsed)).sort(() => rnd() - 0.5);
        for (const k of kinds) {
          form = k === 'woven' ? this.formWoven(it, rnd, solids) : k === 'painted' ? this.formPainted(it, rnd, solids, usedPaintings) : this.formRelief(it, rnd, solids, taken);
          if (form) { if (k === 'woven') wovenUsed = true; break; }
        }
      }
      if (!form) form = this.placeLiteral(it, rnd, solids, taken, L);
      if (!form) {
        const lvl = this.level;
        for (const easier of ['med', 'low']) {
          if (form || easier === lvl || lvl === 'low') continue;
          this.level = easier;
          form = this.placeLiteral(it, rnd, solids, taken, LEVELS[easier]);
        }
        this.level = lvl;
        if (!form) { this.relaxed = true; form = this.placeLiteral(it, rnd, solids, taken, LEVELS.low); this.relaxed = false; }
      }
      it.form = form;
      if (form && form.at) taken.push({ p: form.at, r: form.r || 0.08 });
      if (form) this.useHost(form.host, true);
      if (form && form.m) show(it, form);
    }
    for (const [mtl, side] of sides) mtl.side = side;
    // a Target Object with no fair spot is left out; a Passive Object already hidden takes its place on
    // the list (its word is not on the list yet), so every round has 15
    const spare = shuffle(this.items.filter((x) => x.role === 'po' && !x.lookalike && !x.fixed), rnd);
    this.list = tos.map((it) => {
      if (it.form) return it;
      console.warn('ObjectSleuth: no place for', it.def.id);
      this.setRole(it, null);
      const sub = spare.shift();
      if (sub) this.setRole(sub, 'to');
      return sub || null;
    }).filter(Boolean);
    this.zonesUsed = this.list.map((it) => this.zoneKey(it.form.at));
    this.buildHooks();
    this.mergeShadows();
    this.root.updateMatrixWorld(true);
    this.roll();
    this.changed = true;
    if (this.onChange) this.onChange(this);
  }

  placeFurniture(defs, groups, rnd) {
    for (const s of this.fx.bgSpots || []) {
      const g = groups.get(s.id);
      if (!g) continue;
      if (!g.parent) {
        if (s.kind !== 'frame') g.userData.hostKind = s.kind;
        g.traverse((o) => { if (o.isMesh && !o.userData.proxy) { o.userData.solidMesh = true; accelerate(o); } });   // (fast rays – fastray.js)
        g.userData.proxyMesh.userData.proxy = false;              // real shape: things may rest on it
        g.userData.proxyMesh.removeFromParent();
        if (s.picture && this.fx.makePicture && this.fx.makePicture(s.picture, g)) g.userData.sampler.set(g.userData.sampler.name);   // wall art drawn into the frame (in the current look)
        this.root.add(g);
        this.bg.push(g);
      }
      const k = s.fixed ? 0 : 1;                                   // pictures stay put; furniture is nudged
      g.position.set(s.p[0] + (rnd() - 0.5) * 0.06 * k, s.p[1], s.p[2] + (rnd() - 0.5) * 0.06 * k);
      g.rotation.set(-(s.lean || 0), s.ry + (rnd() - 0.5) * 0.1 * k, 0, 'YXZ');
      if (s.lean) {   // v16.1: a frame leaning against the wall – its tilted bottom edge rests on the surface, its top touches the wall
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g.children[0]);
        g.position.y += s.p[1] - b.min.y;
        if (s.wallZ) g.position.z += s.wallZ - b.max.z;
      }
      g.userData.hostBox = null;
    }
  }

  setRole(it, role) {
    it.role = role;
    it.group.traverse((o) => { if (o.isMesh) { o.userData.target = role === 'to' ? it : null; o.userData.po = role === 'po' ? it : null; } });
  }

  // a saved round coming back (M5): what was found or revealed is put away again, quietly
  restore(found = [], revealed = []) {
    for (const it of this.list) {
      const f = found.includes(it.def.id), r = revealed.includes(it.def.id);
      if (!f && !r) continue;
      it.found = f; it.revealed = r && !f;
      if (it.form.m) it.group.visible = false;
      else if (it.form.kind === 'relief') it.form.mesh.visible = false;
      else this.unembed(it);
      it.shadow.visible = false;
    }
    this.mergeShadows();
    this.roll();
    this.changed = true;
  }

  // the rolling list (OS-27): the first 6 unresolved Target Objects are listed
  roll() {
    let n = 0;
    for (const it of this.list) { it.shown = !this.resolved(it) && n < LIST_ROWS; if (it.shown) n++; }
  }

  // silhouette pictures for the list (OS-33: 5.5): the object as the camera sees it in the room
  silhouette(it) {
    if (it.icon) return it.icon;
    const f = it.form;
    it.icon = f.m ? silhouetteOfObject(it.group, this.viewDir) : silhouetteOfShapes(this.shapes(it), f.turn || 0, f.flip || 1);
    return it.icon;
  }

  placeShadow(it, f) {
    const sh = it.shadow;
    if (f.kind === 'socket' || f.kind === 'wall') { sh.visible = false; return; }
    const pts = this.posePoints(it, f.m, 1);
    let minY = Infinity; const sum = new THREE.Vector3(); let n = 0;
    pts.forEach((p) => { minY = Math.min(minY, p.y); });
    pts.forEach((p) => { if (p.y < minY + 0.01) { sum.add(p); n++; } });
    const c = sum.multiplyScalar(1 / n);
    const size = f.bs ? f.bs.clone() : it.box.getSize(new THREE.Vector3()).multiplyScalar(new THREE.Vector3().setFromMatrixScale(f.m).x);
    const w = f.kind === 'flat' ? size.x * 1.35 : Math.max(0.03, size.y * 3), d = f.kind === 'flat' ? size.z * 1.6 : 0.03;
    sh.position.set(c.x, minY + 0.0012, c.z);
    sh.rotation.set(-Math.PI / 2, 0, f.kind === 'flat' ? new THREE.Euler().setFromRotationMatrix(f.m).y : 0);
    sh.scale.set(w, Math.max(0.02, d), 1);
    sh.material.opacity = f.kind === 'flat' ? 0.55 : 0.45;
    sh.visible = true;
  }
  mergeShadows() {
    const quads = this.items.filter((it) => it.shadow.visible && !(it.role === 'to' && this.resolved(it)));
    const pos = new Float32Array(quads.length * 12), uv = new Float32Array(quads.length * 8), col = new Float32Array(quads.length * 16), idx = [];
    const v = new THREE.Vector3(), corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    quads.forEach((it, q) => {
      const sh = it.shadow;
      sh.updateMatrix();
      corners.forEach(([x, y], k) => {
        v.set(x, y, 0).applyMatrix4(sh.matrix);
        pos.set([v.x, v.y, v.z], q * 12 + k * 3);
        uv.set([x + 0.5, y + 0.5], q * 8 + k * 2);
        col.set([0, 0, 0, sh.material.opacity], q * 16 + k * 4);
      });
      idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    this.shadowMesh.geometry.dispose();
    this.shadowMesh.geometry = g;
    this.shadowMesh.visible = quads.length > 0;
  }

  // ---------------------------------------------------------------- finding
  // returns { found: it } · { tease: word } ("Close, but not this one." – OS-30: 1.1) · null
  tap(ndc, camera) {
    this.ray.setFromCamera(ndc, camera);
    this.ray.far = 200;
    const left = this.list.filter((it) => it.shown && it.form && !this.resolved(it));
    const words = new Set(left.map((it) => it.word));
    const meshes = [];
    for (const it of this.items) if (it.group.visible && !(it.role === 'to' && this.resolved(it))) for (const o of it.group.userData.meshes) meshes.push(o);
    left.forEach((it) => { if (it.form.kind === 'relief') meshes.push(it.form.mesh); });
    const hit = this.ray.intersectObjects([...meshes, ...this.solids().filter((o) => !o.userData.proxy)], false)[0];
    if (hit) {
      const tgt = hit.object.userData.target, po = hit.object.userData.po;
      if (tgt && tgt.role === 'to' && !this.resolved(tgt)) {
        if (tgt.shown) return { found: this.find(tgt) };
        if (words.has(tgt.word)) return { tease: tgt.word };
      }
      if (po && words.has(po.word)) return { tease: po.word };
      for (const it of left) {
        const f = it.form;
        if (f.kind === 'woven' && hit.object === this.fx.rug.mesh && hit.uv) {
          const s = this.fx.rug.slots[f.slot];
          const kx = hit.uv.x * this.fx.rug.KW, ky = (1 - hit.uv.y) * this.fx.rug.KH;
          if (Math.hypot(kx - s.x, ky - s.y) < f.radius + 3) return { found: this.find(it) };
        }
        if (f.kind === 'relief' && hit.object === f.mesh.userData.host) {
          f.mesh.geometry.computeBoundingSphere();
          if (hit.point.distanceTo(f.mesh.position) < f.mesh.geometry.boundingSphere.radius * f.mesh.scale.x * 0.85) return { found: this.find(it) };
        }
        if (f.kind === 'painted' && hit.object === f.painting.mesh && hit.uv) {
          const uv = f.painting.uvOf ? f.painting.uvOf(hit.uv) : hit.uv;
          if (Math.hypot(uv.x - f.u, (uv.y - f.v) * f.painting.hM / f.painting.wM) < f.radius + 0.03) return { found: this.find(it) };
        }
      }
    }
    // near miss on a 3D object: within ~22 screen pixels (fingers are wide)
    for (const it of left) {
      if (!it.form.m) continue;
      const c = it.box.getCenter(new THREE.Vector3()).applyMatrix4(it.form.m);
      const r = it.box.getSize(new THREE.Vector3()).length() * 0.3 * it.group.scale.x, px = this.pxAt(c);
      if (this.ray.ray.distanceToPoint(c) * px < 22 + r * px && this.unblocked(c)) return { found: this.find(it) };
    }
    return null;
  }
  unblocked(c) {
    const toCam = this.towardCam(c);
    return !this.cast(c.clone().addScaledVector(toCam, 0.03), toCam, Math.max(0.05, this.camDist(c) - 0.03), this.solids()).length;
  }

  // ---------------------------------------------------------------- found & revealed
  // FOUND: the object stays centred in a glowing ring; together they grow and come towards the player
  // (v16, OS-25 5.3.1: twice as near, 3 s), then fade. A 3D object turns to its DEFAULT view on the way
  // (OS-33: 5.5.1). REVEALED: ringed where it is until the player taps it (then counts as revealed).
  actor(it) {
    const f = it.form;
    if (f.m) {
      const meshes = it.group.userData.meshes.slice();
      const center = it.box.getCenter(new THREE.Vector3()).applyMatrix4(f.m);
      const size = it.box.getSize(new THREE.Vector3()).length() * it.group.scale.x;
      return { obj: it.group, meshes, center, size, s0: it.group.scale.x, pos0: it.group.position.clone(), q0: it.group.quaternion.clone(), local: it.box.getCenter(new THREE.Vector3()) };
    }
    if (f.kind === 'relief') {
      const m = f.mesh;
      m.geometry.computeBoundingSphere();
      return { obj: m, meshes: [m], center: m.position.clone(), size: m.geometry.boundingSphere.radius * 2 * m.scale.x, s0: m.scale.x, pos0: m.position.clone(), local: new THREE.Vector3() };
    }
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.translate(128, 128);
    x.fillStyle = f.colors ? f.colors.fill : '#c48a4a';
    x.strokeStyle = f.colors ? f.colors.stroke : '#4a1616';
    x.lineWidth = 6;
    x.lineJoin = 'round';
    drawOutline(x, this.shapes(it), 220);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const size = f.kind === 'woven' ? f.radius * 2.2 * this.fx.rug.metresPerKnot : f.radius * 2.4 * f.painting.wM;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const toCam = this.towardCam(f.at);
    card.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toCam);
    card.scale.setScalar(size);
    card.position.copy(f.at).addScaledVector(toCam, 0.01);
    card.renderOrder = 11;
    card.userData.decor = true;
    card.visible = false;
    this.root.add(card);
    return { obj: card, meshes: [card], center: card.position.clone(), size, s0: size, pos0: card.position.clone(), local: new THREE.Vector3(), card: true };
  }
  ghost(a) {
    a.saved = a.meshes.map((o) => o.material);
    if (a.card) return;
    a.meshes.forEach((o) => { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); for (const m of [o.material].flat()) { m.transparent = true; m.depthTest = false; } o.renderOrder = 11; o.userData.ghost = true; });
  }
  unghost(a) {
    if (a.card) { a.obj.removeFromParent(); a.obj.material.map.dispose(); a.obj.material.dispose(); a.obj.geometry.dispose(); return; }
    a.meshes.forEach((o, i) => { for (const m of [o.material].flat()) m.dispose(); o.material = a.saved[i]; o.renderOrder = 0; o.userData.ghost = false; });
  }
  ring() {
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING_TEX, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.renderOrder = 12;
    ring.userData.decor = true;
    this.root.add(ring);
    return ring;
  }
  unembed(it) {
    const f = it.form;
    if (f.kind === 'woven') this.fx.rug.render(null);
    if (f.kind === 'painted') f.painting.render(null);
  }
  find(it) {
    let how = 'found';
    if (it.ringed) {
      it.ringed = false;
      it.revealed = true;
      how = 'revealed';
      for (const p of this.pops) if (p.mode === 'reveal' && p.it === it) { p.done = true; p.ring.removeFromParent(); p.ring.material.dispose(); }
      this.pops = this.pops.filter((p) => !p.done);
    } else {
      it.found = true;
    }
    const a = this.actor(it);
    this.ghost(a);
    if (!it.form.m) this.unembed(it);
    if (a.card) a.obj.visible = true;
    it.shadow.visible = false;
    this.mergeShadows();
    this.pops.push({ it, mode: 'find', t: 0, ring: this.ring(), a });
    this.roll();
    if (this.onFound) this.onFound(it, how);
    if (this.onChange) this.onChange(this);
    return it;
  }
  // UNDO ↶ (v16.2, OS-41: 3.1): a found object goes back exactly where it was found (its find animation, if still
  // running, ends at once) and returns to the list
  unfind(it) {
    if (!it || !it.found) return false;
    for (const p of this.pops) if (p.it === it && p.mode === 'find') {
      p.done = true; p.ring.removeFromParent(); p.ring.material.dispose();
      this.unghost(p.a);
      const a = p.a;
      if (!a.card) { a.obj.scale.setScalar(a.s0); a.obj.position.copy(a.pos0); if (a.q0) a.obj.quaternion.copy(a.q0); }
    }
    this.pops = this.pops.filter((p) => !p.done);
    it.found = false;
    const f = it.form;
    if (f.m) it.group.visible = true;
    else if (f.kind === 'relief') f.mesh.visible = true;
    if (f.m && f.kind !== 'socket' && f.kind !== 'wall') it.shadow.visible = true;
    this.mergeShadows();
    this.roll();
    this.changed = true;
    if (this.onChange) this.onChange(this);
    return true;
  }
  // REVEAL n listed, unfound objects (n = Infinity: the whole list – "Reveal List"); or one given object
  reveal(n, only = null) {
    const left = (only ? [only] : this.list.filter((it) => it.shown)).filter((it) => it.form && !this.resolved(it) && !it.ringed)
      .sort(() => Math.random() - 0.5).slice(0, n);
    for (const it of left) {
      it.ringed = true;
      const a = this.actor(it);
      if (a.card) { a.obj.removeFromParent(); a.obj.material.map.dispose(); a.obj.material.dispose(); }
      this.pops.push({ it, mode: 'reveal', t: 0, ring: this.ring(), a: { ...a, card: false, meshes: [] }, center: a.center });
    }
    if (left.length && this.onChange) this.onChange(this);
    return left.length;
  }
  focusPoint(it) {
    const f = it.form;
    if (!f) return null;
    if (f.m) return it.box.getCenter(new THREE.Vector3()).applyMatrix4(f.m);
    return f.at.clone();
  }

  update(dt) {
    for (const r of this.reliefs) if (r.material !== r.userData.host.material && !r.userData.ghost) r.material = r.userData.host.material;
    if (this.animating()) this.changed = true;
    const view = this.viewPx ? this.viewPx() : 700;
    for (const pop of this.pops) {
      const a = pop.a;
      if (pop.mode === 'reveal') {
        const rs = Math.max(a.size * 2.4, 105 / this.pxAt(pop.center));   // v16: rings 50 % larger (OS-25: 5.3.1)
        pop.ring.position.copy(pop.center);
        pop.ring.scale.set(rs, rs, 1);
        pop.ring.material.opacity = 0.75 + 0.25 * Math.min(1, (pop.t += dt) / 0.3);
        continue;
      }
      pop.t += dt;
      const k = Math.min(1, pop.t / 3.0), e = 1 - (1 - k) ** 3;          // v16: 3 seconds (was 2)
      if (!pop.toCam) {
        pop.toCam = this.towardCam(a.center).clone();
        pop.reach = Math.min(2.4, 0.9 * this.camDist(a.center));           // v16: twice as near (was 0.45, max 1.2)
        if (a.q0) { // its default view: upright, its front turned towards the player
          const yaw = Math.atan2(pop.toCam.x, pop.toCam.z);
          pop.q1 = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        }
      }
      const end = a.center.clone().addScaledVector(pop.toCam, pop.reach);
      if (!pop.targetGrow) pop.targetGrow = Math.min(60, Math.max(1.3, (0.34 * view) / (a.size * this.pxAt(end))));
      const grow = 1 + (pop.targetGrow - 1) * e;
      const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const c = a.center.clone().addScaledVector(pop.toCam, pop.reach * e);
      if (pop.q1) a.obj.quaternion.slerpQuaternions(a.q0, pop.q1, Math.min(1, k / 0.45));
      a.obj.scale.setScalar(a.s0 * grow);
      const offset = a.local.clone().multiplyScalar(a.s0 * grow).applyQuaternion(a.obj.quaternion);
      a.obj.position.copy(c).sub(offset);
      a.meshes.forEach((o) => { for (const m of [o.material].flat()) m.opacity = fade; });
      pop.ring.position.copy(c);
      const rs = a.size * 1.2 * grow;
      pop.ring.scale.set(rs, rs, 1);
      pop.ring.material.opacity = Math.min(1, k / 0.1) * fade;
      if (k >= 1) {
        pop.done = true;
        pop.ring.removeFromParent(); pop.ring.material.dispose();
        this.unghost(a);
        if (!a.card) { a.obj.visible = false; a.obj.scale.setScalar(a.s0); a.obj.position.copy(a.pos0); if (a.q0) a.obj.quaternion.copy(a.q0); }
      }
    }
    this.pops = this.pops.filter((p) => !p.done);
  }
}
