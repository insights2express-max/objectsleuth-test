// STYLE SAMPLER (test feature): re-dresses the same Scene in different art styles.
// Each style swaps shapes (e.g. soft rounded edges), materials (clay, felt, yarn, plastic, paper)
// and draws a fine surface pattern in code, so it stays sharp at any zoom.
import * as THREE from '../../vendor/three/three.module.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { skin } from './skins.js';

// Skin styles (v2, M1.4): each object's surface = a fine baked "base" + one-off marks scattered
// one at a time by dice rolls (never repeating) + a gentle large-scale tone drift.
//   tile = metres per base repeat · bump = relief depth (m) · tone = strength of fine tone
//   drift = strength of the large, gentle tone drift · vary = per-object shade variation
//   rot = how far each object's skin is turned (1 = any angle) · mix2 = blend in a 2nd base layer
//   cell = metres per dice-roll cell · prob = chance a cell gets a mark · mark = mark size (share of cell)
//   grain = knit: stitches run along each piece's length (wood grain), not a random angle
//   lumpy = hand-made unevenness (m, max) pushed into the shapes themselves
export const STYLES = {
  lowpoly: { label: 'Low-poly' },
  clay: { label: 'Clay', skin: true, round: 0.45, cap: 0.09, tile: 0.45, bump: 0.006, tone: 0.35, drift: 0.22, vary: 0.1, rot: 1, mix2: 1,
    cell: 0.1, prob: 0.5, mark: [0.3, 0.85], lumpy: 0.012 },
  felt: { label: 'Felt', skin: true, round: 0.45, cap: 0.1, tile: 0.2, bump: 0.003, tone: 0.8, drift: 0.14, vary: 0.08, rot: 1, mix2: 1,
    cell: 0.07, prob: 0.3, mark: [0.4, 0.95], lumpy: 0.006 },
  knit: { label: 'Knitted yarn', skin: true, round: 0.4, cap: 0.08, tile: 0.36, bump: 0.006, tone: 1.6, drift: 0.12, vary: 0.08, rot: 0.04, mix2: 0,
    cell: 1, prob: 0, mark: [1, 1], grain: true, lumpy: 0.004 },
  // PARKED (OS-4: 5.1): hidden from the list; code kept for later
  paper: { label: 'Paper-craft', kind: 5, parked: true },
  brick: { label: 'Brick-built', kind: 4, parked: true },
};

