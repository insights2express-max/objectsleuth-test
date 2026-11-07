// TARGET OBJECTS v2 (Draft 1 · M1.7): six objects to find, re-hidden every round.
//
// FORMS (SDD 7.04.6 variants, 9.02.2 Nested): about half the objects appear in a figurative form:
//   woven   – knotted into the rug's pattern, in its yarn colours and relief
//   painted – painted into one of the pictures
//   relief  – embossed into the side of a piece of furniture, in that furniture's own material
// The others are the real 3D objects, placed by one of these (all computed at random, with
// collision checks – no fixed list of spots):
//   flat    – lying on a surface, but never out in the open (the cover rule, OS-9: 3.5.2)
//   lean    – standing on its edge and leaning on something (window frame, chair back, books…),
//             any angle, either way up
//   wedge   – slipped upright into a narrow gap (cushion and chair arm…)
//   socket  – inside another object (the key in the trunk's lock)
// CHAL LVL (Low / Medium / High) sets sizes, how many are figurative, and how much cover is needed.
import * as THREE from '../../vendor/three/three.module.js';
import { OBJECT_DEFS, drawOutline } from './objects.js';

const UP = new THREE.Vector3(0, 1, 0);
export const LEVELS = {
  low: { label: 'Low', size: [1.15, 1.45], figurative: 2, minVis: 0.35, modes: { flat: 0.55, lean: 0.35, wedge: 0.05, socket: 0.05 } },
  med: { label: 'Medium', size: [0.9, 1.2], figurative: 3, minVis: 0.3, modes: { flat: 0.35, lean: 0.35, wedge: 0.15, socket: 0.15 } },
  high: { label: 'High', size: [0.75, 1.0], figurative: 4, minVis: 0.22, modes: { flat: 0.25, lean: 0.35, wedge: 0.2, socket: 0.2 } },
};
// cover rule per level: adj = sides touching something (of 8), vis = share visible from the main view
const COVER = {
  low: (adj, vis) => adj >= 1 || vis <= 0.85,
  med: (adj, vis) => adj >= 2 || vis <= 0.7,
  high: (adj, vis) => (adj >= 2 && vis <= 0.85) || vis <= 0.6,
};

// soft round shadow picture (contact shadows) and a glowing ring picture (found effect)
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

export class Targets {
  // root: the Scene group · fx: Scene extras (rug, paintings, sockets) · viewDir: towards the main camera
  constructor(root, fx, viewDir) {
    this.root = root;
    this.fx = fx;
    this.viewDir = viewDir.clone().normalize();
    this.level = 'med';
    this.items = OBJECT_DEFS.map((def) => {
      const group = def.build();
      group.visible = false;
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const it = { def, name: def.name, icon: def.icon, group, box, found: false, form: null };
      group.traverse((o) => { if (o.isMesh) o.userData.target = it; });
      root.add(group);
      // contact shadow under it
      it.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: SHADOW_TEX, color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      it.shadow.userData.decor = true;
      it.shadow.visible = false;
      root.add(it.shadow);
      return it;
    });
    this.reliefs = [];
    this.pops = [];
    this.ray = new THREE.Raycaster();
    this.onChange = null;
  }

