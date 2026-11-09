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
import { Targets, LEVELS } from './game/targets.js';
import { StaticBatcher } from './art/batch.js';
import { rng } from './core/random.js';

// VERSION: one sequential number per published build (JM CP edit, 2026-11-07). Bump it together
// with VERSION in sw.js; MILESTONES.md keeps the history (v01 = M0 …).
const APP_VERSION = 'v15';
const BUILD = 'Draft 1';
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
// Target Objects are added before the style sampler, so they take on each art style too.
const targets = new Targets(study.root, study.fx, VIEW_DIR);
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
  lastMove = performance.now(); busyUntil = performance.now() + 600;
  if (name === 'walk' && !walkHintShown) { walkHintShown = true; toast('🚶 Drag to look around · double-tap the floor to walk there · pinch to zoom'); }
  if (remember) try { localStorage.setItem('objectsleuth.view', name); } catch (e) { /* ignore */ }
}
viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
// WALK-IN: double-tap the floor (or rug) to step there – never into furniture or walls
function walkHere(cx, cy) {
  if (look.zoom > 1.6) return false;              // zoomed in: a double-tap zooms further instead
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
Object.entries(STYLES).filter(([, s]) => !s.parked).forEach(([key, s]) => styleSel.add(new Option(s.label, key)));
// Shadows are measured from the FRONT (lit) faces of solid objects. Measuring from back faces (the
// three.js default) let light creep a few millimetres past every joint – the thin glowing lines
// where the hearth meets the floor and the pillars meet the hearth (OS-12 follow-up).
function frontFaceShadows() {
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.side === THREE.FrontSide && !o.material.transparent) o.material.shadowSide = THREE.FrontSide;
  });
}
function chooseStyle(name) {
  batcher.clear();      // v12: un-merge, re-dress in the new style, merge again
  sampler.set(name);
  rebatch();
  styleSel.value = sampler.name;
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
try {
  sampler.set(localStorage.getItem('objectsleuth.style') || 'lowpoly');   // (merged once the first round is laid out)
  styleSel.value = sampler.name;
  setMiniature(localStorage.getItem('objectsleuth.mini') === '1');
} catch (e) { sampler.set('lowpoly'); }

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
  if (key === 'ao') { gtao.enabled = on; gtao.aoDirty = true; }
  if (key === 'soft') lighting.setSoftShadows(on && graded);
  if (key === 'fire') lighting.setFireShadows(on);
}
let quality = QUALITY.auto, prNow = 1;
const qualitySel = $('quality');
Object.entries(QUALITY).forEach(([k, q]) => qualitySel.add(new Option('QUALITY: ' + q.label, k)));
function setQuality(name) {
  quality = QUALITY[name] || QUALITY.auto;
  qualitySel.value = Object.keys(QUALITY).find((k) => QUALITY[k] === quality);
  setLab('ao', true); setLab('soft', quality.soft); setLab('fire', quality.fire);
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
  $('pill-clock').textContent = fmt(h);
  if (document.activeElement !== tcRange) tcRange.value = h;
  tcLive.classList.toggle('on', lighting.name === 'auto' && lighting.testHours === null);
  tcPlay.classList.toggle('on', !!lighting.timeLapse);
}

