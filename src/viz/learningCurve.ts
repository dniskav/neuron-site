/**
 * Curva de aprendizaje (pieza reutilizable, TS puro, sin DOM): el historial acotado de lo que ha sacado una red en cada intento
 * (partida, bola, repaso) y la detección de «meseta» (la red ya casi no mejora). La dibuja `ui/LearningCurve.ts`.
 *
 * HISTORIAL ACOTADO. Un intento es un número (comidas, 1/0 de atrapada, error…). Se guardan sueltos los últimos `keep` (600) y lo
 * anterior se pliega en cubos de `bucket` (20) intentos que guardan cuántos fueron, su SUMA, su mínimo y su máximo (`Bucket`).
 * Si hay más de `maxBuckets` (150) cubos, se funden los dos más antiguos (suman n y sumas, mín. de mínimos, máx. de máximos).
 * Plegar NUNCA cambia el total ni la media de nada: la media de cualquier tramo de cubos es suma / n, exacta. Lo único que se
 * pierde con el tiempo es el detalle de los intentos muy viejos (3.600 intentos con detalle de 20 en 20, y más allá, cubos más
 * grandes), y la curva lo dibuja tal cual: una franja de mínimo a máximo, no puntos inventados. Todo cabe en ~5 KB de texto.
 */

export interface Bucket { n: number; sum: number; min: number; max: number }
export interface CurveData { total: number; old: [number, number, number, number][]; recent: number[] }
export interface CurveLimits { keep: number; bucket: number; maxBuckets: number }
export const CURVE_LIMITS: CurveLimits = { keep: 600, bucket: 20, maxBuckets: 150 };
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export class CurveHistory {
  total = 0;
  old: Bucket[] = [];
  recent: number[] = [];
  constructor(readonly lim: CurveLimits = CURVE_LIMITS) {}

  add(v: number): void {
    this.total++; this.recent.push(v);
    const { keep, bucket, maxBuckets } = this.lim;
    if (this.recent.length >= keep + bucket) {
      const chunk = this.recent.splice(0, bucket);
      this.old.push({ n: chunk.length, sum: chunk.reduce((s, x) => s + x, 0), min: Math.min(...chunk), max: Math.max(...chunk) });
      while (this.old.length > maxBuckets) {
        const [a, b] = this.old.splice(0, 2);
        this.old.unshift({ n: a.n + b.n, sum: a.sum + b.sum, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) });
      }
    }
  }
  reset(): void { this.total = 0; this.old = []; this.recent = []; }
  /** Intentos que ya no están sueltos (plegados en cubos). */
  get folded(): number { return this.old.reduce((s, b) => s + b.n, 0); }
  /** Suma y media de TODO lo que ha pasado (exactas, aunque esté plegado). */
  get sum(): number { return this.old.reduce((s, b) => s + b.sum, 0) + this.recent.reduce((s, x) => s + x, 0); }
  get mean(): number | null { return this.total ? this.sum / this.total : null; }
  /** Media de los últimos `n` intentos (null si no hay ninguno). Con `n` mayor que lo suelto, se queda con lo suelto. */
  meanLast(n: number): number | null {
    const r = this.recent.slice(-n);
    return r.length ? r.reduce((s, x) => s + x, 0) / r.length : null;
  }
  toJSON(): CurveData { return { total: this.total, old: this.old.map((b) => [b.n, r6(b.sum), r6(b.min), r6(b.max)]), recent: this.recent.map(r6) }; }
  /** Pone el historial desde `toJSON`. Lanza (sin tocar nada) si no cuadra: cuentas que no suman, números raros. */
  load(d: unknown): void {
    const c = checkCurve(d, this.lim);
    this.total = c.total; this.old = c.old.map(([n, sum, min, max]) => ({ n, sum, min, max })); this.recent = c.recent.slice();
  }
  /** Empieza con estos intentos (p. ej. los 60 de un guardado antiguo): la curva sale de aquí y el eje cuenta desde ellos. */
  seed(values: number[]): void { this.reset(); values.forEach((v) => this.add(v)); }
}

/** Comprueba la forma de un historial guardado. Lanza con el motivo. */
export function checkCurve(d: unknown, lim: CurveLimits = CURVE_LIMITS): CurveData {
  const bad = (what: string): never => { throw new Error('«' + what + '» no es válido'); };
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return bad('la curva');
  const { total, old, recent } = d as Record<string, unknown>;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total > 1e7) bad('el total de la curva');
  if (!Array.isArray(old) || old.length > lim.maxBuckets) bad('los cubos de la curva');
  if (!Array.isArray(recent) || recent.length > lim.keep + lim.bucket || !recent.every(num)) bad('los últimos intentos de la curva');
  let n = 0;
  for (const b of old as unknown[]) {
    if (!Array.isArray(b) || b.length !== 4 || !b.every(num) || !Number.isInteger(b[0]) || b[0] < 1 || b[2] > b[3] || b[1] < b[2] * b[0] - 1e-6 || b[1] > b[3] * b[0] + 1e-6) bad('un cubo de la curva');
    n += (b as number[])[0];
  }
  if (n + (recent as unknown[]).length !== total) bad('la cuenta de la curva (los intentos no suman el total)');
  return { total: total as number, old: (old as number[][]).map((b) => [b[0], b[1], b[2], b[3]] as [number, number, number, number]), recent: (recent as number[]).slice() };
}

