import { createLoop, type Loop } from '../../viz/core/loop';
import { fmtCount, type BrainMeter } from '../../viz/BrainMeter';

/** «Cerebro de 3 neuronas» / «Cerebro de 1 neurona». */
export const brainName = (n: number): string => 'Cerebro de ' + n + (n === 1 ? ' neurona' : ' neuronas');

/**
 * Lo que lee un lector de pantalla: cuántas neuronas, cuánto han aprendido (lo que llena el cerebro, de media), los ajustes
 * que lleva (el número del centro) y el % de aciertos de la red entera (el texto de al lado), que son cosas distintas.
 */
export function brainAria(meter: BrainMeter, pct: number | null, what = 'de aciertos'): string {
  const learned = Math.round(meter.level() * 100);
  return brainName(meter.lobes) + ', ' + (learned === 0 ? 'vacío: todavía no ha aprendido nada' : 'lleno al ' + learned + ' por ciento con lo que ha aprendido')
    + '; ' + fmtCount(meter.adjustments()) + (meter.adjustments() === 1 ? ' ajuste' : ' ajustes')
    + (pct === null ? '' : '; ' + pct + ' por ciento ' + what);
}

export interface MeterOptions {
  canvas: HTMLCanvasElement;
  meter: BrainMeter;
  reduced: boolean;
  /** Tamaño del número del centro (los ajustes, que pone el propio cerebro). */
  labelSize?: number;
  /** Si se da, el texto de al lado del cerebro (el % de aciertos de la red entera): se escribe en `caption.el` cuando cambia. */
  caption?: { el: HTMLElement; text: () => string };
  /** Si se da, el tiempo que pasa (0 en pausa). */
  dt?: (dt: number) => number;
  /** Si se da, se pone como `aria-label` del lienzo cada vez que cambia. */
  aria?: () => string;
}

/**
 * Pone un cerebro (`BrainMeter`) en un lienzo, con su bucle de dibujo: en el centro, los ajustes que lleva; se llena con lo que aprende cada neurona, destella
 * cuando una cambia, respeta «menos movimiento» y se pausa fuera de pantalla (`createLoop`).
 */
export function mountBrainMeter(o: MeterOptions): Loop {
  let last = '', lastCap: string | null = null;
  return createLoop(o.canvas, {
    draw(ctx, w, h, dt, t) {
      const d = o.dt ? o.dt(dt) : dt;
      o.meter.ease(d, o.reduced); o.meter.tick(d, o.reduced);
      o.meter.draw(ctx, w, h, t, o.labelSize);
      if (o.caption) { const c = o.caption.text(); if (c !== lastCap) { lastCap = c; o.caption.el.textContent = c; } }
      if (o.aria) { const a = o.aria(); if (a !== last) { last = a; o.canvas.setAttribute('aria-label', a); } }
    },
  });
}

/** El texto del % de aciertos de al lado del cerebro: «acierta el 87 %» (o `empty` si todavía no hay nada que medir). */
export function pctCaption(pct: number | null, verb = 'acierta', empty = 'aún sin examen'): string {
  return pct === null ? empty : verb + ' el ' + pct + ' %';
}