$('zoom-in').addEventListener('click', () => controls.zoomBy(2));
$('zoom-out').addEventListener('click', () => controls.zoomBy(0.5));
$('zoom-reset').addEventListener('click', () => controls.reset());
const zoomLabel = $('zoom-label');
let lastMove = -1e9; // when the view last moved (rest mode, see the main loop)
let busyUntil = 0;   // full speed until then (see the main loop)
ortho.onChange = look.onChange = (c) => {
  if (c !== controls) return;
  zoomLabel.textContent = '×' + c.zoom.toFixed(1); gtao.aoDirty = true; lastMove = performance.now();
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
const panel = $('findpanel'), findList = $('findlist'), findMsg = $('findmsg');
const fpHead = $('fp-head'), fpToggle = $('fp-toggle'), grips = [$('fp-grip-l'), $('fp-grip-r')];
targets.onChange = (tg) => {
  findList.innerHTML = '';
  tg.list.forEach((it, i) => {
    const li = document.createElement('li');
    li.dataset.i = i;
    li.className = it.found ? 'found' : it.revealed ? 'revealed' : it.ringed ? 'ringed' : '';
    li.title = 'Double-tap: T.O. Zoom (hint) · double-tap again: T.O. Reveal';
    li.innerHTML = `<span class="ico"><span>${it.icon}</span></span><span class="nm"></span><span class="st">${it.found ? 'FOUND' : it.revealed ? 'REVEALED' : it.ringed ? 'TAP IT' : ''}</span>`;
    li.querySelector('.nm').textContent = it.name;
    findList.appendChild(li);
  });
  const total = tg.list.length, found = tg.list.filter((it) => it.found).length, rev = tg.list.filter((it) => it.revealed).length, done = found + rev;
  $('fp-done').textContent = `${found} / ${total}` + (rev ? ` · 👁️ ${rev}` : '');
  $('fp-count').textContent = `${done} / ${total}`;
  const bar = $('fp-bar');
  bar.style.width = `${(100 * done) / total}%`;
  bar.style.background = done ? `linear-gradient(90deg, var(--green) ${(100 * found) / done}%, #8d929b ${(100 * found) / done}%)` : '';
  findMsg.textContent = done < total ? '' : rev
    ? `CONGRATULATIONS…you've completed this Scene: ${found} found, ${rev} revealed. Restart to play again.`
    : "CONGRATULATIONS…you've discovered all the Target Objects to complete this Scene! Restart to play again.";
  findMsg.hidden = done !== total;
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
  panel.style.maxHeight = `${Math.max(120, edge ? vh * 0.5 : vh - Math.max(top, fp.y) - 150)}px`;
  // docked at the bottom: stay clear of the Reveal + zoom buttons (bottom right) when there's room
  if (fp.mode === 'bottom' && !fp.collapsed) {
    const bars = Math.max($('hintbar').offsetWidth, $('zoombar').offsetWidth) + 28;
    const room = vw - bars - 8;
    if (room >= MIN_W.edge) { fp.wEdge = Math.min(fp.wEdge, room); panel.style.width = `${fp.wEdge}px`; }
  }
  const r0 = panel.getBoundingClientRect();
  const rightEdge = fp.mode === 'bottom' && !fp.collapsed && vw - Math.max($('hintbar').offsetWidth, $('zoombar').offsetWidth) - 28 - 8 >= r0.width
    ? vw - Math.max($('hintbar').offsetWidth, $('zoombar').offsetWidth) - 28 : vw - 8;
  fp.x = clamp(fp.x, 8, Math.max(8, rightEdge - r0.width));
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
ortho.onTap = look.onTap = (cx, cy) => { targets.tap(screenToNdc(cx, cy), camera); };
// REVEAL (SDD hint): rings unfound objects where they are, after zooming out to ×1; each ring stays
// until that object is tapped (OS-21: 1.1)
$('reveal1').addEventListener('click', () => { controls.reset(); targets.reveal(1); });
$('revealall').addEventListener('click', () => { controls.reset(); targets.reveal(Infinity); });

// ---------- a new round (Scene Instance): new decor, new Target and Passive Objects ----------
function newRound(seed = Math.floor(Math.random() * 1e9)) {
  batcher.clear();
  fx.decorate(rng(seed ^ 0x5eed));           // fabrics and book colours (v15, M2)
  sampler.set(sampler.name);                  // dress the swapped fabrics in the current style
  setCut(VIEWS.diorama.cut);                  // objects are hidden for the Diorama view (seen by every view)
  targets.newRound(seed);
  rebatch();
  setCut(VIEWS[view].cut);
  armed = null;
}
$('newround').addEventListener('click', () => {
  findMsg.hidden = false; findMsg.textContent = 'Hiding…';
  setTimeout(() => newRound(), 30); // let the note show before the (short) search
});
// CHAL LVL: Low / Medium / High concealment
const chalSel = $('chal');
Object.entries(LEVELS).forEach(([k, v]) => chalSel.add(new Option('CHAL LVL: ' + v.label, k)));
try { const c = localStorage.getItem('objectsleuth.chal'); if (LEVELS[c]) targets.level = c; } catch (e) { /* ignore */ }
if (LEVELS[params.get('chal')]) targets.level = params.get('chal');
chalSel.value = targets.level;
chalSel.addEventListener('change', () => {
  targets.level = chalSel.value;
  try { localStorage.setItem('objectsleuth.chal', chalSel.value); } catch (e) { /* ignore */ }
  chalSel.blur();
  findMsg.hidden = false; findMsg.textContent = 'Hiding…';
  setTimeout(() => newRound(), 30);
});

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

newRound(params.get('round') ? Number(params.get('round')) : undefined);
let startView = 'diorama';
try { startView = localStorage.getItem('objectsleuth.view') || 'diorama'; } catch (e) { /* ignore */ }
setView(VIEWS[params.get('view')] ? params.get('view') : startView, !params.get('view'));
if (params.get('zoom') && view === 'diorama') {
  const [x, y, z] = (params.get('focus') || '0,1.2,0').split(',').map(Number);
  ortho.focusOn(new THREE.Vector3(x, y, z), Number(params.get('zoom')));
}
updatePills();
window.objectsleuth = { targets, get camera() { return camera; }, THREE, fx: study.fx, renderer, composer, scene, lighting, setLab, get controls() { return controls; }, ortho, look, setView, newRound, batcher, study }; // (for testing in the browser console)

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
    || !!controls.anim || !!controls.fly || !!look.walk || study.busy;
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
    if (quality.adaptive && moveTime > 0.5) {
      const mfps = moveFrames / moveTime;
      slow = mfps < 40 ? slow + 1 : 0;
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
    .then(() => { $('offline').textContent = 'offline-ready ✓'; })
    .catch((err) => { $('offline').textContent = 'offline unavailable'; console.warn(err); });
} else {
  $('offline').textContent = 'offline unavailable';
}
