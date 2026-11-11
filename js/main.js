// ObjectSleuth – Draft 1. Starts the game: renderer, Scene, lighting, camera controls, on-screen buttons.
import * as THREE from '../vendor/three/three.module.js';
import { buildStudy } from './scene/study.js';
import { Lighting, PRESETS } from './scene/lighting.js';
import { ViewControls } from './core/controls.js';
import { LookControls } from './core/look.js';
import { StyleSampler, STYLES } from './art/styles.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from '../vendor/three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from '../vendor/three/addons/shaders/VerticalTiltShiftShader.js';
import { GTAOPass } from '../vendor/three/addons/postprocessing/GTAOPass.js';
import { installGradedShadows } from './scene/softshadows.js';
import { Targets, LEVELS, LIST_ROWS } from './game/targets.js';
import { Library, MODEL_CACHE, modelUrl } from './game/library.js';
import { Session, store } from './game/session.js';
import { StaticBatcher } from './art/batch.js';
import { rng } from './core/random.js';

// VERSION: one sequential number per published build (JM CP edit, 2026-11-07). Bump it together
// with VERSION in sw.js; MILESTONES.md keeps the history (v01 = M0 …).
const APP_VERSION = 'v16.2';
const BUILD = 'Draft 1';
// v16 LOOKS (OS-31: 2.1): Clay (default), Low-poly, Felt, Knit – the Original photo look is gone (OS-30: 2.1)
const LOOKS = ['clay', 'lowpoly', 'felt', 'knit'];
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- renderer & scene ----------
const graded = installGradedShadows(); // LIGHT LAB: must run before anything is drawn
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = graded ? THREE.BasicShadowMap : THREE.PCFShadowMap; // graded filter works on the basic map
renderer.shadowMap.autoUpdate = false;   // v12: shadows are drawn once and reused; see "shadowsDirty" in the main loop
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
// DIORAMA camera: near/far hug the room (camera is 40 m away): finer depth steps, so touching surfaces
// don't flicker on tablets
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 25, 60);
// v15 STAGE / WALK-IN camera: a real lens (things further away look smaller)
const perspCam = new THREE.PerspectiveCamera(60, 1, 0.05, 30);
let camera = orthoCam;                    // the camera of the current view
const study = buildStudy();
scene.add(study.root);
const lighting = new Lighting(scene, renderer, study.fx, study.compassTurn);

// Isometric-style view from the front-right, looking into the room.
const VIEW_DIR = new THREE.Vector3(1, 0.95, 1.2);
const ortho = new ViewControls(orthoCam, canvas, { maxZoom: 20 });
ortho.setView(new THREE.Vector3(0, 1.2, 0), VIEW_DIR, 40);
ortho.fit(study.bounds);
const look = new LookControls(perspCam, canvas, { maxZoom: 20 });
let controls = ortho;                     // the controls of the current view

