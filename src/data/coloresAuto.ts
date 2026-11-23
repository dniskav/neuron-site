/**
 * «Míralo solo» (Colores): el guion de la pantalla como DATOS (una lista de pasos) y un ejecutor pequeño que no sabe
 * nada del DOM. El ejecutor pide cada cosa a una `AutoApi`; la pantalla la implementa con LAS MISMAS funciones que los
 * botones (reiniciar, Enséñale, «+ nombre», probar un color), y los tests con la red real sin dibujo.
 *
 * Los textos son funciones de lo que pasó de verdad (`AutoCtx`): los «X de Y» son el resultado del examen real y lo que
 * dice la red es su respuesta real, nunca un número escrito a mano.
 */
import { MAX_OUT, N0, NAMES, betweenText, knownNames, rgbHex, sampleOf, type Verdict } from './colores';
import { readMs, runScript, type ScriptApi, type ScriptRun, type ScriptStep } from '../viz/script';

/** Lo que ha pasado hasta ahora; los textos salen de aquí. */
export interface AutoCtx {
  /** Nombres (neuronas) que tiene la capa. */
  n: number;
  /** Último examen terminado. */
  exam: { ok: number; total: number } | null;
  /** Lo que respondió la red al último color probado. */
  verdict: Verdict | null;
}

export type AutoAct = 'reset' | 'addName' | 'teach' | 'exam' | 'probe';
export interface AutoStep extends ScriptStep<AutoCtx> {
  act: AutoAct;
  /** Enséñale y examen deprisa (los nombres del final). */
  quick?: boolean;
  /** Solo `probe`: el color que llega. */
  color?: (ctx: AutoCtx) => number[];
}

/** Lo que el ejecutor necesita de la pantalla (o de los tests). */
export interface AutoApi extends Omit<ScriptApi<AutoCtx>, 'ctx'> {
  /** Rojo, verde y azul, 13 ejemplos por nombre. */
  reset(): void | Promise<void>;
  /** «+ nombre»: devuelve cuántos nombres hay ya. */
  addName(): number | Promise<number>;
  /** «Enséñale»: termina cuando empieza el examen (que la propia pantalla encadena). */
  teach(quick: boolean): Promise<void>;
  /** Termina con el examen: sus aciertos reales. */
  exam(quick: boolean): Promise<{ ok: number; total: number }>;
  /** Probar un color: la respuesta real de la red. */
  probe(c: number[], hex: string): Promise<Verdict>;
}

const WORDS = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis'];
/** «cuatro» para 4 (hasta 16; más, el número). */
export const numWord = (n: number): string => WORDS[n - 1] ?? String(n);
const examText = (c: AutoCtx): string => (c.exam ? 'Acierta ' + c.exam.ok + ' de ' + c.exam.total : '');
const pct = (c: AutoCtx): number => (c.exam ? Math.round((c.exam.ok / c.exam.total) * 100) : 0);

/** El color de muestra del nombre número `y` (el mismo que ofrecen las muestras rápidas). */
const sample = (y: number) => (): number[] => sampleOf(y);

/** Lo que se dice al ver lo que respondió la red al color que llegó. Todo sale de la respuesta real y de la etiqueta real. */
export function probeCaption(v: Verdict | null): string {
  if (!v) return '';
  if (v.doubt === 'noword') return 'Dice «' + v.name + '». No tiene palabra para el ' + v.realName + ': solo puede elegir entre las que conoce.';
  if (v.doubt === 'low') {
    return 'Gana «' + v.name + '», pero apenas se enciende' + (v.between ? ': está entre ' + betweenText(v.between) + ', y' : ' y') + ' una neurona sola no sabe quedarse con lo de en medio.';
  }
  return 'Dice «' + v.name + '»' + (v.real === v.best ? ' y acierta.' : '.');
}

/**
 * El guion. `maxN` es hasta cuántos nombres llega (16). Pasos 1-6 son la historia con calma; del 7 en adelante
 * cada nombre se añade, se enseña y se examina deprisa, con una frase.
 */
