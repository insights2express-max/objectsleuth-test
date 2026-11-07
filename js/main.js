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
import { GTAOPass } from '../vendor/three/addons/postprocessing/GTAOPass.js';
import { installGradedShadows } from './scene/softshadows.js';
import { Targets, LEVELS } from './game/targets.js';
import { StaticBatcher } from './art/batch.js';

// VERSION: one sequential number per published build (JM CP edit, 2026-11-07). Bump it together
// with VERSION in sw.js; MILESTONES.md keeps the history (v01 = M0 …).
const APP_VERSION = 'v14';
const BUILD = 'Draft 1';
const $ = (id) => document.getElementById(id);

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
// near/far hug the room (camera is 40 m away): finer depth steps, so touching surfaces don't flicker on tablets
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 25, 60);
const study = buildStudy();
scene.add(study.root);
const lighting = new Lighting(scene, renderer, study.fx, study.compassTurn);

// Isometric-style view from the front-right, looking into the room.
const controls = new ViewControls(camera, canvas, { maxZoom: 20 });
controls.setView(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0.95, 1.2), 40); // = VIEW_DIR
controls.fit(study.bounds);

// ---------- STYLE SAMPLER (test feature) ----------
const fx = study.fx;
// FIRST TARGET OBJECT TEST: added before the style sampler, so they take on each art style too.
const VIEW_DIR = new THREE.Vector3(1, 0.95, 1.2);
const targets = new Targets(study.root, study.fx, VIEW_DIR);
const batcher = new StaticBatcher(study.root);
const sampler = new StyleSampler(study.root, [...fx.bulbMats, ...fx.shadeMats, ...fx.windowMats]);

// Miniature filter: blurs the top and bottom of the picture (tilt-shift) and adds a little
// extra color, so the room looks like a tiny model photographed up close.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }) /* edge-smoothing 2× (OS-19: 3.3) */);
composer.addPass(new RenderPass(scene, camera));

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
  batcher.build();
  frontFaceShadows();
  renderer.shadowMap.needsUpdate = true; gtao.aoDirty = true;  // new materials and shapes: draw shadows and shading again
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
  chooseStyle(localStorage.getItem('objectsleuth.style') || 'lowpoly');
  setMiniature(localStorage.getItem('objectsleuth.mini') === '1');
} catch (e) { chooseStyle('lowpoly'); }

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
controls.onChange = (c) => { zoomLabel.textContent = '×' + c.zoom.toFixed(1); gtao.aoDirty = true; lastMove = performance.now(); };
controls.apply();

$('build').textContent = APP_VERSION + ' · ' + BUILD;
$('ver').textContent = APP_VERSION;

// Test shortcuts in the address, e.g.  ?light=night&zoom=8&focus=0,0.4,-2.6
const params = new URLSearchParams(window.location.search);
if (PRESETS[params.get('light')]) choosePreset(params.get('light'), true);
if (params.get('time')) { choosePreset('auto', true); lighting.testHours = Number(params.get('time')); }
if (params.get('cloud')) lighting.clouds.fixed = Number(params.get('cloud'));
if (params.get('style')) chooseStyle(params.get('style'));
if (params.get('mini')) setMiniature(params.get('mini') === '1');
for (const k of ['ao', 'soft', 'fire']) if (params.get(k)) setLab(k, params.get(k) === '1');
if (params.get('zoom')) {
  const [x, y, z] = (params.get('focus') || '0,1.2,0').split(',').map(Number);
  controls.focusOn(new THREE.Vector3(x, y, z), Number(params.get('zoom')));
}