// ---------- STYLE SAMPLER (test feature) ----------
const fx = study.fx;
// v16: the room's own pieces get the look from this sampler; imported models each carry their own
// (library.js), so they can be loaded and dropped per round.
const library = new Library();
// v16.2 (OS-40: 1.1): soft reflected room light for the imported objects only – the same tiny made-up room (window,
// ceiling light, warm walls, dark floor) the Intake page uses, blurred once at start (no cost per frame beyond one
// picture read on those objects). Its strength follows the daylight (main loop → library.setFill).
{
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x5d5047, side: THREE.BackSide }));
  box.position.y = 2; env.add(box);
  const panel = (w, h, rgb, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); env.add(m); };
  panel(3.2, 2.4, [6, 5.6, 5], [-4.9, 2.4, 0.5], [0, Math.PI / 2, 0]);
  panel(2.2, 2.2, [2.2, 1.9, 1.5], [0, 4.9, 0], [Math.PI / 2, 0, 0]);
  panel(10, 1.2, [0.18, 0.12, 0.08], [0, -0.9, 0], [-Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  library.env = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  library.envK = 0.3;
}
const targets = new Targets(study.root, study.fx, VIEW_DIR, library);
const batcher = new StaticBatcher(study.root);
const sampler = new StyleSampler(study.root, [...fx.bulbMats, ...fx.shadeMats, ...fx.windowMats, fx.overheadMat]);

// Miniature filter: blurs the top and bottom of the picture (tilt-shift) and adds a little
// extra color, so the room looks like a tiny model photographed up close.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }) /* edge-smoothing 2× (OS-19: 3.3) */);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// LIGHT LAB: contact shading ("ambient occlusion"): darkens corners, gaps and where objects meet.
// Runs at half resolution on high-density screens (iPad), which looks the same and costs a quarter.
const gtao = new GTAOPass(scene, camera, 1, 1, undefined,
  { radius: 0.35, distanceExponent: 1.5, thickness: 0.5, scale: 1.25, samples: 16, screenSpaceRadius: false });
gtao.blendIntensity = 1.0;
let aoScale = 0.5;                     // share of screen resolution the contact shading is worked out at (set by the quality preset)
const gtaoSetSize = gtao.setSize.bind(gtao);
let aoDetail = 1;                       // v13: 0.5 while the view moves (lighter), 1 when still (refined)
gtao.setSize = (w, h) => { gtao.full = [w, h]; gtaoSetSize(Math.max(1, Math.ceil(w * aoScale * aoDetail)), Math.max(1, Math.ceil(h * aoScale * aoDetail))); gtao.aoDirty = true; };
function setAODetail(k) { if (k === aoDetail) return; aoDetail = k; if (gtao.full) gtao.setSize(...gtao.full); }
// v12: contact shading depends only on the view and the furniture, not on the lighting. So it is worked
// out again only when the view moves or objects change; otherwise the stored result is simply reused.
gtao.aoDirty = true;
const gtaoRender = gtao.render.bind(gtao);
gtao.render = function (r, writeBuffer, readBuffer, dt, mask) {
  if (this.aoDirty) { this.aoDirty = false; return gtaoRender(r, writeBuffer, readBuffer, dt, mask); }
  this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
  this.copyMaterial.blending = THREE.NoBlending;
  this._renderPass(r, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
  this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
  this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
  this._renderPass(r, this.blendMaterial, this.renderToScreen ? null : writeBuffer);
};
// Things that must not shade: see-through glass, light shafts, the invisible shadow-only shell,
// and things that give off light (flames, bulbs: they glow, so nothing darkens them or around them).
const gtaoHide = gtao._overrideVisibility.bind(gtao);
gtao._overrideVisibility = function () {
  gtaoHide();
  this.scene.traverse((o) => {
    if ((o.isMesh && o.visible && (o.material.transparent || o.material.colorWrite === false || o.material.isMeshBasicMaterial)) || (o.isSprite && o.visible)) {
      o.visible = false;
      this._visibilityCache.push(o);
    }
  });
};
// v15: contact shading follows whichever camera the current view uses
function setAOCamera(cam) {
  gtao.camera = cam;
  const persp = cam.isPerspectiveCamera ? 1 : 0;
  for (const m of [gtao.gtaoMaterial, gtao.depthRenderMaterial]) {
    if (m.defines.PERSPECTIVE_CAMERA !== persp) { m.defines.PERSPECTIVE_CAMERA = persp; m.needsUpdate = true; }
    if (m.uniforms.cameraNear) { m.uniforms.cameraNear.value = cam.near; m.uniforms.cameraFar.value = cam.far; }
  }
  gtao.aoDirty = true;
}
composer.addPass(gtao);
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
composer.addPass(tiltH);
composer.addPass(tiltV);
const satPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(mix(vec3(l), c.rgb, 1.3), c.a); }`,
});
composer.addPass(satPass);
composer.addPass(new OutputPass());
const miniPasses = [tiltH, tiltV, satPass];
miniPasses.forEach((p) => { p.enabled = false; });
let miniature = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  const blur = 3.5 * renderer.getPixelRatio();
  tiltH.uniforms.h.value = blur / (w * renderer.getPixelRatio());
  tiltV.uniforms.v.value = blur / (h * renderer.getPixelRatio());
  ortho.resize();
  look.resize();
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

// ---------- v15 VIEWS (M1.8): Diorama · Stage · Walk-in ----------
// Each view cuts away the walls that would stand between the camera and the room.
const VIEWS = {
  diorama: { label: 'Diorama', cut: ['front', 'right', 'ceiling'] },
  stage: { label: 'Stage', cut: ['front'],
    pose: { pos: new THREE.Vector3(0.3, 2.55, 6.9), look: new THREE.Vector3(0.1, 0.85, -1.0), fov: 46, yawLim: [-0.6, 0.6], pitchLim: [-0.85, 0.35] } },
  walk: { label: 'Walk-in', cut: [],
    pose: { pos: new THREE.Vector3(3.0, 1.6, 1.9), look: new THREE.Vector3(-3.2, 0.95, -2.4), fov: 62 } },
};
let view = 'diorama', cutNow = new Set(VIEWS.diorama.cut);
// show or hide the walls a view cuts away (the batched copies and the original pieces)
function setCut(tags) {
  cutNow = new Set(tags);
  for (const o of fx.cutMeshes) {
    const hide = cutNow.has(o.userData.cutTag);
    o.userData.cutHidden = hide;
    if (!o.userData.batched) o.visible = !hide;
  }
  for (const m of batcher.merged) if (m.userData.cutTag) m.visible = !cutNow.has(m.userData.cutTag);
  // v16: things hung on a cut-away wall go with it (found ones stay hidden)
  for (const it of targets.items) if (it.group.userData.cutTag && !(it.role === 'to' && targets.resolved(it))) it.group.visible = !cutNow.has(it.group.userData.cutTag);
  for (const h of targets.hookMeshes || []) if (h.userData.cutTag) h.visible = !cutNow.has(h.userData.cutTag);   // v16.1: wall hardware goes with its wall
  gtao.aoDirty = true;
}
// merge the fixed pieces again (after a style change or a new round), then re-apply the view's cut
function rebatch() {
  const keep = [...cutNow];
  setCut([]);                     // (hidden pieces would be left out of the batches)
  batcher.build();
  frontFaceShadows();
  setCut(keep);
  renderer.shadowMap.needsUpdate = true; gtao.aoDirty = true;
}
const viewButtons = document.querySelectorAll('[data-view]');
let walkHintShown = false;
function setView(name, remember = true) {
  if (!VIEWS[name]) name = 'diorama';
  view = name;
  const V = VIEWS[name];
  ortho.active = name === 'diorama';
  look.active = !ortho.active;
  controls = ortho.active ? ortho : look;
  camera = ortho.active ? orthoCam : perspCam;
  if (V.pose) look.configure(V.pose);
  look.onDoubleTap = name === 'walk' ? walkHere : null;
  renderPass.camera = camera;
  setAOCamera(camera);
  setCut(V.cut);
  viewButtons.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  zoomLabel.textContent = '×' + controls.zoom.toFixed(1);
  layoutPanel();
  try { shownBearing = null; updateCompass(); } catch (e) { /* (not ready yet) */ }
  lastMove = performance.now(); busyUntil = performance.now() + 600;
  if (name === 'walk' && !walkHintShown) { walkHintShown = true; toast('🚶 Drag to look around · double-tap the floor to walk there (any zoom) · 🧭 compass or ← → keys to turn'); }
  if (remember) try { localStorage.setItem('objectsleuth.view', name); } catch (e) { /* ignore */ }
}
viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
// WALK-IN: double-tap the floor (or rug) to step there – never into furniture or walls. v16.2 (OS-41: 4.1): at ANY
// zoom (was ×1.6 at most) – the view glides back to ×1 on the way. A double-tap anywhere else zooms in, as before.
function walkHere(cx, cy) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(screenToNdc(cx, cy), perspCam);
  const hit = ray.intersectObjects(targets.solids(), false)[0];
  if (!hit || hit.point.y > 0.08 || targets.normalOf(hit).y < 0.9) return false;   // not the floor
  const from = look.pos.clone(), to = new THREE.Vector3(clamp(hit.point.x, -3.55, 3.55), from.y, clamp(hit.point.z, -2.55, 2.55));
  // keep 35 cm clear of anything at chest and eye height; step back towards where we are if needed
  const solids = targets.solids(), dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(Math.cos(k * Math.PI / 4), 0, Math.sin(k * Math.PI / 4)));
  const free = (p) => [1.1, 1.6].every((y) => dirs.every((d) => !targets.cast(new THREE.Vector3(p.x, y, p.z), d, 0.35, solids).length));
  let p = to.clone();
  for (let i = 0; i < 10 && !free(p); i++) p.lerp(from, 0.2);
  if (!free(p)) { toast('No room to stand there'); return true; }
  look.walkTo(p);
  if (look.zoom > 1.01) { const c = look.centre(); look.anim = { to: 1, cx: c.x, cy: c.y }; }   // back to ×1 as it walks
  return true;
}
// a short note at the top of the screen (fades by itself; plain page text, no 3D redraw)
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ---------- STYLE SAMPLER buttons ----------
const styleSel = $('style'), miniBtn = $('mini');
LOOKS.forEach((key) => { styleSel.add(new Option(STYLES[key].label, key)); $('set-look').add(new Option(STYLES[key].label, key)); });
// Shadows are measured from the FRONT (lit) faces of solid objects. Measuring from back faces (the
// three.js default) let light creep a few millimetres past every joint – the thin glowing lines
// where the hearth meets the floor and the pillars meet the hearth (OS-12 follow-up).
function frontFaceShadows() {
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.side === THREE.FrontSide && !o.material.transparent) o.material.shadowSide = THREE.FrontSide;
  });
}
function chooseStyle(name) {
  if (!LOOKS.includes(name)) name = 'clay';
  batcher.clear();      // v12: un-merge, re-dress in the new style, merge again
  sampler.set(name);
  library.setLook(name);
  rebatch();
  styleSel.value = sampler.name;
  if ($('set-look')) $('set-look').value = sampler.name;
  if (typeof updatePills === 'function') try { updatePills(); } catch (e) { /* (not ready yet) */ }
  try { localStorage.setItem('objectsleuth.style', sampler.name); } catch (e) { /* ignore */ }
}
function setMiniature(on) {
  miniature = on;
  miniPasses.forEach((p) => { p.enabled = on; });
  miniBtn.classList.toggle('on', on);
  miniBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('objectsleuth.mini', on ? '1' : '0'); } catch (e) { /* ignore */ }
}
styleSel.addEventListener('change', () => { chooseStyle(styleSel.value); styleSel.blur(); });
miniBtn.addEventListener('click', () => setMiniature(!miniature));
$('set-look').addEventListener('change', () => chooseStyle($('set-look').value));
try {
  const look = localStorage.getItem('objectsleuth.style');
  sampler.set(LOOKS.includes(look) ? look : 'clay');   // (merged once the first round is laid out)
  styleSel.value = sampler.name;
  setMiniature(localStorage.getItem('objectsleuth.mini') === '1');
} catch (e) { sampler.set('clay'); }
library.look = sampler.name;
$('set-look').value = sampler.name;

// ---------- QUALITY presets (v12; replaces the Light Lab switches) ----------
// Contact shading stays on in every preset (JM's top priority, OS-15: 1.1.1). What changes:
//   ao   = share of screen resolution contact shading is worked out at
//   soft = graded sun shadows · fire = fireplace shadows · pr = sharpness cap · idle = frames/s when the view is still
const RETINA = window.devicePixelRatio > 1.25;
const QUALITY = {
  auto: { label: 'Auto', ao: RETINA ? 0.5 : 0.75, soft: true, fire: false, pr: 1.5, idle: 24, adaptive: true },
  high: { label: 'High', ao: RETINA ? 0.5 : 1, soft: true, fire: false, pr: 2, idle: 30 },   // (v13: no fire)
  balanced: { label: 'Balanced', ao: RETINA ? 0.5 : 0.75, soft: true, fire: false, pr: 1.5, idle: 24 },
  battery: { label: 'Battery Saver', ao: 0.5, soft: false, fire: false, pr: 1.25, idle: 15 },
};
const lab = { ao: true, soft: true, fire: false };
function setLab(key, on) { // (also used by the test shortcuts ?ao= ?soft= ?fire=)
  lab[key] = on;
  if (key === 'ao') { gtao.enabled = on; gtao.aoDirty = true; $('set-ao').checked = on; }
  if (key === 'soft') { lighting.setSoftShadows(on && graded); $('set-soft').checked = on; }
  if (key === 'fire') lighting.setFireShadows(on);
}
// M5 Settings: the Light Lab effects as player options (OS-7: 3) – remembered on the device
$('set-ao').addEventListener('change', () => { setLab('ao', $('set-ao').checked); store.set('lab', { ao: lab.ao, soft: lab.soft }); });
$('set-soft').addEventListener('change', () => { setLab('soft', $('set-soft').checked); store.set('lab', { ao: lab.ao, soft: lab.soft }); });
let quality = QUALITY.auto, prNow = 1;
const qualitySel = $('quality');
Object.entries(QUALITY).forEach(([k, q]) => { qualitySel.add(new Option('QUALITY: ' + q.label, k)); $('set-quality').add(new Option(q.label, k)); });
$('set-quality').addEventListener('change', () => setQuality($('set-quality').value));
function setQuality(name) {
  quality = QUALITY[name] || QUALITY.auto;
  qualitySel.value = Object.keys(QUALITY).find((k) => QUALITY[k] === quality);
  $('set-quality').value = qualitySel.value;
  const saved = store.get('lab', null);
  setLab('ao', saved ? saved.ao : true); setLab('soft', saved ? saved.soft && quality.soft : quality.soft); setLab('fire', quality.fire);
  aoScale = quality.ao;
  setSharpness(Math.min(window.devicePixelRatio, quality.pr));
  if (typeof updatePills === 'function') try { updatePills(); } catch (e) { /* (not ready yet) */ }
  try { localStorage.setItem('objectsleuth.quality', qualitySel.value); } catch (e) { /* ignore */ }
}
function setSharpness(pr) {
  prNow = Math.max(0.6, Math.round(pr * 20) / 20);
  renderer.setPixelRatio(prNow);
  resize();
}
qualitySel.addEventListener('change', () => { setQuality(qualitySel.value); qualitySel.blur(); });
try { setQuality(localStorage.getItem('objectsleuth.quality') || 'auto'); } catch (e) { setQuality('auto'); }

// ---------- TIME OF DAY (a player feature since v16.1, OS-37: 4.2 – was the TEST CLOCK) ----------
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
  $('pill-clock').textContent = fmt(h);
  if (document.activeElement !== tcRange) tcRange.value = h;
  tcLive.classList.toggle('on', lighting.name === 'auto' && lighting.testHours === null);
  tcPlay.classList.toggle('on', !!lighting.timeLapse);
}

$('zoom-in').addEventListener('click', () => controls.zoomBy(2));
$('zoom-out').addEventListener('click', () => controls.zoomBy(0.5));
$('zoom-reset').addEventListener('click', () => controls.reset());
// v16.1 (OS-36: 5.1.1): HOME = zoom ×1 AND the Scene's starting view (⤢ only zooms out, staying where you are)
$('zoom-home').addEventListener('click', () => {
  if (ortho.active) ortho.flyTo(ortho.home.clone(), 1);
  else look.configure(VIEWS[view].pose);
});
const zoomLabel = $('zoom-label');
let lastMove = -1e9; // when the view last moved (rest mode, see the main loop)
let busyUntil = 0;   // full speed until then (see the main loop)
ortho.onChange = look.onChange = (c) => {
  if (c !== controls) return;
  zoomLabel.textContent = '×' + c.zoom.toFixed(1); gtao.aoDirty = true; lastMove = performance.now();
  if (typeof updateCompass === 'function') try { updateCompass(); } catch (e) { /* (not ready yet) */ }
};
ortho.apply();

$('build').textContent = APP_VERSION + ' · ' + BUILD;
$('ver').textContent = APP_VERSION;

// Test shortcuts in the address, e.g.  ?light=night&zoom=8&focus=0,0.4,-2.6&view=walk
const params = new URLSearchParams(window.location.search);
if (PRESETS[params.get('light')]) choosePreset(params.get('light'), true);
if (params.get('time')) { choosePreset('auto', true); lighting.testHours = Number(params.get('time')); }
if (params.get('cloud')) lighting.clouds.fixed = Number(params.get('cloud'));
if (params.get('style')) sampler.set(params.get('style'));
if (params.get('mini')) setMiniature(params.get('mini') === '1');
for (const k of ['ao', 'soft', 'fire']) if (params.get(k)) setLab(k, params.get(k) === '1');

// ---------- FIND panel (v15): floats over the Scene; drag, resize, fold ----------
// Modes: 'side' (one column, anywhere left/right) · 'top' / 'bottom' (docked to that edge, 2 rows of 3).
// Dragging the title bar near the top or bottom edge docks it there; dragging it back into the
// middle of the screen makes it a side panel again (OS-20: 1.2, 1.5.3).
const panel = $('findpanel'), findList = $('findlist');
const fpHead = $('fp-head'), fpToggle = $('fp-toggle'), grips = [$('fp-grip-l'), $('fp-grip-r')];
// v16 ROLLING LIST (OS-27): 15 Target Objects per round, the first 6 unresolved ones listed; a found one
// stays a moment (ticked), then the next rolls in. No text above the list, no Congratulations box (OS-25: 4.1.1).
const leaving = new Map();                 // item → time it was resolved (its row lingers 1.4 s)
targets.onChange = (tg) => {
  const now = performance.now();
  for (const it of tg.list) if (tg.resolved(it) && !leaving.has(it) && it.wasShown) leaving.set(it, now);
  const rows = tg.list.filter((it) => it.shown || (leaving.has(it) && now - leaving.get(it) < 1400));
  findList.innerHTML = '';
  rows.slice(0, LIST_ROWS + 1).forEach((it) => {
    const li = document.createElement('li');
    li.dataset.i = tg.list.indexOf(it);
    li.className = (it.found ? 'found done' : it.revealed ? 'revealed done' : it.ringed ? 'ringed' : '') + (it.mode === 'silhouette' ? ' sil' : it.mode === 'scrambled' ? ' scr' : '');
    li.title = 'Double-tap: T.O. Zoom (hint) · double-tap again: T.O. Reveal';
    li.innerHTML = `<span class="ico${it.mode === 'silhouette' ? ' sil' : ''}"><span>${it.mode === 'silhouette' ? '' : '🔎'}</span></span><span class="nm"></span><span class="st">${it.found ? 'FOUND' : it.revealed ? 'REVEALED' : it.ringed ? 'TAP IT' : ''}</span>`;
    if (it.mode === 'silhouette') li.querySelector('.ico > span').appendChild(tg.silhouette(it));
    li.querySelector('.nm').textContent = it.mode === 'silhouette' ? '' : it.label || it.name;
    findList.appendChild(li);
    if (it.shown) it.wasShown = true;
  });
  if ([...leaving.values()].some((t) => now - t < 1400)) setTimeout(() => targets.onChange(targets), 1450);
  const total = tg.list.length, found = tg.list.filter((it) => it.found).length, rev = tg.list.filter((it) => it.revealed).length, done = found + rev;
  $('fp-done').textContent = `${found} / ${total}` + (rev ? ` · 👁️ ${rev}` : '');
  $('fp-count').textContent = `${done} / ${total}`;
  const bar = $('fp-bar');
  bar.style.width = `${(100 * done) / total}%`;
  bar.style.background = done ? `linear-gradient(90deg, var(--green) ${(100 * found) / done}%, #8d929b ${(100 * found) / done}%)` : '';
  layoutPanel();
};
// Where the panel is and how it is laid out. Remembered only within this Scene Instance.
const fp = { mode: 'side', x: 0, y: 0, wSide: 300, wEdge: 600, collapsed: false, placed: false };
const MIN_W = { side: 150, edge: 400 };          // ≈ 5 letters of each name stay visible (OS-20: 1.3.1.2)
const topLimit = () => Math.round($('topbar').getBoundingClientRect().bottom + 8);
const BOTTOM_GAP = 44;                           // (keeps the build / fps label at the bottom left readable)
function defaultsForScreen() {
  const vw = window.innerWidth, vh = window.innerHeight;
  fp.collapsed = false;
  if (vw >= vh) { // landscape: right side, one column, open
    fp.mode = 'side';
    fp.wSide = Math.max(MIN_W.side, Math.min(300, vw * 0.3));
    fp.x = vw - fp.wSide - 12; fp.y = topLimit();
  } else {       // portrait: docked at the bottom, 2 rows of 3, clear of the zoom buttons
    fp.mode = 'bottom';
    fp.wEdge = Math.max(MIN_W.edge, Math.min(640, vw - 290));
    fp.x = 12;
  }
  fp.placed = true;
}
function placeTools() { // the tool pills sit just under the top bar (which wraps on narrow screens)
  $('tools').style.top = `${topLimit()}px`;
}
function layoutPanel() {
  placeTools();
  if (!fp.placed) defaultsForScreen();
  const vw = window.innerWidth, vh = window.innerHeight, top = topLimit(), edge = fp.mode !== 'side';
  panel.classList.toggle('collapsed', fp.collapsed);
  panel.classList.toggle('edge', edge);
  panel.classList.toggle('side', !edge);
  fpToggle.setAttribute('aria-expanded', String(!fp.collapsed));
  const key = edge ? 'wEdge' : 'wSide';
  fp[key] = clamp(fp[key], Math.min(MIN_W[edge ? 'edge' : 'side'], vw - 16), vw - 16);
  panel.style.width = fp.collapsed ? 'auto' : `${fp[key]}px`;
  panel.style.maxHeight = `${Math.max(120, edge ? vh * 0.5 : $('bottombar').getBoundingClientRect().top - 10 - Math.max(top, fp.y))}px`;   // v16.1: down to the zoom bar – room for 6 rows on a desktop (OS-36)
  // docked at the bottom: stay clear of the Reveal + zoom buttons (bottom right) when there's room
  if (fp.mode === 'bottom' && !fp.collapsed) {
    const bars = $('bottombar').offsetWidth + 28;
    const room = vw - bars - 8;
    if (room >= MIN_W.edge) { fp.wEdge = Math.min(fp.wEdge, room); panel.style.width = `${fp.wEdge}px`; }
  }
  const r0 = panel.getBoundingClientRect();
  const rightEdge = fp.mode === 'bottom' && !fp.collapsed && vw - $('bottombar').offsetWidth - 28 - 8 >= r0.width
    ? vw - $('bottombar').offsetWidth - 28 : vw - 8;
  const leftEdge = fp.mode === 'bottom' && !fp.collapsed ? 104 : 8;      // (v16.2: docked at the bottom, clear of the compass)
  fp.x = clamp(fp.x, leftEdge, Math.max(leftEdge, rightEdge - r0.width));
  if (fp.mode === 'top') fp.y = top;
  else if (fp.mode === 'bottom') fp.y = vh - r0.height - BOTTOM_GAP;
  else fp.y = clamp(fp.y, top, Math.max(top, vh - r0.height - 8));
  panel.style.left = `${fp.x}px`;
  panel.style.top = `${fp.y}px`;
  // resize grips: both sides when docked; the inner side only for a side panel
  const r = panel.getBoundingClientRect(), right = r.left + r.width / 2 > vw / 2;
  grips[0].hidden = fp.collapsed || (!edge && !right);
  grips[1].hidden = fp.collapsed || (!edge && right);
  // the panel floats over the room: zoomed in, the view may pan further on the panel's side (OS-20: 1.3.1.3)
  const cover = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!fp.collapsed) {
    if (fp.mode === 'top') cover.top = r.bottom; else if (fp.mode === 'bottom') cover.bottom = vh - r.top;
    else if (right) cover.right = vw - r.left; else cover.left = r.right;
  }
  ortho.cover = cover;
  ortho.apply();
}
function dragOn(el, onMove, onStart) { // pointer drag helper (mouse, pen and touch)
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') && el === fpHead) return;
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    let lx = e.clientX, ly = e.clientY;
    if (onStart) onStart(e);
    const move = (ev) => { onMove(ev.clientX - lx, ev.clientY - ly, ev); lx = ev.clientX; ly = ev.clientY; };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
// moving: the pointer's height decides the mode (with some slack, so it doesn't flip back and forth)
let grab = { x: 0, y: 0 };
dragOn(fpHead, (dx, dy, ev) => {
  const vh = window.innerHeight, top = topLimit(), py = ev.clientY;
  let mode = fp.mode;
  if (py < top + 40) mode = 'top';
  else if (py > vh - 70) mode = 'bottom';
  else if (mode !== 'side' && py > top + 110 && py < vh - 140) mode = 'side';
  if (mode !== fp.mode) {
    const w = mode === 'side' ? fp.wSide : fp.wEdge;
    grab.x = clamp(grab.x, 20, w - 70);
    fp.mode = mode;
  }
  fp.x = ev.clientX - grab.x;
  if (mode === 'side') fp.y = py - grab.y;
  layoutPanel();
}, (e) => { const r = panel.getBoundingClientRect(); grab = { x: e.clientX - r.left, y: e.clientY - r.top }; });
// resizing from either grip (wider or narrower; never narrower than about 5 letters per name)
grips.forEach((g, i) => dragOn(g, (dx) => {
  const key = fp.mode === 'side' ? 'wSide' : 'wEdge', min = MIN_W[fp.mode === 'side' ? 'side' : 'edge'];
  const w = clamp(fp[key] + (i === 0 ? -dx : dx), Math.min(min, window.innerWidth - 16), window.innerWidth - 16);
  if (i === 0) fp.x -= w - fp[key];
  fp[key] = w;
  layoutPanel();
}));
fpToggle.addEventListener('click', () => { fp.collapsed = !fp.collapsed; layoutPanel(); });
window.addEventListener('resize', () => { fp.placed = false; layoutPanel(); });

// ---------- T.O. ZOOM (OS-20: 2.1.1): double-tap a name in the list ----------
//   1st double-tap: the view glides to ×5, roughly centred on that object (a hint – no ring)
//   double-tap the same name again, as the very next action: T.O. REVEAL (a ring, like Reveal 1)
let armed = null, lastLi = null;
findList.addEventListener('pointerup', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const it = targets.list[Number(li.dataset.i)], now = performance.now();
  if (lastLi && lastLi.it === it && now - lastLi.t < 450) { lastLi = null; toZoom(it); } else lastLi = { it, t: now };
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#findlist li')) { armed = null; lastLi = null; } }, true);
function toZoom(it) {
  if (!it || !it.form || targets.resolved(it)) return;
  if (armed === it) { armed = null; targets.reveal(1, it); return; }        // T.O. REVEAL
  const p = targets.focusPoint(it);
  if (!p) return;
  // "approximate": up to ~12 % of the zoomed view off-centre, in a random direction
  const toCam = targets.towardCam(p), side = new THREE.Vector3().crossVectors(toCam, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, toCam).normalize();
  const span = Math.min(window.innerWidth, window.innerHeight) / (targets.pxAt(p) / controls.zoom) / 5;
  const a = Math.random() * Math.PI * 2, d = Math.random() * 0.12 * span;
  p.addScaledVector(side, Math.cos(a) * d).addScaledVector(up, Math.sin(a) * d);
  controls.flyTo(p, 5);
  armed = it;
}

// ---------- tapping: find an object ----------
function screenToNdc(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
}
// how the current camera sees a point (for the find animation and rings)
targets.pxAt = (p) => (camera === orthoCam ? ortho.pxAt() : look.pxAt(p));
targets.towardCam = (p) => (camera === orthoCam ? targets.viewDir : perspCam.position.clone().sub(p).normalize());
targets.camDist = (p) => (camera === orthoCam ? 60 : perspCam.position.distanceTo(p));
targets.viewPx = () => Math.min(window.innerWidth, window.innerHeight);
// a tap: a listed Target Object is found; a look-alike gets "Close, but not this one." (no points lost)
ortho.onTap = look.onTap = (cx, cy) => {
  if (!session.round || session.round.ended === 'time') return;
  const r = targets.tap(screenToNdc(cx, cy), camera);
  if (r && r.tease) session.tease();
};
// REVEAL (SDD hint): rings listed, unfound objects where they are, after zooming out to ×1; each ring
// stays until that object is tapped (OS-21: 1.1). "Reveal List" = every listed one (OS-28: 1.1).
$('reveal1').addEventListener('click', () => { controls.reset(); targets.reveal(1); });
$('revealall').addEventListener('click', () => { controls.reset(); targets.reveal(Infinity); });

// ---------- v16.2 UNDO ↶ (OS-41: 3.1–3.2): the last found object goes back where it was, its points too ----------
$('undo').addEventListener('click', () => {
  session.undo((id) => {
    const it = targets.list.find((t) => t.def.id === id);
    if (!it || !targets.unfind(it)) return false;
    leaving.delete(it); it.wasShown = false;
    setCut([...cutNow]);                         // (a wall a view cuts away keeps hiding what hangs on it)
    targets.onChange(targets);
    return true;
  });
});

// ---------- v16.2 COMPASS (OS-41: 4.2): lower left – the way the view faces, by the Scene's real compass ----------
// (the same orientation the sun uses: sun.js compassDir). Stage / Walk-in: tap a letter (or any point of the dial)
// to turn that way, or drag round the dial to turn. Desktop: ← → turn, ↑ ↓ look up / down. Nothing animates at rest:
// the dial is redrawn only when the view turns.
const compassEl = $('compass'), rose = $('c-rose');
{
  const ticks = rose.querySelector('.c-ticks');
  for (let b = 0; b < 360; b += 30) if (b % 90) {
    const a = b * Math.PI / 180, l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 40 * Math.sin(a)); l.setAttribute('y1', -40 * Math.cos(a)); l.setAttribute('x2', 34 * Math.sin(a)); l.setAttribute('y2', -34 * Math.cos(a));
    ticks.appendChild(l);
  }
}
const TURN = study.compassTurn;                  // degrees: how the room is turned against the compass
const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI - TURN) % 360 + 360) % 360;
function facing() {
  if (ortho.active) return bearingOf(-VIEW_DIR.x, -VIEW_DIR.z);
  return bearingOf(-Math.sin(look.yaw), -Math.cos(look.yaw));
}
let shownBearing = null;
function updateCompass() {
  const b = facing();
  if (shownBearing !== null && Math.abs(b - shownBearing) < 0.2) return;
  shownBearing = b;
  rose.setAttribute('transform', `rotate(${(-b).toFixed(1)})`);
  for (const t of rose.querySelectorAll('.c-l')) t.setAttribute('transform', `rotate(${b.toFixed(1)} ${t.getAttribute('x')} ${t.getAttribute('y')})`);   // letters stay upright
  compassEl.setAttribute('aria-valuenow', Math.round(b));
  compassEl.title = `Facing ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]} (${Math.round(b)}°)` + (ortho.active ? ' – turn in Stage or Walk-in' : ' – tap a direction or drag round to turn');
  compassEl.classList.toggle('fixed', ortho.active);
}
const yawFor = (bearing) => -((bearing + TURN) * Math.PI / 180);
let turnHint = false;
function canTurn() {
  if (look.active) return true;
  if (!turnHint) { turnHint = true; toast('🧭 The Diorama faces one way – switch to 🎭 Stage or 🚶 Walk-in to turn'); }
  return false;
}
{
  let drag = null;
  const angleAt = (e) => { const r = compassEl.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
  compassEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { compassEl.setPointerCapture(e.pointerId); } catch (err) { /* (not a live pointer) */ }
    drag = { a: angleAt(e), moved: 0, x: e.clientX, y: e.clientY, letter: e.target.dataset && e.target.dataset.b };
  });
  compassEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = angleAt(e), d = Math.atan2(Math.sin(a - drag.a), Math.cos(a - drag.a));
    drag.a = a;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6 && !drag.moved) return;
    drag.moved += Math.abs(d);
    if (!look.active) return;
    look.fly = null;
    look.yaw += d;                               // the dial turns with the finger; the view turns with it
    look.apply();
    lastMove = performance.now();
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved > 0.02 || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) { if (!look.active) canTurn(); return; }
    if (!canTurn()) return;
    // a tap: a letter = that heading; anywhere else on the dial = the heading shown there
    const b = d.letter !== undefined ? Number(d.letter) : facing() + angleAt(e) * 180 / Math.PI;
    look.turnTo(yawFor(b));
  };
  compassEl.addEventListener('pointerup', end);
  compassEl.addEventListener('pointercancel', () => { drag = null; });
}
// desktop arrow keys (held down: smooth turn)
look.keys = { x: 0, y: 0 };
const KEYS = { ArrowLeft: ['x', 1], ArrowRight: ['x', -1], ArrowUp: ['y', 1], ArrowDown: ['y', -1] };
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.key];
  if (!k || (e.target && e.target.closest && e.target.closest('input, select, textarea'))) return;
  e.preventDefault();
  if (!canTurn()) return;
  look.keys[k[0]] = k[1];
});
window.addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k) look.keys[k[0]] = 0; });
window.addEventListener('blur', () => { look.keys.x = look.keys.y = 0; });

