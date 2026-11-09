// MODEL LIBRARY (v16): the imported photographic models (assetlib.js), loaded only when a round needs
// them and re-skinned in the current look (Clay / Low-poly / Felt / Knit).
//
// Each model becomes one "group" in a normalised frame: standing on y = 0, centred, its longest side
// along x, its thinnest across (so the placement code can lay, lean or wedge any model the same way).
// Every group also carries:
//   · an invisible box ("proxy") that hiding and tapping test against – thousands of triangles per
//     model would make the hiding search far too slow on a tablet
//   · its own look (StyleSampler) with the pattern sized for the object (fine stitches on small things)
//   · an automatic flat OUTLINE (shapes) for the figurative forms – woven, painted, embossed (OS-30: 3.1)
// Files are stored on the device in their own cache, which survives game updates (OS-33: 3.2).
import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { ASSET_DEFS } from './assetlib.js';
import { StyleSampler } from '../art/styles.js';

export const MODEL_CACHE = 'objectsleuth-models';      // (sw.js keeps it across versions)
const loader = new GLTFLoader();
const PROXY_MAT = new THREE.MeshStandardMaterial({ color: 0xff00ff });
const KEEP_LOADED = 70;                                 // models kept in memory between rounds

export const modelUrl = (def) => (window.OBJECTSLEUTH_MODELS && window.OBJECTSLEUTH_MODELS[def.file]) || ('assets/models/' + def.file + '?v=' + def.kb);   // (single-file versions carry the models inside)

export class Library {
  constructor() {
    this.defs = ASSET_DEFS;
    this.groups = new Map();      // id → group
    this.pending = new Map();     // id → promise
    this.used = new Map();        // id → last round it was used in
    this.round = 0;
    this.look = 'clay';
  }

  async load(def) {
    if (this.groups.has(def.id)) return this.groups.get(def.id);
    if (this.pending.has(def.id)) return this.pending.get(def.id);
    const p = loader.loadAsync(modelUrl(def)).then((gltf) => {
      const g = this.prepare(def, gltf.scene);
      this.groups.set(def.id, g);
      this.pending.delete(def.id);
      return g;
    });
    this.pending.set(def.id, p);
    return p;
  }

  // load many at once (6 at a time); failures are left out (reported in the console)
  async loadMany(defs, onProgress) {
    this.round++;
    const out = new Map(), list = defs.slice();
    let done = 0;
    const worker = async () => {
      while (list.length) {
        const d = list.shift();
        try { out.set(d.id, await this.load(d)); } catch (e) { console.warn('ObjectSleuth: model failed', d.id, e); }
        this.used.set(d.id, this.round);
        if (onProgress) onProgress(++done, defs.length);
      }
    };
    await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
    for (const g of out.values()) this.setLookOf(g);
    this.trim();
    return out;
  }

  // normalised frame, proxy, look, outline
  prepare(def, scene) {
    const model = new THREE.Group();
    model.add(scene);
    scene.rotation.set(...def.rot);
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    let size = box.getSize(new THREE.Vector3());
    if (size.z > size.x * 1.02) { model.rotation.y = Math.PI / 2; model.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(model); size = box.getSize(new THREE.Vector3()); }
    const k = def.size ? def.size / Math.max(size.x, size.y, size.z) : 1;
    model.scale.setScalar(k);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    const group = new THREE.Group();
    group.name = def.id;
    group.add(model);
    group.updateMatrixWorld(true);
    group.userData.def = def;
    const meshes = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.userData.imported = true;
      for (const m of [o.material].flat()) {
        if (m.map) { m.map.anisotropy = 4; }
        m.side = THREE.FrontSide;
        // glass that "transmits" light makes the engine draw the WHOLE room a second time every frame
        // (one light bulb: +107 draws). Plain see-through glass looks the same at this size and costs nothing.
        if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.depthWrite = false; }
      }
      meshes.push(o);
    });
    group.userData.meshes = meshes;
    const gb = new THREE.Box3().setFromObject(group);
    group.userData.box = gb;
    // OS-25 (5.3): very white objects "yell" – tone them down a little
    const avg = averageColor(meshes);
    group.userData.color = avg;
    const lum = 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b;
    if (lum > 0.78) for (const o of meshes) for (const m of [o.material].flat()) m.color.multiplyScalar(0.78 / lum);
    // its own look, with the pattern sized for the object (Intake page: same rule)
    const L = Math.max(...gb.getSize(new THREE.Vector3()).toArray());
    let ws = 0;
    const wv = new THREE.Vector3();
    for (const o of meshes) { o.getWorldScale(wv); ws += (wv.x + wv.y + wv.z) / 3; }
    group.userData.sampler = new StyleSampler(group, [], { scale: Math.min(1, Math.max(0.3, L / 0.5)) / (meshes.length ? ws / meshes.length : 1) });
    // the proxy box (added after the look, so it is never restyled)
    const s = gb.getSize(new THREE.Vector3()), pc = gb.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(s.x, 0.004), Math.max(s.y, 0.004), Math.max(s.z, 0.004)), PROXY_MAT);
    proxy.position.copy(pc);
    proxy.visible = false;
    proxy.userData.proxy = true;
    group.add(proxy);
    group.userData.proxyMesh = proxy;
    return group;
  }

  setLook(look) { this.look = look; for (const g of this.groups.values()) this.setLookOf(g); }
  setLookOf(g) {
    const s = g.userData.sampler;
    if (s && s.name !== this.look) s.set(this.look);
    else if (s && !s.applied) s.set(this.look);
    if (s) s.applied = true;
  }

  // free the models not used for a while (they are still on the device; loading again is quick)
  trim() {
    if (this.groups.size <= KEEP_LOADED) return;
    const old = [...this.groups.keys()].sort((a, b) => (this.used.get(a) || 0) - (this.used.get(b) || 0));
    for (const id of old.slice(0, this.groups.size - KEEP_LOADED)) {
      if (this.used.get(id) === this.round) continue;
      const g = this.groups.get(id);
      g.removeFromParent();
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) { if (m.map) m.map.dispose(); m.dispose(); }
        if (o.userData.orig) o.userData.orig.g.dispose();
      });
      this.groups.delete(id);
    }
  }
}

