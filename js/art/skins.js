// "Skins" v2: surface pictures baked once in code (no image files) and wrapped onto each object.
//
// Each style has three baked pictures:
//   base  – the fine, even surface (lumps, fibers, stitches). Seamless. R = tone, G = height, B = 2nd height layer.
//   marks – an "atlas" of 16 separate one-off marks (thumbprints, scrapes, pills, loose strands…),
//           4 × 4 slots. The shader scatters them one at a time with dice rolls, so nothing repeats.
//   drift – (shared) very soft, large blotches for gentle tone drift across big surfaces.
// Value 0.5 = "no change" in every channel.
import * as THREE from '../../vendor/three/three.module.js';
import { rng } from '../core/random.js';

// Seamless (wrap-around) smooth noise.
function periodicNoise(r, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

// Fills `out` (N×N) with fractal noise 0..1. freq = blobs across the tile.
function fbm(r, N, freq, octaves, out) {
  const layers = [];
  let f = freq, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) { layers.push({ n: periodicNoise(r, f), f, amp }); total += amp; f *= 2; amp *= 0.5; }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (const L of layers) s += L.amp * L.n((x / N) * L.f, (y / N) * L.f);
      out[y * N + x] = s / total;
    }
  }
  return out;
}

// Stamps a feature into an N×N map, wrapping around the edges.
function stamp(N, cx, cy, rad, fn) {
  const R = Math.ceil(rad);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = ((Math.round(cx) + dx) % N + N) % N, y = ((Math.round(cy) + dy) % N + N) % N;
      fn(y * N + x, dx + Math.round(cx) - cx, dy + Math.round(cy) - cy);
    }
  }
}

// Points along a wandering path (tool marks, cracks, loose fibers).
function wander(r, x, y, a, steps, stepLen, turn) {
  const pts = [[x, y]];
  for (let s = 0; s < steps; s++) { a += (r() - 0.5) * turn; x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen; pts.push([x, y]); }
  return pts;
}

// Runs fn(i, distance, t-along-path) for every pixel within `width` of a path.
function alongPath(N, pts, width, fn) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const px = ax + (bx - ax) * (s / steps), py = ay + (by - ay) * (s / steps);
      const t = (run + len * (s / steps)) / total;
      stamp(N, px, py, width + 1, (k, dx, dy) => {
        const d = Math.hypot(dx, dy);
        if (d <= width) fn(k, d / width, t);
      });
    }
    run += len;
  }
}