// ---------- skins: shader code added to the normal three.js materials ----------
const SKIN_VERT = `
attribute float aSeed;
#ifdef SKIN_GRAIN
attribute vec3 aGrain; attribute vec3 aGrain2;
varying vec3 vGrain; varying vec3 vGrain2;
#endif
varying vec3 vLP; varying vec3 vLN; varying float vSeed;`;
const SKIN_VERT_MAIN = `
#ifdef USE_INSTANCING
  vLP = mat3(instanceMatrix) * transformed;
  vLN = mat3(instanceMatrix) * objectNormal;
  vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  #ifdef SKIN_GRAIN
  { // grain = the block's longest side, 2nd = its middle side
    vec3 A = instanceMatrix[0].xyz, B = instanceMatrix[1].xyz, C = instanceMatrix[2].xyz, t;
    if (dot(B, B) > dot(A, A)) { t = A; A = B; B = t; }
    if (dot(C, C) > dot(A, A)) { t = A; A = C; C = t; }
    if (dot(C, C) > dot(B, B)) { t = B; B = C; C = t; }
    vGrain = normalize(A); vGrain2 = normalize(B);
  }
  #endif
#else
  vLP = transformed; vLN = objectNormal; vSeed = aSeed;
  #ifdef SKIN_GRAIN
  vGrain = aGrain; vGrain2 = aGrain2;
  #endif
#endif`;
const SKIN_FRAG = `
uniform sampler2D uSkin; uniform sampler2D uMarks;
uniform float uTile; uniform float uBump; uniform float uTone; uniform float uDriftTone; uniform float uVary; uniform float uRot;
uniform float uMix2; uniform float uCell; uniform float uProb; uniform vec2 uMark;
varying vec3 vLP; varying vec3 vLN; varying float vSeed;
#ifdef SKIN_GRAIN
varying vec3 vGrain; varying vec3 vGrain2;
#endif
float skHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 skHash2(vec2 p) { return vec2(skHash(p), skHash(p + 17.31)); }
// smooth random "value noise", computed on the spot: no picture, so it never repeats
float skNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skHash(i), skHash(i + vec2(1.0, 0.0)), f.x), mix(skHash(i + vec2(0.0, 1.0)), skHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// "Shuffled tiling": the surface is split into small triangles; each corner of a triangle takes the
// picture from a random place, and the three are blended. Neighbouring patches never match, so no
// repeat can form (stochastic texturing, after Heitz & Neyret / Mikkelsen).
vec4 skinShuffled(vec2 uv, vec2 ux, vec2 uy) {
  vec2 s = mat2(1.0, 0.0, -0.57735027, 1.15470054) * (uv * 3.4641016 * 0.55);
  vec2 b = floor(s), fr = fract(s);
  float wz = 1.0 - fr.x - fr.y;
  vec3 w; vec2 v1, v2, v3;
  if (wz > 0.0) { w = vec3(wz, fr.y, fr.x); v1 = b; v2 = b + vec2(0.0, 1.0); v3 = b + vec2(1.0, 0.0); }
  else { w = vec3(-wz, 1.0 - fr.y, 1.0 - fr.x); v1 = b + vec2(1.0); v2 = b + vec2(1.0, 0.0); v3 = b + vec2(0.0, 1.0); }
  w = w * w * w; w /= (w.x + w.y + w.z);              // sharper blend keeps the surface crisp
  vec4 c1 = textureGrad(uSkin, uv + skHash2(v1) * 7.0, ux, uy);
  vec4 c2 = textureGrad(uSkin, uv + skHash2(v2) * 7.0, ux, uy);
  vec4 c3 = textureGrad(uSkin, uv + skHash2(v3) * 7.0, ux, uy);
  return w.x * c1 + w.y * c2 + w.z * c3;
}
// The skin's "up" direction inside one projection plane (axes e1, e2).
vec2 skinDir(vec3 e1, vec3 e2) {
  float a = (vSeed - 0.5) * 6.2831 * uRot;
#ifdef SKIN_GRAIN
  vec2 g = vec2(dot(vGrain, e1), dot(vGrain, e2));
  if (dot(g, g) < 0.25) g = vec2(dot(vGrain2, e1), dot(vGrain2, e2));
  g = normalize(g + vec2(1e-5));
  float c = cos(a), s = sin(a);
  return vec2(c * g.x - s * g.y, s * g.x + c * g.y);
#else
  return vec2(sin(a), cos(a));
#endif
}
// One projection plane: returns (tone, height). All reads use explicit gradients, so the
// scattered marks have no seams and nothing depends on neighbouring pixels.
vec2 skinPlane(vec3 e1, vec3 e2, vec3 dpx, vec3 dpy, vec2 o) {
  vec2 d = skinDir(e1, e2), dp = vec2(d.y, -d.x);
  vec2 p2 = vec2(dot(vLP, e1), dot(vLP, e2));
  vec2 gx2 = vec2(dot(dpx, e1), dot(dpx, e2)), gy2 = vec2(dot(dpy, e1), dot(dpy, e2));
  vec2 q = vec2(dot(p2, dp), dot(p2, d)), qx = vec2(dot(gx2, dp), dot(gx2, d)), qy = vec2(dot(gy2, dp), dot(gy2, d));
  vec2 uv = q / uTile + o, ux = qx / uTile, uy = qy / uTile;
  vec4 a;
  if (uMix2 > 0.0) a = skinShuffled(uv, ux, uy);       // Clay, Felt: no repeat anywhere
  else a = textureGrad(uSkin, uv, ux, uy);             // Knit: stitches must line up
  // gentle, large tone drift, computed on the spot (not a picture, so it can never repeat)
  float dr = 0.65 * skNoise(q / 1.7 + o * 3.1) + 0.35 * skNoise(q / 0.6 + o.yx * 5.3);
  float tone = (a.r - 0.5) * uTone + (dr - 0.5) * 2.0 * uDriftTone;
  float h = a.g;
  if (uMix2 > 0.0) { // 2nd height layer (Felt: coarse fibers, Clay: other lumps) mixed in soft random patches
    float pn = skNoise(q / 0.35 + o * 7.7 + 11.0);
    h = mix(a.g, a.b, smoothstep(0.35, 0.65, pn) * uMix2);
  }
  if (uProb > 0.0) { // one-off marks, one dice roll per cell, each kept inside its cell
    vec2 cq = q / uCell, id = floor(cq), f = cq - id;
    vec2 cx = qx / uCell, cy = qy / uCell;
    float sd = vSeed * 37.0;
    if (skHash(id + sd) < uProb) {
      float r2 = skHash(id * 1.31 + 5.7 + sd), r3 = skHash(id * 0.71 + 2.3 + sd), r4 = skHash(id * 1.73 + 9.1 + sd);
      vec2 r56 = vec2(skHash(id * 2.1 + 1.9 + sd), skHash(id * 0.37 + 4.4 + sd));
      float sc = mix(uMark.x, uMark.y, r4);
      vec2 c = 0.5 + (r56 - 0.5) * (1.0 - sc);
      float an = r3 * 6.2831, ca = cos(an), sa = sin(an);
      mat2 M = mat2(ca, -sa, sa, ca);
      vec2 l = M * (f - c) / sc + 0.5;
      if (l.x > 0.0 && l.y > 0.0 && l.x < 1.0 && l.y < 1.0) {
        float slot = floor(r2 * 16.0);
        vec2 uvm = (vec2(mod(slot, 4.0), floor(slot / 4.0)) + l) * 0.25;
        vec4 m = textureGrad(uMarks, uvm, M * cx / (sc * 4.0), M * cy / (sc * 4.0));
        tone += (m.r - 0.5) * 2.0;
        h += (m.g - 0.5) * 1.6;
      }
    }
  }
  return vec2(tone, h);
}
vec2 skinSample(vec3 n) {
  vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z);
  vec3 dpx = dFdx(vLP), dpy = dFdy(vLP);
  vec2 o = vec2(vSeed * 17.3, fract(vSeed * 91.7) * 5.1);
  vec2 s = vec2(0.0);
  if (w.x > 0.01) s += w.x * skinPlane(vec3(0, 0, 1), vec3(0, 1, 0), dpx, dpy, o);
  if (w.y > 0.01) s += w.y * skinPlane(vec3(1, 0, 0), vec3(0, 0, 1), dpx, dpy, o.yx);
  if (w.z > 0.01) s += w.z * skinPlane(vec3(1, 0, 0), vec3(0, 1, 0), dpx, dpy, o * 1.3);
  return s;
}
vec3 skinBump(vec3 sp, vec3 sn, float h, float faceDir) {
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, sn), R2 = cross(sn, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * R1 + dFdy(h) * R2);
  return normalize(abs(det) * sn - grad);
}`;