// ---------- FIND panel (v14): drag by its header, resize by its grip, fold with the chevron ----------
const panel = $('findpanel'), findList = $('findlist'), findMsg = $('findmsg');
const fpHead = $('fp-head'), fpGrip = $('fp-grip'), fpToggle = $('fp-toggle');
targets.onChange = (tg) => {
  findList.innerHTML = '';
  for (const it of tg.items) {
    const li = document.createElement('li');
    li.className = it.revealed ? 'revealed' : it.found ? 'found' : '';
    li.innerHTML = `<span class="ico"><span>${it.icon}</span></span><span class="nm"></span><span class="st">${it.revealed ? 'REVEALED' : it.found ? 'FOUND' : ''}</span>`;
    li.querySelector('.nm').textContent = it.name;
    findList.appendChild(li);
  }
  const done = tg.items.filter((it) => it.found).length, total = tg.items.length;
  $('fp-done').textContent = `${done} / ${total}`;
  $('fp-count').textContent = `${done} / ${total}`;
  $('fp-bar').style.width = `${(100 * done) / total}%`;
  findMsg.textContent = done === total ? "CONGRATULATIONS…you've discovered all the Target Objects to complete this Scene! Restart to play again." : '';
  findMsg.hidden = done !== total;
  layoutPanel();
};
// Where the panel is and how it is laid out. Remembered only within this Scene Instance.
const fp = { x: 0, y: 70, w: 300, collapsed: false, edge: false, placed: false };
function defaultsForScreen() {
  const vw = window.innerWidth, vh = window.innerHeight, landscape = vw >= vh;
  fp.collapsed = !landscape;                       // portrait: folded, at the bottom, list in rows
  fp.w = landscape ? Math.min(300, vw * 0.3) : Math.min(560, vw - 24);
  fp.x = landscape ? vw - fp.w - 12 : (vw - fp.w) / 2;
  fp.y = landscape ? 70 : vh - 140;
  fp.placed = true;
}
function placeTools() { // the tool pills sit just under the top bar (which wraps on narrow screens)
  const tb = document.getElementById('topbar').getBoundingClientRect();
  document.getElementById('tools').style.top = `${Math.round(tb.bottom + 8)}px`;
}
function layoutPanel() {
  placeTools();
  if (!fp.placed) defaultsForScreen();
  const vw = window.innerWidth, vh = window.innerHeight;
  panel.classList.toggle('collapsed', fp.collapsed);
  fpToggle.setAttribute('aria-expanded', String(!fp.collapsed));
  panel.style.width = fp.collapsed ? 'auto' : `${fp.w}px`;
  const r0 = panel.getBoundingClientRect();
  fp.x = Math.min(Math.max(0, fp.x), Math.max(0, vw - r0.width));
  fp.y = Math.min(Math.max(0, fp.y), Math.max(0, vh - r0.height));
  panel.style.left = `${fp.x}px`;
  panel.style.top = `${fp.y}px`;
  const r = panel.getBoundingClientRect(), cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
  // near the top or bottom: a horizontal list (2 rows of 3); at the sides: one column
  fp.edge = cyp < vh * 0.22 || cyp > vh * 0.78;
  panel.classList.toggle('edge', fp.edge);
  panel.classList.toggle('side', !fp.edge);
  fpGrip.className = 'fp-grip ' + (cxp > vw / 2 ? 'left' : 'right');
  // frame the room in the space the panel leaves free
  const pad = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!fp.collapsed && r.width > 40) {
    if (fp.edge) { if (cyp < vh / 2) pad.top = r.bottom; else pad.bottom = vh - r.top; }
    else if (cxp > vw / 2) pad.right = vw - r.left; else pad.left = r.right;
  }
  const p = controls.pad;
  if (p.left !== pad.left || p.right !== pad.right || p.top !== pad.top || p.bottom !== pad.bottom) {
    controls.pad = pad;
    controls.resize();
  }
}
function dragOn(el, onMove, onEnd) { // pointer drag helper (mouse, pen and touch)
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') && el === fpHead) return;
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    let lx = e.clientX, ly = e.clientY;
    const move = (ev) => { onMove(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (onEnd) onEnd(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
dragOn(fpHead, (dx, dy) => { fp.x += dx; fp.y += dy; layoutPanel(); });
dragOn(fpGrip, (dx) => {
  const left = fpGrip.classList.contains('left');
  const w = Math.max(12, Math.min(window.innerWidth * 0.7, fp.w + (left ? -dx : dx)));
  if (left) fp.x -= w - fp.w;
  fp.w = w;
  layoutPanel();
});
fpToggle.addEventListener('click', () => { fp.collapsed = !fp.collapsed; layoutPanel(); });
window.addEventListener('resize', () => { fp.placed = false; layoutPanel(); });

// ---------- tapping: find an object, or dismiss revealed ones ----------
function screenToNdc(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
}
const pxPerUnit = () => canvas.getBoundingClientRect().height / ((camera.top - camera.bottom) / camera.zoom);
targets.pxPerUnit = pxPerUnit;
targets.viewPx = () => { const v = controls.visibleRect(); return Math.min(v.w, v.h); };
controls.onTap = (cx, cy) => {
  if (targets.releaseReveals()) return;           // a tap anywhere lets revealed objects go
  targets.tap(screenToNdc(cx, cy), camera, pxPerUnit());
};
// REVEAL (SDD hint): shows unfound objects where they are, in a frozen ring, after zooming out to ×1
$('reveal1').addEventListener('click', () => { controls.reset(); targets.reveal(1); });
$('revealall').addEventListener('click', () => { controls.reset(); targets.reveal(Infinity); });

$('newround').addEventListener('click', () => {
  findMsg.hidden = false; findMsg.textContent = 'Hiding…';
  setTimeout(() => targets.newRound(), 30); // let the note show before the (short) search
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
  setTimeout(() => targets.newRound(), 30);
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

targets.newRound(params.get('round') ? Number(params.get('round')) : undefined);
updatePills();
window.objectsleuth = { targets, camera, THREE, fx: study.fx, renderer, composer, scene, lighting, setLab, controls }; // (for testing in the browser console)

// ---------- main loop ----------
// ---------- main loop (v13 "zero-idle": draw only when something visible changes) ----------
//  • moving (pan, zoom, a find animation, test-clock time-lapse): full speed, lighter contact shading
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
let busyUntil = 0;
for (const ev of ['pointerdown', 'change', 'keydown']) document.addEventListener(ev, () => { busyUntil = performance.now() + 1500; }, true);
window.addEventListener('resize', () => { busyUntil = performance.now() + 500; });
function visibleState() {
  const c = lighting.cur, h = lighting.hours();
  return [c.sunI, c.hemiI, c.exposure, c.lampI, c.rays, c.windowI, c.toSun.x, c.toSun.y, c.toSun.z]
    .map((v) => v.toFixed(3)).join() + c.bg.getHexString() + '|' + Math.floor(h * 60) + (lighting.overhead ? 'O' : '');
}
function draw(dt) {
  if (targets.changed) { targets.changed = false; renderer.shadowMap.needsUpdate = true; gtao.aoDirty = true; }
  if (lighting.shadowDirty) { lighting.shadowDirty = false; renderer.shadowMap.needsUpdate = true; }
  const c0 = performance.now();
  renderer.info.reset();
  if (miniature || lab.ao) composer.render(dt); else renderer.render(scene, camera);
  cpu += performance.now() - c0;
  draws = renderer.info.render.calls;
  frames++;
}
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const moving = now - lastMove < 300 || now < busyUntil || controls.pointers.size > 0 || targets.pops.length > 0 || !!lighting.timeLapse || !!controls.anim;
  const dt = Math.min((now - last) / 1000, 0.25);
  if (moving) {
    last = now;
    if (!wasMoving) { setAODetail(0.5); lighting.setMoving(true); wasMoving = true; }
    const t = (now - start) / 1000;
    controls.update(dt);
    lighting.update(dt, t);
    study.animate(t, lighting.hours());
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
