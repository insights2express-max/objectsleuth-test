// IMPORTED ASSET LIBRARY (RFI OS-27 pilot → OS-29): ready-made photographic 3D models from free CC0
// sources, re-skinned by the game. One entry per model file. The game (from v16) and the Asset
// Intake test page both read this list.
//   word    the LIST WORD shown to the player – the simplest, most interpretable word (POLYSEMY, OS-28):
//           "duck" may be met by a toy, a real duck, a painting, an embossing… Adjectives only where
//           common items clash ("pocket watch" / "wristwatch" / "alarm clock").
//   name    what the model actually is (for us, not shown in the game)
//   file    path under assets/models/
//   size    longest side in metres; null = keep the file's own real-world scale
//   rot     [x, y, z] turn (radians) that brings the file into its natural rest pose
//   pose    'lie' = rests flat · 'upright' = stands on its base
//   kind    'literal' (the real thing) · 'toy' (a toy / miniature version) · 'sculpture'
//   source, author, license, url   where it came from – kept for EVERY asset (CC0 and CC-BY)
// Never add (OS-29: 1.3.2): snails/slugs, modern handguns, torture devices, Russian cultural relics.
const H = Math.PI / 2;
const ph = (id, word, name, author, rot, pose, kind = 'literal', size = null, folder = id) => ({
  id: 'ph-' + id, word, name, file: `polyhaven/${folder}/${folder}_1k.gltf`, size, rot, pose, kind,
  source: 'Poly Haven', author, license: 'CC0', url: 'https://polyhaven.com/a/' + folder,
});
const LIE = [-H, 0, 0], NONE = [0, 0, 0];
export const ASSET_DEFS = [
  // --- pilot (OS-27/28 KEEP)
  ph('watch', 'pocket watch', 'Pocket watch', 'PierreB3D', LIE, 'lie', 'literal', null, 'pocket_watch'),
  ph('magnifier', 'magnifying glass', 'Magnifying glass', 'Nazar Borodavka', LIE, 'lie', 'literal', null, 'magnifying_glass_01'),
  ph('glasses', 'glasses', 'Round spectacles', 'Sean Buckley', NONE, 'upright', 'literal', null, 'round_spectacles'),
  ph('duck', 'duck', 'Rubber duck', 'Plat251', NONE, 'upright', 'toy', 0.1, 'rubber_duck_toy'),
  ph('compass', 'compass', 'Brass ship compass', 'Benny Weimer', NONE, 'upright', 'literal', null, 'seadogs_compass'),
  ph('shell', 'seashell', 'Conch shell (Lambis)', 'Kuutti Siitonen', NONE, 'lie', 'literal', null, 'lambis_shell'),
  ph('spoon', 'spoon', 'Wooden spoon', 'Ronnie Barter', NONE, 'lie', 'literal', null, 'wooden_spoon'),
  // --- batch 1 (OS-29: 2.2)
  ph('alarm_clock_01', 'alarm clock', 'Alarm clock', 'Yann Kervran & James Ray Cock', NONE, 'upright'),
  ph('baseball_01', 'baseball', 'Baseball', 'Rico Cilliers', NONE, 'lie'),
  ph('vintage_binocular', 'binoculars', 'Vintage binoculars', 'Luke', NONE, 'lie'),
  ph('brass_vase_03', 'vase', 'Brass vase', 'Rico Cilliers', NONE, 'upright'),
  ph('Camera_01', 'camera', 'Film camera', 'Rajil Jose Macatangay', NONE, 'upright'),
  ph('carved_wooden_elephant', 'elephant', 'Carved wooden elephant', 'Greg Zaal', NONE, 'upright', 'sculpture'),
  ph('concrete_cat_statue', 'cat', 'Concrete cat statue', 'Rico Cilliers & Riley Queen', NONE, 'upright', 'sculpture'),
  ph('horse_statue_01', 'horse', 'Horse statue', 'Rico Cilliers', NONE, 'upright', 'sculpture'),
  ph('digital_wrist_watch', 'wristwatch', 'Digital wristwatch', 'Adrian C', NONE, 'lie'),
  ph('food_apple_01', 'apple', 'Apple', 'Oliver Harries', NONE, 'upright'),
  ph('lemon', 'lemon', 'Lemon', 'Kuutti Siitonen', [0, 0, H], 'lie'),
  ph('food_pomegranate_01', 'pomegranate', 'Pomegranate', 'Oliver Harries', NONE, 'upright'),
  ph('croissant', 'croissant', 'Croissant', 'Greg Zaal & Dario Barresi', NONE, 'lie'),
  ph('Lantern_01', 'lantern', 'Oil lantern', 'Rajil Jose Macatangay', NONE, 'upright'),
  ph('lightbulb_01', 'lightbulb', 'Lightbulb', 'Josh Dean', [0, 0, H], 'lie'),
  ph('measuring_tape_01', 'tape measure', 'Tape measure', 'Kuutti Siitonen', NONE, 'upright'),
  ph('mousetrap', 'mousetrap', 'Mousetrap', 'GreenPixel', NONE, 'lie'),
  ph('pliers', 'pliers', 'Pliers', 'PierreB3D', LIE, 'lie'),
  ph('screwdriver', 'screwdriver', 'Screwdriver', 'PierreB3D', LIE, 'lie'),
  ph('cross_pein_hammer', 'hammer', 'Cross-pein hammer', 'Tics', LIE, 'lie'),
  ph('standing_picture_frame_01', 'picture frame', 'Standing picture frame', 'James Ray Cock', NONE, 'upright'),
  ph('vintage_lighter', 'lighter', 'Vintage lighter', 'Slinc', NONE, 'upright'),
  ph('vintage_microscope', 'microscope', 'Vintage microscope', 'Luis José Fernández Rodríguez', NONE, 'upright'),
  ph('vintage_stapler', 'stapler', 'Vintage stapler', 'Mateusz Sadek', NONE, 'lie'),
  ph('wooden_bowl_02', 'bowl', 'Wooden bowl', 'Kuutti Siitonen', NONE, 'upright'),
  ph('wooden_candlestick', 'candlestick', 'Wooden candlestick', 'Josh Dean', NONE, 'upright'),
  ph('jug_01', 'jug', 'Ceramic jug', 'Kuutti Siitonen', NONE, 'upright'),
  ph('fishermans_hat', 'hat', "Fisherman's hat", 'PierreB3D', NONE, 'lie'),
  ph('garden_gloves_01', 'gloves', 'Garden gloves', 'Satyaki Mandal', NONE, 'lie'),
  ph('vintage_flashlight', 'flashlight', 'Vintage flashlight', 'Omar M. El-Safy', NONE, 'lie'),
];
