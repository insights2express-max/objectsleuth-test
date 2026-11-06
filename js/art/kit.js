// Low-poly art kit: small helpers that every scene and object is built from.
import * as THREE from '../../vendor/three/three.module.js';

const cache = new Map();

// Flat-shaded material (the faceted low-poly look). Plain colours are shared to save memory.
export function mat(color, opts = {}) {
  const {
    rough = 0.85, metal = 0, emissive = 0x000000, emissiveIntensity = 1,
    map = null, transparent = false, opacity = 1, side = THREE.FrontSide,
  } = opts;
  const key = [color, rough, metal, emissive, emissiveIntensity, transparent, opacity, side].join('|');
  if (!map && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, emissive, emissiveIntensity,
    map, transparent, opacity, side, flatShading: true,
  });
  if (!map) cache.set(key, m);
  return m;
}

// Always-bright material for flames and light bulbs (ignores lighting).
export const glow = (color) => new THREE.MeshBasicMaterial({ color });

const asMat = (m) => (m && m.isMaterial ? m : mat(m));

export function mesh(geometry, material, castShadow = true) {
  const m = new THREE.Mesh(geometry, asMat(material));
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

// Box whose BOTTOM sits at y (x and z are the centre). Easier for placing furniture.
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

// Upright cylinder (or cone/tapered shape) whose BOTTOM sits at y.
export function cyl(rTop, rBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

export function group(children = [], x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

// Draws a picture in code (rug patterns, paintings, globe map) – no image files needed.
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
