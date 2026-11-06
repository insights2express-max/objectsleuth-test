// Lighting ("Living Light").
// Auto follows the device clock: the sun moves through the day, clouds pass, night falls at 19:00.
// Day / Dusk / Night are fixed moments of the same model (clear sky), so they match Auto.
import * as THREE from '../../vendor/three/three.module.js';
import { solar, compassDir, smooth, Clouds, SunShafts } from './sun.js';

export const PRESETS = {
  auto: { label: 'Auto' },
  day: { label: 'Day', hour: 10.5 },
  dusk: { label: 'Dusk', hour: 18.6 },
  night: { label: 'Night', hour: 23 },
};

// Three "key" looks; every moment of the day blends between them by the sun's height.
const KEYS = {
  night: { bg: 0x121827, hemiSky: 0x8a96c4, hemiGround: 0x4a3a48, hemiI: 1.35, fireI: 9, windowColor: 0x2a3a66, windowI: 0.6, exposure: 1.15 },
  twi: { bg: 0x5d4a6e, hemiSky: 0xffb98a, hemiGround: 0x3a2f45, hemiI: 1.2, fireI: 4, windowColor: 0xff9a5a, windowI: 0.9, exposure: 1.05 },
  day: { bg: 0xa9c6d6, hemiSky: 0xfff4e2, hemiGround: 0x6b5a48, hemiI: 2.3, fireI: 1.5, windowColor: 0xe8f6ff, windowI: 0.9, exposure: 1.05 },
};
const NUMS = ['hemiI', 'fireI', 'windowI', 'exposure', 'sunI', 'lampI', 'rays'];
const COLS = ['bg', 'hemiSky', 'hemiGround', 'windowColor', 'sunColor'];
for (const k of Object.values(KEYS)) COLS.forEach((c) => { if (c in k) k[c] = new THREE.Color(k[c]); });

const SUN_LOW = new THREE.Color(0xff8a40), SUN_HIGH = new THREE.Color(0xfff2dc), MOON = new THREE.Color(0x9fb2ff);
const OVERCAST = new THREE.Color(0x8d989f);
const BULB_OFF = new THREE.Color(0x333333), BULB_ON = new THREE.Color(0xfff0c0);
const TARGET = new THREE.Vector3(0, 1.0, 0);

function blank() {
  const s = { toSun: new THREE.Vector3(0, 1, 0) };
  NUMS.forEach((k) => { s[k] = 0; });
  COLS.forEach((k) => { s[k] = new THREE.Color(); });
  return s;
}

// The complete look for a clock time and a cloud cover (0 = clear).
function stateAt(hours, cover, turn, s) {
  const { el, az } = solar(hours);
  const a = smooth(-8, 0, el), b = smooth(0, 15, el);
  const N = KEYS.night, T = KEYS.twi, D = KEYS.day;
  for (const k of ['hemiI', 'fireI', 'windowI', 'exposure']) {
    const nt = N[k] + (T[k] - N[k]) * a;
    s[k] = nt + (D[k] - nt) * b;
  }
  for (const k of ['bg', 'hemiSky', 'hemiGround', 'windowColor']) s[k].copy(N[k]).lerp(T[k], a).lerp(D[k], b);
  const clear = 1 - cover;
  if (el > -1.5) { // the sun
    const up = smooth(-1, 8, el);
    compassDir(az, Math.max(el, 2), turn, s.toSun);
    s.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0, 30, el));
    s.sunI = 7 * up * (0.2 + 0.8 * clear);
    s.rays = 0.1 * up * clear * clear * (0.6 + 0.4 * (1 - smooth(5, 35, el)));
  } else { // the moon
    compassDir(200, 38, turn, s.toSun);
    s.sunColor.copy(MOON);
    s.sunI = 1.1 * (1 - smooth(-8, -2, el)) * (0.5 + 0.5 * clear);
    s.rays = 0;
  }
  // clouds: a little less sky light, grayer sky
  s.hemiI *= 1 - 0.12 * cover * b;
  s.windowI *= 1 - 0.25 * cover * b;
  s.bg.lerp(OVERCAST, 0.35 * cover * b);
  s.lampI = 1 - smooth(2, 10, el); // lamps switch on as the sun goes down
  return s;
}