// ---------- M3–M5: the game round ----------
const session = new Session({
  levels: LEVELS,
  lighting: () => ({ preset: lighting.name, hours: lighting.hours() }),
  view: () => view,
  restart: (o) => startRound(o ? { ...o } : null),
});
targets.onFound = (it, how) => session.onFound(it, how);
const busy = (on, title = 'Hiding the objects…', sub = '') => { $('busy').hidden = !on; $('busy-title').textContent = title; $('busy-sub').textContent = sub; };

// ---------- a new round (Scene Instance): lived-in variation, new Target and Passive Objects ----------
// opts: the Per Scene Options (null = ask, unless the player uses saved defaults); resume: a saved round
let starting = false;
async function startRound(opts = null, resume = null) {
  if (starting) return;
  starting = true;
  try {
    if (!opts) opts = await session.askOptions();
    if (LEVELS[params.get('chal')] && !resume) opts.chal = params.get('chal');
    opts.seed = opts.seed ?? (params.get('round') && !startRound.used ? Number(params.get('round')) : Math.floor(Math.random() * 1e9));
    startRound.used = true;
    targets.level = opts.chal;
    chalSel.value = opts.chal;
    updatePills();
    // OS-25 (5.1): avoid the zones the last rounds' Target Objects used
    targets.avoid = new Set(opts.avoid || store.get('zones', []));
    opts.avoid = [...targets.avoid];
    busy(true, 'Hiding the objects…', 'Loading models…');
    await new Promise((r) => setTimeout(r, 30));      // (let the note show)
    const picked = targets.pick(opts.seed, opts.chal);
    const need = [...picked.bg, ...picked.tos, ...picked.pos];
    const groups = await library.loadMany(need, (n, all) => { $('busy-sub').textContent = `Loading models ${n} / ${all}`; });
    // v16.1 (OS-36, iPad): always 15 Target Objects – a model that didn't load is replaced by another one
    // (a different list word), and a short note says which model it was
    if (library.failed.length) {
      const missing = picked.tos.filter((d) => !groups.has(d.id));
      if (missing.length) {
        const r = rng(opts.seed ^ 0x70b5), have = new Set(need.map((d) => d.id));
        const words = new Set(picked.tos.filter((d) => groups.has(d.id)).map((d) => d.word));
        const spare = library.defs.filter((d) => d.role === 'to' && !have.has(d.id) && !library.failed.includes(d)).sort(() => r() - 0.5);
        const extra = [];
        for (const d of spare) { if (extra.length >= missing.length + 2) break; if (!words.has(d.word)) { extra.push(d); words.add(d.word); } }
        $('busy-sub').textContent = 'Loading replacement models…';
        for (const [id, g] of await library.loadMany(extra, null, true)) groups.set(id, g);
        const ok = extra.filter((d) => groups.has(d.id)).slice(0, missing.length);
        picked.tos = picked.tos.filter((d) => groups.has(d.id)).concat(ok);
        picked.order = picked.order.filter((d) => groups.has(d.id)).concat(ok);
      }
      const names = [...new Set(library.failed.map((d) => d.word))];
      setTimeout(() => toast(names.length === 1 ? `Couldn't load the ${names[0]} – another object took its place.`
        : `Couldn't load ${names.length} models (${names.slice(0, 3).join(', ')}) – other objects took their places.`), 900);
    }
    $('busy-sub').textContent = 'Finding hiding places…';
    await new Promise((r) => setTimeout(r, 20));
    batcher.clear();
    fx.decorate(rng(opts.seed ^ 0x5eed));        // lived-in variation (desk, side table, door)
    sampler.set(sampler.name);
    setCut(VIEWS.diorama.cut);                   // objects are hidden for the Diorama view (seen by every view)
    targets.place(opts.seed, picked, groups);
    if (!resume) store.set('zones', [...targets.zonesUsed, ...[...targets.avoid].slice(0, 30)]);
    rebatch();
    setCut(VIEWS[view].cut);
    armed = null;
    leaving.clear();
    if (resume) targets.restore(resume.found, resume.revealed);
    session.begin(opts, targets, resume);
    targets.onChange(targets);
  } catch (e) {
    console.error(e);
    toast('Something went wrong while hiding: ' + (e.message || e));
  } finally {
    busy(false);
    starting = false;
    busyUntil = performance.now() + 800;
  }
}
$('newround').addEventListener('click', () => startRound());
// CHALLENGE LVL: Low / Medium / High – also changeable inside the Scene (OS-33: 5.4.1): restarts the Scene.
// v16.1 (OS-36): its own pill, top left (no dev acronyms in the player's view)
const chalSel = $('chal');
Object.entries(LEVELS).forEach(([k, v]) => chalSel.add(new Option(v.label, k)));
chalSel.value = session.defaults.chal;
chalSel.addEventListener('change', () => {
  chalSel.blur();
  const o = session.round ? { ...session.round.opts } : { ...session.defaults };
  delete o.seed; delete o.avoid;
  o.chal = chalSel.value;
  startRound(o);
});

