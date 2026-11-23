/**
 * Ejecutor de guiones («Míralo solo»): el guion es una lista de pasos (DATOS) y el ejecutor no sabe nada del DOM ni de
 * ninguna pantalla. Para cada paso: rótulo previo, `perform` (que llama a las MISMAS funciones que los botones), rótulo
 * con lo que pasó de verdad y pausa de lectura. Se detiene entre pasos (nunca a medias) en cuanto `cancelled()` es verdadero.
 *
 * Lo usan Paleta (`src/data/paletaAuto.ts`) y Colores (`src/data/coloresAuto.ts`); un ejemplo nuevo solo pone su guion y su
 * `perform`.
 */

/** Lo que cualquier paso de un guion trae. `C` es lo que ha pasado hasta ahora: los textos son funciones de `C`, nunca números escritos a mano. */
export interface ScriptStep<C> {
  /** Rótulo mientras se hace. */
  before?: (ctx: C) => string;
  /** Rótulo con lo que pasó. */
  after?: (ctx: C) => string;
  /** Pausa de lectura tras el paso, en ms. */
  hold: number;
  /** El último rótulo trae el enlace a la pantalla siguiente (y no hay pausa tras él). */
  link?: boolean;
}

/** Lo que el ejecutor necesita de la pantalla (o de los tests). */
export interface ScriptApi<C> {
  ctx(): C;
  caption(text: string, link?: boolean): void;
  sleep(ms: number): Promise<void>;
  cancelled(): boolean;
}

export interface ScriptRun<C> { finished: boolean; steps: number; ctx: C }

/** Cuánto se tarda en leer un rótulo sin animación (con `prefers-reduced-motion` no hay nada que ver mientras tanto). */
export const readMs = (text: string): number => 1800 + 45 * text.length;

/**
 * Ejecuta el guion paso a paso. `reduced`: sin animación, así que cada pausa se alarga lo que haga falta para leer el rótulo.
 * `perform(paso, ctx)` hace lo que el paso pide y, si hace falta, anota en `ctx` lo que pasó.
 */
export async function runScript<S extends ScriptStep<C>, C>(
  script: S[],
  api: ScriptApi<C>,
  perform: (s: S, ctx: C) => void | Promise<void>,
  opts: { reduced?: boolean; log?: (s: S, ctx: C) => void } = {},
): Promise<ScriptRun<C>> {
  let done = 0;
  for (const s of script) {
    if (api.cancelled()) return { finished: false, steps: done, ctx: api.ctx() };
    if (s.before) api.caption(s.before(api.ctx()));
    await perform(s, api.ctx());
    if (api.cancelled()) return { finished: false, steps: done, ctx: api.ctx() };
    const ctx = api.ctx(), text = s.after ? s.after(ctx) : '';
    if (text) api.caption(text, s.link);
    opts.log?.(s, ctx);
    done++;
    const hold = opts.reduced ? Math.max(s.hold, text ? readMs(text) : 0) : s.hold;
    if (hold > 0 && !s.link) await api.sleep(hold);
  }
  return { finished: true, steps: done, ctx: api.ctx() };
}
