/**
 * Datos deterministas de «¿Qué color es?» (Colores). El generador viene de la verificación previa
 * (experiments/05-nombres/lib.ts).
 *
 * El modelo es `NetworkN([3, n])` de @dniskav/neuron: UNA capa de `n` neuronas (una por nombre) que miran el
 * mismo color, sin capa oculta. Cada una es la neurona de «Enséñale» copiada y responde «¿soy yo?». Adam, salidas
 * sigmoide y objetivos «one-hot» (1 en el nombre correcto, 0 en los demás). Gana la que más brilla.
 *
 * La capa CRECE: empieza con las `N0` primeras neuronas de `COLORS` y gana una por nombre. Toda la estructura
 * nueva se crea en un único sitio: `growNetwork`. Nada depende de cuántos nombres hay: sale de la longitud de `COLORS`.
 */
import { Adam, NetworkN, seededRandom, setRandom } from '@dniskav/neuron';
import { mulberry32 } from '../viz/core/rng';

/** Cómo se define un nombre: su color de muestra y de dónde salen sus ejemplos (tono en grados, saturación y luz de 0 a 1). */
export interface ColorDef {
  name: string;
  /** Color de muestra (bulbo y chip). */
  color: string;
  /** Rango de tono; el rojo cruza el 0 (345..372). Los nombres sin tono (blanco, gris, negro) usan 0..360. */
  hue: [number, number];
  sat: [number, number];
  lit: [number, number];
}
const G: [number, number] = [0, 360];
const def = (name: string, color: string, hue: [number, number], sat: [number, number], lit: [number, number]): ColorDef => ({ name, color, hue, sat, lit });
/**
 * La lista ordenada de nombres (16): la red va ganando salidas en este orden. Las regiones HSL son las de la
 * verificación (experiments/16-nombres); «verde lima» separa algo más su tono del amarillo. Todo lo demás
 * sale de la longitud de esta lista. Los nombres sin tono (blanco, gris, negro) usan todo el círculo y poca saturación.
 */
export const COLORS: ColorDef[] = [
  def('rojo', '#e53935', [350, 370], [0.65, 1], [0.4, 0.58]),
  def('verde', '#43a047', [110, 150], [0.5, 1], [0.25, 0.45]),
  def('azul', '#1e88e5', [215, 232], [0.65, 1], [0.4, 0.55]),
  def('amarillo', '#fdd835', [50, 62], [0.85, 1], [0.5, 0.6]),
  def('naranja', '#fb8c00', [24, 38], [0.85, 1], [0.45, 0.58]),
  def('morado', '#8e24aa', [272, 296], [0.55, 1], [0.28, 0.42]),
  def('rosa', '#f48fb1', [325, 352], [0.6, 1], [0.74, 0.88]),
  def('celeste', '#81d4fa', [195, 210], [0.7, 1], [0.72, 0.84]),
  def('turquesa', '#1abc9c', [165, 182], [0.6, 1], [0.35, 0.5]),
  def('verde lima', '#c0ca33', [78, 98], [0.7, 1], [0.42, 0.55]),
  def('marrón', '#795548', [15, 35], [0.5, 0.75], [0.18, 0.32]),
  def('blanco', '#ffffff', G, [0, 0.08], [0.93, 1]),
  def('negro', '#000000', G, [0, 0.08], [0, 0.12]),
  def('gris', '#888888', G, [0, 0.08], [0.35, 0.65]),
  def('azul marino', '#0d1b4f', [222, 245], [0.6, 1], [0.12, 0.24]),
  def('lila', '#c9a7e8', [262, 288], [0.45, 0.8], [0.72, 0.82]),
];
export const NAMES: string[] = COLORS.map((d) => d.name);
export const NAME_COLOR: string[] = COLORS.map((d) => d.color);
/** Cuántos nombres hay en total (el tope de salidas). */
export const MAX_OUT = COLORS.length;
/** Con cuántas neuronas (nombres) empieza la pantalla. */
export const N0 = Math.min(3, MAX_OUT);
/** Ejemplos por nombre de cada conjunto. */
export const PER = [1, 3, 5, 8, 13, 21];
export const PER_DEFAULT = 13;
export const EPOCHS = 100;
export const LR = 0.05;
export const FULLN = 2;
export const CHUNK = 10;
export const INIT_SEED = 1;
export const TRAIN_SEED = 11;
export const EXAM_SEED = 5;
export const EXAM_PER = 12;

