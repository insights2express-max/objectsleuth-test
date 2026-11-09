// v16 WALL ART in imported frames (OS-25: 8, OS-32: 2.1). The frame's own picture is replaced by one
// drawn here: an insect collection, a stamp collection (a Target Object may appear as one of its stamps)
// or an old photograph. Works with any imported frame: the picture is fitted to the part of the model
// whose material is named "artwork" / "canvas".
import * as THREE from '../../vendor/three/three.module.js';
import { rng } from '../core/random.js';
import { painting, brushTexture } from './study.js';

export function makePicture(fx, kind, group) {
  if (group.userData.picture) return group.userData.picture;
  let art = null;
  group.traverse((o) => {
    const m = o.isMesh && (o.userData.orig ? o.userData.orig.m : o.material);
    if (!art && m && /artwork|canvas/i.test(m.name || '')) art = o;
  });
  if (!art) return null;
  group.updateMatrixWorld(true);
  const uv = art.geometry.attributes.uv, pos = art.geometry.attributes.position;
  if (!uv) return null;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < uv.count; i++) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i)); }
  const size = new THREE.Box3().setFromObject(art).getSize(new THREE.Vector3());
  const wM = Math.max(size.x, size.z), hM = size.y;
  const W = kind === 'photo' ? 300 : 640, Hc = Math.max(64, Math.round(W * hM / wM));
  const draw = kind === 'stamps' ? drawStamps : kind === 'insects' ? drawInsects : drawPhoto;
  const p = painting(W, Hc, draw, []);
  p.tex.flipY = false;                                   // (model pictures: v runs downwards)
  p.tex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0));
  p.tex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0));
  p.tex.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: p.tex, roughness: 0.9 });
  m.name = 'picture';
  if (art.userData.orig) art.userData.orig.m = m;
  art.material = m;
  // picture point (u, v: 0–1, v downwards) → room position: an exact fit through three corners of its surface
  let A = 0, B = 0, Cc = 0;
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i), y = uv.getY(i);
    if (x + y < uv.getX(A) + uv.getY(A)) A = i;
    if (x - y > uv.getX(B) - uv.getY(B)) B = i;
    if (y - x > uv.getY(Cc) - uv.getX(Cc)) Cc = i;
  }
  const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);
  const du1 = uv.getX(B) - uv.getX(A), dv1 = uv.getY(B) - uv.getY(A), du2 = uv.getX(Cc) - uv.getX(A), dv2 = uv.getY(Cc) - uv.getY(A);
  const dP1 = P(B).sub(P(A)), dP2 = P(Cc).sub(P(A)), det = du1 * dv2 - du2 * dv1 || 1e-6;
  const X = dP1.clone().multiplyScalar(dv2).sub(dP2.clone().multiplyScalar(dv1)).divideScalar(det);
  const Y = dP2.clone().multiplyScalar(du1).sub(dP1.clone().multiplyScalar(du2)).divideScalar(det);
  const toWorld = (u, v) => {
    const uu = u0 + u * (u1 - u0) - uv.getX(A), vv = v0 + v * (v1 - v0) - uv.getY(A);
    return P(A).addScaledVector(X, uu).addScaledVector(Y, vv).applyMatrix4(art.matrixWorld);
  };
  const uvOf = (h) => ({ x: (h.x - u0) / (u1 - u0), y: (h.y - v0) / (v1 - v0) });
  const rec = { ...p, id: kind, kind, mesh: art, wM, hM, uvDown: true, toWorld, uvOf, cells: p.canvas.cells || [] };
  group.userData.picture = rec;
  if (kind === 'stamps') fx.paintings.push(rec);
  return rec;
}