function toTexture(N, R, G, B) {
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.max(0, Math.min(255, R[i] * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, G[i] * 255));
    data[i * 4 + 2] = Math.max(0, Math.min(255, (B ? B[i] : 0.5) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Builds a 4 × 4 atlas of one-off marks. draw(k, r, T, H, S) paints slot k into S×S maps
// (0.5 = neutral). Each slot fades to neutral at its border, so marks never show a box edge.
function atlas(seed, S, draw) {
  const N = S * 4, r = rng(seed);
  const T = new Float32Array(N * N).fill(0.5), H = new Float32Array(N * N).fill(0.5);
  for (let k = 0; k < 16; k++) {
    const t = new Float32Array(S * S).fill(0.5), h = new Float32Array(S * S).fill(0.5);
    draw(k, r, t, h, S);
    const ox = (k % 4) * S, oy = Math.floor(k / 4) * S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const e = Math.min(x, y, S - 1 - x, S - 1 - y);
        const win = Math.min(1, Math.max(0, (e - 3) / 10));       // soft fade near the slot border
        const i = y * S + x, j = (oy + y) * N + ox + x;
        T[j] = 0.5 + (t[i] - 0.5) * win;
        H[j] = 0.5 + (h[i] - 0.5) * win;
      }
    }
  }
  const tex = toTexture(N, T, H);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------- shared: gentle large-scale drift ----------
function bakeDrift() {
  const N = 128, r = rng(7100);
  const A = fbm(r, N, 2, 3, new Float32Array(N * N));
  const B = fbm(r, N, 3, 3, new Float32Array(N * N));
  return toTexture(N, A, B);
}

// ---------- CLAY ----------
function bakeClayBase() {
  const N = 512, r = rng(7001);
  const T = fbm(r, N, 6, 4, new Float32Array(N * N));
  const G = fbm(r, N, 7, 5, new Float32Array(N * N));     // soft lumps
  const B = fbm(r, N, 11, 5, new Float32Array(N * N));    // a second lump layer (mixed in patches)
  for (let i = 0; i < N * N; i++) { T[i] = 0.5 + (T[i] - 0.5) * 0.6; G[i] = 0.5 + (G[i] - 0.5) * 0.9; B[i] = 0.5 + (B[i] - 0.5) * 0.9; }
  return toTexture(N, T, G, B);
}

function bakeClayMarks() {
  return atlas(7002, 128, (k, r, T, H, S) => {
    const c = S / 2;
    if (k < 4) { // thumbprint: oval hollow, whorl ridges, a slightly pushed-up rim
      const rad = 34 + r() * 16, ang = r() * Math.PI, sq = 0.62 + r() * 0.22, ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = (r() - 0.5) * 0.5, oy = (r() - 0.5) * 0.5, freq = 0.75 + r() * 0.25;
      stamp(S, c, c, rad * 1.25, (i, dx, dy) => {
        const u = dx * ca + dy * sa, v = (-dx * sa + dy * ca) / sq, d = Math.hypot(u, v) / rad;
        if (d >= 1.2) return;
        const bowl = d < 1 ? (1 - d * d) ** 2 : 0, rim = Math.exp(-(((d - 1.03) / 0.09) ** 2));
        const whorl = Math.sin(Math.hypot(u / rad + ox, v / rad + oy) * rad * freq);
        H[i] += -0.2 * bowl + 0.06 * rim + 0.035 * bowl * whorl;
        T[i] -= 0.025 * bowl;
      });
    } else if (k < 7) { // a few small dents
      const n = 1 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) {
        const x = c + (r() - 0.5) * 60, y = c + (r() - 0.5) * 60, rad = 5 + r() * 11;
        stamp(S, x, y, rad, (i, dx, dy) => {
          const d = Math.hypot(dx, dy) / rad;
          if (d < 1) { H[i] -= 0.2 * (1 - d * d) ** 2; T[i] -= 0.015 * (1 - d); }
        });
      }
    } else if (k < 10) { // tool scrape: curved groove with a raised lip and faint tooth lines
      const a = r() * Math.PI * 2, L = 70 + r() * 30, steps = Math.ceil(L / 8);
      const pts = wander(r, c - Math.cos(a) * L / 2, c - Math.sin(a) * L / 2, a, steps, 8, 0.3);
      const w = 3 + r() * 2.5;
      alongPath(S, pts, w * 1.8, (i, d, t) => {
        const fade = Math.sin(Math.PI * t) ** 0.5;
        const groove = d < 0.55 ? (1 - d / 0.55) : 0, lip = Math.exp(-(((d - 0.75) / 0.15) ** 2));
        H[i] = Math.min(H[i], 0.5 - 0.16 * groove * fade) + 0.04 * lip * fade;
        if (groove > 0) H[i] += 0.02 * Math.sin(d * 18) * fade;
      });
    } else if (k < 13) { // hairline crack: thin, wandering, a little darker, sometimes a branch
      const a = r() * Math.PI * 2, steps = 10 + Math.floor(r() * 8);
      const pts = wander(r, c - Math.cos(a) * 40, c - Math.sin(a) * 40, a, steps, 5.5, 1.0);
      const crack = (p, w) => alongPath(S, p, w, (i, d, t) => {
        const fade = Math.min(1, Math.sin(Math.PI * t) * 2);
        H[i] = Math.min(H[i], 0.5 - 0.22 * (1 - d) * fade);
        T[i] = Math.min(T[i], 0.5 - 0.11 * (1 - d) * fade);
      });
      crack(pts, 1.2 + r() * 0.4);
      if (r() < 0.6) { const m = pts[Math.floor(pts.length / 2)]; crack(wander(r, m[0], m[1], a + 1.2, 5, 5, 1.0), 0.9); }
    } else { // smear: a long shallow press with clay pushed up on one side
      const a = r() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), len = 30 + r() * 18, wid = 10 + r() * 6;
      stamp(S, c, c, len + 8, (i, dx, dy) => {
        const u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca) / wid;
        const e = u * u + v * v;
        if (e < 1) H[i] -= 0.12 * (1 - e) ** 2;
        const ridge = Math.exp(-(((v - 1.15) / 0.3) ** 2)) * Math.max(0, 1 - u * u);
        H[i] += 0.07 * ridge;
      });
    }
  });
}

// ---------- FELT ----------
function fiber(N, r, T, H, x, y, len, w, lift, tone) {
  const a = r() * Math.PI * 2, bend = (r() - 0.5) * 0.35, steps = Math.max(1, Math.ceil(len / 2.5));
  const pts = wander(r, x, y, a, steps, 2.5, bend);
  alongPath(N, pts, w, (i, d) => {
    H[i] = Math.max(H[i], 0.35 + lift * (1 - d));
    if (tone) T[i] += tone * (1 - d);
  });
}