/** Números que aprende una capa [3, n]: (3 pesos + sesgo) por neurona, o sea 4·n. */
export const paramCount = (n: number): number => (3 + 1) * n;

export function hslToRgb(h: number, s: number, l: number): number[] {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
const q2 = (c: number[]): number[] => c.map((v) => Math.round(v * 100) / 100);

export interface Ex { c: number[]; y: number }

/**
 * `perClass` ejemplos de cada uno de los `n` primeros nombres, intercalados (uno de cada nombre, y vuelta a
 * empezar). Determinista, y los ejemplos de un nombre no cambian cuando la red gana otros nombres.
 */
export function makeSet(seed: number, perClass: number, n: number): Ex[] {
  const cols: Ex[][] = COLORS.slice(0, n).map((d, y) => {
    const r = mulberry32(seed * 1000 + y * 7 + 1), [a, b] = d.hue, out: Ex[] = [];
    for (let i = 0; i < perClass; i++) {
      const h = a + r() * (b - a), s = d.sat[0] + r() * (d.sat[1] - d.sat[0]), l = d.lit[0] + r() * (d.lit[1] - d.lit[0]);
      out.push({ c: q2(hslToRgb(h, s, l)), y });
    }
    return out;
  });
  const out: Ex[] = [];
  for (let i = 0; i < perClass; i++) cols.forEach((cl) => out.push(cl[i]));
  return out;
}

const exams: Record<number, Ex[]> = {};
/** El examen fijo de una red con `n` nombres: 12 colores de cada uno. */
export function examSet(n: number): Ex[] { return (exams[n] ??= makeSet(EXAM_SEED, EXAM_PER, n)); }
const sets: Record<string, Ex[]> = {};
/** El conjunto de `per` ejemplos por nombre, solo de los `n` nombres que la red ya tiene. */
export function trainSet(per: number, n: number): Ex[] { return (sets[per + ':' + n] ??= makeSet(TRAIN_SEED, per, n)); }

export const target = (y: number, n: number): number[] => Array.from({ length: n }, (_, i) => (i === y ? 1 : 0));
export const argmax = (v: number[]): number => v.indexOf(Math.max(...v));

/** Capa nueva de `n` neuronas (una por nombre): nace siempre con los mismos pesos (semilla fija). */
export function newNet(n: number): NetworkN {
  setRandom(seededRandom(INIT_SEED));
  try { return new NetworkN([3, n], { optimizer: () => new Adam() }); } finally { setRandom(null); }
}

export interface Dims { n: number }
/**
 * CRECER la capa: el único sitio donde se crea un `NetworkN` con una estructura nueva. `outputs` añade neuronas
 * (una por nombre: el siguiente de la lista). La red nueva nace sin enseñar (se entrena desde cero con los
 * ejemplos de los nombres que ya tiene: unos 60 ms). El tope es la lista de nombres.
 */
export function growNetwork(from: Dims, by: { outputs?: number } = {}): Dims & { net: NetworkN } {
  const n = Math.max(1, Math.min(MAX_OUT, from.n + (by.outputs ?? 0)));
  return { n, net: newNet(n) };
}

export function trainPass(net: NetworkN, set: Ex[], n: number): void { set.forEach((x) => net.train(x.c, target(x.y, n), LR)); }
export function trainNet(net: NetworkN, set: Ex[], n: number, epochs = EPOCHS): void { for (let e = 0; e < epochs; e++) trainPass(net, set, n); }

export function score(net: NetworkN, n: number): { ok: number; pct: number } {
  const exam = examSet(n);
  let ok = 0;
  exam.forEach((x) => { if (argmax(net.predict(x.c)) === x.y) ok++; });
  return { ok, pct: Math.round((ok / exam.length) * 100) };
}

/** Capa nueva de `n` neuronas enseñada con `per` ejemplos por nombre y examinada. */
export function runSet(n: number, per: number): { net: NetworkN; ok: number; pct: number } {
  const net = newNet(n);
  trainNet(net, trainSet(per, n), n);
  return { net, ...score(net, n) };
}

/** Acierto del examen con cada conjunto, para un tamaño dado (se calcula la primera vez que se pide). */
const cmpCache: Record<number, number[]> = {};
export function setCmp(n: number): number[] { return (cmpCache[n] ??= PER.map((per) => runSet(n, per).pct)); }
/** ¿Ya se calculó la comparativa de este tamaño? */
export const cmpKnown = (n: number): boolean => n in cmpCache;

// ---------- el anillo de colores: con qué tonos se enciende una neurona (la de un nombre) ----------
export const NH = 24;
export const RING_SAT = 0.85;
export const RING_LIT = 0.5;
/** Los 24 tonos de la rueda (cada 15°), con saturación 0.85 y luz 0.5. */
export const RING_COLORS: number[][] = Array.from({ length: NH }, (_, i) => q2(hslToRgb(i * (360 / NH), RING_SAT, RING_LIT)));

/** La activación REAL de la neurona `j` de la capa para cada tono de la rueda. */
export function ringActs(net: NetworkN, j: number): number[] {
  const n = net.layers[0].neurons[j];
  return RING_COLORS.map((c) => n.predict(c));
}

/** Nombre de la zona de la rueda a la que pertenece un tono (en plural, para la frase). */
export const hueName = (h: number): string => {
  h = ((h % 360) + 360) % 360;
  return h >= 345 || h < 15 ? 'rojos' : h < 40 ? 'naranjas' : h < 75 ? 'amarillos' : h < 165 ? 'verdes' : h < 195 ? 'cianes' : h < 255 ? 'azules' : h < 315 ? 'morados' : 'rosas';
};
const HUE_GROUPS: string[] = Array.from({ length: NH }, (_, i) => hueName(i * (360 / NH)));
const joinList = (a: string[]): string => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]);