// ---------------------------------------------------------------- colours
// average colour of a model (its color images, sampled small) – for camouflage checks and white tone-down
const tiny = document.createElement('canvas');
tiny.width = tiny.height = 8;
const tctx = tiny.getContext('2d', { willReadFrequently: true });
export function averageColor(meshes) {
  const sum = new THREE.Color(0, 0, 0);
  let n = 0;
  for (const o of meshes) {
    for (const m of [o.material].flat()) {
      if (m.transparent) continue;
      const c = m.color.clone();
      if (m.map && m.map.image) {
        try {
          tctx.clearRect(0, 0, 8, 8);
          tctx.drawImage(m.map.image, 0, 0, 8, 8);
          const d = tctx.getImageData(0, 0, 8, 8).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
          const k = 1 / (255 * 64);
          c.multiply(new THREE.Color(r * k, g * k, b * k));
        } catch (e) { /* image not readable: use the base colour */ }
      }
      const w = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
      sum.r += c.r * w; sum.g += c.g * w; sum.b += c.b * w; n += w;
    }
  }
  return n ? new THREE.Color(sum.r / n, sum.g / n, sum.b / n) : new THREE.Color(0.5, 0.5, 0.5);
}

// ---------------------------------------------------------------- outlines (automatic figurative forms)
// The model's triangles are drawn flat onto a small grid seen from its most telling side (the side
// showing its two largest measures), and the edge of what is filled becomes the outline. Cached per model.
const GRID = 96;
export function shapesOf(group) {
  if (group.userData.shapes) return group.userData.shapes;
  const s = group.userData.box.getSize(new THREE.Vector3());
  const top = s.y < s.z;                                  // thin top-to-bottom: seen from above; else from the front
  const pts = (v) => (top ? [v.x, -v.z] : [v.x, v.y]);
  const mask = rasterize(group, pts);
  group.userData.shapes = traceShapes(mask.grid, mask.n, mask.min, mask.cell);
  group.userData.shapeView = top ? 'top' : 'front';
  return group.userData.shapes;
}

// fill a GRID × GRID mask with the model's triangles projected by fn(worldVec) → [u, v]
export function rasterize(group, fn, matrix = null) {
  group.updateMatrixWorld(true);
  const tris = [];
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  const v = new THREE.Vector3(), inv = matrix ? null : new THREE.Matrix4().copy(group.matrixWorld).invert();
  for (const o of group.userData.meshes) {
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const m = new THREE.Matrix4().multiplyMatrices(matrix || inv, o.matrixWorld);
    const P = [];
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); const p = fn(v); P.push(p); lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) tris.push(P[idx ? idx.getX(i) : i], P[idx ? idx.getX(i + 1) : i + 1], P[idx ? idx.getX(i + 2) : i + 2]);
  }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1]) || 1e-3, cell = span / (GRID - 4);
  const min = [lo[0] - cell * 2 - ((span - (hi[0] - lo[0])) / 2), lo[1] - cell * 2 - ((span - (hi[1] - lo[1])) / 2)];
  const grid = new Uint8Array(GRID * GRID);
  const toG = (p) => [(p[0] - min[0]) / cell, (p[1] - min[1]) / cell];
  for (let t = 0; t < tris.length; t += 3) {
    const a = toG(tris[t]), b = toG(tris[t + 1]), c = toG(tris[t + 2]);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(GRID - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(GRID - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) { grid[Math.round(a[1]) * GRID + Math.round(a[0])] = 1; continue; }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
      if (w0 >= -0.02 && w1 >= -0.02 && w0 + w1 <= 1.04) grid[y * GRID + x] = 1;
    }
  }
  return { grid, n: GRID, min, cell };
}

