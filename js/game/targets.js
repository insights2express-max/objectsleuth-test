// FIRST TARGET OBJECT TEST (Draft 1): a "Find" list of small objects hidden in the Scene.
// Every round each object gets a new random spot, size and angle (the USP: one Object Asset,
// reused at random positions, scales and rotations). No scoring and no timer yet.
//
// Placement rules:
//  - it rests on a real, level surface (floor, rug, desk, shelves, mantel, sills, chair seats…),
//    with enough room above it and nothing poking into it;
//  - it may be partly hidden behind or under things, but part of it must be visible from the
//    main view (fair to find);
//  - the objects keep apart from each other.
import * as THREE from '../../vendor/three/three.module.js';
import { mat, mesh, box } from '../art/kit.js';

const BRASS = 0xc9a14a, GOLD = 0xd9b45a, CREAM = 0xf3ead2, WOOD = 0x4a2c19, STEEL = 0x8a8f96, LENS = 0xbfd8e2;

function pocketWatch() {
  const g = new THREE.Group();
  const c = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.009, 16), mat(GOLD, { rough: 0.35, metal: 0.6 }));
  c.position.y = 0.0045;
  const face = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.0015, 16), mat(CREAM, { rough: 0.5 }), false);
  face.position.y = 0.0095;
  const crown = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8), mat(GOLD, { rough: 0.35, metal: 0.6 }));
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.0045, -0.028);
  const bow = mesh(new THREE.TorusGeometry(0.007, 0.0016, 4, 10), mat(GOLD, { rough: 0.35, metal: 0.6 }));
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.0045, -0.036);
  const h1 = box(0.0015, 0.0006, 0.014, mat(0x1d2236), 0, 0.0102, -0.005);
  const h2 = box(0.0018, 0.0006, 0.01, mat(0x1d2236), 0.003, 0.0102, 0.002);
  h2.rotation.y = 1.2;
  g.add(c, face, crown, bow, h1, h2);
  return { group: g, name: 'Pocket watch', icon: '⌚', radius: 0.04, height: 0.012, fp: { x0: -0.026, x1: 0.026, z0: -0.044, z1: 0.026 } };
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
  return { group: g, name: 'Brass key', icon: '🔑', radius: 0.05, height: 0.008, fp: { x0: -0.048, x1: 0.03, z0: -0.015, z1: 0.015 } };
}

function magnifier() {
  const g = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 20), mat(BRASS, { rough: 0.35, metal: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.006;
  const lens = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 20), mat(LENS, { rough: 0.08, metal: 0.1 }), false);
  lens.position.y = 0.006;
  const collar = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.02, 8), mat(BRASS, { rough: 0.35, metal: 0.5 }));
  collar.rotation.z = Math.PI / 2;
  collar.position.set(0.056, 0.009, 0);
  const handle = mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.1, 8), mat(WOOD, { rough: 0.6 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.115, 0.011, 0);
  g.add(ring, lens, collar, handle);
  return { group: g, name: 'Magnifying glass', icon: '🔍', radius: 0.17, height: 0.022, fp: { x0: -0.049, x1: 0.166, z0: -0.049, z1: 0.049 } };
}

// A soft glow that pops up where an object is found (works with every art style).
function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,180,1)');
  gr.addColorStop(0.35, 'rgba(255,215,120,0.6)');
  gr.addColorStop(1, 'rgba(255,200,90,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
  s.visible = false;
  s.renderOrder = 10;
  return s;
}

export class Targets {
  // root: the Scene group; viewDir: direction from the room towards the camera (main view).
  constructor(root, viewDir) {
    this.root = root;
    this.viewDir = viewDir.clone().normalize();
    this.items = [pocketWatch(), brassKey(), magnifier()];
    for (const it of this.items) {
      it.group.traverse((o) => { if (o.isMesh) o.userData.target = it; });
      root.add(it.group);
    }
    this.glow = glowSprite();
    root.add(this.glow);
    this.pops = [];
    this.ray = new THREE.Raycaster();
    this.onChange = null;
  }

