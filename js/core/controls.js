// Camera controls for the diorama view: pan (drag), zoom (pinch / mouse wheel / double-tap),
// with gentle "flick" momentum. The view can never be panned beyond the room itself.
import * as THREE from '../../vendor/three/three.module.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class ViewControls {
  constructor(camera, el, { maxZoom = 20 } = {}) {
    this.cam = camera;
    this.el = el;
    this.minZoom = 1;
    this.maxZoom = maxZoom;
    this.zoom = 1;
    this.u = 0; // pan offset, sideways (world units)
    this.v = 0; // pan offset, up/down (world units)
    this.home = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.contentW = 10; this.contentH = 10; this.W = 10; this.H = 10;
    this.pointers = new Map();
    this.pinch = null;
    this.multi = false;
    this.vel = { x: 0, y: 0 };
    this.lastMove = 0;
    this.anim = null;
    this.lastTap = null;
    this.onTap = null;     // set by the game (from M2: "did the player tap a hidden object?")
    this.onChange = null;
    // v14: screen space covered by an on-screen panel (px); the room is framed in the rest
    this.pad = { left: 0, right: 0, top: 0, bottom: 0 };

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up_(e));
    el.addEventListener('pointercancel', (e) => this.up_(e, true));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Stop iPad Safari from zooming the whole page instead of the scene.
    ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  }

  // Where the camera looks from (direction) and at (target).
  setView(target, direction, distance) {
    this.target0 = target.clone();
    this.dir = direction.clone().normalize();
    this.dist = distance;
  }

  // Frame a 3D box (the room) so it exactly fills the screen at zoom 1.
  fit(box3) {
    const cam = this.cam;
    cam.position.copy(this.target0).addScaledVector(this.dir, this.dist);
    cam.lookAt(this.target0);
    cam.updateMatrixWorld();
    this.right.setFromMatrixColumn(cam.matrixWorld, 0);
    this.up.setFromMatrixColumn(cam.matrixWorld, 1);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z);
      p.sub(this.target0);
      const x = p.dot(this.right), y = p.dot(this.up);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    this.home.copy(cam.position)
      .addScaledVector(this.right, (minX + maxX) / 2)
      .addScaledVector(this.up, (minY + maxY) / 2);
    this.contentW = (maxX - minX) * 1.06;
    this.contentH = (maxY - minY) * 1.06;
    this.resize();
  }

  // The visible part of the screen (minus any panel), in px.
  visibleRect() {
    const r = this.el.getBoundingClientRect(), p = this.pad;
    const w = Math.max(80, r.width - p.left - p.right), h = Math.max(80, r.height - p.top - p.bottom);
    return { r, w, h, x0: r.left + p.left, y0: r.top + p.top };
  }

  resize() {
    const { r, w, h } = this.visibleRect(), p = this.pad;
    const aspect = w / h || 1;
    let W = this.contentW, H = this.contentH;
    if (W / H < aspect) W = H * aspect; else H = W / aspect;
    this.W = W; this.H = H;                       // world size of the VISIBLE part at zoom 1
    const k = W / w;                              // world units per pixel at zoom 1
    // the frustum covers the whole screen, but is centred on the visible part
    Object.assign(this.cam, { left: -W / 2 - p.left * k, right: W / 2 + p.right * k, top: H / 2 + p.top * k, bottom: -H / 2 - p.bottom * k });
    this.apply();
  }

  apply() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    const mu = Math.max(0, this.contentW / 2 - this.W / (2 * this.zoom));
    const mv = Math.max(0, this.contentH / 2 - this.H / (2 * this.zoom));
    this.u = clamp(this.u, -mu, mu);
    this.v = clamp(this.v, -mv, mv);
    this.cam.position.copy(this.home).addScaledVector(this.right, this.u).addScaledVector(this.up, this.v);
    this.cam.zoom = this.zoom;
    this.cam.updateProjectionMatrix();
    if (this.onChange) this.onChange(this);
  }

  // Screen point -> offset from screen centre, in world units at the current zoom.
  toView(cx, cy) {
    const { w, h, x0, y0 } = this.visibleRect();
    return {
      x: ((cx - x0) / w - 0.5) * this.W / this.zoom,
      y: (0.5 - (cy - y0) / h) * this.H / this.zoom,
    };
  }

  // Zoom while keeping the point under the finger/cursor fixed in place.
  zoomAt(z, cx, cy) {
    const a = this.toView(cx, cy);
    this.zoom = clamp(z, this.minZoom, this.maxZoom);
    const b = this.toView(cx, cy);
    this.u += a.x - b.x;
    this.v += a.y - b.y;
    this.apply();
  }

  panBy(dx, dy) {
    const { w, h } = this.visibleRect();
    this.u -= (dx / w) * this.W / this.zoom;
    this.v += (dy / h) * this.H / this.zoom;
    this.apply();
  }

  centre() {
    const { w, h, x0, y0 } = this.visibleRect();
    return { x: x0 + w / 2, y: y0 + h / 2 };
  }

  // Smooth (animated) zoom – used by buttons and double-tap.
  zoomTo(z, cx, cy) {
    if (cx === undefined) ({ x: cx, y: cy } = this.centre());
    this.anim = { to: clamp(z, this.minZoom, this.maxZoom), cx, cy };
  }
  // Centre the view on a 3D point at a given zoom (later used by the "Find Object" hint).
  focusOn(point, zoom) {
    const d = point.clone().sub(this.home);
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.u = d.dot(this.right);
    this.v = d.dot(this.up);
    this.apply();
  }
  zoomBy(f) { this.zoomTo((this.anim ? this.anim.to : this.zoom) * f); }
  reset() { this.vel.x = this.vel.y = 0; this.zoomTo(1); }

  update(dt) {
    if (this.anim) {
      const a = this.anim;
      const cur = Math.log(this.zoom), tgt = Math.log(a.to);
      const next = cur + (tgt - cur) * (1 - Math.exp(-dt * 12));
      if (Math.abs(tgt - next) < 0.002) { this.zoomAt(a.to, a.cx, a.cy); this.anim = null; }
      else this.zoomAt(Math.exp(next), a.cx, a.cy);
    }
    if (this.pointers.size === 0 && (Math.abs(this.vel.x) + Math.abs(this.vel.y)) > 0.01) {
      this.panBy(this.vel.x * dt * 1000, this.vel.y * dt * 1000);
      const decay = Math.exp(-dt * 5);
      this.vel.x *= decay; this.vel.y *= decay;
    }
  }

  // ---------- pointer handling (touch, mouse and pen all arrive here) ----------
  down(e) {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    this.vel.x = this.vel.y = 0;
    this.anim = null;
    if (this.pointers.size >= 2) { this.multi = true; this.pinch = this.pinchInfo(); }
  }

  pinchInfo() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1 && !this.multi) {
      this.panBy(dx, dy);
      const now = performance.now(), dt = Math.max(1, now - this.lastMove);
      this.vel.x = 0.7 * (dx / dt) + 0.3 * this.vel.x;
      this.vel.y = 0.7 * (dy / dt) + 0.3 * this.vel.y;
      this.lastMove = now;
    } else if (this.pointers.size >= 2) {
      const n = this.pinchInfo();
      if (this.pinch) {
        this.zoomAt(this.zoom * n.dist / this.pinch.dist, n.x, n.y);
        this.panBy(n.x - this.pinch.x, n.y - this.pinch.y);
      }
      this.pinch = n;
    }
  }

  up_(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const now = performance.now();
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size > 0) return;

    const wasMulti = this.multi;
    this.multi = false;
    if (wasMulti || now - this.lastMove > 60) { this.vel.x = this.vel.y = 0; }
    const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
    if (cancelled || wasMulti || moved > 8 || now - p.t0 > 350) return;

    // It was a tap.
    this.vel.x = this.vel.y = 0;
    const lt = this.lastTap;
    if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      this.lastTap = null;
      const target = this.zoom >= this.maxZoom * 0.99 ? 1 : this.zoom * 2.5;
      this.zoomTo(target, e.clientX, e.clientY);
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (this.onTap) this.onTap(e.clientX, e.clientY);
  }

  wheel(e) {
    e.preventDefault();
    this.anim = null;
    this.vel.x = this.vel.y = 0;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const k = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey = laptop touchpad pinch
    this.zoomAt(this.zoom * Math.exp(-dy * k), e.clientX, e.clientY);
  }
}
