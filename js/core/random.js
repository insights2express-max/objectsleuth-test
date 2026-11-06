// Seeded random numbers: the same seed always gives the same sequence.
// Used so the room's furniture and books look identical every time,
// while hidden-object placement (from M2) can use a fresh seed each round.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r, a, b) => a + r() * (b - a);
export const pick = (r, list) => list[Math.floor(r() * list.length)];