export class Lighting {
  constructor(scene, renderer, fx, turn) {
    this.scene = scene;
    this.renderer = renderer;
    this.fx = fx;
    this.turn = turn;
    this.hemi = new THREE.HemisphereLight();
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.target.position.copy(TARGET);
    scene.add(sun, sun.target);
    this.sun = sun;
    this.shafts = new SunShafts(fx.openings, fx.room);
    scene.add(this.shafts.group);
    scene.background = new THREE.Color();
    this.clouds = new Clouds();
    this.testHours = null;   // test clock: a fixed time instead of the real one
    this.timeLapse = 0;      // test clock: hours per second (0 = off)
    this.cur = blank();
    this.tgt = blank();
    // LIGHT LAB: the fire can cast shadows. Then its light sits INSIDE the firebox (logs, andirons
    // and the opening shape the light); without shadows it sits in front, so it can't leak through walls.
    const f = fx.fireLight;
    this.fireOutside = f.position.clone();
    this.fireInside = new THREE.Vector3(0, 0.5, -2.68);
    f.shadow.mapSize.set(1024, 1024);
    f.shadow.camera.near = 0.05;
    f.shadow.bias = -0.003;
    f.shadow.radius = 2.5;
    this.softShadows = false;
    this.fireShadows = false;
    this.set('auto', true);
  }

  // LIGHT LAB: graded sun shadows (crisp at contact, softer the farther they fall) + more detail.
  setSoftShadows(on) {
    this.softShadows = on;
    const s = this.sun.shadow, size = on ? 4096 : 2048;
    if (s.mapSize.x !== size) {
      s.mapSize.set(size, size);
      if (s.map) { s.map.dispose(); s.map = null; }
    }
    // penumbra grows 1.5 cm per metre the shadow falls (real sun ≈ 1 cm; in shadow-map units, see softshadows.js)
    s.radius = on ? 0.015 * (s.camera.far - s.camera.near) / (s.camera.right - s.camera.left) : 0;
  }

  // LIGHT LAB: flickering fireplace shadows.
  setFireShadows(on) {
    this.fireShadows = on;
    const f = this.fx.fireLight;
    f.castShadow = on;
    f.position.copy(on ? this.fireInside : this.fireOutside);
  }

  set(name, instant = false) {
    this.name = name;
    if (instant) this.snap = true;
  }

  // The clock time the lighting is showing (decimal hours).
  hours() {
    if (this.name !== 'auto') return PRESETS[this.name].hour;
    if (this.testHours !== null) return this.testHours;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  update(dt, t) {
    if (this.testHours !== null && this.timeLapse) this.testHours = (this.testHours + dt * this.timeLapse) % 24;
    const cover = this.clouds.update(dt);
    const auto = this.name === 'auto';
    stateAt(this.hours(), auto ? cover : 0, this.turn, this.tgt);

    const c = this.cur, g = this.tgt;
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 3);
    this.snap = false;
    NUMS.forEach((key) => { c[key] += (g[key] - c[key]) * k; });
    COLS.forEach((key) => c[key].lerp(g[key], k));
    c.toSun.lerp(g.toSun, k).normalize();

    this.scene.background.copy(c.bg);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunI;
    this.sun.position.copy(TARGET).addScaledVector(c.toSun, 20);
    this.renderer.toneMappingExposure = c.exposure;
    this.shafts.update(c.toSun, c.rays, c.sunColor, t);

    const fx = this.fx;
    const flicker = 0.85 + 0.1 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 31.7 + 1.3);
    fx.fireLight.intensity = c.fireI * flicker * (this.fireShadows ? 1.0 : 1);
    if (this.fireShadows) { // the flames move, so their shadows dance
      fx.fireLight.position.copy(this.fireInside);
      fx.fireLight.position.x += 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 17.9);
      fx.fireLight.position.y += 0.03 * Math.sin(t * 11.1 + 0.7);
    }
    fx.lamps.forEach((l) => { l.light.intensity = l.base * c.lampI; });
    fx.bulbMats.forEach((m) => m.color.copy(BULB_OFF).lerp(BULB_ON, Math.min(1, c.lampI)));
    fx.shadeMats.forEach((m) => { m.emissiveIntensity = 0.55 * c.lampI; });
    fx.windowMats.forEach((m) => { m.emissive.copy(c.windowColor); m.emissiveIntensity = c.windowI; });
  }
}