/** Los nombres de la rueda con los que se enciende la neurona, en orden, empezando por donde empieza su arco. */
export function ringNames(acts: number[]): string[] {
  const on = acts.map((v) => v > 0.5);
  const start = on.findIndex((v, i) => v && !on[(i + NH - 1) % NH]);
  if (start < 0) return [];
  const total: Record<string, number> = {}, lit: Record<string, number> = {}, order: string[] = [];
  HUE_GROUPS.forEach((g) => { total[g] = (total[g] || 0) + 1; });
  for (let s = 0; s < NH; s++) {
    const i = (start + s) % NH;
    if (!on[i]) continue;
    const g = HUE_GROUPS[i];
    lit[g] = (lit[g] || 0) + 1;
    if (!order.includes(g)) order.push(g);
  }
  const names = order.filter((g) => lit[g] >= Math.ceil(total[g] / 2));
  return names.length ? names : [HUE_GROUPS[acts.indexOf(Math.max(...acts))]];
}

/** La frase corta de una neurona, generada de su activación real. */
export function ringPhrase(acts: number[]): string {
  const n = acts.filter((v) => v > 0.5).length;
  if (n === 0) return 'Casi nunca se enciende';
  if (n === NH) return 'Se enciende con todos los colores';
  return 'Se enciende con: ' + joinList(ringNames(acts));
}

// ---------- la banda de luz: de negro a blanco, para las neuronas que responden a la LUZ y no al tono ----------
/** Siete niveles de luz, del casi negro al casi blanco. */
export const LIGHT_LEVELS = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92];
/** Colores con los que se mide cada nivel: el gris de esa luz y doce tonos con esa luz (saturación 0.85). */
export const LIGHT_SAMPLES: number[][][] = LIGHT_LEVELS.map((l) => [[l, l, l], ...Array.from({ length: 12 }, (_, i) => q2(hslToRgb(i * 30, RING_SAT, l)))]);
/** ¿Hace falta la banda de luz? Siempre que haya nombres que dependen de la luz (blanco, negro, marrón, azul marino…). */
export const HAS_LIGHT_BAND = COLORS.some((d) => d.sat[1] < 0.3 || d.lit[1] < 0.35 || d.lit[0] > 0.7);
/** La activación REAL de la neurona `j` para cada nivel de luz (media de lo que responde a cualquier tono con esa luz). */
export function lightActs(net: NetworkN, j: number): number[] {
  const n = net.layers[0].neurons[j];
  return LIGHT_SAMPLES.map((cs) => cs.reduce((t, c) => t + n.predict(c), 0) / cs.length);
}
/** Si la banda lo justifica: se enciende con lo oscuro (y se apaga con lo claro) o al revés. */
export function lightTrend(band: number[]): 'oscuro' | 'claro' | null {
  const m = (a: number[]): number => a.reduce((t, v) => t + v, 0) / a.length, dark = m(band.slice(0, 2)), light = m(band.slice(-2));
  if (dark > 0.6 && light < 0.4) return 'oscuro';
  if (light > 0.6 && dark < 0.4) return 'claro';
  return null;
}
/**
 * La frase de una neurona, de su activación real: por tonos (anillo) y, si el tono no la explica
 * pero la luz sí, «con lo oscuro» o «con lo claro, sea el color que sea».
 */
