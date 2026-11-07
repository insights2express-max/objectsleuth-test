// BATCHING (v12): the room's fixed pieces are merged into a few big pieces, one per material,
// so the graphics chip gets ~50 drawing jobs instead of ~330. Done after an art style is chosen
// (and again when it changes). The original pieces stay in the Scene, hidden, so that hiding
// objects and tapping still test against the exact individual shapes.
//
// Not merged: anything that moves or changes shape (pendulum, clock hands, globe, flames, embers,
// Target Objects), see-through glass, the rug and pictures (their own textures), invisible shells.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export class StaticBatcher {
  constructor(root) {
    this.root = root;
    this.merged = [];
    this.hidden = [];
  }

  isStatic(o) {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return false;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent || m.colorWrite === false || m.map) return false;
    for (let p = o; p; p = p.parent) if (p.userData.dynamic || p.userData.target || p.userData.decor) return false;
    return true;
  }

  build() {
    this.clear();
    this.root.updateMatrixWorld(true);
    const groups = new Map();
    this.root.traverse((o) => {
      if (!this.isStatic(o)) return;
      const g = o.geometry;
      const sig = [o.material.uuid, o.castShadow, o.receiveShadow, Object.keys(g.attributes).sort().join(',')].join('|');
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(o);
    });
    const nm = new THREE.Matrix3();
    for (const list of groups.values()) {
      if (list.length < 2) continue;                       // nothing to gain
      const geos = list.map((o) => {
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.clearGroups();
        g.applyMatrix4(o.matrixWorld);                     // into room coordinates
        nm.getNormalMatrix(o.matrixWorld);
        for (const name of ['aGrain', 'aGrain2']) {        // knit stitch directions turn with the piece
          const a = g.attributes[name];
          if (!a) continue;
          const v = new THREE.Vector3();
          for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); a.setXYZ(i, v.x, v.y, v.z); }
        }
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      mesh.userData.merged = true;
      mesh.raycast = () => {};                             // taps and hiding use the original pieces
      this.root.add(mesh);
      this.merged.push(mesh);
      for (const o of list) { o.visible = false; o.userData.batched = true; this.hidden.push(o); }
    }
  }

  clear() {
    for (const m of this.merged) { m.removeFromParent(); m.geometry.dispose(); }
    for (const o of this.hidden) { o.visible = true; o.userData.batched = false; }
    this.merged = [];
    this.hidden = [];
  }
}
