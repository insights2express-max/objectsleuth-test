// ObjectSleuth service worker: stores every app file on the device so the game runs 100% offline.
// IMPORTANT: change VERSION whenever any app file changes. That makes devices download the new files.
const VERSION = 'draft1-m1.5-001';
const CACHE = 'objectsleuth-' + VERSION;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/core/controls.js',
  './js/core/random.js',
  './js/art/kit.js',
  './js/art/styles.js',
  './js/art/skins.js',
  './js/scene/study.js',
  './js/scene/lighting.js',
  './js/scene/sun.js',
  './js/scene/softshadows.js',
  './js/game/targets.js',
  './vendor/three/three.module.js',
  './vendor/three/three.core.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
  './vendor/three/addons/math/SimplexNoise.js',
  './vendor/three/addons/postprocessing/EffectComposer.js',
  './vendor/three/addons/postprocessing/GTAOPass.js',
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('objectsleuth-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first: the game never needs the network once installed.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return fetch(req);
      })
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source.postMessage({ version: VERSION });
});
