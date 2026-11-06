// "Skins": surface pictures baked once in code (no image files) and wrapped onto each object.
// Every skin tiles seamlessly. Channels: R = tone (0.5 = no change), G = height (relief), B = unused.
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

// Stamps a feature into the map, wrapping around the tile edges.
function stamp(N, cx, cy, rad, fn) {
  const R = Math.ceil(rad);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = ((Math.round(cx) + dx) % N + N) % N, y = ((Math.round(cy) + dy) % N + N) % N;
      fn(y * N + x, dx + Math.round(cx) - cx, dy + Math.round(cy) - cy);
    }
  }
}

// A groove along a path of points (tool marks, cracks).
function groove(N, pts, width, depth, H, T, darken) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len);
    for (let s = 0; s <= steps; s++) {
      const px = ax + (bx - ax) * (s / steps), py = ay + (by - ay) * (s / steps);
      stamp(N, px, py, width + 1, (i2, dx, dy) => {
        const d = Math.hypot(dx, dy);
        if (d > width) return;
        const k = 1 - d / width;
        H[i2] = Math.min(H[i2], 0.5 - depth * k);
        if (darken) T[i2] = Math.min(T[i2], 0.5 - darken * k);
      });
    }
  }
}

function toTexture(N, T, H) {
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.max(0, Math.min(255, T[i] * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, H[i] * 255));
    data[i * 4 + 2] = 128;
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

// ---------- CLAY: lumps, tonal blotches, thumbprints, dents, tool marks, hairline cracks ----------
function bakeClay() {
  const N = 1024, r = rng(7001);
  const T = fbm(r, N, 5, 4, new Float32Array(N * N));      // slow tone drift
  const L = fbm(r, N, 9, 5, new Float32Array(N * N));      // lumps
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { T[i] = 0.5 + (T[i] - 0.5) * 0.9; H[i] = 0.5 + (L[i] - 0.5) * 0.9; }
  // thumbprints: shallow oval hollows with faint ridges
  for (let k = 0; k < 9; k++) {
    const cx = r() * N, cy = r() * N, rad = 22 + r() * 22, ang = r() * Math.PI, sq = 0.6 + r() * 0.25;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    stamp(N, cx, cy, rad, (i, dx, dy) => {
      const u = dx * ca + dy * sa, v = (-dx * sa + dy * ca) / sq, d = Math.hypot(u, v) / rad;
      if (d >= 1) return;
      const bowl = (1 - d * d) ** 2;
      H[i] -= 0.22 * bowl - 0.05 * bowl * Math.sin(d * rad * 0.9);
      T[i] -= 0.03 * bowl;
    });
  }
  // small dents
  for (let k = 0; k < 40; k++) {
    const cx = r() * N, cy = r() * N, rad = 3 + r() * 8;
    stamp(N, cx, cy, rad, (i, dx, dy) => {
      const d = Math.hypot(dx, dy) / rad;
      if (d < 1) H[i] -= 0.18 * (1 - d * d) ** 2;
    });
  }
  // tool marks: short, slightly curved scrapes
  for (let k = 0; k < 10; k++) {
    let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
    const pts = [[x, y]], n = 6 + Math.floor(r() * 10);
    for (let s = 0; s < n; s++) { a += (r() - 0.5) * 0.25; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
    groove(N, pts, 2.2, 0.12, H, T, 0);
  }
  // hairline cracks: thin, wandering, slightly darker
  for (let k = 0; k < 5; k++) {
    let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
    const pts = [[x, y]], n = 8 + Math.floor(r() * 14);
    for (let s = 0; s < n; s++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    groove(N, pts, 1.1, 0.2, H, T, 0.12);
  }
  return toTexture(N, T, H);
}

// ---------- FELT: fibers of random length, thickness and density ----------
function bakeFelt() {
  const N = 512, r = rng(7002);
  const D = fbm(r, N, 6, 3, new Float32Array(N * N));      // patchy density
  const T = fbm(r, N, 4, 3, new Float32Array(N * N));
  const H = new Float32Array(N * N).fill(0.35);
  for (let i = 0; i < N * N; i++) T[i] = 0.5 + (T[i] - 0.5) * 0.5;
  for (let k = 0; k < 9000; k++) {
    const cx = r() * N, cy = r() * N, dens = D[(Math.floor(cy) % N) * N + (Math.floor(cx) % N)];
    if (r() > dens * 1.3) continue;                           // sparser in some patches
    const len = 4 + r() * 18, w = 0.6 + r() * r() * 2.2, a = r() * Math.PI * 2, bend = (r() - 0.5) * 0.3;
    let x = cx, y = cy, ang = a;
    const pts = [[x, y]];
    for (let s = 0; s < len; s += 3) { ang += bend; x += Math.cos(ang) * 3; y += Math.sin(ang) * 3; pts.push([x, y]); }
    const lift = 0.25 + r() * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      for (let s = 0; s <= 3; s++) {
        stamp(N, ax + (bx - ax) * s / 3, ay + (by - ay) * s / 3, w + 1, (i2, dx, dy) => {
          const d = Math.hypot(dx, dy);
          if (d <= w) { H[i2] = Math.max(H[i2], 0.35 + lift * (1 - d / (w + 0.01))); T[i2] += 0.004; }
        });
      }
    }
  }
  return toTexture(N, T, H);
}

// ---------- KNIT: columns of V-shaped stitches made of two plump yarn legs ----------
function bakeKnit() {
  const N = 512, r = rng(7003), COLS = 8, ROWS = 10;
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
  return toTexture(N, T, H);
}

const BAKERS = { clay: bakeClay, felt: bakeFelt, knit: bakeKnit };
const cache = {};
export function skin(style) {
  if (!cache[style] && BAKERS[style]) cache[style] = BAKERS[style]();
  return cache[style];
}