  // ---------------------------------------------------------------- helpers
  solids() {
    const list = [];
    this.root.traverse((o) => {
      // (pieces hidden by batching still count: they are the exact shapes; the merged copies don't)
      if (!o.isMesh || (!o.visible && !o.userData.batched) || o.userData.merged || o.userData.target || o.userData.decor) return;
      const m = o.material;
      if (m.transparent || m.colorWrite === false || m.isMeshBasicMaterial) return;
      list.push(o);
    });
    list.balls = list.map((o) => {
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); return o.boundingSphere.clone().applyMatrix4(o.matrixWorld); }
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      return o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    });
    return list;
  }
  // Ray test. For speed, objects whose bounding ball the ray can't reach are skipped first
  // (balls are worked out once per round, in solids()).
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
    if (hit.instanceId !== undefined) {
      const m = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.instanceId, m);
      n.transformDirection(m);
    }
    return n.transformDirection(hit.object.matrixWorld);
  }
  // Is p inside something solid? (look up: if the first surface met faces up, we're inside it)
  inside(p, solids) {
    const h = this.cast(p, UP, 4, solids)[0];
    return !!h && this.normalOf(h).y > 0.2;
  }
  // share of sample points the main camera can see
  visible(points, solids) {
    let seen = 0;
    for (const p of points) if (!this.cast(p.clone().addScaledVector(this.viewDir, 0.002), this.viewDir, 60, solids).length) seen++;
    return seen / points.length;
  }
  // the 8 corners + centre of an object's box for a given pose (shrunk a little: touching is allowed)
  posePoints(it, m, shrink = 0.9) {
    const b = it.box, c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * shrink);
    const pts = [c.clone()];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(c.x + (i & 1 ? h.x : -h.x), c.y + (i & 2 ? h.y : -h.y), c.z + (i & 4 ? h.z : -h.z)));
    return pts.map((p) => p.applyMatrix4(m));
  }
  // nothing solid between the object's centre and any of its corners
  clear(it, m, solids) {
    const pts = this.posePoints(it, m);
    if (this.inside(pts[0], solids)) return false;
    const d = new THREE.Vector3();
    for (let i = 1; i < pts.length; i++) {
      d.subVectors(pts[i], pts[0]);
      const len = d.length();
      if (this.cast(pts[0], d.normalize(), len, solids).length) return false;
    }
    return true;
  }
  // a random point on an upward-facing surface with room above it
  surfacePoint(rnd, solids, minRoom) {
    const down = new THREE.Vector3(0, -1, 0);
    for (let n = 0; n < 15; n++) {
      const x = -3.85 + rnd() * 7.7, z = -2.9 + rnd() * 5.8;
      const hits = this.cast(new THREE.Vector3(x, 3.1, z), down, 3.3, solids);
      const ok = [];
      hits.forEach((h, i) => {
        if (this.normalOf(h).y < 0.9) return;
        const above = i > 0 ? hits[i - 1].point.y : 3.1;
        if (above - h.point.y >= minRoom) ok.push(h);
      });
      if (ok.length) return ok[Math.floor(rnd() * ok.length)].point;
    }
    return null;
  }

  // ---------------------------------------------------------------- literal placements
  placeFlat(it, rnd, solids, taken, s) {
    const L = LEVELS[this.level];
    const bs = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
    for (let a = 0; a < 70; a++) {
      const p = this.surfacePoint(rnd, solids, bs.y + 0.03);
      if (!p || this.near(p, taken)) continue;
      const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(UP, rnd() * Math.PI * 2), new THREE.Vector3(s, s, s));
      // cheapest checks first: resting level → neighbours → in view → cover rule → nothing poking in
      if (!this.supported(it, m, p.y, solids)) continue;
      const adj = this.touching(it, m, solids);
      const vis = this.visible(this.posePoints(it, m, 0.8), solids);
      if (vis < L.minVis || !COVER[this.level](adj, vis)) continue;
      if (!this.clear(it, m, solids)) continue;
      return { m, kind: 'flat', at: p, vis, adj };
    }
    return null;
  }
  // corners of the underside must rest on the surface
  supported(it, m, y, solids) {
    const pts = this.posePoints(it, m, 0.75).slice(1).filter((_, i) => !(i & 2)); // bottom 4
    const down = new THREE.Vector3(0, -1, 0);
    return pts.every((p) => {
      const h = this.cast(new THREE.Vector3(p.x, y + 0.03, p.z), down, 0.06, solids)[0];
      return h && Math.abs(h.point.y - y) < 0.012;
    });
  }
  // how many of 8 sides have something within 3 cm (cover by neighbours)
  touching(it, m, solids) {
    const c = new THREE.Vector3().setFromMatrixPosition(m);
    const r = it.box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * new THREE.Vector3().setFromMatrixScale(m).x);
    const reach = Math.max(r.x, r.z) + 0.03, o = c.clone().setY(c.y + Math.max(0.004, r.y));
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.cast(o, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), reach, solids).length) n++;
    }
    return n;
  }
  near(p, taken) { return taken.some((t) => t.distanceTo(p) < 0.35); }

  // Leaning: find an upright face near a surface point and lean the object against it.
  placeLean(it, rnd, solids, taken, s) {
    const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
    const len = size.x;
    for (let a = 0; a < 60; a++) {
      const p = this.surfacePoint(rnd, solids, len + 0.03);
      if (!p || this.near(p, taken)) continue;
      // nearest upright face around this spot
      const o = p.clone().setY(p.y + 0.03);
      let best = null;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + rnd() * 0.3;
        const d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        const h = this.cast(o, d, 0.35, solids)[0];
        if (!h) continue;
        const n = this.normalOf(h);
        if (Math.abs(n.y) > 0.3 || n.dot(d) > -0.3) continue;
        if (!best || h.distance < best.h.distance) best = { h, n: n.setY(0).normalize() };
      }
      if (!best) continue;
      // the pose: length axis up, tilted so the top rests on the face; either way up; face-on or oblique
      const tilt = (0.12 + rnd() * 0.55);                       // 7°–38° from upright
      const up = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(best.n, -Math.sin(tilt)).normalize();
      if (rnd() < 0.5) up.negate();                              // upside down (bow down / bow up…)
      let thin = best.n.clone().sub(up.clone().multiplyScalar(best.n.dot(up))).normalize();
      thin.applyAxisAngle(up, (rnd() - 0.5) * 1.6);              // oblique to the viewer
      const third = new THREE.Vector3().crossVectors(up, thin).normalize();
      thin = new THREE.Vector3().crossVectors(third, up).normalize();
      const rot = new THREE.Matrix4().makeBasis(up, thin, third);
      const m = this.fitPose(it, rot, s, p.y, best.h.point, best.n, rnd() * 0.04 - 0.02);
      if (!this.clear(it, m, solids) || !this.baseRests(it, m, solids)) continue;
      const pts = this.posePoints(it, m, 0.8), vis = this.visible(pts, solids);
      if (vis < LEVELS[this.level].minVis) continue;
      if (this.level !== 'low' && vis > 0.92 && rnd() < 0.6) continue; // prefer some cover
      return { m, kind: 'lean', at: p, vis };
    }
    return null;
  }
  // something solid right under the object's lowest point
  baseRests(it, m, solids) {
    const pts = this.posePoints(it, m, 1).slice(1);
    const low = pts.reduce((a, p) => (p.y < a.y ? p : a));
    const h = this.cast(low.clone().setY(low.y + 0.02), new THREE.Vector3(0, -1, 0), 0.05, solids)[0];
    return !!h && Math.abs(h.point.y - low.y) < 0.015;
  }
  // Puts a turned object so its lowest point is on the surface (height y) and, if a face is given,
  // its furthest point touches that face.
  fitPose(it, rot, s, y, facePoint, faceN, slide = 0) {
    const m = rot.clone().scale(new THREE.Vector3(s, s, s));
    const pts = this.posePoints(it, m, 1);
    let minY = Infinity, maxIn = -Infinity;
    const into = faceN ? faceN.clone().negate() : null;
    pts.forEach((p) => { minY = Math.min(minY, p.y); if (into) maxIn = Math.max(maxIn, p.dot(into)); });
    const t = new THREE.Vector3(0, y - minY + 0.0008, 0);
    if (into) {
      const want = facePoint.dot(into) - 0.001;                // touch the face
      const along = new THREE.Vector3().crossVectors(UP, faceN).normalize();
      t.addScaledVector(into, want - maxIn);
      t.add(facePoint.clone().projectOnVector(along).sub(pts[0].clone().projectOnVector(along)));
      t.addScaledVector(along, slide);
    }
    return new THREE.Matrix4().makeTranslation(t.x, t.y, t.z).multiply(m);
  }

  // Wedged upright into a narrow gap between two faces.
  placeWedge(it, rnd, solids, taken, s) {
    const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(s);
    for (let a = 0; a < 50; a++) {
      const p = this.surfacePoint(rnd, solids, size.x * 0.5);
      if (!p || this.near(p, taken)) continue;
      const o = p.clone().setY(p.y + 0.02);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI + rnd() * 0.4, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        const h1 = this.cast(o, d, 0.08, solids)[0], h2 = this.cast(o, d.clone().negate(), 0.08, solids)[0];
        if (!h1 || !h2) continue;
        const gap = h1.distance + h2.distance;
        if (gap < size.y + 0.003 || gap > size.y + 0.035) continue;
        const mid = o.clone().addScaledVector(d, (h1.distance - h2.distance) / 2);
        const up = UP.clone().applyAxisAngle(d, (rnd() - 0.5) * 0.8); // tilted within the gap
        if (rnd() < 0.5) up.negate();
        const third = new THREE.Vector3().crossVectors(up, d).normalize();
        const rot = new THREE.Matrix4().makeBasis(up, d.clone(), third);
        const m = this.fitPose(it, rot, s, p.y, null, null);
        const c = this.posePoints(it, m, 1)[0], off = mid.clone().setY(0).sub(c.clone().setY(0));
        m.premultiply(new THREE.Matrix4().makeTranslation(off.x, 0, off.z));
        if (!this.clear(it, m, solids)) continue;
        const vis = this.visible(this.posePoints(it, m, 0.8), solids);
        if (vis < LEVELS[this.level].minVis * 0.7) continue;
        return { m, kind: 'wedge', at: mid, vis };
      }
    }
    return null;
  }

  // Inside another object (a SOCKET on a PO/BG): the key in the trunk's lock.
  placeSocket(it, rnd, solids) {
    const sockets = (this.fx.sockets || []).filter((k) => k.kind === it.def.socket);
    if (!sockets.length) return null;
    const sk = sockets[Math.floor(rnd() * sockets.length)];
    sk.parent.updateMatrixWorld(true);
    const at = sk.pos.clone().applyMatrix4(sk.parent.matrixWorld);
    const out = sk.out.clone().transformDirection(sk.parent.matrixWorld);
    const along = out.clone().negate();                          // the key's length goes into the lock
    const bowUp = rnd() < 0.7;                                   // bow upright (usual) or flat
    const thin = bowUp ? new THREE.Vector3().crossVectors(UP, along).normalize() : UP.clone();
    const third = new THREE.Vector3().crossVectors(along, thin).normalize();
    const m = new THREE.Matrix4().makeBasis(along, thin, third);
    const shaftPoint = new THREE.Vector3(-0.004, 0, 0).applyMatrix4(m);   // this point sits at the keyhole
    m.setPosition(at.clone().sub(shaftPoint));
    return { m, kind: 'socket', at, vis: 0.5 };
  }

  // ---------------------------------------------------------------- figurative forms
  formWoven(it, rnd, solids) {
    const rug = this.fx.rug;
    if (!rug) return null;
    const order = rug.slots.map((_, i) => i).sort(() => rnd() - 0.5);
    for (const i of order) {
      const s = rug.slots[i], p = rug.toWorld(s.x, s.y);
      const r = s.s * rug.metresPerKnot * 0.6;
      const pts = [p, ...[0, 1, 2, 3].map((k) => p.clone().add(new THREE.Vector3(Math.cos(k * 1.57) * r, 0, Math.sin(k * 1.57) * r)))];
      const vis = this.visible(pts.map((q) => q.clone().setY(q.y + 0.004)), solids);
      if (vis < 0.6) continue;
      const turn = (Math.floor(rnd() * 4) * Math.PI) / 2 + (rnd() - 0.5) * 0.3, flip = rnd() < 0.5 ? -1 : 1;
      const size = s.s * (this.level === 'low' ? 2.0 : this.level === 'med' ? 1.75 : 1.5); // thin parts need knots to show
      rug.render({ slot: i, draw: (ctx) => { ctx.rotate(turn); ctx.scale(flip, 1); ctx.lineWidth = 0.6; drawOutline(ctx, it.def.shapes(), size); } });
      return { kind: 'woven', at: p, slot: i, radius: size * 0.6 };
    }
    return null;
  }
  formPainted(it, rnd, solids, usedPaintings) {
    const list = (this.fx.paintings || []).filter((pt) => !usedPaintings.has(pt));
    if (!list.length) return null;
    const pt = list[Math.floor(rnd() * list.length)];
    const [x0, x1, y0, y1] = pt.regions[0];
    const u = x0 + rnd() * (x1 - x0), v = y0 + rnd() * (y1 - y0);
    const W = pt.canvas.width, H = pt.canvas.height;
    const size = W * (this.level === 'high' ? 0.09 : this.level === 'med' ? 0.11 : 0.14);
    const turn = (rnd() - 0.5) * 1.2, flip = rnd() < 0.5 ? -1 : 1;
    pt.render((ctx) => {
      // pick up the colours already painted there, then paint the object in them (shaded, with a cast shadow)
      const px = ctx.getImageData(Math.floor(u * W), Math.floor(v * H), 1, 1).data;
      const base = `rgb(${px[0]},${px[1]},${px[2]})`;
      const dark = `rgb(${px[0] * 0.55 | 0},${px[1] * 0.55 | 0},${px[2] * 0.55 | 0})`;
      const lite = `rgb(${Math.min(255, px[0] * 1.35) | 0},${Math.min(255, px[1] * 1.35) | 0},${Math.min(255, px[2] * 1.35) | 0})`;
      ctx.translate(u * W, v * H);
      ctx.rotate(turn); ctx.scale(flip, 1);
      ctx.save(); ctx.translate(size * 0.04, size * 0.05); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.filter = 'blur(3px)'; drawOutline(ctx, it.def.shapes(), size, false); ctx.restore();
      ctx.fillStyle = dark; ctx.strokeStyle = lite; ctx.lineWidth = Math.max(1, size * 0.02);
      drawOutline(ctx, it.def.shapes(), size);
      ctx.globalAlpha = 0.5; ctx.fillStyle = base; ctx.save(); ctx.translate(-size * 0.02, -size * 0.02); drawOutline(ctx, it.def.shapes(), size * 0.9, false); ctx.restore();
    });
    usedPaintings.add(pt);
    pt.mesh.updateMatrixWorld(true);
    const at = new THREE.Vector3((u - 0.5) * pt.wM, (0.5 - v) * pt.hM, 0).applyMatrix4(pt.mesh.matrixWorld);
    return { kind: 'painted', at, painting: pt, u, v: 1 - v, radius: size / W * 0.6 };
  }
  formRelief(it, rnd, solids, taken) {
    for (let a = 0; a < 90; a++) {
      const o = new THREE.Vector3(-3.8 + rnd() * 7.6, 0.08 + rnd() * 1.7, -2.9 + rnd() * 5.8);
      if (this.inside(o, solids)) continue;
      const ang = rnd() * Math.PI * 2, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const h = this.cast(o, d, 1.5, solids)[0];
      if (!h || h.object.isInstancedMesh || h.object.material.map) continue;   // not books, rug or pictures
      if (!h.object.geometry.boundingSphere) h.object.geometry.computeBoundingSphere();
      if (h.object.geometry.boundingSphere.radius > 1.2) continue;             // furniture, not whole walls
      const n = this.normalOf(h);
      if (Math.abs(n.y) > 0.08 || n.dot(this.viewDir) < 0.25) continue;      // upright, facing the viewer
      if (this.near(h.point, taken)) continue;
      n.setY(0).normalize();
      const s = (this.level === 'low' ? 1.8 : this.level === 'med' ? 1.5 : 1.25);
      const shapes = it.def.shapes();
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0009, bevelSegments: 1, curveSegments: 10 });
      geo.center();
      geo.computeBoundingBox();
      const half = geo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5 * s);
      // flat enough? the face must continue under all four corners
      const tang = new THREE.Vector3().crossVectors(UP, n).normalize();
      const flat = [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([i, j]) => {
        const q = h.point.clone().addScaledVector(tang, i * half.x).addScaledVector(UP, j * half.y).addScaledVector(n, 0.02);
        const hh = this.cast(q, n.clone().negate(), 0.04, solids)[0];
        return hh && hh.object === h.object && Math.abs(hh.distance - 0.02) < 0.003;
      });
      if (!flat) continue;
      const vis = this.visible([h.point.clone().addScaledVector(n, 0.004)], solids);
      if (vis < 1) continue;
      const rel = new THREE.Mesh(geo, h.object.material);
      rel.userData.target = it;
      rel.userData.host = h.object;
      const count = geo.attributes.position.count, seed = h.object.geometry.attributes.aSeed ? h.object.geometry.attributes.aSeed.getX(0) : 0.5;
      geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(seed), 1));
      const fill = (v) => { const arr = new Float32Array(count * 3); for (let i = 0; i < count; i++) arr.set(v, i * 3); return arr; };
      geo.setAttribute('aGrain', new THREE.BufferAttribute(fill([1, 0, 0]), 3));
      geo.setAttribute('aGrain2', new THREE.BufferAttribute(fill([0, 1, 0]), 3));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd() * Math.PI * 2));
      rel.quaternion.copy(q);
      rel.scale.setScalar(s);
      rel.position.copy(h.point).addScaledVector(n, 0.0018 * s);
      rel.castShadow = true;
      rel.receiveShadow = true;
      this.root.add(rel);
      this.reliefs.push(rel);
      return { kind: 'relief', at: h.point.clone(), mesh: rel };
    }
    return null;
  }

  // ---------------------------------------------------------------- a round
  newRound(seed = Math.random() * 1e9) {
    let st = seed >>> 0 || 1;
    const rnd = () => { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return (st >>> 0) / 4294967296; };
    for (const p of this.pops) { // a round restarted mid-animation: put everything back
      p.ring.removeFromParent(); p.ring.material.dispose();
      p.meshes.forEach((o, i) => { o.material.dispose(); o.material = p.saved[i]; o.renderOrder = 0; });
      p.it.group.scale.setScalar(p.s0);
    }
    this.pops = [];
    for (const r of this.reliefs) { r.removeFromParent(); r.geometry.dispose(); }
    this.reliefs = [];
    if (this.fx.globeBall) this.fx.globeBall.rotation.y = rnd() * Math.PI * 2;   // the globe is turned differently each round
    if (this.fx.rug) this.fx.rug.render(null);
    (this.fx.paintings || []).forEach((p) => p.render(null));
    for (const it of this.items) { it.group.visible = false; it.shadow.visible = false; it.found = false; it.form = null; }
    this.root.updateMatrixWorld(true);
    const L = LEVELS[this.level];
    const solids = this.solids();
    // while placing, surfaces count from both sides (so "inside furniture" is detected); restored after
    const sides = new Map();
    for (const o of solids) if (!sides.has(o.material)) sides.set(o.material, o.material.side);
    for (const mtl of sides.keys()) mtl.side = THREE.DoubleSide;
    // which objects are figurative this round, and in which form
    const order = this.items.map((it) => it).sort(() => rnd() - 0.5);
    const figurative = new Set(order.slice(0, L.figurative));
    const taken = [], usedPaintings = new Set();
    let wovenUsed = false;
    for (const it of order) {
      let form = null;
      if (figurative.has(it)) {
        const kinds = ['relief', 'painted', 'woven'].filter((k) => !(k === 'woven' && wovenUsed)).sort(() => rnd() - 0.5);
        for (const k of kinds) {
          form = k === 'woven' ? this.formWoven(it, rnd, solids) : k === 'painted' ? this.formPainted(it, rnd, solids, usedPaintings) : this.formRelief(it, rnd, solids, taken);
          if (form) { if (k === 'woven') wovenUsed = true; break; }
        }
      }
      if (!form) form = this.placeLiteral(it, rnd, solids, taken, L);
      if (!form) { // no spot met this level's cover rule: try the next easier rule rather than leave it out
        const lvl = this.level;
        for (const easier of ['med', 'low']) {
          if (form || easier === lvl || (lvl === 'low')) continue;
          this.level = easier;
          form = this.placeLiteral(it, rnd, solids, taken, LEVELS[easier]);
        }
        this.level = lvl;
      }
      it.form = form;
      if (form && form.at) taken.push(form.at);
    }
    for (const [mtl, side] of sides) mtl.side = side;
    // show the literal ones
    for (const it of this.items) {
      const f = it.form;
      if (!f) { console.warn('ObjectSleuth: no place for', it.name); continue; }
      if (!f.m) continue;
      f.m.decompose(it.group.position, it.group.quaternion, it.group.scale);
      it.group.visible = true;
      this.placeShadow(it, f);
    }
    this.root.updateMatrixWorld(true);
    this.changed = true;                       // v12: shadows and contact shading need drawing again
    if (this.onChange) this.onChange(this);
  }

  placeLiteral(it, rnd, solids, taken, L) {
    const s = L.size[0] + rnd() * (L.size[1] - L.size[0]);
    const w = { ...L.modes };
    if (!it.def.socket) w.socket = 0; else w.socket = Math.max(w.socket, 0.35); // the key loves its lock
    if (!it.def.lean) { w.lean = 0; w.wedge = 0; }
    const tries = [];
    const pool = Object.entries(w).filter(([, v]) => v > 0);
    while (pool.length) { // weighted random order of placement kinds
      const sum = pool.reduce((a, [, v]) => a + v, 0);
      let x = rnd() * sum, i = 0;
      while (x > pool[i][1]) { x -= pool[i][1]; i++; }
      tries.push(pool.splice(i, 1)[0][0]);
    }
    for (const k of tries) {
      const f = k === 'flat' ? this.placeFlat(it, rnd, solids, taken, s) : k === 'lean' ? this.placeLean(it, rnd, solids, taken, s)
        : k === 'wedge' ? this.placeWedge(it, rnd, solids, taken, s) : this.placeSocket(it, rnd, solids);
      if (f) return f;
    }
    return null;
  }

  // a soft contact shadow where the object touches its support
  placeShadow(it, f) {
    if (f.kind === 'socket') return;
    const sh = it.shadow, pts = this.posePoints(it, f.m, 1);
    let minY = Infinity, sum = new THREE.Vector3(), n = 0;
    pts.forEach((p) => { minY = Math.min(minY, p.y); });
    pts.forEach((p) => { if (p.y < minY + 0.01) { sum.add(p); n++; } });
    const c = sum.multiplyScalar(1 / n);
    const size = it.box.getSize(new THREE.Vector3()).multiplyScalar(new THREE.Vector3().setFromMatrixScale(f.m).x);
    const w = f.kind === 'flat' ? size.x * 1.35 : Math.max(0.03, size.y * 3), d = f.kind === 'flat' ? size.z * 1.6 : 0.03;
    sh.position.set(c.x, minY + 0.0012, c.z);
    sh.rotation.set(-Math.PI / 2, 0, f.kind === 'flat' ? new THREE.Euler().setFromRotationMatrix(f.m).y : 0);
    sh.scale.set(w, Math.max(0.02, d), 1);
    sh.material.opacity = f.kind === 'flat' ? 0.55 : 0.45;
    sh.visible = true;
  }

  // ---------------------------------------------------------------- finding
  tap(ndc, camera, pxPerUnit) {
    this.ray.setFromCamera(ndc, camera);
    this.ray.far = 200;
    const left = this.items.filter((it) => it.form && !it.found);
    if (!left.length) return null;
    const meshes = [];
    left.forEach((it) => {
      if (it.form.m) it.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
      if (it.form.kind === 'relief') meshes.push(it.form.mesh);
    });
    const hit = this.ray.intersectObjects([...meshes, ...this.solids()], false)[0];
    if (hit) {
      if (hit.object.userData.target && !hit.object.userData.target.found) return this.find(hit.object.userData.target);
      // knotted into the rug / painted into a picture: is the tap on its outline?
      for (const it of left) {
        const f = it.form;
        if (f.kind === 'woven' && hit.object === this.fx.rug.mesh && hit.uv) {
          const s = this.fx.rug.slots[f.slot];
          const kx = hit.uv.x * this.fx.rug.KW, ky = (1 - hit.uv.y) * this.fx.rug.KH;
          if (Math.hypot(kx - s.x, ky - s.y) < f.radius + 3) return this.find(it);
        }
        if (f.kind === 'relief' && hit.object === f.mesh.userData.host) { // a tap inside its outline (e.g. a ring's hole) counts
          f.mesh.geometry.computeBoundingSphere();
          if (hit.point.distanceTo(f.mesh.position) < f.mesh.geometry.boundingSphere.radius * f.mesh.scale.x * 0.85) return this.find(it);
        }
        if (f.kind === 'painted' && hit.object === f.painting.mesh && hit.uv) {
          if (Math.hypot(hit.uv.x - f.u, (hit.uv.y - f.v) * f.painting.hM / f.painting.wM) < f.radius + 0.03) return this.find(it);
        }
      }
    }
    // near miss on a 3D object: within ~22 screen pixels (fingers are wide)
    for (const it of left) {
      if (!it.form.m) continue;
      const c = it.box.getCenter(new THREE.Vector3()).applyMatrix4(it.form.m);
      const r = it.box.getSize(new THREE.Vector3()).length() * 0.3 * it.group.scale.x;
      if (this.ray.ray.distanceToPoint(c) * pxPerUnit < 22 + r * pxPerUnit && this.unblocked(c)) return this.find(it);
    }
    return null;
  }
  unblocked(c) {
    const toCam = this.viewDir;
    return !this.cast(c.clone().addScaledVector(toCam, 0.03), toCam, 60, this.solids()).length;
  }

  // Found (OS-18 / OS-10: 1.5.1): the object stays centred in a glowing ring; together they grow and
  // come towards the player, then fade – 2 seconds, and the view can be moved freely meanwhile.
  // A figurative object (woven, painted, embossed) lifts out of its host as the real 3D object.
  find(it) {
    it.found = true;
    const f = it.form;
    let center;
    if (f.m) {
      center = it.box.getCenter(new THREE.Vector3()).applyMatrix4(f.m);
    } else {                                   // figurative: the real object appears where its form was
      if (f.kind === 'relief') f.mesh.visible = false;
      if (f.kind === 'woven') this.fx.rug.render(null);
      if (f.kind === 'painted') f.painting.render(null);
      center = f.at.clone().addScaledVector(this.viewDir, 0.03);
      it.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.viewDir); // its face towards the player
      it.group.scale.setScalar(1.3);
      it.group.position.copy(center).sub(it.box.getCenter(new THREE.Vector3()).multiplyScalar(1.3).applyQuaternion(it.group.quaternion));
      it.group.visible = true;
    }
    it.shadow.visible = false;
    // its own see-through copies of its materials while it fades (the originals come back after)
    const meshes = [];
    it.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const saved = meshes.map((o) => o.material);
    meshes.forEach((o) => { o.material = o.material.clone(); o.material.transparent = true; o.material.depthTest = false; o.renderOrder = 11; });
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING_TEX, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.renderOrder = 12;
    ring.userData.decor = true;
    this.root.add(ring);
    const size = it.box.getSize(new THREE.Vector3()).length() * it.group.scale.x;
    this.pops.push({ it, t: 0, ring, center, size: Math.max(0.05, size), start: it.group.position.clone(), s0: it.group.scale.x, meshes, saved });
    if (this.onChange) this.onChange(this);
    return it;
  }

  update(dt) {
    for (const r of this.reliefs) if (r.material !== r.userData.host.material) r.material = r.userData.host.material; // follow art style
    if (this.pops.length) this.changed = true;  // objects are moving: shadows and shading follow
    for (const pop of this.pops) {
      pop.t += dt;
      const k = Math.min(1, pop.t / 2.0), e = 1 - (1 - k) ** 3;          // 2 seconds, easing out
      const grow = 1 + 1.6 * e;                                          // both grow together
      const toward = this.viewDir.clone().multiplyScalar(0.8 * e);       // and come towards the player
      const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      const it = pop.it;
      it.group.scale.setScalar(pop.s0 * grow);
      // keep the object's centre on the ring's centre while it grows
      const c = pop.center.clone().add(toward);
      const offset = it.box.getCenter(new THREE.Vector3()).multiplyScalar(pop.s0 * grow).applyQuaternion(it.group.quaternion);
      it.group.position.copy(c).sub(offset);
      pop.meshes.forEach((o) => { o.material.opacity = fade; });
      pop.ring.position.copy(c);
      const rs = pop.size * 1.15 * grow;
      pop.ring.scale.set(rs, rs, 1);
      pop.ring.material.opacity = Math.min(1, k / 0.12) * fade;
      if (k >= 1) {
        pop.ring.removeFromParent(); pop.ring.material.dispose(); pop.done = true;
        pop.meshes.forEach((o, i) => { o.material.dispose(); o.material = pop.saved[i]; o.renderOrder = 0; });
        it.group.visible = false;
        it.group.scale.setScalar(pop.s0);
        it.group.position.copy(pop.start);
      }
    }
    this.pops = this.pops.filter((p) => !p.done);
  }
}
