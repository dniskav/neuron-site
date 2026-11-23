/**
 * Datos deterministas de «Enséñale», copiados del prototipo aprobado.
 * Colores de aprendizaje y examen salen de semillas fijas; la neurona nace con pesos de otra semilla.
 */
import { NeuronN } from '@dniskav/neuron';
import { mulberry32 } from '../viz/core/rng';
import { q2, hsl } from '../viz/core/colors';

export const SIZES = [2, 3, 5, 8, 13, 21, 34];
export const EPOCHS = 40;
export const LR = 0.5;
export const THR = 0.2;
export const GAP = 0.07;
export const INIT_SEED = 4;
export const TRAIN_SEED = 382;
export const EXAM_SEED = 5;
export const FULLN = 3;
/**
 * Con cuánto cambio acumulado se llena el cerebro al 63 % (`fillOf`): el cambio es la suma, paso a paso, de Σ|Δw| + |Δb|
 * de la neurona (`ObservedModel.travel`). Medido con la neurona real y sus 40 repasos: sin enseñarle, 0 (vacío); 2 ejemplos
 * 2,7 (se llena 10 %); 3 → 11 (36 %); 8 → 24 (62 %); 13 → 40 (80 %); 21 → 63 (92 %); 34 → 95 (98 %). Con 25, bien enseñada
 * queda casi llena y sin enseñar, vacía.
 */
export const BRAIN_SCALE = 25;

function lin(v: number): number {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
/** Luminancia relativa de un color [r,g,b] de 0 a 1. */
export function lum(c: number[]): number {
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
/** 1 = claro, 0 = oscuro. */
export function labelOf(c: number[]): number {
  return lum(c) > THR ? 1 : 0;
}
export function makeColors(seed: number, n: number): number[][] {
  const r = mulberry32(seed), out: number[][] = [];
  let g = 0;
  while (out.length < n && g++ < 10000) {
    const c = [r(), r(), r()];
    if (Math.abs(lum(c) - THR) < GAP) continue;
    out.push(c);
  }
  return out;
}
export function makeExam(seed: number, n: number): number[][] {
  const r = mulberry32(seed), L: number[][] = [], D: number[][] = [], o: number[][] = [];
  let g = 0;
  while ((L.length < n / 2 || D.length < n / 2) && g++ < 100000) {
    const c = [r(), r(), r()], y = lum(c);
    if (Math.abs(y - THR) < GAP * 1.6) continue;
    if (y > THR) { if (L.length < n / 2) L.push(c); } else if (D.length < n / 2) D.push(c);
  }
  for (let i = 0; i < n / 2; i++) o.push(L[i], D[i]);
  return o;
}

/** Los 34 colores de aprendizaje (a 2 decimales: lo que se ve en el código es lo que entrena). Cada conjunto es un prefijo. */
export const ALL: number[][] = makeColors(TRAIN_SEED, 34).map(q2);
/** Los 12 colores del examen. */
export const EXAM: number[][] = makeExam(EXAM_SEED, 12).map(q2);

/** Colores rápidos para probar. */
export const QUICK: [string, string][] = [
  ['#f5d742', 'amarillo'], ['#1f2f7a', 'azul marino'], ['#f080b8', 'rosa'],
  ['#14532d', 'verde oscuro'], ['#8a8a8a', 'gris'], ['#e8742a', 'naranja'],
];

const HUES = [0, 35, 60, 130, 190, 230, 290], ROWS = [88, 70, 52, 36, 20], GRAYS = [96, 74, 52, 30, 10];
/** Rejilla 8×5 del selector propio: 7 tonos por 5 luminosidades, y una columna de grises. */
export const PICKER_CELLS: string[] = ROWS.flatMap((L, r) =>
  Array.from({ length: 8 }, (_, c) => (c < 7 ? hsl(HUES[c], 80, L) : hsl(0, 0, GRAYS[r]))));

/** Neurona nueva de la pantalla: 3 entradas, pesos de la semilla fija redondeados a 3 decimales. */
export function newNeuron(): NeuronN {
  const old = Math.random;
  Math.random = mulberry32(INIT_SEED);
  try {
    const n = new NeuronN(3);
    n.weights = n.weights.map((x) => Math.round(x * 1000) / 1000);
    return n;
  } finally {
    Math.random = old;
  }
}

/** Entrena EPOCHS repasos sobre el conjunto de k ejemplos y examina: pesos, sesgo y % de aciertos. */
export function runSet(k: number): { w: number[]; b: number; pct: number; correct: number } {
  const n = newNeuron(), set = ALL.slice(0, k);
  for (let e = 0; e < (k ? EPOCHS : 0); e++) set.forEach((c) => n.train(c, labelOf(c), LR));
  let ok = 0;
  EXAM.forEach((c) => { if ((n.predict(c) > 0.5 ? 1 : 0) === labelOf(c)) ok++; });
  return { w: n.weights.slice(), b: n.bias, pct: Math.round((ok / 12) * 100), correct: ok };
}

/**
 * Cuánto se equivoca la neurona en los ejemplos con los que aprende: error cuadrático medio (el de verdad: sale de `predict`) frente a la
 * respuesta correcta (1 claro, 0 oscuro), después de cada repaso. 0 = acierta todo con total seguridad.
 */
export function passError(n: NeuronN, set: number[][]): number {
  return set.reduce((s, c) => s + (n.predict(c) - labelOf(c)) ** 2, 0) / set.length;
}
/** «Ya no mejora» en los repasos (ver `plateau`, `viz/learningCurve.ts`): 5 repasos frente a los 5 de antes, desde el 15. Medido: con 2 ejemplos se aplana; con 13 o 34 sigue bajando a los 40 repasos (0,07 → 0,045). */
export const PLATEAU = { window: 5, minGames: 15, skip: 0, minGain: 0.002, k: 0.4, better: 'down' } as const;
