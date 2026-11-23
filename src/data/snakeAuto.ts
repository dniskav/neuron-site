/**
 * «Míralo solo» (Snake): el guion como DATOS; el ejecutor es el genérico `runScript` (`src/viz/script.ts`), que no sabe nada del DOM.
 * Los textos son funciones de lo que pasó de verdad (`AutoCtx`): los números salen de las partidas reales.
 */
import { readMs, runScript, type ScriptApi, type ScriptRun, type ScriptStep } from '../viz/script';
import type { Vision } from './snake';

/** Lo que ha pasado hasta ahora; los textos salen de aquí. */
export interface AutoCtx {
  /** Partidas jugadas desde que la red es nueva. */
  games: number;
  /** Comidas por partida: media de las últimas 10 y de las últimas 20 (null si aún no hay). */
  mean10: number | null;
  mean20: number | null;
  /** La última partida: cuánto comió y cómo acabó. */
  last: { food: number; death: 'pared' | 'cuerpo' | 'vueltas' | 'none'; trapped?: boolean } | null;
  /** Lo que come la regla escrita a mano, y el azar. */
  rule: number;
  random: number;
  /** Nivel 2: lo que ve la red ahora, lo que come la regla escrita a mano que cuenta el sitio que queda, y lo que comía la red con sus ojos al cambiar. */
  vision: Vision;
  ruleHelp: number;
  eyesMean: number | null;
  /** Lo que come la red jugando SIN dado (la mejor jugada siempre), ahora y la de sus ojos al cambiar de nivel (null si aún no hay partidas para medirlo). */
  skill: number | null;
  eyesSkill: number | null;
  /** De las últimas partidas, la parte que acabó encerrada (0..1; null si aún no hay datos). */
  trapped: number | null;
}

export type AutoAct = 'reset' | 'watch' | 'train' | 'vision';
export interface AutoStep extends ScriptStep<AutoCtx> {
  act: AutoAct;
  /** Solo `train`: cuántas partidas. */
  count?: number;
  /** Solo `vision`: a qué nivel se pasa. */
  to?: Vision;
}
export interface AutoApi extends ScriptApi<AutoCtx> {
  /** Red nueva en el nivel 1 (sus ojos). */
  reset(): void | Promise<void>;
  /** Cambia lo que ve la red (red nueva y vacía). */
  setVision(v: Vision): void | Promise<void>;
  /** Una partida despacio. */
  watch(): Promise<void>;
  /** `n` partidas deprisa. */
  train(n: number): Promise<void>;
}

export const WINDOW = 20;
/** Una cifra con coma decimal: 12,4. */
export const num = (x: number | null, d = 1): string => (x === null ? '–' : x.toFixed(d).replace('.', ','));
const how = (c: AutoCtx): string => {
  const d = c.last?.death, t = c.last?.trapped, what = d === 'pared' ? 'con la pared' : 'con su cola';
  return d === 'vueltas' ? 'Dio vueltas sin comer' : d === 'pared' || d === 'cuerpo' ? (t ? 'Se encerró y chocó ' + what : 'Chocó ' + what + ' (tenía salida)') : 'Acabó';
};
const eats = (n: number): string => (n === 1 ? '1 comida' : n + ' comidas');

const pct = (x: number | null): string => (x === null ? '–' : Math.round(x * 100) + ' %');

/** Nivel 1 y nivel 2, uno detrás de otro (corto): primero con sus ojos, luego la misma red con la ayuda que escribió una persona. */
export function buildScript(): AutoStep[] {
  return [
    { act: 'reset', after: () => 'Nivel 1: una serpiente y una red que todavía no sabe nada. Solo recibe un premio (+) cuando come y un castigo (−) cuando choca.', hold: 4200 },
    { act: 'watch', before: () => 'Primera partida: como no sabe nada, casi todo lo juega al azar…',
      after: (c) => how(c) + ' con ' + eats(c.last?.food ?? 0) + '.', hold: 2800 },
    { act: 'train', count: 100, before: () => 'Cien partidas deprisa, con lo que ve con sus ojos…',
      after: (c) => c.games + ' partidas: come de media ' + num(c.mean20) + '. Al final se encierra sola: no sabe cuánto sitio le queda (' + pct(c.trapped) + ' de las últimas murió encerrada).', hold: 4600 },
    { act: 'vision', to: 'ayuda', before: () => 'Nivel 2: una persona escribe código que cuenta cuánto sitio queda tras cada jugada y se lo da a la red…',
      after: () => 'Red nueva, vacía, con 3 entradas más: «¿cabe si giro a la izquierda / sigo recto / giro a la derecha?». Esas 3 las calcula una persona; la red no.', hold: 4600 },
    { act: 'train', count: 100, before: () => 'Otras cien partidas, ahora con ayuda…',
      after: (c) => c.games + ' partidas: come de media ' + num(c.mean20) + ' (con solo sus ojos: ' + num(c.eyesMean) + '), y sin tirar el dado ' + num(c.skill, 0) + ' (sus ojos: ' + num(c.eyesSkill, 0) + '). La regla escrita a mano con la misma ayuda come ' + num(c.ruleHelp, 0) + '. La idea de contar el sitio la puso una persona; la red aprendió cuándo fiarse de ella. ', hold: 0, link: true },
  ];
}

export { readMs };
export type AutoRun = ScriptRun<AutoCtx>;
/** Ejecuta el guion paso a paso (el ejecutor genérico es `runScript`, de `src/viz/script.ts`). */
export function runAuto(script: AutoStep[], api: AutoApi, opts: { reduced?: boolean; log?: (s: AutoStep, ctx: AutoCtx) => void } = {}): Promise<AutoRun> {
  return runScript(script, api, async (s) => {
    if (s.act === 'reset') await api.reset();
    else if (s.act === 'vision') await api.setVision(s.to ?? 'ayuda');
    else if (s.act === 'watch') await api.watch();
    else await api.train(s.count ?? 10);
  }, opts);
}
