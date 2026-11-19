/** Generadores deterministas. */

/** mulberry32: la semilla fija el color de cada ejemplo y los pesos con los que nace una neurona. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generador lineal congruente (Park-Miller): da la forma fija de las ramitas de las dendritas. */
export function lcg(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
