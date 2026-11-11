// v15 (M1.8) PERSPECTIVE VIEWS: a camera that stands somewhere and turns its head.
//   STAGE   – stands just outside the open front of the room (like a theatre seat); turns a little.
//   WALK-IN – stands INSIDE the room at eye height; turns all the way round, looks up and down,
//             and walks: double-tap the floor to step there.
// Same gestures as the Diorama view: drag = look around, pinch / wheel = zoom (×1–×20, by narrowing
// the lens, so nothing ever goes through a wall), double-tap = zoom in on that spot, tap = find.
import * as THREE from '../../vendor/three/three.module.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class LookControls {
  constructor(camera, el, { maxZoom = 20 } = {}) {
    this.cam = camera;
    this.el = el;
    this.cam.rotation.order = 'YXZ';
    this.minZoom = 1;
    this.maxZoom = maxZoom;
    this.zoom = 1;
    this.fov0 = 60;                               // vertical lens angle at ×1 (degrees)
    this.pos = new THREE.Vector3(0, 1.6, 0);
    this.yaw = 0; this.pitch = 0;
    this.yawLim = null;                           // [min, max] or null (free)
    this.pitchLim = [-1.25, 1.1];
    this.pointers = new Map();
    this.pinch = null; this.multi = false;
    this.vel = { x: 0, y: 0 }; this.lastMove = 0;
    this.anim = null; this.fly = null; this.walk = null;
    this.lastTap = null;
    this.active = false;
    this.onTap = null; this.onChange = null;
    this.onDoubleTap = null;                      // (cx, cy) → true if handled (e.g. walked there)
    this.pad = { left: 0, right: 0, top: 0, bottom: 0 };
    this.cover = { left: 0, right: 0, top: 0, bottom: 0 };
    el.addEventListener('pointerdown', (e) => this.active && this.down(e));
    el.addEventListener('pointermove', (e) => this.active && this.move(e));
    el.addEventListener('pointerup', (e) => this.active && this.up_(e));
    el.addEventListener('pointercancel', (e) => this.active && this.up_(e, true));
    el.addEventListener('wheel', (e) => this.active && this.wheel(e), { passive: false });
  }

  // a view's starting pose: where it stands, what it looks at, its lens, how far it may turn
  configure({ pos, look, fov, yawLim = null, pitchLim = [-1.25, 1.1] }) {
    this.pos.copy(pos);
    this.fov0 = fov;
    this.yawLim = yawLim; this.pitchLim = pitchLim;
    this.home = { pos: pos.clone(), look: look.clone() };
    this.lookAt(look);
    this.zoom = 1;
    this.anim = this.fly = this.walk = null;
    this.vel.x = this.vel.y = 0;
    this.apply();
  }
  lookAt(p) {
    const d = p.clone().sub(this.pos).normalize();
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(clamp(d.y, -1, 1));
  }

  visibleRect() {
    const r = this.el.getBoundingClientRect();
    return { r, w: r.width, h: r.height, x0: r.left, y0: r.top };
  }
  // the lens angle (fov0 is for a 4:3 landscape screen; upright screens get a taller angle, so the
  // room's width still fits)
  fov() {
    const k = Math.max(1, (4 / 3) / (this.cam.aspect || 4 / 3));
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.fov0) / 2) * k / this.zoom));
  }
  resize() {
    const { w, h } = this.visibleRect();
    this.cam.aspect = w / h || 1;
    this.apply();
  }
  apply() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    if (this.yawLim) this.yaw = clamp(wrap(this.yaw), this.yawLim[0], this.yawLim[1]);
    this.pitch = clamp(this.pitch, this.pitchLim[0], this.pitchLim[1]);
    this.cam.position.copy(this.pos);
    this.cam.rotation.set(this.pitch, this.yaw, 0);
    this.cam.fov = this.fov();
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    if (this.onChange) this.onChange(this);
  }

  // direction of the ray through a screen point
  dirAt(cx, cy) {
    const { w, h, x0, y0 } = this.visibleRect();
    const v = new THREE.Vector3(((cx - x0) / w) * 2 - 1, -((cy - y0) / h) * 2 + 1, 0.5).unproject(this.cam);
    return v.sub(this.cam.position).normalize();
  }
  // turn so that direction d ends up under the screen point (cx, cy)
  keepUnder(d, cx, cy) {
    for (let i = 0; i < 2; i++) { // two small corrections are plenty
      const now = this.dirAt(cx, cy);
      this.yaw += Math.atan2(-d.x, -d.z) - Math.atan2(-now.x, -now.z);
      this.pitch += Math.asin(clamp(d.y, -1, 1)) - Math.asin(clamp(now.y, -1, 1));
      this.apply();
    }
  }
  zoomAt(z, cx, cy) {
    const d = this.dirAt(cx, cy);
    this.zoom = clamp(z, this.minZoom, this.maxZoom);
    this.apply();
    this.keepUnder(d, cx, cy);
  }
  // dragging moves the picture with the finger
  panBy(dx, dy) {
    const { h } = this.visibleRect();
    const k = THREE.MathUtils.degToRad(this.cam.fov) / h;
    this.yaw += dx * k;
    this.pitch += dy * k;
    this.apply();
  }
  centre() { const { w, h, x0, y0 } = this.visibleRect(); return { x: x0 + w / 2, y: y0 + h / 2 }; }
  zoomTo(z, cx, cy) {
    if (cx === undefined) ({ x: cx, y: cy } = this.centre());
    this.anim = { to: clamp(z, this.minZoom, this.maxZoom), cx, cy };
  }
  zoomBy(f) { this.zoomTo((this.anim ? this.anim.to : this.zoom) * f); }
  reset() { this.vel.x = this.vel.y = 0; this.fly = null; this.zoomTo(1); }
  focusOn(point, zoom) { this.lookAt(point); this.zoom = clamp(zoom, this.minZoom, this.maxZoom); this.apply(); }
  // T.O. ZOOM: glide to look straight at a point, zoomed in
  flyTo(point, zoom) {
    const d = point.clone().sub(this.pos).normalize();
    let y1 = Math.atan2(-d.x, -d.z);
    y1 = this.yaw + wrap(y1 - this.yaw);                      // the short way round
    this.anim = null; this.vel.x = this.vel.y = 0;
    this.fly = { t: 0, y0: this.yaw, p0: this.pitch, z0: this.zoom, y1, p1: Math.asin(clamp(d.y, -1, 1)), z1: clamp(zoom, this.minZoom, this.maxZoom) };
  }
  // v16.2 COMPASS / arrow keys: turn smoothly to a heading (the short way round; Stage stays within its limits)
  turnTo(yaw, pitch = this.pitch) {
    let y1 = this.yaw + wrap(yaw - this.yaw);
    if (this.yawLim) y1 = clamp(y1, this.yawLim[0], this.yawLim[1]);
    const f = this.fly;
    this.anim = null; this.vel.x = this.vel.y = 0;
    this.fly = { t: 0, y0: this.yaw, p0: this.pitch, z0: this.zoom, y1, p1: clamp(pitch, this.pitchLim[0], this.pitchLim[1]), z1: f ? f.z1 : this.zoom, dur: 0.45 };
  }
  // WALK-IN: step to a new spot (eye height stays the same), 0.8 s
  walkTo(p) { this.walk = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(p.x, this.pos.y, p.z) }; }
  // pixels per metre on screen, at a point (things further away look smaller)
  pxAt(p) {
    const { h } = this.visibleRect();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion);
    const dist = Math.max(0.05, p.clone().sub(this.cam.position).dot(fwd));
    return h / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2));
  }

  update(dt) {
    if (this.keys && (this.keys.x || this.keys.y)) {   // v16.2: desktop arrow keys held down – turn 90°/s, tilt 45°/s
      this.fly = null;
      this.yaw += this.keys.x * dt * Math.PI / 2;
      this.pitch += this.keys.y * dt * Math.PI / 4;
      this.apply();
    }
    if (this.walk) {
      const w = this.walk;
      w.t = Math.min(1, w.t + dt / 0.8);
      const e = w.t * w.t * (3 - 2 * w.t);
      this.pos.lerpVectors(w.from, w.to, e);
      this.apply();
      if (w.t >= 1) this.walk = null;
    }
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / (f.dur || 0.7));
      const e = f.t * f.t * (3 - 2 * f.t);
      this.yaw = f.y0 + (f.y1 - f.y0) * e;
      this.pitch = f.p0 + (f.p1 - f.p0) * e;
      this.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * e);
      this.apply();
      if (f.t >= 1) this.fly = null;
    }
    if (this.anim) {
      const a = this.anim;
      const cur = Math.log(this.zoom), tgt = Math.log(a.to);
      const next = cur + (tgt - cur) * (1 - Math.exp(-dt * 12));
      if (Math.abs(tgt - next) < 0.002) { this.zoomAt(a.to, a.cx, a.cy); this.anim = null; }
      else this.zoomAt(Math.exp(next), a.cx, a.cy);
    }
    if (this.pointers.size === 0 && (Math.abs(this.vel.x) + Math.abs(this.vel.y)) > 0.01) {
      this.panBy(this.vel.x * dt * 1000, this.vel.y * dt * 1000);
      const decay = Math.exp(-dt * 6);
      this.vel.x *= decay; this.vel.y *= decay;
    }
  }
  moving() { return !!(this.anim || this.fly || this.walk || (this.keys && (this.keys.x || this.keys.y))); }

  // ---------- pointer handling (same feel as the Diorama view) ----------
  down(e) {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    this.vel.x = this.vel.y = 0;
    this.anim = null; this.fly = null;
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
    this.vel.x = this.vel.y = 0;
    const lt = this.lastTap;
    if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      this.lastTap = null;
      if (this.onDoubleTap && this.onDoubleTap(e.clientX, e.clientY)) return;
      const target = this.zoom >= this.maxZoom * 0.99 ? 1 : this.zoom * 2.5;
      this.zoomTo(target, e.clientX, e.clientY);
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (this.onTap) this.onTap(e.clientX, e.clientY);
  }
  wheel(e) {
    e.preventDefault();
    this.anim = null; this.fly = null;
    this.vel.x = this.vel.y = 0;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const k = e.ctrlKey ? 0.01 : 0.0015;
    this.zoomAt(this.zoom * Math.exp(-dy * k), e.clientX, e.clientY);
  }
}
