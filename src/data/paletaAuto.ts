/**
 * «Míralo solo» (Paleta): el guion como DATOS; el ejecutor es el genérico `runScript` (`src/viz/script.ts`), que no sabe nada del DOM.
 * Los textos son funciones de lo que pasó de verdad (`AutoCtx`): los «X de Y» salen de las bolas reales.
 */
import { readMs, runScript, type ScriptApi, type ScriptRun, type ScriptStep } from '../viz/script';

/** Lo que ha pasado hasta ahora; los textos salen de aquí. */
export interface AutoCtx {
  kind: 'solo' | 'equipo';
  walls: boolean;
  /** ¿Hay un bloque en el campo? */
  block: boolean;
  /** ¿Las neuronas del medio se doblan? (solo cuenta con el equipo) */
  curve: boolean;
  /** Caídas guardadas. */
  n: number;
  /** Las últimas bolas (hasta `WINDOW`): atrapadas y total. */
  recent: { ok: number; total: number };
  /** La última bola lanzada. */
  last: { ok: boolean; pred: number; land: number } | null;
}

export type AutoAct = 'reset' | 'launch' | 'walls' | 'block' | 'team' | 'curve';
export interface AutoStep extends ScriptStep<AutoCtx> {
  act: AutoAct;
  /** Solo `launch`: cuántas bolas. */
  count?: number;
  /** Solo `curve` y `block`: encender (true) o apagar la curva del equipo / el bloque. */
  on?: boolean;
  /** Solo `launch`: con animación completa (una a una, con calma). */
  slow?: boolean;
}

export interface AutoApi extends ScriptApi<AutoCtx> {
  reset(): void | Promise<void>;
  launch(count: number, slow: boolean): Promise<void>;
  walls(on: boolean): void;
  block(on: boolean): void;
  team(): void;
  curve(on: boolean): void;
}

export const WINDOW = 20;
const pc = (c: AutoCtx): string => 'atrapó ' + c.recent.ok + ' de las últimas ' + c.recent.total;
const pct = (c: AutoCtx): number => (c.recent.total ? Math.round((c.recent.ok / c.recent.total) * 100) : 0);

export function buildScript(): AutoStep[] {
  return [
    { act: 'reset', after: () => 'Una neurona, una paleta y una bola. La neurona todavía no sabe nada. La paleta solo va adonde la neurona le diga.', hold: 3600 },
    { act: 'launch', count: 1, slow: true, before: () => 'La bola baja. La neurona mira dónde está y cuánto se inclina, y dice dónde cree que caerá…',
      after: (c) => (c.last && c.last.ok ? 'Acertó por casualidad. ' : 'Falló: no sabía nada. ') + 'Pero ahora ya sabe dónde cayó, así que guarda esa caída y la repasa.', hold: 2600 },
    { act: 'launch', count: 1, slow: true, after: (c) => 'Segunda bola, ' + c.n + ' caídas guardadas. Cada vez repasa todas las que lleva.', hold: 1800 },
    { act: 'launch', count: 10, before: () => 'Ahora varias bolas seguidas…', after: (c) => 'Con ' + c.n + ' caídas, ' + pc(c) + '.', hold: 2000 },
    { act: 'launch', count: 20, after: (c) => 'Con ' + c.n + ' caídas, ' + pc(c) + '. Nadie le explicó cómo se mueve una bola: solo vio dónde cayó cada una.', hold: 3400 },
    { act: 'launch', count: 1, slow: true, before: () => 'Una bola nueva, que nunca había visto…',
      after: (c) => (c.last && c.last.ok ? 'Atrapada. Ninguna trayectoria se repite, y aun así sabe dónde caerá.' : 'Esta vez falló por poco. Cuantas más caídas, menos falla.'), hold: 2600 },
    { act: 'walls', after: () => 'Ahora con paredes: la bola rebota en los lados.', hold: 1800 },
    { act: 'launch', count: 30, before: () => 'La neurona sola lo intenta otra vez…',
      after: (c) => 'Con paredes, la neurona sola ' + pc(c) + '. Por mucho que repase, una sola no puede seguir los rebotes.', hold: 4200 },
    { act: 'team', after: () => 'Un equipo, como el de Equipo: unas neuronas ayudantes entre lo que ve y lo que dice. Empieza sin saber nada.', hold: 3000 },
    { act: 'launch', count: 100, before: () => 'Lanzando 100 bolas…', after: (c) => 'Con ' + c.n + ' caídas, el equipo ' + pc(c) + '.', hold: 2200 },
    { act: 'launch', count: 100,
      after: (c) => 'Con ' + c.n + ' caídas, ' + pc(c) + ' (' + pct(c) + ' %). Rebotes que nadie le explicó. Como en Equipo: una sola neurona no podía con esto; un equipo sí.', hold: 3000 },
    { act: 'curve', on: false, after: () => 'Ahora apagamos la curva: las ayudantes ya no doblan su respuesta. Empieza de nuevo, sin saber nada.', hold: 3000 },
    { act: 'launch', count: 100, before: () => 'Con paredes, otra vez 100 bolas…',
      after: (c) => 'Sin curva, ' + pc(c) + ' (' + pct(c) + ' %). Ocho neuronas que no se doblan valen lo mismo que una recta: falla.', hold: 3800 },
    { act: 'curve', on: true, after: () => 'Encendemos la curva otra vez.', hold: 2200 },
    { act: 'launch', count: 100,
      after: (c) => 'Con la curva, ' + pc(c) + ' (' + pct(c) + ' %). Es la curva la que sigue los rebotes.', hold: 3200 },
    { act: 'block', on: true, after: () => 'Ahora un bloque en el campo. La red no lo ve: si la bola rebota en él, tiene que volver a mirar y corregir.', hold: 3600 },
    { act: 'launch', count: 10, before: () => 'Diez bolas, con el bloque en medio…',
      after: (c) => 'Con el bloque, ' + pc(c) + '. Cada vez que la bola rebota en él, la red vuelve a mirar desde la nueva altura y la paleta corrige.', hold: 0, link: true },
  ];
}

export { readMs };
export type AutoRun = ScriptRun<AutoCtx>;
/** Ejecuta el guion paso a paso (el ejecutor genérico es `runScript`, de `src/viz/script.ts`). */
export function runAuto(script: AutoStep[], api: AutoApi, opts: { reduced?: boolean; log?: (s: AutoStep, ctx: AutoCtx) => void } = {}): Promise<AutoRun> {
  return runScript(script, api, async (s) => {
    if (s.act === 'reset') await api.reset();
    else if (s.act === 'launch') await api.launch(s.count ?? 1, !!s.slow);
    else if (s.act === 'walls') api.walls(true);
    else if (s.act === 'block') api.block(s.on !== false);
    else if (s.act === 'team') api.team();
    else if (s.act === 'curve') api.curve(s.on !== false);
  }, opts);
}