// outer edges of the filled areas → THREE.Shape list (small specks are ignored)
function traceShapes(grid, N, min, cell) {
  const seen = new Uint8Array(N * N), shapes = [];
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? grid[y * N + x] : 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!grid[y * N + x] || seen[y * N + x]) continue;
    // flood the blob (to mark it and measure it)
    const stack = [[x, y]]; let count = 0;
    seen[y * N + x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop(); count++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (at(nx, ny) && !seen[ny * N + nx]) { seen[ny * N + nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (count < 12) continue;
    // Moore-neighbour trace of its outer edge, starting at its top-left pixel (x, y)
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const pts = [[x, y]];
    let cx = x, cy = y, d = 6, guard = 0;
    do {
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (d + 6 + k) % 8, nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
        if (at(nx, ny)) { cx = nx; cy = ny; d = nd; found = true; break; }
      }
      if (!found) break;
      pts.push([cx, cy]);
    } while (!(cx === x && cy === y) && ++guard < N * N);
    // a closed outline: simplify its two halves (start → farthest point → start)
    let far = 0;
    pts.forEach((p, i) => { if (Math.hypot(p[0] - x, p[1] - y) > Math.hypot(pts[far][0] - x, pts[far][1] - y)) far = i; });
    const simple = far > 0 ? rdp(pts.slice(0, far + 1), 0.9).slice(0, -1).concat(rdp(pts.slice(far), 0.9)) : [];
    if (simple.length > 1 && simple[0][0] === simple.at(-1)[0] && simple[0][1] === simple.at(-1)[1]) simple.pop();
    if (simple.length < 3) continue;
    const shape = new THREE.Shape(simple.map(([gx, gy]) => new THREE.Vector2(min[0] + (gx + 0.5) * cell, min[1] + (gy + 0.5) * cell)));
    shape.area = count;
    shapes.push(shape);
  }
  shapes.sort((a, b) => b.area - a.area);
  return shapes.slice(0, 6);
}
function rdp(pts, eps) { // Ramer–Douglas–Peucker line simplification
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  let best = -1, dmax = 0;
  const L = Math.hypot(bx - ax, by - ay) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
    if (d > dmax) { dmax = d; best = i; }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, best + 1), eps).slice(0, -1).concat(rdp(pts.slice(best), eps));
}

// ---------------------------------------------------------------- silhouettes (presentation mode)
// A black silhouette picture of a placed object exactly as the camera sees it (OS-33: 5.5) –
// or, for a figurative form, its outline turned the way it was knotted / painted / embossed.
export function silhouetteOfObject(group, viewDir, size = 96) {
  const z = viewDir.clone().normalize(), x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const view = new THREE.Matrix4().makeBasis(x, y, z).invert();
  const mask = rasterize(group, (v) => [v.x, v.y], view);
  return maskToCanvas(mask, size);
}
export function silhouetteOfShapes(shapes, turn = 0, flip = 1, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.translate(size / 2, size / 2); x.rotate(turn); x.scale(flip, 1);
  x.fillStyle = '#111';
  drawShapes(x, shapes, size * 0.86);
  return c;
}
function maskToCanvas({ grid, n }, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) {
    const on = grid[y * n + i], o = ((n - 1 - y) * n + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 17; img.data[o + 3] = on ? 255 : 0;
  }
  const t = document.createElement('canvas'); t.width = t.height = n; t.getContext('2d').putImageData(img, 0, 0);
  x.imageSmoothingEnabled = true;
  x.drawImage(t, 0, 0, size, size);
  return c;
}
// draw outlines centred at 0,0 with the longest side = size (same rule as objects.js drawOutline)
export function drawShapes(ctx, shapes, size, stroke = false) {
  const b = new THREE.Box2();
  shapes.forEach((s) => s.getPoints(8).forEach((p) => b.expandByPoint(p)));
  const c = b.getCenter(new THREE.Vector2()), d = b.getSize(new THREE.Vector2());
  const k = size / Math.max(d.x, d.y, 1e-6);
  for (const s of shapes) {
    ctx.beginPath();
    s.getPoints(8).forEach((p, i) => (i ? ctx.lineTo((p.x - c.x) * k, -(p.y - c.y) * k) : ctx.moveTo((p.x - c.x) * k, -(p.y - c.y) * k)));
    ctx.closePath();
    ctx.fill();
    if (stroke) ctx.stroke();
  }
  return k;
}