// background: the rest of the model library is stored on the device for offline play (OS-33: 3.2)
async function fillLibrary() {
  if (!('caches' in window) || location.protocol === 'file:') return;
  try {
    const cache = await caches.open(MODEL_CACHE);
    const defs = library.defs;
    let have = 0;
    for (const d of defs) {
      const url = new URL(modelUrl(d), location.href).href;
      if (!(await cache.match(url))) {
        try { const res = await fetch(url, { cache: 'no-cache' }); if (res.ok) await cache.put(url, res); } catch (e) { return; }   // offline: try again next time
        await new Promise((r) => setTimeout(r, 40));
      }
      have++;
      if (have % 10 === 0 || have === defs.length) $('offline').textContent = have < defs.length ? `library ${have} / ${defs.length}` : 'offline-ready ✓';
    }
  } catch (e) { console.warn('library fill', e); }
}

// ---------- test-tool pills: hover peeks (desktop), click/tap pins open or closed ----------
document.querySelectorAll('.tool').forEach((tool) => {
  const pill = tool.querySelector('.pill');
  pill.addEventListener('click', () => {
    const open = !tool.classList.contains('open');
    tool.classList.toggle('open', open);
    tool.classList.toggle('shut', !open);       // closing by click also stops the hover peek until the mouse leaves
    pill.setAttribute('aria-expanded', String(open));
  });
  tool.addEventListener('mouseleave', () => tool.classList.remove('shut'));
});
function updatePills() {
  $('pill-style').textContent = (STYLES[sampler.name] || {}).label || sampler.name;
  $('pill-chal').textContent = (LEVELS[chalSel.value] || LEVELS.med).label;
  $('pill-quality').textContent = quality.label;
  $('pill-clock').textContent = fmt(lighting.hours());
}