// ---------- puntos de la curva ----------
export interface CurvePoints {
  /** Cubos plegados: tramo [x0, x1] (intentos que cubre), media, mínimo y máximo. */
  buckets: { x0: number; x1: number; mean: number; min: number; max: number }[];
  /** Intentos sueltos: x = su número (1-based), y = su valor. */
  raw: { x: number; y: number }[];
  /** La línea suave: media móvil de `window` intentos. Cubos: su media en su centro. Sueltos: media de los últimos `window` (lo que falta, antes del primero suelto, se completa con la media del último cubo). */
  line: { x: number; y: number }[];
}
export function curvePoints(h: CurveHistory, window: number): CurvePoints {
  const buckets: CurvePoints['buckets'] = [], line: CurvePoints['line'] = [], raw: CurvePoints['raw'] = [];
  let x = 0;
  for (const b of h.old) { buckets.push({ x0: x, x1: x + b.n, mean: b.sum / b.n, min: b.min, max: b.max }); line.push({ x: x + b.n / 2, y: b.sum / b.n }); x += b.n; }
  const tail = h.old.length ? h.old[h.old.length - 1].sum / h.old[h.old.length - 1].n : 0;
  let acc = 0;
  h.recent.forEach((y, i) => {
    raw.push({ x: x + i + 1, y });
    acc += y;
    if (i >= window) acc -= h.recent[i - window];
    const have = Math.min(i + 1, window), missing = h.old.length ? window - have : 0;
    line.push({ x: x + i + 1, y: (acc + missing * tail) / (have + missing) });
  });
  return { buckets, raw, line };
}

// ---------- meseta ----------
export interface PlateauParams {
  /** Tamaño de cada tramo que se compara (últimos `window` frente a los `window` de antes). */
  window: number;
  /** No se dice nada con menos intentos que éstos en total. */
  minGames: number;
  /** Los primeros `skip` intentos no cuentan (Snake: la fase del dado ε, 70 partidas). */
  skip: number;
  /** Ganancia mínima que cuenta como mejora, en las unidades del valor (comidas, fracción…). */
  minGain: number;
  /** Y en múltiplos de la desviación típica de los últimos 2·`window` intentos (el ruido de un intento a otro). */
  k: number;
  /** 'up': más es mejor (comidas, aciertos). 'down': menos es mejor (error). */
  better: 'up' | 'down';
}
export interface Plateau {
  flat: boolean;
  /** Intento (1-based) desde el que la media se queda en la franja: dónde empieza la meseta que se sombrea. */
  from: number;
  /** Lo que ha mejorado la media de los últimos `window` frente a los `window` de antes (negativo: ha empeorado). */
  gain: number;
  threshold: number;
  /** La media de los últimos `window`. */
  level: number;
}
const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;
const sd = (v: number[]): number => { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length); };

/**
 * ¿Ha dejado de mejorar? Regla (una sola para todas las pantallas; cada una pone sus números):
 *   mejora = media(últimos w) − media(los w de antes)   (con signo: si menos es mejor, al revés)
 *   ruido  = desviación típica de los últimos 2w
 *   meseta = mejora < max(minGain, k · ruido)   y   hay ≥ minGames intentos en total
 * Los primeros `skip` intentos no entran. `values` = los intentos sueltos más recientes y `first` = nº (0-based) del primero.
 * Devuelve null si todavía no hay datos para decirlo (no es «no hay meseta»: es «no se sabe»). La franja sombreada empieza en el
 * primer intento desde el que la media móvil de w se queda a menos de `threshold` de la media de ahora.
 */
export function plateau(values: number[], first: number, p: PlateauParams): Plateau | null {
  const total = first + values.length, w = p.window, from0 = Math.max(0, p.skip - first), v = values.slice(from0);
  if (total < p.minGames || v.length < 2 * w) return null;
  const sign = p.better === 'up' ? 1 : -1;
  const level = mean(v.slice(-w)), gain = sign * (level - mean(v.slice(-2 * w, -w)));
  const threshold = Math.max(p.minGain, p.k * sd(v.slice(-2 * w)));
  const flat = gain < threshold;
  let e0 = v.length - 1;
  for (let e = v.length - 1; e >= w - 1; e--) { if (Math.abs(mean(v.slice(e - w + 1, e + 1)) - level) > threshold) break; e0 = e; }
  const from = Math.min(first + from0 + e0 + 1, total - w + 1);
  return { flat, from: Math.max(1, from), gain, threshold, level };
}
