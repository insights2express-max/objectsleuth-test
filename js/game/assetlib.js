// IMPORTED ASSET LIBRARY (pilot, RFI OS-27): ready-made 3D models from free CC0 sources.
// One entry per model file. The game (from v16) and the Asset Intake test page both read this list.
//   file    path under assets/models/
//   size    longest side in metres; null = keep the file's own real-world scale
//   rot     [x, y, z] turn (radians) that brings the file into its natural rest pose
//   pose    'lie' = rests flat · 'upright' = stands on its base
//   kind    'literal' (the real thing) · 'toy' (a toy / miniature version) · 'sculpture'
//   source, author, license, url   where it came from – kept for EVERY asset (CC0 and CC-BY)
const H = Math.PI / 2;
export const ASSET_DEFS = [
  // --- Poly Haven (photographic detail, real-world scale)
  { id: 'ph-watch', name: 'Pocket watch', file: 'polyhaven/pocket_watch/pocket_watch_1k.gltf', size: null, rot: [-H, 0, 0], pose: 'lie', kind: 'literal',
    source: 'Poly Haven', author: 'PierreB3D', license: 'CC0', url: 'https://polyhaven.com/a/pocket_watch' },
  { id: 'ph-magnifier', name: 'Magnifying glass', file: 'polyhaven/magnifying_glass_01/magnifying_glass_01_1k.gltf', size: null, rot: [-H, 0, 0], pose: 'lie', kind: 'literal',
    source: 'Poly Haven', author: 'Nazar Borodavka', license: 'CC0', url: 'https://polyhaven.com/a/magnifying_glass_01' },
  { id: 'ph-glasses', name: 'Eyeglasses', file: 'polyhaven/round_spectacles/round_spectacles_1k.gltf', size: null, rot: [0, 0, 0], pose: 'upright', kind: 'literal',
    source: 'Poly Haven', author: 'Sean Buckley', license: 'CC0', url: 'https://polyhaven.com/a/round_spectacles' },
  { id: 'ph-duck', name: 'Rubber duck', file: 'polyhaven/rubber_duck_toy/rubber_duck_toy_1k.gltf', size: 0.1, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Poly Haven', author: 'Plat251', license: 'CC0', url: 'https://polyhaven.com/a/rubber_duck_toy' },
  { id: 'ph-compass', name: 'Brass compass', file: 'polyhaven/seadogs_compass/seadogs_compass_1k.gltf', size: null, rot: [0, 0, 0], pose: 'upright', kind: 'literal',
    source: 'Poly Haven', author: 'Benny Weimer', license: 'CC0', url: 'https://polyhaven.com/a/seadogs_compass' },
  { id: 'ph-shell', name: 'Conch shell', file: 'polyhaven/lambis_shell/lambis_shell_1k.gltf', size: null, rot: [0, 0, 0], pose: 'lie', kind: 'literal',
    source: 'Poly Haven', author: 'Kuutti Siitonen', license: 'CC0', url: 'https://polyhaven.com/a/lambis_shell' },
  { id: 'ph-spoon', name: 'Wooden spoon', file: 'polyhaven/wooden_spoon/wooden_spoon_1k.gltf', size: null, rot: [0, 0, 0], pose: 'lie', kind: 'literal',
    source: 'Poly Haven', author: 'Ronnie Barter', license: 'CC0', url: 'https://polyhaven.com/a/wooden_spoon' },
  // --- Kenney Furniture Kit (simple shapes, flat colours; shown here as toys / miniatures)
  { id: 'kn-bear', name: 'Teddy bear', file: 'kenney/bear.glb', size: 0.12, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-books', name: 'Toy books', file: 'kenney/books.glb', size: 0.09, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-mouse', name: 'Computer mouse', file: 'kenney/computerMouse.glb', size: 0.1, rot: [0, 0, 0], pose: 'lie', kind: 'literal',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-radio', name: 'Toy radio', file: 'kenney/radio.glb', size: 0.1, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-toaster', name: 'Toy toaster', file: 'kenney/toaster.glb', size: 0.08, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-speaker', name: 'Mini speaker', file: 'kenney/speakerSmall.glb', size: 0.1, rot: [0, 0, 0], pose: 'upright', kind: 'literal',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-plant', name: 'Succulent pot', file: 'kenney/plantSmall1.glb', size: 0.1, rot: [0, 0, 0], pose: 'upright', kind: 'literal',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
  { id: 'kn-lamp', name: 'Toy table lamp', file: 'kenney/lampRoundTable.glb', size: 0.11, rot: [0, 0, 0], pose: 'upright', kind: 'toy',
    source: 'Kenney Furniture Kit', author: 'Kenney', license: 'CC0', url: 'https://kenney.nl/assets/furniture-kit' },
];