// ---------- Overhead lights (OS-19: 4): steady ceiling light, on/off, independent of the presets ----------
const overheadBtn = $('overhead');
overheadBtn.addEventListener('click', () => {
  lighting.setOverhead(!lighting.overhead);
  overheadBtn.classList.toggle('on', lighting.overhead);
  overheadBtn.setAttribute('aria-pressed', String(lighting.overhead));
});

// first round: resume the saved one (M5), else ask the Per Scene Options
{
  const saved = params.get('round') || params.get('fresh') ? null : session.saved();
  if (saved) startRound({ ...saved.opts }, saved).then(() => toast('Welcome back – your Scene is as you left it'));
  else startRound(params.get('opts') === 'default' ? { ...session.defaults } : null);
}
let startView = 'diorama';
try { startView = localStorage.getItem('objectsleuth.view') || 'diorama'; } catch (e) { /* ignore */ }
setView(VIEWS[params.get('view')] ? params.get('view') : startView, !params.get('view'));
if (params.get('zoom') && view === 'diorama') {
  const [x, y, z] = (params.get('focus') || '0,1.2,0').split(',').map(Number);
  ortho.focusOn(new THREE.Vector3(x, y, z), Number(params.get('zoom')));
}
updatePills();
window.objectsleuth = { targets, library, session, get camera() { return camera; }, THREE, fx: study.fx, renderer, composer, scene, lighting, setLab, get controls() { return controls; }, ortho, look, setView, startRound, batcher, study, chooseStyle }; // (for testing in the browser console)

