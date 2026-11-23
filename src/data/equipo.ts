/**
 * Datos deterministas de «Ni claro ni oscuro» (Equipo), copiados del prototipo aprobado.
 * El modelo es `NetworkN([3, k, 1])` con k >= 2 y `NetworkN([3, 1])` con k = 1, Adam, sigmoide.
 * «Intermedio» = brillo (0.299 R + 0.587 G + 0.114 B) entre LO y HI.
 */
import { Adam, NetworkN, seededRandom, setRandom } from '@dniskav/neuron';
import { q2 } from '../viz/core/colors';
import { mulberry32 } from '../viz/core/rng';

export const KS = [1, 2, 3];
export const NTRAIN = 60;
export const EPOCHS = 200;
export const LR = 0.02;
export const LO = 0.35;
export const HI = 0.65;
export const GAP = 0.04;
export const FULLN = 2;
export const CHUNK = 10;
export const INIT_SEED = 3;
export const TRAIN_SEED = 7;
export const EXAM_SEED = 5;
/**
 * Con cuánto cambio acumulado se llena la sección de una neurona al 63 % (`fillOf`): la suma, paso a paso, de Σ|Δw| + |Δb|
 * (`ObservedModel.travel`). Medido tras los 60 ejemplos y los 200 repasos: con 2 neuronas, 124 y 215 en las del medio y 98 en la
 * que decide; con 3, de 123 a 204 y 131; la neurona sola (k = 1) acumula 203 y se queda en 67 %. Con 50, un equipo enseñado queda
 * casi lleno (86–98 %). Mide cuánto se ha movido, no lo bien que acierta: la neurona sola se mueve mucho y no puede con lo del medio.
 * Sin enseñarle, 0 (vacío).
 */
export const BRAIN_SCALE = 50;

export const bri = (c: number[]): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** 0 = oscuro, 1 = intermedio, 2 = claro. */
export const zoneOf = (c: number[]): number => { const y = bri(c); return y < LO ? 0 : y > HI ? 2 : 1; };
/** 1 = intermedio, 0 = el resto. */
export const labelOf = (c: number[]): number => (zoneOf(c) === 1 ? 1 : 0);
const nearEdge = (c: number[], gap: number): boolean => { const y = bri(c); return Math.abs(y - LO) < gap || Math.abs(y - HI) < gap; };

export function makeTrain(seed: number, n: number): number[][] {
  const r = mulberry32(seed), out: number[][] = [], cnt = [0, 0, 0];
  let g = 0;
  while (out.length < n && g++ < 1e6) {
    const c = q2([r(), r(), r()]);
    if (nearEdge(c, GAP)) continue;
    const z = zoneOf(c);
    if (cnt[z] >= n / 3) continue;
    cnt[z]++; out.push(c);
  }
  return out;
}
export function makeExam(seed: number, n: number): number[][] {
  const r = mulberry32(seed), b: number[][][] = [[], [], []], o: number[][] = [];
  let g = 0;
  while ((b[0].length < n / 3 || b[1].length < n / 3 || b[2].length < n / 3) && g++ < 1e6) {
    const c = q2([r(), r(), r()]);
    if (nearEdge(c, GAP * 1.5)) continue;
    const z = zoneOf(c);
    if (b[z].length < n / 3) b[z].push(c);
  }
  for (let i = 0; i < n / 3; i++) o.push(b[1][i], b[0][i], b[2][i]);
  return o;
}

/** Los 60 colores de aprendizaje (un tercio oscuros, un tercio intermedios, un tercio claros). */
export const TRAIN: number[][] = makeTrain(TRAIN_SEED, NTRAIN);
/** Los 12 colores del examen (4 de cada zona). */
export const EXAM: number[][] = makeExam(EXAM_SEED, 12);

export const structOf = (k: number): number[] => (k === 1 ? [3, 1] : [3, k, 1]);
export const kName = (k: number): string => (k === 1 ? '1 neurona sola' : k + ' neuronas + la que decide');

/** Equipo nuevo de `k` neuronas: nace siempre con los mismos pesos (semilla fija). */
export function newTeam(k: number): NetworkN {
  setRandom(seededRandom(INIT_SEED));
  try { return new NetworkN(structOf(k), { optimizer: () => new Adam() }); } finally { setRandom(null); }
}