// an album page of stamps (4 × 3); the plain ones may carry a Target Object's picture
function drawStamps(c, w, h) {
  const r = rng(0x57a3);
  c.fillStyle = '#efe6cf'; c.fillRect(0, 0, w, h);
  const cols = 4, rows = 3, cw = w / cols, ch = h / rows, cells = [];
  const inks = ['#9c3b32', '#2f5a86', '#3f7a4a', '#7a4a8a', '#b07a2a', '#2a6a6a'];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw + cw * 0.12, y = j * ch + ch * 0.12, sw = cw * 0.76, sh = ch * 0.76;
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 3, y + 3, sw, sh);
    c.fillStyle = '#fbf7ec'; c.fillRect(x, y, sw, sh);
    c.fillStyle = '#efe6cf';                                               // perforations
    for (let k = 0; k <= 10; k++) {
      for (const [px, py] of [[x + (k / 10) * sw, y], [x + (k / 10) * sw, y + sh], [x, y + (k / 10) * sh], [x + sw, y + (k / 10) * sh]]) { c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fill(); }
    }
    const ink = inks[Math.floor(r() * inks.length)];
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(x + 8, y + 8, sw - 16, sh - 16);
    c.fillStyle = ink; c.font = `bold ${Math.round(sh * 0.16)}px serif`; c.fillText(String([1, 2, 3, 5, 6, 9][Math.floor(r() * 6)]) + (r() < 0.5 ? 'd' : 'c'), x + 12, y + sh - 12);
    const blank = r() < 0.6;
    if (!blank) { // a simple motif: a crown, a sail or a cameo
      c.fillStyle = ink; c.globalAlpha = 0.8;
      const mx = x + sw / 2, my = y + sh * 0.45, s = sh * 0.22;
      const t = Math.floor(r() * 3);
      c.beginPath();
      if (t === 0) { c.moveTo(mx - s, my + s * 0.5); c.lineTo(mx - s, my - s * 0.3); c.lineTo(mx - s * 0.5, my); c.lineTo(mx, my - s * 0.6); c.lineTo(mx + s * 0.5, my); c.lineTo(mx + s, my - s * 0.3); c.lineTo(mx + s, my + s * 0.5); }
      else if (t === 1) { c.moveTo(mx - s * 0.1, my - s); c.lineTo(mx + s * 0.7, my + s * 0.4); c.lineTo(mx - s * 0.1, my + s * 0.4); c.moveTo(mx - s, my + s * 0.55); c.lineTo(mx + s, my + s * 0.55); c.lineTo(mx + s * 0.6, my + s * 0.9); c.lineTo(mx - s * 0.6, my + s * 0.9); }
      else c.ellipse(mx, my, s * 0.7, s * 0.9, 0, 0, Math.PI * 2);
      c.fill(); c.globalAlpha = 1;
    } else cells.push({ u: (x + sw / 2) / w, v: (y + sh * 0.45) / h, size: (sw * 0.55) / w });
  }
  c.canvas.cells = cells;
  brushTexture(c, w, h, 0x11f3);
}
// a cased insect collection: beetles and butterflies pinned in rows, with labels
function drawInsects(c, w, h) {
  const r = rng(0x1ec7);
  c.fillStyle = '#e9e2d0'; c.fillRect(0, 0, w, h);
  const cols = 4, rows = 3;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * w / cols, y = (j + 0.45) * h / rows, s = Math.min(w / cols, h / rows) * 0.28;
    const hue = ['#2d4a2a', '#5a2a1a', '#1d2a4a', '#8a6a1a', '#3a1a3a'][Math.floor(r() * 5)];
    c.save(); c.translate(x, y); c.rotate((r() - 0.5) * 0.2);
    if (r() < 0.45) { // butterfly
      c.fillStyle = ['#d9873a', '#3a6ab0', '#e0c04a', '#b04a3a'][Math.floor(r() * 4)];
      for (const sx of [-1, 1]) {
        c.beginPath(); c.ellipse(sx * s * 0.55, -s * 0.2, s * 0.6, s * 0.45, sx * 0.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(sx * s * 0.4, s * 0.4, s * 0.35, s * 0.3, -sx * 0.4, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#222'; c.fillRect(-s * 0.06, -s * 0.6, s * 0.12, s * 1.1);
    } else { // beetle
      c.fillStyle = hue; c.beginPath(); c.ellipse(0, s * 0.15, s * 0.45, s * 0.65, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0, -s * 0.6, s * 0.25, s * 0.2, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = hue; c.lineWidth = 2;
      for (const sx of [-1, 1]) for (const k of [-0.2, 0.15, 0.5]) { c.beginPath(); c.moveTo(sx * s * 0.4, k * s); c.lineTo(sx * s * 0.8, k * s + s * 0.25); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.moveTo(0, -s * 0.4); c.lineTo(0, s * 0.75); c.stroke();
    }
    c.restore();
    c.fillStyle = '#c33'; c.beginPath(); c.arc(x, y - 2, 2.5, 0, Math.PI * 2); c.fill();          // the pin
    c.fillStyle = '#fff'; c.fillRect(x - s * 0.7, y + s * 1.05, s * 1.4, s * 0.32);
    c.fillStyle = '#555'; c.fillRect(x - s * 0.55, y + s * 1.17, s * 1.1, 2);
  }
  brushTexture(c, w, h, 0x2b17);
}
// an old sepia photograph: a house behind a garden
function drawPhoto(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#d9c7a4'); g.addColorStop(1, '#a8916a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#7a6448'; c.fillRect(w * 0.18, h * 0.42, w * 0.64, h * 0.38);
  c.beginPath(); c.moveTo(w * 0.12, h * 0.44); c.lineTo(w * 0.5, h * 0.2); c.lineTo(w * 0.88, h * 0.44); c.fill();
  c.fillStyle = '#e8dcc0';
  for (const x of [0.26, 0.44, 0.62]) c.fillRect(w * x, h * 0.5, w * 0.1, h * 0.1);
  c.fillStyle = '#5a4630'; c.fillRect(w * 0.47, h * 0.64, w * 0.08, h * 0.16);
  c.fillStyle = '#6a5a40'; c.fillRect(0, h * 0.8, w, h * 0.2);
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
  brushTexture(c, w, h, 0x9a1f);
}
