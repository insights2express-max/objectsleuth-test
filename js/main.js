// ObjectSleuth – Draft 1. Starts the game: renderer, Scene, lighting, camera controls, on-screen buttons.
import * as THREE from '../vendor/three/three.module.js';
import { buildStudy } from './scene/study.js';
import { Lighting, PRESETS } from './scene/lighting.js';
import { ViewControls } from './core/controls.js';
import { StyleSampler, STYLES } from './art/styles.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from '../vendor/three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from '../vendor/three/addons/shaders/VerticalTiltShiftShader.js';

const BUILD = 'Draft 1 · M1.3 skins';
const $ = (id) => document.getElementById(id);

// ---------- renderer & scene ----------
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const study = buildStudy();
scene.add(study.root);
const lighting = new Lighting(scene, renderer, study.fx, study.compassTurn);

// Isometric-style view from the front-right, looking into the room.
const controls = new ViewControls(camera, canvas, { maxZoom: 20 });
controls.setView(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0.95, 1.2), 40);
controls.fit(study.bounds);

// ---------- STYLE SAMPLER (test feature) ----------
const fx = study.fx;
const sampler = new StyleSampler(study.root, [...fx.bulbMats, ...fx.shadeMats, ...fx.windowMats]);

// Miniature filter: blurs the top and bottom of the picture (tilt-shift) and adds a little
// extra color, so the room looks like a tiny model photographed up close.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
composer.addPass(tiltH);
composer.addPass(tiltV);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(mix(vec3(l), c.rgb, 1.3), c.a); }`,
}));
composer.addPass(new OutputPass());
let miniature = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  const blur = 3.5 * renderer.getPixelRatio();
  tiltH.uniforms.h.value = blur / (w * renderer.getPixelRatio());
  tiltV.uniforms.v.value = blur / (h * renderer.getPixelRatio());
  controls.resize();
}
window.addEventListener('resize', resize);
resize();

// ---------- on-screen buttons ----------
const STORE = 'objectsleuth.light'; // remembers Auto / Day / Dusk / Night
const presetButtons = document.querySelectorAll('[data-preset]');
function choosePreset(name, instant = false) {
  lighting.set(name, instant);
  presetButtons.forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
  try { localStorage.setItem(STORE, name); } catch (e) { /* storage unavailable: fine */ }
}
let saved = 'auto';
try { saved = localStorage.getItem(STORE) || 'auto'; } catch (e) { /* ignore */ }
choosePreset(PRESETS[saved] ? saved : 'auto', true);
presetButtons.forEach((b) => b.addEventListener('click', () => choosePreset(b.dataset.preset)));

// ---------- STYLE SAMPLER buttons ----------
const styleSel = $('style'), miniBtn = $('mini');
Object.entries(STYLES).filter(([, s]) => !s.parked).forEach(([key, s]) => styleSel.add(new Option(s.label, key)));
function chooseStyle(name) {
  sampler.set(name);
  styleSel.value = sampler.name;
  try { localStorage.setItem('objectsleuth.style', sampler.name); } catch (e) { /* ignore */ }
}
function setMiniature(on) {
  miniature = on;
  miniBtn.classList.toggle('on', on);
  miniBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('objectsleuth.mini', on ? '1' : '0'); } catch (e) { /* ignore */ }
}
styleSel.addEventListener('change', () => { chooseStyle(styleSel.value); styleSel.blur(); });
miniBtn.addEventListener('click', () => setMiniature(!miniature));
try {
  chooseStyle(localStorage.getItem('objectsleuth.style') || 'lowpoly');
  setMiniature(localStorage.getItem('objectsleuth.mini') === '1');
} catch (e) { chooseStyle('lowpoly'); }

// ---------- TEST CLOCK (test-only u.f.n.) ----------
const tcRange = $('tc-range'), tcTime = $('tc-time'), tcPlay = $('tc-play'), tcLive = $('tc-live');
const fmt = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
function setTestTime(h) {
  if (lighting.name !== 'auto') choosePreset('auto');
  lighting.testHours = h;
}
tcRange.addEventListener('input', () => setTestTime(Number(tcRange.value)));
tcPlay.addEventListener('click', () => {
  if (lighting.timeLapse) { lighting.timeLapse = 0; return; }
  if (lighting.testHours === null || lighting.name !== 'auto') setTestTime(lighting.hours());
  lighting.timeLapse = 0.25; // 1 hour every 4 seconds
});
tcLive.addEventListener('click', () => { lighting.testHours = null; lighting.timeLapse = 0; choosePreset('auto'); });
function showTestClock() {
  const h = lighting.hours();
  tcTime.textContent = fmt(h);
  if (document.activeElement !== tcRange) tcRange.value = h;
  tcLive.classList.toggle('on', lighting.name === 'auto' && lighting.testHours === null);
  tcPlay.classList.toggle('on', !!lighting.timeLapse);
}

$('zoom-in').addEventListener('click', () => controls.zoomBy(2));
$('zoom-out').addEventListener('click', () => controls.zoomBy(0.5));
$('zoom-reset').addEventListener('click', () => controls.reset());
const zoomLabel = $('zoom-label');
controls.onChange = (c) => { zoomLabel.textContent = '×' + c.zoom.toFixed(1); };
controls.apply();

$('build').textContent = BUILD;

// Test shortcuts in the address, e.g.  ?light=night&zoom=8&focus=0,0.4,-2.6
const params = new URLSearchParams(window.location.search);
if (PRESETS[params.get('light')]) choosePreset(params.get('light'), true);
if (params.get('time')) { choosePreset('auto', true); lighting.testHours = Number(params.get('time')); }
if (params.get('cloud')) lighting.clouds.fixed = Number(params.get('cloud'));
if (params.get('style')) chooseStyle(params.get('style'));
if (params.get('mini')) setMiniature(params.get('mini') === '1');
if (params.get('zoom')) {
  const [x, y, z] = (params.get('focus') || '0,1.2,0').split(',').map(Number);
  controls.focusOn(new THREE.Vector3(x, y, z), Number(params.get('zoom')));
}

// ---------- main loop ----------
const fpsEl = $('fps');
let last = performance.now(), frames = 0, acc = 0;
const start = last;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = (now - start) / 1000;
  controls.update(dt);
  lighting.update(dt, t);
  study.animate(t, lighting.hours());
  if (miniature) composer.render(dt); else renderer.render(scene, camera);
  frames++; acc += dt;
  if (frames % 10 === 0) showTestClock();
  if (acc >= 1) { fpsEl.textContent = Math.round(frames / acc) + ' fps'; frames = 0; acc = 0; }
});

// ---------- offline support ----------
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // When a new version has been downloaded, reload once so it shows straight away.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; window.location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => { $('offline').textContent = 'offline-ready ✓'; })
    .catch((err) => { $('offline').textContent = 'offline unavailable'; console.warn(err); });
} else {
  $('offline').textContent = 'offline unavailable';
}