function bakeFeltBase() {
  const N = 512, r = rng(7003);
  const D = fbm(r, N, 5, 3, new Float32Array(N * N));
  const T = fbm(r, N, 4, 3, new Float32Array(N * N));
  for (let i = 0; i < N * N; i++) T[i] = 0.5 + (T[i] - 0.5) * 0.4;
  const G = new Float32Array(N * N).fill(0.35), B = new Float32Array(N * N).fill(0.35);
  const at = (x, y) => D[(((Math.floor(y) % N) + N) % N) * N + (((Math.floor(x) % N) + N) % N)];
  for (let k = 0; k < 16000; k++) { // fine fibers
    const x = r() * N, y = r() * N;
    if (r() > at(x, y) * 1.4) continue;
    fiber(N, r, T, G, x, y, 3 + r() * 8, 0.5 + r() * 0.7, 0.2 + r() * 0.45, 0.002);
  }
  for (let k = 0; k < 4500; k++) { // coarse fibers (a different layer, mixed in patches by the shader)
    const x = r() * N, y = r() * N;
    fiber(N, r, T, B, x, y, 8 + r() * 20, 0.9 + r() * r() * 2.2, 0.25 + r() * 0.5, 0);
  }
  return toTexture(N, T, G, B);
}

function bakeFeltMarks() {
  return atlas(7004, 128, (k, r, T, H, S) => {
    const c = S / 2;
    if (k < 6) { // pills: little balls of fuzz with a few fibers around them
      const n = 1 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const x = c + (r() - 0.5) * 40, y = c + (r() - 0.5) * 40, rad = 4 + r() * 6;
        stamp(S, x, y, rad, (i, dx, dy) => {
          const d = Math.hypot(dx, dy) / rad;
          if (d < 1) { H[i] = Math.max(H[i], 0.5 + 0.38 * Math.sqrt(1 - d * d)); T[i] += 0.03 * (1 - d); }
        });
        for (let f = 0; f < 6; f++) fiber(S, r, T, H, x + (r() - 0.5) * rad * 2, y + (r() - 0.5) * rad * 2, 6 + r() * 8, 0.6, 0.18, 0.004);
      }
    } else if (k < 11) { // a loose, curly strand lying on top
      const a = r() * Math.PI * 2, steps = 22 + Math.floor(r() * 14);
      const pts = wander(r, c - Math.cos(a) * 42, c - Math.sin(a) * 42, a, steps, 3.6, 0.7);
      const w = 0.9 + r() * 0.8;
      alongPath(S, pts, w, (i, d) => { H[i] = Math.max(H[i], 0.5 + 0.32 * (1 - d)); T[i] += 0.012 * (1 - d); });
    } else if (k < 14) { // a dense clump of short fibers
      const rad = 22 + r() * 12;
      for (let f = 0; f < 70; f++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
        fiber(S, r, T, H, c + Math.cos(a) * d, c + Math.sin(a) * d, 4 + r() * 8, 0.6 + r() * 0.6, 0.2 + r() * 0.2, 0.002);
      }
    } else { // a thin, worn spot
      const rad = 24 + r() * 14;
      stamp(S, c, c, rad, (i, dx, dy) => {
        const d = Math.hypot(dx, dy) / rad;
        if (d < 1) { const k2 = (1 - d * d) ** 2; H[i] -= 0.14 * k2; T[i] -= 0.035 * k2; }
      });
    }
  });
}

// ---------- KNIT: columns of V-shaped stitches made of two plump yarn legs ----------
function bakeKnit() {
  const N = 512, r = rng(7005), COLS = 8, ROWS = 10;
  const F = fbm(r, N, 64, 2, new Float32Array(N * N));     // yarn fuzz
  const T = new Float32Array(N * N), H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = (x / N) * COLS, cy = (y / N) * ROWS;
      const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
      const left = fx < 0.5, lx = left ? fx * 2 : (1 - fx) * 2;        // 0 at column edge, 1 at center
      const leanY = fy + (left ? -fx : fx - 1) * 1.1;                  // slanted leg
      const lean = leanY - Math.floor(leanY);
      const legAcross = Math.sin(Math.PI * lean);                      // round across the yarn
      const legAlong = Math.sin(Math.PI * Math.min(1, lx * 1.05));     // round along the leg
      const twist = 0.5 + 0.5 * Math.sin((lean * 3 + lx * 2) * Math.PI); // yarn ply
      const h = Math.max(0, legAcross) ** 0.7 * (0.55 + 0.45 * legAlong) * (0.88 + 0.12 * twist);
      const i = y * N + x;
      H[i] = 0.15 + 0.75 * h + 0.1 * (F[i] - 0.5);
      T[i] = 0.5 + 0.22 * (h - 0.6) + 0.06 * (F[i] - 0.5);
    }
  }
  return toTexture(N, T, H, H);
}

function neutral() {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

const BAKERS = {
  clay: () => ({ base: bakeClayBase(), marks: bakeClayMarks() }),
  felt: () => ({ base: bakeFeltBase(), marks: bakeFeltMarks() }),
  knit: () => ({ base: bakeKnit(), marks: neutral() }),
};
const cache = {};
let drift = null;
export function skin(style) {
  if (!cache[style] && BAKERS[style]) cache[style] = BAKERS[style]();
  return cache[style];
}
export function driftTexture() {
  if (!drift) drift = bakeDrift();
  return drift;
}