export function buildScript(maxN: number = MAX_OUT): AutoStep[] {
  const steps: AutoStep[] = [
    { act: 'reset', after: () => 'Tres neuronas, una por nombre. Ninguna sabe nada todavía.', hold: 3200 },
    { act: 'teach', before: () => 'Enséñale: cada color de ejemplo pasa por las tres. La que debía encenderse se corrige…', hold: 0 },
    { act: 'exam', before: () => 'Examen: colores que nunca vio…', after: (c) => 'Examen: colores que nunca vio. ' + examText(c) + '.', hold: 2400 },
    { act: 'probe', color: sample(N0), before: () => 'Llega un ' + NAMES[N0] + '…', after: (c) => probeCaption(c.verdict), hold: 3800 },
    { act: 'addName', after: (c) => 'Una neurona más: ahora la capa tiene ' + numWord(c.n) + '.', hold: 1400 },
    { act: 'teach', quick: true, before: () => 'Enséñale otra vez, con la neurona nueva…', hold: 0 },
    { act: 'exam', quick: true, after: (c) => 'Con «' + NAMES[c.n - 1] + '» ya sabe ' + knownNames(c.n) + '. ' + examText(c) + '.', hold: 2400 },
    { act: 'addName', after: (c) => 'Otra más, para el ' + NAMES[c.n - 1] + ': ' + numWord(c.n) + ' neuronas.', hold: 1000 },
    { act: 'teach', quick: true, hold: 0 },
    { act: 'exam', quick: true, after: (c) => numWord(c.n)[0].toUpperCase() + numWord(c.n).slice(1) + ' neuronas. ' + examText(c) + '.', hold: 1600 },
    { act: 'probe', color: sample(N0 + 1), before: () => 'Llega un ' + NAMES[N0 + 1] + '…', after: (c) => probeCaption(c.verdict), hold: 5400 },
  ];
  /* del sexto nombre en adelante: uno por uno, deprisa */
  for (let n = N0 + 3; n <= maxN; n++) {
    steps.push({ act: 'addName', hold: 300 });
    steps.push({ act: 'teach', quick: true, hold: 0 });
    steps.push({
      act: 'exam', quick: true, hold: n === maxN ? 0 : 500,
      after: (c) => (n === maxN ? '' : '«' + NAMES[c.n - 1] + '»: ' + c.n + ' neuronas. ' + examText(c) + '.'),
    });
  }
  const last = steps[steps.length - 1];
  last.after = (c) => c.n + ' neuronas, una por nombre, aciertan ' + pct(c) + ' %. Eso es una capa: muchas neuronas mirando lo mismo. Pero ya viste el naranja: hay cosas que una neurona sola no puede.';
  last.link = true;
  return steps;
}

export { readMs };
export type AutoRun = ScriptRun<AutoCtx>;
/**
 * Ejecuta el guion paso a paso (el ejecutor genérico es `runScript`, de `src/viz/script.ts`): para entre pasos (nunca a medias)
 * en cuanto `api.cancelled()` es verdadero. `reduced`: sin animación, así que cada pausa se alarga lo que haga falta para leer el rótulo.
 */
export function runAuto(script: AutoStep[], api: AutoApi, opts: { reduced?: boolean; log?: (s: AutoStep, ctx: AutoCtx) => void } = {}): Promise<AutoRun> {
  const ctx: AutoCtx = { n: N0, exam: null, verdict: null };
  return runScript(script, { ...api, ctx: () => ctx }, async (s) => {
    if (s.act === 'reset') { await api.reset(); ctx.n = N0; ctx.exam = null; ctx.verdict = null; }
    else if (s.act === 'addName') ctx.n = await api.addName();
    else if (s.act === 'teach') await api.teach(!!s.quick);
    else if (s.act === 'exam') ctx.exam = await api.exam(!!s.quick);
    else if (s.act === 'probe') { const c = (s.color as (x: AutoCtx) => number[])(ctx); ctx.verdict = await api.probe(c, rgbHex(c)); }
  }, opts);
}