export function trainPass(net: NetworkN): void { TRAIN.forEach((c) => net.train(c, [labelOf(c)], LR)); }

export function score(net: NetworkN): { ok: number; yes: number } {
  let ok = 0, yes = 0;
  EXAM.forEach((c) => { const a = net.predict(c)[0] > 0.5 ? 1 : 0; if (a === labelOf(c)) ok++; yes += a; });
  return { ok, yes };
}

export interface NodeSnap { w: number[]; b: number }
/** Pesos y sesgo de todas las neuronas, de la primera capa a la última. */
export function snapNet(net: NetworkN): NodeSnap[] {
  const o: NodeSnap[] = [];
  net.layers.forEach((L) => L.neurons.forEach((n) => o.push({ w: n.weights.slice(), b: n.bias })));
  return o;
}
export const r4 = (x: number): number => Math.round(x * 10000) / 10000;
/** Los pesos aplanados, como los pide `setWeights`: por neurona, sus pesos y su sesgo. */
export const flatOf = (sn: NodeSnap[]): number[] => { const f: number[] = []; sn.forEach((n) => { n.w.forEach((v) => f.push(r4(v))); f.push(r4(n.b)); }); return f; };

/** Entrena EPOCHS repasos con los 60 colores y examina. */
export function runTeam(k: number): { net: NetworkN; pct: number; ok: number; yes: number; flat: number[]; tags: SpecTag[] } {
  const net = newTeam(k);
  for (let e = 0; e < EPOCHS; e++) trainPass(net);
  const sc = score(net);
  return { net, pct: Math.round((sc.ok / 12) * 100), ok: sc.ok, yes: sc.yes, flat: flatOf(snapNet(net)), tags: specTags(net) };
}

// ---- especialidad medida en el examen: en qué colores se enciende cada neurona del medio (salida > 0.5) ----
export type TagKey = 'osc' | 'cla' | 'noc' | 'noo' | 'med' | 'none';
export const TAGFULL: Record<TagKey, string> = {
  osc: 'se enciende con colores oscuros', cla: 'se enciende con colores claros', noc: 'se enciende con todo menos lo claro',
  noo: 'se enciende con todo menos lo oscuro', med: 'se enciende con colores intermedios', none: 'sin especialidad clara',
};
export const TAGSHORT: Record<TagKey, [string, string]> = {
  osc: ['se enciende con', 'colores oscuros'], cla: ['se enciende con', 'colores claros'], noc: ['se enciende con', 'todo menos lo claro'],
  noo: ['se enciende con', 'todo menos lo oscuro'], med: ['se enciende con', 'colores intermedios'], none: ['sin especialidad', 'clara'],
};
const TAGMAP: Record<string, TagKey> = { '1,0,0': 'osc', '0,0,1': 'cla', '1,1,0': 'noc', '0,1,1': 'noo', '0,1,0': 'med' };
export interface SpecTag { tag: TagKey; f: number[] }
export function specTags(net: NetworkN): SpecTag[] {
  if (net.layers.length < 2) return [];
  return net.layers[0].neurons.map((n) => {
    const f = [0, 0, 0];
    EXAM.forEach((c) => { if (n.predict(c) > 0.5) f[zoneOf(c)]++; });
    const key = f.map((v) => (v >= 3 ? 1 : v <= 1 ? 0 : -1)).join(',');
    return { tag: TAGMAP[key] || 'none', f };
  });
}
export const fracText = (f: number[]): string => 'oscuros ' + f[0] + '/4 · intermedios ' + f[1] + '/4 · claros ' + f[2] + '/4';

/** «Compáralos»: lo aprendido con 1, 2 y 3 neuronas (se calcula al construir el sitio y, perezosamente, en el navegador). */
export interface TeamCmp { flat: number[]; pct: number; yes: number; tags: SpecTag[] }
let cmpCache: Record<number, TeamCmp> | null = null;
export function computeTeamCmp(): Record<number, TeamCmp> {
  if (cmpCache) return cmpCache;
  const c: Record<number, TeamCmp> = {};
  KS.forEach((k) => { const r = runTeam(k); c[k] = { flat: r.flat, pct: r.pct, yes: r.yes, tags: r.tags }; });
  return (cmpCache = c);
}
