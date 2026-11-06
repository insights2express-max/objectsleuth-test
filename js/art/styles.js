// STYLE SAMPLER (test feature): re-dresses the same Scene in different art styles.
// Each style swaps shapes (e.g. soft rounded edges), materials (clay, felt, yarn, plastic, paper)
// and draws a fine surface pattern in code, so it stays sharp at any zoom.
import * as THREE from '../../vendor/three/three.module.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { skin } from './skins.js';

// skin styles: the surface is a baked "skin" (skins.js) wrapped onto each object, so it moves
// with the object, has relief that catches the light, and is cheap to draw.
//   tile = metres per skin repeat · bump = relief depth (m) · tone = strength of tonal variation
//   vary = per-object shade variation · rot = how far each object's skin is turned (1 = any angle)
//   lumpy = hand-made unevenness (m, max) pushed into the shapes themselves
export const STYLES = {
  lowpoly: { label: 'Low-poly' },
  clay: { label: 'Clay', skin: true, round: 0.45, cap: 0.09, tile: 0.6, bump: 0.006, tone: 0.75, vary: 0.16, rot: 1, lumpy: 0.012 },
  felt: { label: 'Felt', skin: true, round: 0.45, cap: 0.1, tile: 0.25, bump: 0.003, tone: 1.0, vary: 0.08, rot: 1, lumpy: 0.006 },
  knit: { label: 'Knitted yarn', skin: true, round: 0.4, cap: 0.08, tile: 0.36, bump: 0.006, tone: 1.6, vary: 0.08, rot: 0.04, lumpy: 0.004 },
  // PARKED (OS-4: 5.1): hidden from the list; code kept for later
  paper: { label: 'Paper-craft', kind: 5, parked: true },
  brick: { label: 'Brick-built', kind: 4, parked: true },
};

// ---------- skins: shader code added to the normal three.js materials ----------
const SKIN_VERT = `
attribute float aSeed;
varying vec3 vLP; varying vec3 vLN; varying float vSeed;`;
const SKIN_VERT_MAIN = `
#ifdef USE_INSTANCING
  vLP = mat3(instanceMatrix) * transformed;
  vLN = mat3(instanceMatrix) * objectNormal;
  vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
#else
  vLP = transformed; vLN = objectNormal; vSeed = aSeed;
#endif`;
const SKIN_FRAG = `
uniform sampler2D uSkin; uniform float uTile; uniform float uBump; uniform float uTone; uniform float uVary; uniform float uRot;
varying vec3 vLP; varying vec3 vLN; varying float vSeed;
vec4 skinSample(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z);
  float a = (vSeed - 0.5) * 6.2831 * uRot; float c = cos(a), s = sin(a);
  mat2 R = mat2(c, -s, s, c);
  vec2 o = vec2(vSeed * 17.3, fract(vSeed * 91.7) * 5.1);
  return w.x * texture2D(uSkin, R * (p.zy / uTile) + o)
       + w.y * texture2D(uSkin, R * (p.xz / uTile) + o.yx)
       + w.z * texture2D(uSkin, R * (p.xy / uTile) + o * 1.3);
}
vec3 skinBump(vec3 sp, vec3 sn, float h, float faceDir) {
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, sn), R2 = cross(sn, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * R1 + dFdy(h) * R2);
  return normalize(abs(det) * sn - grad);
}`;

