import { createLoop, type Loop } from '../../viz/core/loop';
import type { BrainMeter } from '../../viz/BrainMeter';

/** «Cerebro de 3 neuronas» / «Cerebro de 1 neurona». */
export const brainName = (n: number): string => 'Cerebro de ' + n + (n === 1 ? ' neurona' : ' neuronas');

/**
 * Lo que lee un lector de pantalla: cuántas neuronas, cuánto han aprendido (lo que llena el cerebro, de media) y el % de
 * aciertos de la red entera (el número del centro), que son dos cosas distintas.
 */
export function brainAria(meter: BrainMeter, pct: number | null, what = 'de aciertos'): string {
  const learned = Math.round(meter.level() * 100);
  return brainName(meter.lobes) + ', ' + (learned === 0 ? 'vacío: todavía no ha aprendido nada' : 'lleno al ' + learned + ' por ciento con lo que ha aprendido')
    + (pct === null ? '' : '; ' + pct + ' por ciento ' + what);
}

export interface MeterOptions {
  canvas: HTMLCanvasElement;
  meter: BrainMeter;
  reduced: boolean;
  /** El número del centro (el % de la red entera). */
  label: () => string;
  labelSize?: number;
  /** Si se da, el tiempo que pasa (0 en pausa). */
  dt?: (dt: number) => number;
  /** Si se da, se pone como `aria-label` del lienzo cada vez que cambia. */
  aria?: () => string;
}

/**
 * Pone un cerebro (`BrainMeter`) en un lienzo, con su bucle de dibujo: se llena con lo que aprende cada neurona, destella
 * cuando una cambia, respeta «menos movimiento» y se pausa fuera de pantalla (`createLoop`).
 */
export function mountBrainMeter(o: MeterOptions): Loop {
  let last = '';
  return createLoop(o.canvas, {
    draw(ctx, w, h, dt, t) {
      const d = o.dt ? o.dt(dt) : dt;
      o.meter.ease(d, o.reduced); o.meter.tick(d, o.reduced);
      o.meter.draw(ctx, w, h, t, o.label(), o.labelSize);
      if (o.aria) { const a = o.aria(); if (a !== last) { last = a; o.canvas.setAttribute('aria-label', a); } }
    },
  });
}
