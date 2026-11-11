// ObjectSleuth service worker: stores every app file on the device so the game runs 100% offline.
// IMPORTANT: change VERSION whenever any app file changes. That makes devices download the new files.
// v16 (OS-33: 3.2): the imported models live in their OWN store ("objectsleuth-models"), which is kept
// across versions – an update never downloads the model library again. Models are stored the first time
// a round uses them, and the game fills in the rest in the background (main.js fillLibrary).
const VERSION = 'v16.2'; // = APP_VERSION in js/main.js (one number per published build)
// build mark (any change to this file makes devices fetch every file again): v16.2 update 2026-11-11 b
const CACHE = 'objectsleuth-' + VERSION;
const MODELS = 'objectsleuth-models';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/core/controls.js',
  './js/core/random.js',
  './js/core/look.js',
  './js/art/kit.js',
  './js/art/styles.js',
  './js/art/skins.js',
  './js/art/batch.js',
  './js/scene/study.js',
  './js/scene/wallart.js',
  './js/scene/lighting.js',
  './js/scene/sun.js',
  './js/scene/softshadows.js',
  './js/game/targets.js',
  './js/game/fastray.js',
  './js/game/objects.js',
  './js/game/library.js',
  './js/game/assetlib.js',
  './js/game/session.js',
  './vendor/three/three.module.js',
  './vendor/three/three.core.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
  './vendor/three/addons/math/SimplexNoise.js',
  './vendor/three/addons/loaders/GLTFLoader.js',
  './vendor/three/addons/utils/SkeletonUtils.js',
  './vendor/three/addons/postprocessing/EffectComposer.js',
  './vendor/three/addons/postprocessing/GTAOPass.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js',
  './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js',
  './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/GTAOShader.js',
  './vendor/three/addons/shaders/PoissonDenoiseShader.js',
  './vendor/three/addons/shaders/HorizontalTiltShiftShader.js',
  './vendor/three/addons/shaders/OutputShader.js',
  './vendor/three/addons/shaders/VerticalTiltShiftShader.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('objectsleuth-') && k !== CACHE && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first: the game never needs the network once installed.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.includes('/assets/models/lib/')) {
    // a model: from its store (the ?v= number changes when a model file changes), else download and keep it
    event.respondWith(
      caches.open(MODELS).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && url.searchParams.has('v')) cache.put(req, res.clone());
        return res;
      })))
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        // A page that isn't stored (e.g. the Asset Intake test page) loads from the network;
        // only when offline does it fall back to the game.
        if (req.mode === 'navigate') return fetch(req).catch(() => cache.match('./index.html'));
        return fetch(req);
      })
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source.postMessage({ version: VERSION });
});