function addSkin(material, style, uniforms) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + SKIN_VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 sk = skinSample(vLP, normalize(vLN));
  vec3 hs = fract(vec3(vSeed * 13.7, vSeed * 71.3, vSeed * 29.1));
  vec3 tintv = vec3(1.0 + (hs.x - 0.5) * uVary) + (hs.yzx - 0.5) * uVary * 0.4;
  diffuseColor.rgb *= tintv * (1.0 + (sk.r - 0.5) * uTone);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = skinBump(-vViewPosition, normal, sk.g * uBump, faceDirection);`);
  };
  material.customProgramCacheKey = () => 'objectsleuth-skin-' + style;
}

// Smooth 3D noise (JS) for hand-made unevenness in the shapes.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// ---------- surface patterns (GLSL), projected from three sides so no texture stretching ----------
const LIB = `
varying vec3 vWP; varying vec3 vWN;
float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
}
float sFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sNoise(p); p *= 2.03; a *= 0.5; } return s; }
float sPat(vec2 uv, float up) {
#if STYLE_KIND == 1
  float n = sFbm(uv * 6.0);
  float ridge = abs(sin((uv.x + uv.y) * 70.0 + n * 14.0));
  return 0.95 + 0.08 * (n - 0.5) + 0.035 * smoothstep(0.8, 1.0, ridge);
#elif STYLE_KIND == 2
  float f = 0.5 * sNoise(uv * 260.0) + 0.5 * sNoise(uv * 85.0);
  return 0.82 + 0.2 * f + 0.07 * (sNoise(uv * 6.0) - 0.5);
#elif STYLE_KIND == 3
  vec2 c = vec2(uv.x / 0.045, uv.y / 0.036);
  vec2 f = fract(c);
  float half_ = f.x < 0.5 ? f.x * 2.0 : (1.0 - f.x) * 2.0;
  float lean = fract(f.y + (f.x < 0.5 ? -f.x : f.x - 1.0) * 0.9);
  float loopv = pow(max(sin(3.14159 * lean), 0.0), 0.6);
  float shade = (0.55 + 0.45 * loopv) * (0.68 + 0.32 * sin(3.14159 * fract(f.x * 2.0))) * (0.9 + 0.1 * half_);
  return shade * (0.92 + 0.12 * sNoise(uv * 420.0));
#elif STYLE_KIND == 4
  if (up > 0.5) {
    vec2 q = fract(uv / vec2(0.32, 0.16)) * vec2(0.32, 0.16);
    float e = min(min(q.x, 0.32 - q.x), min(q.y, 0.16 - q.y));
    return 0.78 + 0.22 * smoothstep(0.0, 0.006, e);
  }
  float row = floor(uv.y / 0.096);
  float fx = fract(uv.x / 0.32 + 0.5 * mod(row, 2.0)) * 0.32;
  float fy = fract(uv.y / 0.096) * 0.096;
  float e = min(min(fx, 0.32 - fx), min(fy, 0.096 - fy));
  return 0.7 + 0.3 * smoothstep(0.0, 0.006, e);
#else
  float fib = sNoise(vec2(uv.x * 900.0, uv.y * 90.0));
  return 0.96 + 0.05 * (sNoise(uv * 330.0) - 0.5) + 0.04 * (sFbm(uv * 18.0) - 0.5) + 0.02 * (fib - 0.5);
#endif
}
float stylePattern(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return w.x * sPat(p.zy, 0.0) + w.y * sPat(p.xz, 1.0) + w.z * sPat(p.xy, 0.0);
}`;

function addPattern(material, kind) {
  material.defines = { ...(material.defines || {}), STYLE_KIND: kind };
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        mat4 mw = modelMatrix;
        #ifdef USE_INSTANCING
          mw = modelMatrix * instanceMatrix;
        #endif
        vWP = (mw * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(mw) * objectNormal);
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LIB)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= stylePattern(vWP, normalize(vWN));');
  };
  material.customProgramCacheKey = () => 'objectsleuth-style-' + kind;
}

// ---------- colors per style ----------
const hsl = { h: 0, s: 0, l: 0 };
function tint(color, style) {
  const c = color.clone();
  c.getHSL(hsl);
  if (style === 'clay') c.setHSL(hsl.h, hsl.s * 0.85, Math.min(1, hsl.l + 0.04));
  else if (style === 'felt') c.setHSL(hsl.h, hsl.s * 0.8, Math.min(1, hsl.l + 0.05));
  else if (style === 'knit') c.setHSL(hsl.h, hsl.s * 0.9, Math.min(1, hsl.l + 0.04));
  else if (style === 'brick') c.setHSL(hsl.h, Math.min(1, hsl.s * 1.3), hsl.l);
  else if (style === 'paper') c.setHSL(hsl.h, hsl.s * 0.7, hsl.l + (1 - hsl.l) * 0.2);
  return c;
}

const skinUniforms = {};
function uniformsFor(style) {
  if (!skinUniforms[style]) {
    const S = STYLES[style];
    skinUniforms[style] = {
      uSkin: { value: skin(style) }, uTile: { value: S.tile }, uBump: { value: S.bump },
      uTone: { value: S.tone }, uVary: { value: S.vary }, uRot: { value: S.rot },
    };
  }
  return skinUniforms[style];
}

function makeMaterial(orig, style) {
  const S = STYLES[style];
  if (S.skin) {
    const m = makeBase(orig, style);
    addSkin(m, style, uniformsFor(style));
    return m;
  }
  const m = makeBase(orig, style);
  addPattern(m, S.kind);
  return m;
}

function makeBase(orig, style) {
  const color = tint(orig.color, style);
  const base = {
    color, map: orig.map, side: orig.side,
    emissive: orig.emissive, emissiveIntensity: orig.emissiveIntensity,
  };
  let m;
  if (style === 'felt') {
    m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35) });
  } else if (style === 'knit') {
    m = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.25) });
  } else if (style === 'clay') {
    m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.62 });
  } else if (style === 'brick') {
    m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.3, flatShading: true });
  } else {
    m = new THREE.MeshStandardMaterial({ ...base, roughness: 1, flatShading: true });
  }
  m.emissive = orig.emissive.clone();
  return m;
}

export class StyleSampler {
  // keep: materials the lighting animates (lamp shades, bulbs, window glass) – left as they are.
  constructor(root, keep = []) {
    this.root = root;
    this.keep = new Set(keep);
    this.meshes = [];
    root.traverse((o) => { if (o.isMesh) { o.userData.orig = { g: o.geometry, m: o.material }; this.meshes.push(o); } });
    this.mats = new Map();
    this.geos = new Map();
    this.edges = null;
    this.studs = null;
    this.name = 'lowpoly';
  }

  restylable(m) {
    return m.isMeshStandardMaterial && !m.transparent && !this.keep.has(m);
  }

  material(orig, style) {
    if (!this.restylable(orig)) return orig;
    const key = orig.uuid + style;
    if (!this.mats.has(key)) this.mats.set(key, makeMaterial(orig, style));
    return this.mats.get(key);
  }

  geometry(orig, style, instanced) {
    const S = STYLES[style];
    if (!S.round || orig.type !== 'BoxGeometry') return orig;
    const key = orig.uuid + style;
    if (!this.geos.has(key)) {
      const { width: w, height: h, depth: d } = orig.parameters;
      const r = instanced ? 0.12 : Math.min(S.cap, Math.min(w, h, d) * S.round);
      this.geos.set(key, r < 0.002 ? orig : new RoundedBoxGeometry(w, h, d, S.seg, r));
    }
    return this.geos.get(key);
  }

  // Skin styles: each object gets its own shape copy (rounded, slightly uneven) and a seed
  // number, so its skin, shade and unevenness differ from every other object.
  skinGeometry(o, style) {
    const S = STYLES[style], orig = o.userData.orig.g;
    if (o.isInstancedMesh) { // books: one shared rounded block; variety comes from each book's position
      const key = orig.uuid + style;
      if (!this.geos.has(key)) this.geos.set(key, new RoundedBoxGeometry(1, 1, 1, 1, 0.12));
      return this.geos.get(key);
    }
    const key = o.uuid + style;
    if (this.geos.has(key)) return this.geos.get(key);
    let g;
    if (orig.type === 'BoxGeometry') {
      const { width: w, height: h, depth: d } = orig.parameters;
      const r = Math.min(S.cap, Math.min(w, h, d) * S.round);
      g = r < 0.002 ? orig.clone() : new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) > 0.5 ? 2 : 1, r);
    } else {
      g = orig.clone();
    }
    o.updateWorldMatrix(true, false);
    const pos = g.attributes.position, v = new THREE.Vector3();
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    const amp = Math.min(S.lumpy, Math.max(0.0005, Math.min(size.x, size.y, size.z) * 0.12));
    if (S.lumpy) {
      // Unevenness follows one shared field in the room, so touching pieces stay joined.
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const dx = noise3(v.x * 5, v.y * 5, v.z * 5) - 0.5 + 0.4 * (noise3(v.x * 17 + 9, v.y * 17, v.z * 17) - 0.5);
        const dy = noise3(v.x * 5 + 31, v.y * 5, v.z * 5) - 0.5 + 0.4 * (noise3(v.x * 17, v.y * 17 + 9, v.z * 17) - 0.5);
        const dz = noise3(v.x * 5, v.y * 5 + 57, v.z * 5) - 0.5 + 0.4 * (noise3(v.x * 17, v.y * 17, v.z * 17 + 9) - 0.5);
        pos.setXYZ(i, pos.getX(i) + dx * 2 * amp, pos.getY(i) + dy * 2 * amp, pos.getZ(i) + dz * 2 * amp);
      }
    }
    const wp = o.getWorldPosition(new THREE.Vector3());
    const seed = hash3(wp.x * 3.1, wp.y * 7.3, wp.z * 5.7);
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(pos.count).fill(seed), 1));
    this.geos.set(key, g);
    return g;
  }

  set(style) {
    if (!STYLES[style] || STYLES[style].parked) style = 'lowpoly';
    this.name = style;
    for (const o of this.meshes) {
      const { g, m } = o.userData.orig;
      if (style === 'lowpoly' || (m.colorWrite === false)) { o.geometry = g; o.material = m; continue; }
      if (STYLES[style].skin) {
        o.material = this.material(m, style);
        o.geometry = o.material === m && !o.isInstancedMesh ? g : this.skinGeometry(o, style);
        continue;
      }
      o.geometry = this.geometry(g, style, o.isInstancedMesh);
      o.material = this.material(m, style);
    }
    if (style === 'paper' && !this.edges) this.buildEdges();
    if (style === 'brick' && !this.studs) this.buildStuds();
    if (this.edges) this.edges.forEach((e) => { e.visible = style === 'paper'; });
    if (this.studs) this.studs.visible = style === 'brick';
  }

  // Paper-craft: crisp fold lines along every edge.
  buildEdges() {
    this.edges = [];
    const lineMats = new Map();
    for (const o of this.meshes) {
      const m = o.userData.orig.m;
      if (o.isInstancedMesh || !this.restylable(m)) continue;
      const c = tint(m.color, 'paper').multiplyScalar(m.map ? 0.35 : 0.55);
      const hex = c.getHex();
      if (!lineMats.has(hex)) lineMats.set(hex, new THREE.LineBasicMaterial({ color: c }));
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(o.userData.orig.g, 25), lineMats.get(hex));
      line.raycast = () => {};
      o.add(line);
      this.edges.push(line);
    }
  }

  // Brick-built: round studs on top of every flat, upward-facing block.
  buildStuds() {
    this.root.updateMatrixWorld(true);
    const P = 0.16, spots = [];
    const up = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
    // thin things lying flat (rugs, mats): no studs underneath them
    const covers = this.meshes
      .filter((o) => o.userData.orig.g.type === 'BoxGeometry' && o.userData.orig.g.parameters.height < 0.05
        && o.userData.orig.m.colorWrite !== false && o.userData.orig.m.map)
      .map((o) => new THREE.Box3().setFromObject(o).expandByVector(new THREE.Vector3(0.05, 0, 0.05)));
    for (const o of this.meshes) {
      const { g, m } = o.userData.orig;
      if (g.type !== 'BoxGeometry' || o.isInstancedMesh || !this.restylable(m) || m.map) continue;
      up.setFromMatrixColumn(o.matrixWorld, 1);
      if (Math.abs(up.length() - 1) > 0.01 || up.y < 0.999) continue; // only level, unscaled blocks
      const { width: w, height: h, depth: d } = g.parameters;
      let nx = Math.floor(w / P), nz = Math.floor(d / P);
      if (nx === 0 || nz === 0) {
        if (w < 0.07 || d < 0.07) continue;
        nx = Math.max(nx, 1); nz = Math.max(nz, 1);
      }
      const sx = Math.min(P, w / nx), sz = Math.min(P, d / nz);
      col.copy(tint(m.color, 'brick'));
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          v.set((i - (nx - 1) / 2) * sx, h / 2, (k - (nz - 1) / 2) * sz).applyMatrix4(o.matrixWorld);
          if (covers.some((c) => v.x > c.min.x && v.x < c.max.x && v.z > c.min.z && v.z < c.max.z
            && c.min.y > v.y - 0.02 && c.min.y < v.y + 0.06)) continue; // under a rug or mat
          spots.push(v.x, v.y, v.z, col.r, col.g, col.b);
        }
      }
      if (spots.length > 6 * 30000) break;
    }
    const n = spots.length / 6;
    const geo = new THREE.CylinderGeometry(0.048, 0.048, 0.034, 12).translate(0, 0.017, 0);
    const studMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const im = new THREE.InstancedMesh(geo, studMat, n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const s = i * 6;
      im.setMatrixAt(i, mtx.makeTranslation(spots[s], spots[s + 1], spots[s + 2]));
      im.setColorAt(i, col.setRGB(spots[s + 3], spots[s + 4], spots[s + 5]));
    }
    im.castShadow = im.receiveShadow = true;
    im.raycast = () => {};
    this.studs = im;
    this.root.add(im);
  }
}