  // Everything a target could rest on or be hidden by (not glass, flames, invisible walls, or targets).
  solids() {
    const list = [];
    this.root.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData.target) return;
      const m = o.material;
      if (m.transparent || m.colorWrite === false || m.isMeshBasicMaterial || m.isSpriteMaterial) return;
      list.push(o);
    });
    return list;
  }

  cast(origin, dir, far, solids) {
    this.ray.set(origin, dir);
    this.ray.far = far;
    return this.ray.intersectObjects(solids, false);
  }

  // Collects many valid spots, then picks a random height band first (floor, low, middle, high,
  // furniture tops) and a spot inside it, so objects turn up everywhere, not mostly on the floor.
  findSpot(it, solids, taken, rnd) {
    const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), n = new THREE.Vector3();
    const bands = [[], [], [], [], []];
    const band = (y) => (y < 0.045 ? 0 : y < 0.4 ? 1 : y < 1.0 ? 2 : y < 2.0 ? 3 : 4);
    for (let attempt = 0; attempt < 450; attempt++) {
      const x = -3.85 + rnd() * 7.7, z = -2.9 + rnd() * 5.8;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 0.45)) continue;
      const hits = this.cast(o.set(x, 3.1, z), down, 3.3, solids);
      // every upward-facing surface along the ray is a candidate (so shelves and the floor under the desk count)
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (!h.face) continue;
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (n.y < 0.9) continue;
        const y = h.point.y, above = i > 0 ? hits[i - 1].point.y : 3.1;
        const b = band(y);
        if (bands[b].length >= 4) continue;                    // enough choice in this band already
        const s = 0.85 + rnd() * 0.45;                         // random size
        const hgt = it.height * s;
        if (above - y < hgt + 0.03) continue;                  // room above it
        const yaw = rnd() * Math.PI * 2;
        const pts = this.outline(it, x, z, s, yaw);
        if (!this.fits(x, y, z, hgt, pts, solids)) continue;
        const vis = this.visibleShare(x, y + hgt, z, pts, solids);
        if (vis < 0.3) continue;                               // at least ~a third must be in view
        bands[b].push({ x, y, z, s, yaw, vis });
      }
      if (bands.every((l) => l.length >= 4)) break;
    }
    const full = bands.filter((l) => l.length);
    if (!full.length) return null;
    const pick = full[Math.floor(rnd() * full.length)];
    return pick[Math.floor(rnd() * pick.length)];
  }

  // The object's outline on the surface (its real shape box, turned and sized): 8 points.
  outline(it, x, z, s, yaw) {
    const { x0, x1, z0, z1 } = it.fp, c = Math.cos(yaw), sn = Math.sin(yaw);
    const loc = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, z0], [x1, (z0 + z1) / 2], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2]];
    // three.js turns +x towards -z for a positive yaw
    return loc.map(([lx, lz]) => [x + (lx * c + lz * sn) * s, z + (-lx * sn + lz * c) * s]);
  }

  // Level support under the whole outline, and nothing poking into it from the sides.
  fits(x, y, z, hgt, pts, solids) {
    const p = new THREE.Vector3(), d = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    for (const [px, pz] of pts) {
      d.set(px - x, 0, pz - z);
      const len = d.length();
      if (len > 1e-4 && this.cast(p.set(x, y + hgt * 0.6 + 0.004, z), d.normalize(), len + 0.006, solids).length) return false;
      const sx = x + (px - x) * 0.85, sz = z + (pz - z) * 0.85;
      const hit = this.cast(p.set(sx, y + hgt + 0.02, sz), down, hgt + 0.06, solids)[0];
      if (!hit || Math.abs(hit.point.y - y) > 0.012) return false;
    }
    return true;
  }

  // Share of sample points on top of the object that the main camera can see.
  visibleShare(x, y, z, pts, solids) {
    let seen = 0;
    const p = new THREE.Vector3();
    const all = [[x, z], ...pts.map(([px, pz]) => [x + (px - x) * 0.7, z + (pz - z) * 0.7])];
    for (const [px, pz] of all) if (!this.cast(p.set(px, y + 0.002, pz), this.viewDir, 60, solids).length) seen++;
    return seen / all.length;
  }

  // New round: every object gets a fresh random spot, size and angle.
  newRound(seed = Math.random() * 1e9) {
    let s = seed >>> 0 || 1;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (const p of this.pops) { p.glow.removeFromParent(); p.glow.material.dispose(); }
    this.pops = [];
    this.root.updateMatrixWorld(true);
    for (const it of this.items) it.group.visible = false;
    const solids = this.solids(), taken = [];
    // While placing, every surface counts from both sides, so a spot INSIDE furniture (e.g. between
    // a desk's top and its drawers) is seen as blocked. Restored straight after.
    const sides = new Map();
    for (const o of solids) if (!sides.has(o.material)) sides.set(o.material, o.material.side);
    for (const m of sides.keys()) m.side = THREE.DoubleSide;
    const spots = this.items.map((it) => {
      const spot = this.findSpot(it, solids, taken, rnd);
      if (spot) taken.push(spot);
      return spot;
    });
    for (const [m, side] of sides) m.side = side;
    this.items.forEach((it, i) => {
      const spot = spots[i];
      it.found = false;
      it.spot = spot;
      if (!spot) { console.warn('ObjectSleuth: no spot for', it.name); return; }
      it.group.position.set(spot.x, spot.y + 0.0005, spot.z);
      it.group.rotation.set(0, spot.yaw, 0);
      it.group.scale.setScalar(spot.s);
      it.group.visible = true;
    });
    this.root.updateMatrixWorld(true);
    if (this.onChange) this.onChange(this);
  }

  // A tap at a screen point: finds a target under the finger (with a little forgiveness for fingers).
  tap(ndc, camera, pxPerUnit) {
    this.ray.setFromCamera(ndc, camera);
    this.ray.far = 200;
    const left = this.items.filter((it) => it.group.visible && !it.found);
    if (!left.length) return null;
    // 1) exact hit, unless something solid is in front of it
    const meshes = [];
    left.forEach((it) => it.group.traverse((o) => { if (o.isMesh) meshes.push(o); }));
    const hit = this.ray.intersectObjects([...meshes, ...this.solids()], false)[0];
    if (hit && hit.object.userData.target) return this.find(hit.object.userData.target);
    // 2) near miss: within ~22 screen pixels of an object's centre (fingers are wide)
    const c = new THREE.Vector3();
    for (const it of left) {
      it.group.getWorldPosition(c);
      const dist = this.ray.ray.distanceToPoint(c) * pxPerUnit;
      if (dist < 22 + it.radius * it.group.scale.x * pxPerUnit * 0.6) return this.find(it);
    }
    return null;
  }

  find(it) {
    it.found = true;
    const p = it.group.getWorldPosition(new THREE.Vector3());
    const glow = this.glow.clone();                 // each find gets its own glow, so finds can overlap
    glow.material = this.glow.material.clone();
    this.root.add(glow);
    this.pops.push({ it, t: 0, p, glow });
    if (this.onChange) this.onChange(this);
    return it;
  }

  // Found animation: a glow, the object lifts, grows a little and fades away.
  update(dt) {
    for (const pop of this.pops) {
      pop.t += dt;
      const k = Math.min(1, pop.t / 0.9);
      const it = pop.it, base = it.spot ? it.spot.s : 1, g = pop.glow;
      g.visible = true;
      g.position.copy(pop.p).add(new THREE.Vector3(0, 0.04 + 0.1 * k, 0));
      const gs = (0.25 + 0.35 * Math.sin(Math.PI * Math.min(1, k * 1.2))) * Math.max(1, it.radius / 0.05);
      g.scale.set(gs, gs, 1);
      g.material.opacity = 1 - k * k;
      it.group.position.y = pop.p.y + 0.12 * k;
      it.group.scale.setScalar(base * (1 + 0.6 * Math.sin(Math.PI * k * 0.5)) * (1 - k * k * 0.9));
      if (k >= 1) { it.group.visible = false; g.removeFromParent(); g.material.dispose(); pop.done = true; }
    }
    this.pops = this.pops.filter((p) => !p.done);
  }
}