function addSkin(material, style, uniforms) {
  if (STYLES[style].grain) material.defines = { ...(material.defines || {}), SKIN_GRAIN: '' };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + SKIN_VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 sk = skinSample(normalize(vLN));
  vec3 hs = fract(vec3(vSeed * 13.7, vSeed * 71.3, vSeed * 29.1));
  vec3 tintv = vec3(1.0 + (hs.x - 0.5) * uVary) + (hs.yzx - 0.5) * uVary * 0.4;
  diffuseColor.rgb *= tintv * max(0.2, 1.0 + sk.x);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = skinBump(-vViewPosition, normal, sk.y * uBump, faceDirection);`);
  };
  material.customProgramCacheKey = () => 'objectsleuth-skin3-' + style;
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
    const sk = skin(style);
    skinUniforms[style] = {
      uSkin: { value: sk.base }, uMarks: { value: sk.marks },
      uTile: { value: S.tile }, uBump: { value: S.bump }, uTone: { value: S.tone }, uDriftTone: { value: S.drift },
      uVary: { value: S.vary }, uRot: { value: S.rot }, uMix2: { value: S.mix2 },
      uCell: { value: S.cell }, uProb: { value: S.prob }, uMark: { value: new THREE.Vector2(...S.mark) },
    };
  }
  return skinUniforms[style];
}
// Same skin at another size (small imported objects need finer stitches / fibres): only the
// pattern size and relief change; textures are shared.
function scaledUniforms(style, k) {
  if (k === 1) return uniformsFor(style);
  const key = style + "@" + k.toFixed(3);
  if (!skinUniforms[key]) {
    const u = uniformsFor(style);
    skinUniforms[key] = { ...u, uTile: { value: u.uTile.value * k }, uBump: { value: u.uBump.value * k } };
  }
  return skinUniforms[key];
}

function makeMaterial(orig, style, k = 1) {
  const S = STYLES[style];
  if (S.skin) {
    const m = makeBase(orig, style);
    addSkin(m, style, scaledUniforms(style, k));
    return m;
  }
  const m = makeBase(orig, style);
  addPattern(m, S.kind);
  return m;
}

function makeBase(orig, style) {
  const color = tint(orig.color, style);
  const base = {
    color, map: orig.map, side: orig.side, bumpMap: orig.bumpMap, bumpScale: orig.bumpScale, // (rug relief)
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
  // opts.scale: pattern size factor in the meshes' own units (1 = room-sized pieces)
  constructor(root, keep = [], opts = {}) {
    this.scale = opts.scale ?? 1;
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
    if (!this.mats.has(key)) this.mats.set(key, makeMaterial(orig, style, STYLES[style].skin && style !== 'clay' ? this.scale : 1));
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
      const r = Math.min(S.cap, (o.userData.roundMin ?? Math.min(w, h, d)) * S.round); // (roundMin: size before it was sunk into floor/wall)
      g = r < 0.002 ? orig.clone() : new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) > 0.5 ? 2 : 1, r);
    } else {
      g = orig.clone();
    }
    o.updateWorldMatrix(true, false);
    const pos = g.attributes.position, v = new THREE.Vector3();
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    const amp = Math.min(S.lumpy, Math.max(0.0005, (o.userData.roundMin ?? Math.min(size.x, size.y, size.z)) * 0.12));
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
    // Grain (knit): the piece's longest side, unless the Scene says otherwise (userData.grain = 'x' | 'y' | 'z').
    const dims = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    const want = o.userData.grain;
    const first = want || dims[0], second = dims.find((d) => d !== first);
    const axis = (n) => ({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] })[n];
    const fill = (v) => { const a = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) a.set(v, i * 3); return a; };
    g.setAttribute('aGrain', new THREE.BufferAttribute(fill(axis(first)), 3));
    g.setAttribute('aGrain2', new THREE.BufferAttribute(fill(axis(second)), 3));
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