export function neuronPhrase(ring: number[], band?: number[]): string {
  const on = ring.filter((v) => v > 0.5).length, trend = band ? lightTrend(band) : null;
  if (trend && (on <= 3 || on >= NH - 3)) return 'Se enciende con lo ' + trend + ', sea el color que sea';
  return ringPhrase(ring);
}

/**
 * Cuando ningún tono vivo del anillo enciende a la neurona (blanco, negro, gris, marrón…): ¿dónde se enciende?
 * Se mide con la propia neurona en los grises y en tonos oscuros y apagados. Si no se enciende en ninguno, `null`.
 */
export function dullPhrase(net: NetworkN, j: number): string | null {
  const n = net.layers[0].neurons[j], on = (c: number[]): boolean => n.predict(c) > 0.5;
  const greys = LIGHT_LEVELS.map((l) => on([l, l, l])), kinds: string[] = [];
  greys.forEach((g, i) => { if (!g) return; const w = LIGHT_LEVELS[i] <= 0.2 ? 'negros' : LIGHT_LEVELS[i] <= 0.65 ? 'grises' : 'blancos'; if (!kinds.includes(w)) kinds.push(w); });
  if (kinds.length) return 'se enciende con ' + joinList(kinds);
  const hues: string[] = [];
  for (let h = 0; h < 360; h += 15) {
    if ([[0.5, 0.2], [0.5, 0.3], [0.65, 0.25], [0.4, 0.35], [0.35, 0.22]].some(([sa, l]) => on(q2(hslToRgb(h, sa, l)))) && !hues.includes(hueName(h))) hues.push(hueName(h));
  }
  return hues.length ? 'se enciende con ' + joinList(hues) + ' oscuros y apagados' : null;
}

/** La zona de una neurona de nombre, de su activación real: «verde: se enciende con verdes y cianes». */
export function namePhrase(name: string, ring: number[], band?: number[], dull?: string | null): string {
  const p = neuronPhrase(ring, band).replace('con: ', 'con '), low = p.charAt(0).toLowerCase() + p.slice(1);
  return name + ': ' + (low.startsWith('casi nunca') && dull ? dull : low);
}

// ---------- probar un color: ¿cómo se llama de verdad? ¿lo conoce? ----------
export function hslOf(c: number[]): { h: number; s: number; l: number; chroma: number } {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn, l = (mx + mn) / 2;
  let h = 0;
  if (d > 0) h = mx === c[0] ? ((c[1] - c[2]) / d + 6) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
  return { h: h * 60, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l, chroma: d };
}
const span = (v: number, [a, b]: [number, number]): number => (v < a ? a - v : v > b ? v - b : 0);
const hueSpan = (h: number, [a, b]: [number, number]): number => {
  if (b - a >= 360) return 0;
  const mid = (a + b) / 2, half = (b - a) / 2, d = Math.abs((((h - mid) % 360) + 540) % 360 - 180);
  return Math.max(0, d - half);
};
/** Cuánto se sale un color de la región de un nombre (0 = dentro; en unidades de «lo que se tolera»). */
function outside(x: { h: number; s: number; l: number }, d: ColorDef): number {
  return (x.s > 0.08 || d.sat[1] > 0.08 ? hueSpan(x.h, d.hue) / 30 : 0) + span(x.s, d.sat) / 0.2 + span(x.l, d.lit) / 0.15;
}
/** Hasta dónde se tolera salirse de una región para seguir diciendo que el color tiene ese nombre. */
const TOL = 1.2;
/** El nombre REAL de un color, que conocemos por la lista de regiones. -1 si no cae en ninguno (un hueco). No depende de lo que la red sepa. */
export function nameIndexOf(c: number[]): number {
  const x = hslOf(c);
  let best = -1, bs = Infinity;
  COLORS.forEach((d, i) => { const o = outside(x, d); if (o < bs) { bs = o; best = i; } });
  return bs <= TOL ? best : -1;
}
/** Un color de ejemplo de un nombre (el primero de su examen), para «el color que llega». */
export function sampleOf(y: number): number[] { return examSet(y + 1).find((e) => e.y === y)!.c; }