// ---------- main loop (v13 "zero-idle": draw only when something visible changes) ----------
//  • moving (pan, zoom, walking, a find animation, curtains gliding, test-clock time-lapse): full
//    speed, lighter contact shading
//  • still: a light check 4× a second (clock, sun, clouds, lamps); the room is redrawn ONLY if one of
//    them visibly changed – usually about once a minute. Otherwise nothing is drawn at all.
//  • when the view stops moving: one final, fully refined picture
//  • Auto: if panning gets slow, the picture gets slightly less sharp (and sharper again when there's room)
const fpsEl = $('fps');
let last = performance.now(), lastTick = 0, frames = 0, acc = 0, cpu = 0, draws = 0, lastSig = '', wasMoving = false;
let moveFrames = 0, moveTime = 0, slow = 0, quick = 0, secStart = last;
const start = last;
renderer.info.autoReset = false;
// any tap or change in the on-screen controls (lighting, style, quality, Restart…): full speed for
// 1.5 s, so changes glide smoothly instead of stepping
// (busyUntil is declared with lastMove, above)
for (const ev of ['pointerdown', 'change', 'keydown']) document.addEventListener(ev, () => { busyUntil = performance.now() + 1500; }, true);
window.addEventListener('resize', () => { busyUntil = performance.now() + 500; });
function visibleState() {
  const c = lighting.cur, h = lighting.hours();
  library.setFill(clamp(0.3 * c.hemiI / 2.3, 0.04, 0.35));        // v16.2: reflected light on imported things follows the daylight
  return [c.sunI, c.hemiI, c.exposure, c.lampI, c.rays, c.windowI, c.toSun.x, c.toSun.y, c.toSun.z]
    .map((v) => v.toFixed(3)).join() + c.bg.getHexString() + '|' + Math.floor(h * 60) + (lighting.overhead ? 'O' : '') + view + fx.curtains.k.toFixed(3);
}
function draw(dt) {
  if (targets.changed) { targets.changed = false; renderer.shadowMap.needsUpdate = true; gtao.aoDirty = true; }
  if (lighting.shadowDirty) { lighting.shadowDirty = false; renderer.shadowMap.needsUpdate = true; }
  if (study.busy) { renderer.shadowMap.needsUpdate = true; gtao.aoDirty = true; }   // curtains gliding
  const c0 = performance.now();
  renderer.info.reset();
  if (miniature || lab.ao) composer.render(dt); else renderer.render(scene, camera);
  cpu += performance.now() - c0;
  draws = renderer.info.render.calls;
  frames++;
}
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const moving = now - lastMove < 300 || now < busyUntil || controls.pointers.size > 0 || targets.animating() || !!lighting.timeLapse
    || !!controls.anim || !!controls.fly || !!look.walk || study.busy || (look.active && !!(look.keys.x || look.keys.y));   // (v16.2: arrow keys held)
  const dt = Math.min((now - last) / 1000, 0.25);
  if (moving) {
    last = now;
    if (!wasMoving) { setAODetail(0.5); lighting.setMoving(true); wasMoving = true; }
    const t = (now - start) / 1000;
    controls.update(dt);
    lighting.update(dt, t);
    study.animate(t, lighting.hours());
    if (study.changed) { study.changed = false; batcher.refresh(fx.movers); }   // curtains moved: re-merge their batches
    targets.update(dt);
    gtao.aoDirty = true;
    draw(dt);
    moveFrames++; moveTime += dt;
  } else {
    if (wasMoving) { wasMoving = false; setAODetail(1); lighting.setMoving(false); draw(dt); } // the view just stopped: one refined picture
    if (now - lastTick >= 250) { // the light check
      lastTick = now; last = now;
      const t = (now - start) / 1000;
      controls.update(dt);
      lighting.update(dt, t);
      study.animate(t, lighting.hours());
      if (study.changed) { study.changed = false; batcher.refresh(fx.movers); }   // curtains moved: re-merge their batches
      targets.update(dt);
      const sig = visibleState();
      if (sig !== lastSig || targets.changed || lighting.shadowDirty || gtao.aoDirty) { lastSig = sig; draw(dt); }
    }
  }
  if (now - secStart >= 1000) { // the meter, once a second
    acc = (now - secStart) / 1000;
    const fps = Math.round(frames / acc);
    fpsEl.textContent = frames ? `${fps} fps · ${(cpu / frames).toFixed(1)} ms · ${draws} draws · ×${prNow.toFixed(2)}` : `0 fps (resting) · ×${prNow.toFixed(2)}`;
    showTestClock();
    session.tick();                     // timer + score text (page text only: no 3D redraw)
    if (quality.adaptive && moveTime > 0.5) {
      const mfps = moveFrames / moveTime;
      slow = mfps < 45 ? slow + 1 : 0;              // v16.1 (OS-37: 5): reacts a little sooner (was < 40)
      quick = mfps > 57 ? quick + 1 : 0;
      if (slow >= 2 && prNow > 0.75) { setSharpness(prNow - 0.15); slow = 0; }
      if (quick >= 3 && prNow < Math.min(window.devicePixelRatio, quality.pr)) { setSharpness(Math.min(prNow + 0.1, window.devicePixelRatio, quality.pr)); quick = 0; }
    }
    frames = 0; cpu = 0; moveFrames = 0; moveTime = 0; secStart = now;
  }
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
    .then(() => { $('offline').textContent = 'offline-ready ✓'; setTimeout(fillLibrary, 6000); })
    .catch((err) => { $('offline').textContent = 'offline unavailable'; console.warn(err); });
} else {
  $('offline').textContent = 'offline unavailable';
}
