// FAST RAYS (v16.1): the hiding search sends tens of thousands of rays per round. Against the detailed
// imported furniture (armchair 5,600 triangles, tall side table 6,000) each ray tested every triangle –
// about 1–2 ms a ray, so a round took 7–25 s to hide. accelerate(mesh) sorts a mesh's triangles once into
// a small tree of boxes (a "BVH"); a ray then only tests the few triangles near its path (~0.01 ms).
// Same results as three.js's own test (face side, near/far, every crossing), for meshes that never change shape.
import * as THREE from '../../vendor/three/three.module.js';

const LEAF = 8;
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Vector3();

export function accelerate(mesh) {
  if (mesh.userData.fastRay || mesh.isInstancedMesh || mesh.isSkinnedMesh) return;
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const n = (idx ? idx.count : pos.count) / 3;
  if (n < 100) return;                                     // small meshes: the normal test is quick enough
  const T = new Float32Array(n * 9), C = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = idx ? idx.getX(i * 3 + k) : i * 3 + k;
      T[i * 9 + k * 3] = pos.getX(v); T[i * 9 + k * 3 + 1] = pos.getY(v); T[i * 9 + k * 3 + 2] = pos.getZ(v);
    }
    for (let a = 0; a < 3; a++) C[i * 3 + a] = (T[i * 9 + a] + T[i * 9 + 3 + a] + T[i * 9 + 6 + a]) / 3;
  }
  const order = new Uint32Array(n).map((_, i) => i);
  const nodes = [];                                       // [minx,miny,minz,maxx,maxy,maxz, left, right, start, count]
  const build = (start, count) => {
    const id = nodes.length;
    const node = new Float64Array(10);
    nodes.push(node);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < start + count; i++) {
      const t = order[i] * 9;
      for (let k = 0; k < 9; k++) { const a = k % 3, v = T[t + k]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    }
    node.set([...mn, ...mx, -1, -1, start, count]);
    if (count <= LEAF) return id;
    const ax = [0, 1, 2].reduce((b, a) => (mx[a] - mn[a] > mx[b] - mn[b] ? a : b), 0);
    const sub = Array.from(order.subarray(start, start + count)).sort((p, q) => C[p * 3 + ax] - C[q * 3 + ax]);
    order.set(sub, start);
    const half = count >> 1;
    node[6] = build(start, half);
    node[7] = build(start + half, count - half);
    return id;
  };
  build(0, n);
  mesh.userData.fastRay = { T, order, nodes, geo: g };
  mesh.raycast = fastRaycast;
}

function boxHit(node, o, inv, far) {
  let t0 = 0, t1 = far;
  for (let a = 0; a < 3; a++) {
    let ta = (node[a] - o[a]) * inv[a], tb = (node[a + 3] - o[a]) * inv[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

function fastRaycast(raycaster, intersects) {
  const mat = this.material;
  if (!mat || Array.isArray(mat)) return THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  if (this.userData.fastRay.geo !== this.geometry) {      // a new look gave it a new shape: sort it again
    this.userData.fastRay = null;
    accelerate(this);
    if (!this.userData.fastRay) { this.raycast = THREE.Mesh.prototype.raycast; return this.raycast(raycaster, intersects); }
  }
  const { T, order, nodes } = this.userData.fastRay;
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  const o = [_ray.origin.x, _ray.origin.y, _ray.origin.z], d = [_ray.direction.x, _ray.direction.y, _ray.direction.z];
  const len = Math.hypot(d[0], d[1], d[2]);
  d[0] /= len; d[1] /= len; d[2] /= len;
  _ray.direction.set(d[0], d[1], d[2]);
  const inv = [1 / d[0], 1 / d[1], 1 / d[2]];
  const scale = this.matrixWorld.getMaxScaleOnAxis();
  const farL = raycaster.far === Infinity ? Infinity : raycaster.far / Math.max(scale, 1e-9) * 1.01;
  const side = mat.side;
  // every surface the ray crosses (like three.js: counting surfaces tells inside from outside)
  const found = [];
  const stack = [0];
  while (stack.length) {
    const node = nodes[stack.pop()];
    if (!boxHit(node, o, inv, farL)) continue;
    if (node[6] < 0) {
      for (let i = node[8]; i < node[8] + node[9]; i++) {
        const t = order[i] * 9;
        _e1.set(T[t + 3] - T[t], T[t + 4] - T[t + 1], T[t + 5] - T[t + 2]);
        _e2.set(T[t + 6] - T[t], T[t + 7] - T[t + 1], T[t + 8] - T[t + 2]);
        _h.crossVectors(_ray.direction, _e2);
        const det = _e1.dot(_h);
        if (Math.abs(det) < 1e-12) continue;
        // det > 0: the ray meets the triangle's front face (det = −direction · face normal)
        if (side === THREE.FrontSide && det < 0) continue;
        if (side === THREE.BackSide && det > 0) continue;
        const f = 1 / det;
        _s.set(o[0] - T[t], o[1] - T[t + 1], o[2] - T[t + 2]);
        const u = f * _s.dot(_h);
        if (u < 0 || u > 1) continue;
        _q.crossVectors(_s, _e1);
        const v = f * _ray.direction.dot(_q);
        if (v < 0 || u + v > 1) continue;
        const dist = f * _e2.dot(_q);
        if (dist > 1e-9 && dist < farL) found.push(dist, order[i], u, v);
      }
    } else {
      stack.push(node[6], node[7]);
    }
  }
  for (let k = 0; k < found.length; k += 4) {
    const dist = found[k], tri = found[k + 1], u = found[k + 2], v = found[k + 3];
    _p.copy(_ray.direction).multiplyScalar(dist).add(_ray.origin).applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(_p);
    if (distance < raycaster.near || distance > raycaster.far) continue;
    const t = tri * 9;
    _e1.set(T[t + 3] - T[t], T[t + 4] - T[t + 1], T[t + 5] - T[t + 2]);
    _e2.set(T[t + 6] - T[t], T[t + 7] - T[t + 1], T[t + 8] - T[t + 2]);
    _n.crossVectors(_e1, _e2).normalize();
    intersects.push({ distance, point: _p.clone(), object: this, faceIndex: tri, face: { a: tri * 3, b: tri * 3 + 1, c: tri * 3 + 2, normal: _n.clone(), materialIndex: 0 }, uv: null, barycoord: new THREE.Vector3(1 - u - v, u, v) });
  }
}
