// ASSET INTAKE (test page, RFI OS-27 pilot): shows every imported model from assets/models on a
// desk under game-like light, so JM can judge them by eye before they enter the game.
//   Look     Original (the file as made) · Clay / Felt / Knit (our skins over soft colour zones) · Low-poly (reduced + flat)
//   Detail   Full · Lite (≤ LITE_TRIS triangles per model – the in-game budget)
//   Shuffle  new random rest pose / lean / side, turn, size and colour per model – proves the
//            "one asset, many looks" variation the game will use.
// The page draws only when something changes (no idle animation).
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from '../../vendor/three/addons/modifiers/SimplifyModifier.js';
import { StyleSampler } from '../art/styles.js';
import { ASSET_DEFS } from '../game/assetlib.js';

const LITE_TRIS = 3000, LOWPOLY_TRIS = 700;
const TABLE_Y = 0.75;
const DESK_W = 2.7, DESK_D = 1.6;            // big enough for ~42 models
const COLS = 7, GAP_X = 0.36, GAP_Z = 0.25;  // grid on the desk

// ---------------------------------------------------------------- renderer, scene, camera
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x221c17);
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 40);

let dirty = true;
const redraw = () => { dirty = true; };

// Reflections: a tiny made-up room (window, ceiling light, warm walls) blurred into an environment
// map once at start. Without it, metal (brass, gold) looks black. Cost: one bake, nothing per frame.
function makeEnvironment() {
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x5d5047, side: THREE.BackSide }));
  box.position.y = 2;
  env.add(box);
  const panel = (w, h, rgb, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel(3.2, 2.4, [6, 5.6, 5], [-4.9, 2.4, 0.5], [0, Math.PI / 2, 0]);    // window (cool daylight)
  panel(2.2, 2.2, [2.2, 1.9, 1.5], [0, 4.9, 0], [Math.PI / 2, 0, 0]);     // ceiling light (warm)
  panel(10, 1.2, [0.18, 0.12, 0.08], [0, -0.9, 0], [-Math.PI / 2, 0, 0]); // dark floor
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  return tex;
}
const envMap = makeEnvironment();
scene.environment = envMap;
scene.environmentIntensity = 0.55;

// Room: floor, back wall, a simple wooden desk.
const woodTex = (() => { // soft wood grain, drawn once
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6b472b'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${40 + Math.random() * 30},${22 + Math.random() * 18},${10 + Math.random() * 10},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 0.5 + Math.random() * 2.2;
    const y = Math.random() * 128; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3 + (Math.random() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.anisotropy = 8;
  return t;
})();
const deskTop = new THREE.Mesh(new THREE.BoxGeometry(DESK_W, 0.04, DESK_D), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }));
deskTop.position.y = TABLE_Y - 0.02; deskTop.receiveShadow = true; deskTop.castShadow = true;
scene.add(deskTop);
const LX = DESK_W / 2 - 0.05, LZ = DESK_D / 2 - 0.05;
for (const [x, z] of [[-LX, -LZ], [LX, -LZ], [-LX, LZ], [LX, LZ]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE_Y - 0.04, 0.06), deskTop.material);
  leg.position.set(x, (TABLE_Y - 0.04) / 2, z); leg.castShadow = true; scene.add(leg);
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ color: 0x6f6152, roughness: 0.95 }));
wall.position.set(0, 2.5, -DESK_D / 2 - 0.4); wall.receiveShadow = true; scene.add(wall);