export type Doubt = 'noword' | 'low' | 'hue' | null;
export interface Verdict {
  ps: number[]; best: number; p: number;
  /** Lo que dice la red. */
  name: string;
  /** Lo que es de verdad (la etiqueta del color, no la salida de la red); -1 si no cae en ningún nombre. */
  real: number; realName: string | null;
  doubt: Doubt;
  /** Solo con `low`: los dos nombres que conoce la red entre los que cae el color (por tono), o `null` si no hay un par claro. */
  between: [string, string] | null;
}
/** Color sin nombre en la lista (un hueco de la rueda: cian, fucsia…). Texto de `hue`. */
export const DOUBT_TEXT = 'Este color no tiene nombre todavía: no sé cómo llamarlo';

/** Los nombres que la red conoce, para una frase: «rojo, verde y azul» (hasta 4) o «sus 7 nombres». */
export function knownNames(n: number): string {
  if (n > 4) return 'sus ' + n + ' nombres';
  const names = NAMES.slice(0, n);
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0] ?? '';
}
/** La explicación de por qué se equivoca: no tiene palabra para el color y tiene que elegir una de las que tiene. */
export const noWordReason = (n: number): string => 'Solo conoce ' + knownNames(n) + ', y tiene que elegir uno';

/** Centro del tono de un nombre con color (en grados); `null` si no depende del tono (blanco, gris, negro). */
const hueCenter = (d: ColorDef): number | null => (d.hue[1] - d.hue[0] >= 360 ? null : (((d.hue[0] + d.hue[1]) / 2) % 360 + 360) % 360);
/** Distancia con signo de `from` a `to` por el camino más corto (grados, de -180 a 180). */
const hueDelta = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;
/** Cuánto se tolera que quede lejos cada vecino, y la suma de las dos distancias. */
const NEIGH_MAX = 70, NEIGH_SUM = 110;
/**
 * Entre qué dos nombres CONOCIDOS (los `n` primeros) cae un color de tono `h`: el más cercano a cada lado, sin contar el
 * propio nombre ni los que se le solapan en tono (marrón con naranja, azul marino con azul) ni los que no tienen tono.
 * Sale de los tonos de `COLORS`. Si a un lado no hay nadie cerca, o el par queda muy abierto, `null`.
 */
export function neighbours(h: number, n: number, real: number): [string, string] | null {
  const me = COLORS[real];
  let lo: { name: string; d: number } | null = null, hi: { name: string; d: number } | null = null;
  COLORS.slice(0, n).forEach((d, i) => {
    const c = hueCenter(d);
    if (i === real || c === null || (me && hueSpan(c, me.hue) === 0)) return;
    const dd = hueDelta(h, c);
    if (dd > 0 && (!hi || dd < hi.d)) hi = { name: d.name, d: dd };
    if (dd < 0 && (!lo || -dd < lo.d)) lo = { name: d.name, d: -dd };
  });
  const l = lo as { name: string; d: number } | null, u = hi as { name: string; d: number } | null;
  if (!l || !u || l.d > NEIGH_MAX || u.d > NEIGH_MAX || l.d + u.d > NEIGH_SUM) return null;
  return [l.name, u.name];
}

/**
 * La respuesta de la red a un color (`ps` son sus salidas) y el aviso honesto que toca. El aviso NO sale de lo
 * seguro que esté la red (se mide que llama con confianza a colores sin nombre): sale de la etiqueta real.
 * - `noword`: el color tiene un nombre que la red aún no tiene (el índice real es mayor que sus salidas).
 * - `hue`: el color no cae en ningún nombre de la lista (un hueco de la rueda).
 * - `low`: el color SÍ tiene nombre en la red, pero la mejor salida es floja (< 0.5).
 */
export function judge(ps: number[], c: number[]): Verdict {
  const best = argmax(ps), p = ps[best], real = nameIndexOf(c);
  let doubt: Doubt = null, between: [string, string] | null = null;
  if (real >= ps.length) doubt = 'noword';
  else if (real < 0) doubt = 'hue';
  else if (p < 0.5) { doubt = 'low'; between = neighbours(hslOf(c).h, ps.length, real); }
  return { ps, best, p, name: NAMES[best], real, realName: real >= 0 ? NAMES[real] : null, doubt, between };
}
/** «el rojo y el amarillo» para la frase de «entre…». */
export const betweenText = (b: [string, string]): string => 'el ' + b[0] + ' y el ' + b[1];
/** Lo que dice la red cuando duda con poca seguridad: «Gana «naranja», pero con poca seguridad: está entre el rojo y el amarillo». */
export const lowText = (v: Verdict): string => 'Gana «' + v.name + '», pero con poca seguridad' + (v.between ? ': está entre ' + betweenText(v.between) : '');
/** El aviso en texto plano; `noword` dice qué responde la red, cómo se llama de verdad el color y por qué se equivoca. */
export function verdictText(v: Verdict): string {
  if (v.doubt === 'noword') return 'Dice «' + v.name + '»… pero es ' + v.realName + '. ' + noWordReason(v.ps.length);
  if (v.doubt === 'low') return lowText(v);
  return v.doubt ? DOUBT_TEXT : '';
}

