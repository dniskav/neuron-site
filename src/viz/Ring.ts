import { TAU } from './core/canvas';
import { css } from './core/colors';
import { RING_COLORS, LIGHT_LEVELS } from '../data/colores';

/** El gris de cada nivel de la banda de luz. */
const LIGHT_SHADES: number[][] = LIGHT_LEVELS.map((l) => [l, l, l]);

/**
 * El anillo de colores de una neurona del medio: la rueda de tonos, con cada segmento tan encendido como
 * la activación REAL de la neurona para ese tono. Se ve «media rueda encendida». Si hay nombres sin tono
 * (blanco, gris, negro), debajo va una banda de luz con los grises, también con la activación real.
 */
const alphaOf = (a: number): number => 0.12 + 0.88 * Math.max(0, Math.min(1, a));

/** Dibuja el anillo en un lienzo, centrado en (x, y). El tono 0° (rojo) queda arriba y la rueda gira a la derecha. */
export function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, rIn: number, rOut: number, acts: number[], alpha = 1): void {
  const n = acts.length, da = TAU / n;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i - 0.5) * da + 0.02, a1 = a0 + da - 0.04;
    ctx.fillStyle = css(RING_COLORS[i], alphaOf(acts[i]));
    ctx.beginPath(); ctx.arc(x, y, rOut, a0, a1); ctx.arc(x, y, rIn, a1, a0, true); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

const P = (r: number, a: number): string => (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);

/** El mismo anillo como SVG (para las tarjetas y el panel). `light` añade la banda de luz debajo. */
export function ringSvg(acts: number[], light?: number[], size = 44): string {
  const n = acts.length, da = TAU / n, r0 = 11, r1 = 19;
  let paths = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i - 0.5) * da + 0.02, a1 = a0 + da - 0.04;
    paths += '<path d="M' + P(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + P(r1, a1) + ' L' + P(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + P(r0, a0) + ' Z" fill="' + css(RING_COLORS[i], alphaOf(acts[i])) + '"/>';
  }
  let band = '';
  if (light) {
    const w = 35 / light.length;
    band = light.map((v, i) => '<rect x="' + (-17.5 + i * w).toFixed(2) + '" y="23" width="' + (w - 1).toFixed(2) + '" height="5" rx="1.5" fill="' + css(LIGHT_SHADES[i], alphaOf(v)) + '"/>').join('');
  }
  const h = light ? 56 : 44, y0 = -22;
  return '<svg class="ring" viewBox="-22 ' + y0 + ' 44 ' + h + '" width="' + size + '" height="' + Math.round((size * h) / 44) + '" aria-hidden="true" focusable="false">' + paths + band + '</svg>';
}