// Light: "Day" = low sun through a window + sky fill · "Lamp" = warm desk lamp at night.
const hemi = new THREE.HemisphereLight(0xfff0dc, 0x3a2a1e, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-1.7, TABLE_Y + 1.9, 1.3);
sun.target.position.set(0, TABLE_Y, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1.7, right: 1.7, top: 1.3, bottom: -1.3, near: 0.5, far: 7 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const lamp = new THREE.PointLight(0xffc27a, 1.6, 3.5, 2);
lamp.position.set(0.55, TABLE_Y + 0.55, -0.3);
lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.002; lamp.visible = false;
scene.add(lamp);

// ---------------------------------------------------------------- state
const state = { look: 'original', detail: 'full', light: 'day', refl: 'on' };
const items = [];               // one per ASSET_DEFS entry
const loader = new GLTFLoader();
const simplifier = new SimplifyModifier();
const rand = (a, b) => a + Math.random() * (b - a);
const ok = () => items.filter((it) => it && !it.error);

// ---------------------------------------------------------------- colour "overlay": hue / saturation / lightness
// Added to any material (also on top of the Clay skin): turns the colour wheel, then scales
// saturation and lightness. One uniform per item, so every model can get its own colouring.
function addTint(material, uniform) {
  if (material.userData.tinted) return;
  material.userData.tinted = true;
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(material, sh, r);
    sh.uniforms.uHSL = uniform;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHSL;
vec3 osTurn(vec3 c, float a) { const vec3 k = vec3(0.57735); float s = sin(a * 6.2831853), q = cos(a * 6.2831853);
  return c * q + cross(k, c) * s + k * dot(k, c) * (1.0 - q); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = max(osTurn(diffuseColor.rgb, uHSL.x), 0.0);
  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, uHSL.y) * uHSL.z;`);
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey.call(material) : '') + '-os-tint';
  material.needsUpdate = true;
}

// Soft colour zones: the photo texture shrunk to a few pixels, so Clay / Low-poly keep WHERE the
// colours are (gold case, white dial…) without the photographic detail.
const softCache = new Map();
function softMap(tex, px) {
  if (!tex || !tex.image) return null;
  const key = tex.uuid + px;
  if (softCache.has(key)) return softCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(tex.image, 0, 0, px, px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel;
  softCache.set(key, t);
  return t;
}

function plainMaterial(orig, look) {
  if (!orig.isMeshStandardMaterial || orig.transparent) return orig.clone(); // glass stays glass
  return new THREE.MeshStandardMaterial({
    name: orig.name, color: orig.color.clone(), map: softMap(orig.map, look === 'lowpoly' ? 16 : 48),
    roughness: look === 'lowpoly' ? 0.85 : Math.max(0.45, orig.roughness ?? 0.6),
    metalness: Math.min(orig.metalness ?? 0, look === 'lowpoly' ? 0.2 : 0.5),
    flatShading: look === 'lowpoly', side: orig.side,
  });
}

// ---------------------------------------------------------------- triangle counts + reduction
const trisOf = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(n); };

async function reduce(root, target) {
  const total = trisOf(root);
  if (total <= target) return;
  const ratio = target / total;
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const g = o.geometry, verts = g.attributes.position.count;
    o.geometry = await simplifier.modify(g, Math.floor(verts * (1 - ratio)));
    o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------- loading
async function sizeOf(url, json) {
  const dir = url.slice(0, url.lastIndexOf("/") + 1);
  const uris = [...(json.buffers || []), ...(json.images || [])].map((x) => x.uri).filter((u) => u && !u.startsWith("data:")).map((u) => dir + u);
  let sum = 0;
  for (const u of new Set([url, ...uris])) {
    try { const r = await fetch(u, { method: "HEAD", cache: "no-store" }); sum += +r.headers.get("content-length") || 0; } catch { /* offline */ }
  }
  return sum;
}

async function loadItem(def, i) {
  const url = 'assets/models/' + def.file;
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.rotation.set(...def.rot);
  const base = new THREE.Group(); base.add(model);
  base.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(base);
  const size = box.getSize(new THREE.Vector3());
  if (def.size) model.scale.multiplyScalar(def.size / Math.max(size.x, size.y, size.z));
  base.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(base);
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  base.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of [o.material].flat()) if (m.map) m.map.anisotropy = 8;
  });
  base.updateMatrixWorld(true);
  const dims = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3());
  // file size: the model file plus every file it points to (bin + textures), asked from the server
  const bytes = await sizeOf(url, gltf.parser.json);
  const col = i % COLS, row = Math.floor(i / COLS), rows = Math.ceil(ASSET_DEFS.length / COLS);
  const holder = new THREE.Group();   // place on the desk
  const pivot = new THREE.Group();    // pose, turn, size
  holder.add(pivot);
  holder.position.set((col - (COLS - 1) / 2) * GAP_X, TABLE_Y, (row - (rows - 1) / 2) * GAP_Z);
  holder.userData.item = i;
  scene.add(holder);
  const item = { def, base, holder, pivot, variants: {}, tint: { value: new THREE.Vector3(0, 1, 1) }, fullTris: trisOf(base), dims, bytes, current: null };
  items[i] = item;
  return item;
}

// Felt fibres / knit stitches sized for the object: room-sized pieces use the full pattern,
// small objects a finer one (down to 0.3×). Converted into the meshes' own file units.
function patternScale(item, g) {
  const L = Math.max(item.dims.x, item.dims.y, item.dims.z);
  const k = Math.min(1, Math.max(0.3, L / 0.5));
  g.updateMatrixWorld(true);
  let s = 0, n = 0; const v = new THREE.Vector3();
  g.traverse((o) => { if (o.isMesh) { o.getWorldScale(v); s += (v.x + v.y + v.z) / 3; n++; } });
  return k / (n ? s / n : 1);
}

async function variantOf(item, look, detail) {
  const key = look + '-' + (look === 'lowpoly' ? 'lp' : detail);
  if (item.variants[key]) return item.variants[key];
  const g = item.base.clone(true);
  const target = look === 'lowpoly' ? LOWPOLY_TRIS : detail === 'lite' ? LITE_TRIS : 0;
  if (target) await reduce(g, target);
  const mats = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!mats.has(m)) mats.set(m, look === 'original' ? m.clone() : plainMaterial(m, look));
    o.material = mats.get(m);
  });
  if (look === 'clay' || look === 'felt' || look === 'knit') new StyleSampler(g, [], { scale: patternScale(item, g) }).set(look);
  g.traverse((o) => { if (o.isMesh) addTint(o.material, item.tint); });
  item.variants[key] = { group: g, tris: trisOf(g) };
  return item.variants[key];
}

function seat(item) { // bottom of the posed model rests on the desk
  item.holder.position.y = TABLE_Y;
  item.holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(item.pivot);
  item.holder.position.y += TABLE_Y - box.min.y;
}

async function showAll() {
  setStatus('Preparing ' + state.look + (state.detail === 'lite' ? ' · Lite' : '') + '…');
  for (const it of ok()) {
    const v = await variantOf(it, state.look, state.detail);
    if (it.current) it.pivot.remove(it.current);
    it.pivot.add(v.group); it.current = v.group; it.curTris = v.tris;
    seat(it);
  }
  updateRows(); updateStats(); redraw();
  setStatus('Ready · ' + ok().length + ' models');
}

// ---------------------------------------------------------------- shuffle (the variation the game will use)
function shuffle() {
  for (const it of ok()) {
    const p = it.pivot, toy = it.def.kind === 'toy';
    p.rotation.set(0, 0, 0);
    const r = Math.random();
    if (r < 0.2) p.rotation.set(Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 0, 0);          // on its side
    else if (r < 0.4) p.rotation.set(rand(-0.6, 0.6), 0, rand(-0.6, 0.6));                        // leaning
    else if (r < 0.48 && it.def.pose === 'upright') p.rotation.set(Math.PI, 0, 0);               // upside down
    p.rotation.y = rand(0, Math.PI * 2);
    p.rotation.order = 'YXZ';
    p.scale.setScalar(toy ? rand(0.7, 1.35) : rand(0.88, 1.12));
    // colour: toys may take any colour; real things only drift a little (brass stays brass-ish)
    const hue = toy ? (Math.random() < 0.6 ? Math.random() : rand(-0.06, 0.06)) : (Math.random() < 0.35 ? rand(-0.05, 0.05) : 0);
    it.tint.value.set(hue, toy ? rand(0.75, 1.25) : rand(0.85, 1.1), rand(0.82, 1.12));
    seat(it);
  }
  redraw();
}
function resetPoses() {
  for (const it of ok()) { it.pivot.rotation.set(0, 0, 0); it.pivot.scale.setScalar(1); it.tint.value.set(0, 1, 1); seat(it); }
  redraw();
}

// ---------------------------------------------------------------- camera: turn / zoom / move
const view = { target: new THREE.Vector3(0, TABLE_Y, 0), dist: 1.9, theta: 0.0, phi: 0.95 };
function placeCamera() {
  view.phi = Math.min(1.45, Math.max(0.15, view.phi));
  view.dist = Math.min(6, Math.max(0.08, view.dist));
  const s = Math.sin(view.phi);
  camera.position.set(view.target.x + view.dist * s * Math.sin(view.theta), view.target.y + view.dist * Math.cos(view.phi), view.target.z + view.dist * s * Math.cos(view.theta));
  camera.lookAt(view.target);
  redraw();
}
function home() { view.target.set(0, TABLE_Y, 0); view.dist = 3.4 * Math.max(1, 1.9 / camera.aspect); view.theta = 0; view.phi = 0.95; placeCamera(); }
function focus(i) {
  const it = items[i]; if (!it || it.error) return;
  const box = new THREE.Box3().setFromObject(it.pivot);
  box.getCenter(view.target);
  const r = box.getSize(new THREE.Vector3()).length();
  view.dist = Math.max(0.12, r * 2.2);
  view.phi = Math.min(view.phi, 1.1);
  placeCamera(); select(i);
}

const pointers = new Map();
let gesture = null, downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  gesture = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = [...pointers.values()];
  const p = pointers.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (pointers.size === 1) {
    view.theta -= dx * 0.006; view.phi -= dy * 0.006; placeCamera();
  } else if (pointers.size === 2) {
    const [a, b] = prev, d0 = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX; p.y = e.clientY;
    const [a2, b2] = [...pointers.values()], d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
    if (d0 > 0) view.dist *= d0 / d1;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const k = view.dist * 0.0012 / 2;
    view.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    placeCamera();
  }
  p.x = e.clientX; p.y = e.clientY;
});
const lift = (e) => {
  if (downAt && pointers.size === 1 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 400) pick(e);
  pointers.delete(e.pointerId); downAt = null;
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); downAt = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.dist *= Math.exp(e.deltaY * 0.0012); placeCamera(); }, { passive: false });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(ok().map((it) => it.holder), true);
  if (!hits.length) return;
  let o = hits[0].object; while (o && o.userData.item === undefined) o = o.parent;
  if (o) focus(o.userData.item);
}

// ---------------------------------------------------------------- side list, verdicts
const rowsEl = document.getElementById('rows');
let verdicts = {};
try { verdicts = JSON.parse(localStorage.getItem('os-intake-verdicts') || '{}'); } catch { verdicts = {}; }
const saveVerdicts = () => { try { localStorage.setItem('os-intake-verdicts', JSON.stringify(verdicts)); } catch { /* private mode */ } };
let selected = -1;
function select(i) { selected = i; updateRows(); }
const fmtKB = (b) => (b ? (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : '–');
const cm = (m) => (m * 100).toFixed(m < 0.1 ? 1 : 0);
function buildRows() {
  rowsEl.innerHTML = '';
  ASSET_DEFS.forEach((def, i) => {
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.i = i;
    row.innerHTML = `<div class="t"><span class="n"></span><span class="v"><button class="keep" title="Keep">✓</button><button class="drop" title="Drop">✗</button></span></div><div class="m"></div>`;
    row.querySelector('.n').textContent = def.word;
    row.querySelector('.n').title = def.name;
    row.addEventListener('click', (e) => { if (!e.target.closest('button')) focus(i); });
    row.querySelector('.keep').addEventListener('click', () => { verdicts[def.id] = verdicts[def.id] === 'keep' ? undefined : 'keep'; saveVerdicts(); updateRows(); });
    row.querySelector('.drop').addEventListener('click', () => { verdicts[def.id] = verdicts[def.id] === 'drop' ? undefined : 'drop'; saveVerdicts(); updateRows(); });
    rowsEl.appendChild(row);
  });
}
function updateRows() {
  rowsEl.querySelectorAll('.row').forEach((row) => {
    const i = +row.dataset.i, def = ASSET_DEFS[i], it = items[i];
    row.classList.toggle('sel', i === selected);
    row.querySelector('.keep').classList.toggle('on', verdicts[def.id] === 'keep');
    row.querySelector('.drop').classList.toggle('on', verdicts[def.id] === 'drop');
    const m = row.querySelector('.m');
    if (it && it.error) { m.innerHTML = ''; const s = document.createElement('span'); s.className = 'err'; s.textContent = 'Failed to load: ' + it.error; m.appendChild(s); return; }
    const size = it ? `${cm(it.dims.x)} × ${cm(it.dims.z)} × ${cm(it.dims.y)} cm` : '…';
    const tris = it ? (it.curTris && it.curTris !== it.fullTris ? `${it.fullTris.toLocaleString()} → ${it.curTris.toLocaleString()}` : it.fullTris.toLocaleString()) + ' triangles' : '';
    m.textContent = `${def.name} · ${def.kind}\n${def.source} · ${def.author} · ${def.license}\n${size} · ${tris} · ${fmtKB(it && it.bytes)}`;
    m.style.whiteSpace = 'pre-line';
  });
  const keep = ASSET_DEFS.filter((d) => verdicts[d.id] === 'keep').map((d) => d.word);
  const drop = ASSET_DEFS.filter((d) => verdicts[d.id] === 'drop').map((d) => d.word);
  document.getElementById('summary').value = `KEEP (${keep.length}): ${keep.join(', ') || '–'}\nDROP (${drop.length}): ${drop.join(', ') || '–'}`;
}
document.getElementById('copy').addEventListener('click', async () => {
  const ta = document.getElementById('summary');
  try { await navigator.clipboard.writeText(ta.value); setStatus('Verdicts copied'); } catch { ta.select(); document.execCommand('copy'); setStatus('Verdicts copied'); }
});
document.getElementById('fold').addEventListener('click', (e) => {
  const l = document.getElementById('list'); l.classList.toggle('closed'); e.currentTarget.textContent = l.classList.contains('closed') ? '◂' : '▸';
});

// ---------------------------------------------------------------- top bar
document.querySelectorAll('.grp[data-grp]').forEach((grp) => {
  grp.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    grp.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    state[grp.dataset.grp] = b.dataset.v;
    if (grp.dataset.grp === 'look' || grp.dataset.grp === 'detail') { setBusy(true); await showAll(); setBusy(false); }
    else applyLight();
  });
});
document.getElementById('shuffle').addEventListener('click', shuffle);
document.getElementById('reset').addEventListener('click', resetPoses);
document.getElementById('home').addEventListener('click', home);
function setBusy(b) { document.querySelectorAll('#bar button').forEach((x) => { x.disabled = b; }); }
function applyLight() {
  const day = state.light === 'day';
  sun.visible = day; lamp.visible = !day;
  hemi.intensity = day ? 0.55 : 0.06;
  scene.environment = state.refl === 'on' ? envMap : null;
  scene.environmentIntensity = day ? 0.55 : 0.12;
  scene.background.set(day ? 0x221c17 : 0x0d0b0a);
  redraw();
}

// ---------------------------------------------------------------- stats, status, frame loop
const statsEl = document.getElementById('stats'), statusEl = document.getElementById('status');
function setStatus(t) { statusEl.textContent = t; }
function updateStats() {
  const tris = items.reduce((s, it) => s + (it && it.curTris ? it.curTris : 0), 0);
  statsEl.textContent = `Models: ${tris.toLocaleString()} triangles · draws: ${renderer.info.render.calls}`;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const bar = document.getElementById('bar').getBoundingClientRect().height;
  document.getElementById('list').style.top = bar + 'px';
  redraw();
}
window.addEventListener('resize', resize);
renderer.setAnimationLoop(() => {
  if (!dirty) return;
  dirty = false;
  renderer.render(scene, camera);
  updateStats();
});

// ---------------------------------------------------------------- start
buildRows(); resize(); home(); applyLight();
if (window.innerWidth < 1000) { document.getElementById("list").classList.add("closed"); document.getElementById("fold").textContent = "◂"; }
let done = 0;
setBusy(true);
await Promise.all(ASSET_DEFS.map((def, i) => loadItem(def, i)
  .catch((err) => { items[i] = { error: String(err && err.message || err) }; console.error(def.file, err); })
  .finally(() => { done++; setStatus(`Loading ${done}/${ASSET_DEFS.length}…`); })));
await showAll();
setBusy(false);
window.__intake = { items, state, renderer, scene, camera }; // for testing
console.log('Asset Intake ready:', ok().length, 'models');