// ---------- muestras rápidas para probar, según los nombres que la red conoce ahora ----------
const hex2 = (v: number): string => ('0' + Math.round(v * 255).toString(16)).slice(-2);
export const rgbHex = (c: number[]): string => '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
export interface Quick { hex: string; name: string; known: boolean }
/**
 * Las muestras de la fila «Prueba un color»: un ejemplo típico de cada nombre que la red conoce (hasta `maxKnown`,
 * repartidos por la lista) y de 1 a 2 colores de nombres que aún NO conoce, empezando por el siguiente, para poder
 * provocar el momento «Dice X… pero es amarillo». Sin colores repetidos, tampoco con el `avoid` (el del selector).
 */
export function quickSamples(n: number, maxKnown = 6, maxUnknown = 2, avoid: string | null = null): Quick[] {
  const idx: number[] = [];
  if (n <= maxKnown) for (let i = 0; i < n; i++) idx.push(i);
  else for (let i = 0; i < maxKnown; i++) idx.push(Math.round((i * (n - 1)) / (maxKnown - 1)));
  const unk = Array.from({ length: Math.min(maxUnknown, MAX_OUT - n) }, (_, i) => n + i);
  const near = (a: string, b: string): boolean => { const d = [1, 3, 5].reduce((t, k) => t + (parseInt(a.slice(k, k + 2), 16) - parseInt(b.slice(k, k + 2), 16)) ** 2, 0); return d < 40 * 40; };
  const out: Quick[] = [];
  [...idx.map((i) => [i, true] as const), ...unk.map((i) => [i, false] as const)].forEach(([i, known]) => {
    const hex = rgbHex(sampleOf(i));
    if (out.some((q) => near(q.hex, hex)) || (avoid && near(avoid, hex))) return;
    out.push({ hex, name: NAMES[i], known });
  });
  return out;
}

// ---------- pesos aplanados, como los pide setWeights ----------
export { flatOf, snapNet, r4 } from './equipo';

/** El contador de la pantalla: «3 neuronas, una por nombre». */
export function countText(n: number): string {
  return n + (n === 1 ? ' neurona' : ' neuronas') + ', una por nombre';
}

/** Etiqueta corta de un nombre (nivel compacto): «amarillo» → «amar.», «verde lima» → «verde l.». */
export function shortName(name: string): string {
  const cut = (w: string, m: number): string => (w.length <= m ? w : w.slice(0, m - 1) + '.');
  const [a, ...rest] = name.split(' ');
  return rest.length ? cut(a, 5) + ' ' + rest[0][0] + '.' : cut(a, 5);
}

// ---------- examen rápido: todos los colores se ven pasar ----------
/** Duraciones cortas de un color del examen rápido (entra, sale). */
export const FAST_DUR = { in: 0.3, out: 0.2 } as const;
/** Lo que dura la parte rápida del examen, en segundos (de que sale el primero a que llega el último). */
export const FAST_TOTAL = 4;
/** Lo mismo con «Míralo solo» cuando va deprisa (los nombres del final). */
export const FAST_TOTAL_TURBO = 2.2;
/**
 * Los instantes (s desde el inicio de la parte rápida) en que sale cada uno de `count` colores: los intervalos
 * se acortan poco a poco, así que se ve arrancar despacio y acelerar. El total, con lo que tarda el último en
 * llegar, es `FAST_TOTAL` sea cual sea `count`.
 */
export function examFastPlan(count: number, total = FAST_TOTAL): { times: number[]; total: number } {
  const last = total - FAST_DUR.in - FAST_DUR.out;
  const times = Array.from({ length: Math.max(0, count) }, (_, k) => (count <= 1 ? 0 : last * (1 - Math.pow(1 - k / (count - 1), 1.6))));
  return { times, total: count > 0 ? times[count - 1] + FAST_DUR.in + FAST_DUR.out : 0 };
}

/** Qué colores cubre el porcentaje del examen: los nombres que la red conoce (3 o 4, se nombran; más, se cuentan). */
export function knownColors(n: number): string {
  if (n > 4) return 'de sus ' + n + ' nombres';
  const names = NAMES.slice(0, n);
  return 'de los colores que conoce: ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0]);
}
