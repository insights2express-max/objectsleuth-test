// "Living Light": where the sun is at any hour, passing clouds, and light shafts through windows.
import * as THREE from '../../vendor/three/three.module.js';

const RAD = Math.PI / 180;
export const SUNRISE = 6, SUNSET = 19, MAX_ELEVATION = 50; // spring/autumn, northern hemisphere

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Sun position for a clock time (decimal hours, 0–24).
// Rises due east at 06:00, highest in the south (50°, never overhead) at 12:30, sets due west at 19:00.
// Elevation goes below the horizon at night (used for twilight).
export function solar(hours) {
  let h = hours;
  if (h < SUNRISE) h += 24;
  const f = (h - SUNRISE) / (SUNSET - SUNRISE);   // 0 at sunrise, 1 at sunset, >1 at night
  return { el: MAX_ELEVATION * Math.sin(Math.PI * f), az: 90 + 180 * Math.min(1, f) };
}

// A direction in the Scene for a compass bearing (0 = north, 90 = east…) and an elevation.
// `turn` says how the Scene's room is rotated against the compass (each Scene sets its own).
export function compassDir(az, el, turn, out = new THREE.Vector3()) {
  const a = (az + turn) * RAD, e = el * RAD;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// Random clouds: now and then a cloud drifts over the sun, then clears again.
export class Clouds {
  constructor() {
    this.cover = 0; this.target = 0; this.rate = 0.3;
    this.next = 10 + Math.random() * 20;
    this.fixed = null; // a number 0–1 to hold the cloud cover still (tests)
  }
  update(dt) {
    if (this.fixed !== null) { this.cover = this.fixed; return this.cover; }
    this.next -= dt;
    if (this.next <= 0) {
      if (this.target > 0) { this.target = 0; this.next = 15 + Math.random() * 50; }      // clear spell
      else { this.target = 0.35 + Math.random() * 0.5; this.next = 6 + Math.random() * 18; } // a cloud
      this.rate = 1 / (2.5 + Math.random() * 4);
    }
    const d = this.target - this.cover, step = this.rate * dt;
    this.cover += Math.abs(d) < step ? d : Math.sign(d) * step;
    return this.cover;
  }
}

// Soft beams of light ("sun rays") from each window down to the floor.
const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
uniform vec3 uColor; uniform float uStrength; uniform float uTime;
varying vec2 vUv;
void main() {
  float along = pow(max(1.0 - vUv.y, 0.0), 1.4) * smoothstep(0.0, 0.05, vUv.y);
  float across = pow(max(sin(3.14159 * vUv.x), 0.0), 0.8);
  float streak = 0.72 + 0.28 * sin(vUv.x * 31.0 + uTime * 0.3) * sin(vUv.x * 11.0 - uTime * 0.17);
  gl_FragColor = vec4(uColor * (uStrength * along * across * streak), 1.0);
}`;

export class SunShafts {
  // room: the inside of the room (a Box3); beams stop at its floor and its open sides.
  constructor(openings, room) {
    this.room = room;
    this.group = new THREE.Group();
    this.items = openings.map((o) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(16 * 3), uv = new Float32Array(16 * 2), idx = [];
      for (let f = 0; f < 4; f++) {
        uv.set([0, 0, 1, 0, 1, 1, 0, 1], f * 8);
        const b = f * 4;
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 0 }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, material);
      m.frustumCulled = false;
      m.raycast = () => {};
      m.visible = false;
      this.group.add(m);
      // the four corners of the opening, just inside the room
      const inside = o.c.clone().addScaledVector(o.n, -0.12);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        inside.clone().addScaledVector(o.u, a).addScaledVector(o.v, b));
      return { o, m, corners };
    });
  }

  // How far light travels from point c in direction d before leaving the room.
  reach(c, d) {
    const r = this.room;
    let L = (c.y - r.min.y - 0.01) / -d.y;
    if (d.x > 1e-4) L = Math.min(L, (r.max.x - c.x) / d.x);
    if (d.x < -1e-4) L = Math.min(L, (r.min.x - c.x) / d.x);
    if (d.z > 1e-4) L = Math.min(L, (r.max.z - c.z) / d.z);
    if (d.z < -1e-4) L = Math.min(L, (r.min.z - c.z) / d.z);
    return Math.max(0, L);
  }

  // toSun: direction pointing at the sun. strength: 0 = off.
  update(toSun, strength, color, t) {
    const d = toSun.clone().negate(); // the way the light travels
    const far = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const it of this.items) {
      const facing = smooth(0.05, 0.35, toSun.dot(it.o.n));
      const s = strength * facing;
      it.m.visible = s > 0.002 && d.y < -0.05;
      if (!it.m.visible) continue;
      it.corners.forEach((c, i) => far[i].copy(c).addScaledVector(d, this.reach(c, d)));
      const pos = it.m.geometry.attributes.position;
      for (let f = 0; f < 4; f++) {
        const a = f, b = (f + 1) % 4;
        pos.setXYZ(f * 4, ...it.corners[a].toArray());
        pos.setXYZ(f * 4 + 1, ...it.corners[b].toArray());
        pos.setXYZ(f * 4 + 2, ...far[b].toArray());
        pos.setXYZ(f * 4 + 3, ...far[a].toArray());
      }
      pos.needsUpdate = true;
      const u = it.m.material.uniforms;
      u.uStrength.value = s;
      u.uColor.value.copy(color);
      u.uTime.value = 0;   // v13: streaks stay still – moving streaks forced the room to be redrawn constantly
    }
  }
}
