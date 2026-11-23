/**
 * Curva de aprendizaje (pieza reutilizable): dibuja, para TODOS los intentos desde que se creó la red, la línea suave (media móvil),
 * lo suelto de cada intento muy tenue detrás (puntos; los intentos viejos plegados en cubos, como una franja de su mínimo a su
 * máximo), las líneas de referencia y, si la red ya no mejora, la franja de «meseta». Los datos y la regla de la meseta viven en
 * `viz/learningCurve.ts` (TS puro); aquí solo se dibuja. Con «menos movimiento» no cambia nada: ya es un dibujo quieto.
 */
import { createLoop, type Loop } from '../../viz/core/loop';
import { font, rrect } from '../../viz/core/canvas';
import { curvePoints, type CurveHistory, type Plateau } from '../../viz/learningCurve';

export interface CurveRef { value: number; text: string; rgb: string; /** el rótulo va bajo su línea (para no pisar otro) */ below?: boolean }
export interface CurveView {
  history: () => CurveHistory;
  /** La meseta de ahora (null: no se sabe o no hay). `flat` false = sigue mejorando. */
  plateau: () => Plateau | null;
  refs?: () => CurveRef[];
  /** Tamaño de la media móvil de la línea. */
  window: number;
  /** Fija el eje vertical (0..yMax); si no, sale de los datos y las referencias. */
  yMax?: () => number;
  /** Eje x: mínimo de intentos que se muestra (para que el eje no sea ridículo con 3 intentos). */
  minX?: number;
  /** Color de la línea («r,g,b»). */
  rgb?: string;
  /** Qué hay cuando todavía no hay nada. */
  empty: string;
  flatLabel?: string;
  /** Rótulo pequeño arriba a la izquierda que dice qué vale lo más alto del eje (p. ej. «100 %», «error 0,25»). Sin él, el eje no lleva número (las referencias dan la escala). */
  yLabel?: () => string;
  /** De qué lado va `yLabel` (por defecto, la derecha: donde suele estar la línea más baja que al principio). */
  yLabelAt?: 'left' | 'right';
  aria?: () => string;
}
/** La frase de la meseta, igual en todas las pantallas (cada una añade, si es verdad, un consejo). */
export const FLAT_MESSAGE = 'Ya casi no mejora: ha llegado a lo máximo que puede con lo que ve.';
const BLUE = '106,167,255', GOLD = '255,224,138', BAND = '236,232,220';
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Paso de las marcas del eje x: el menor «redondo» que deja ≥ `gap` px entre dos. Exportado para probarlo. */
export function axisStep(xMax: number, w: number, gap = 38): number {
  return STEPS.find((s) => (s / xMax) * w >= gap) ?? STEPS[STEPS.length - 1];
}

export function drawLearningCurve(ctx: CanvasRenderingContext2D, w: number, h: number, v: CurveView): void {
  const hist = v.history(), pl = v.plateau(), refs = v.refs ? v.refs() : [], rgb = v.rgb ?? BLUE;
  const top = 3, base = h - 11, xMax = Math.max(hist.total, v.minX ?? 20);
  const pts = curvePoints(hist, v.window);
  const hi = Math.max(0, ...refs.map((r) => r.value), ...pts.raw.map((p) => p.y), ...pts.buckets.map((b) => b.max));
  const yMax = v.yMax ? v.yMax() : Math.max(1, Math.ceil(hi) + 1);
  const X = (n: number): number => 1 + (n / xMax) * (w - 2), Y = (y: number): number => base - (Math.max(0, Math.min(yMax, y)) / yMax) * (base - top);
  ctx.fillStyle = 'rgba(255,255,255,.04)'; rrect(ctx, 0, top - 2, w, base - top + 4, 5); ctx.fill();
  /* ejes: marcas del eje x (intentos jugados) */
  ctx.font = font(8.5); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(141,137,125,.9)'; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  const step = axisStep(xMax, w);
  for (let n = 0; n <= xMax; n += step) {
    const x = X(n);
    if (n > 0) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, base); ctx.stroke(); }
    ctx.textAlign = n === 0 ? 'left' : x > w - 14 ? 'right' : 'center'; ctx.fillText(String(n), Math.max(1, Math.min(w - 1, x)), h - 1);
  }
  /* la meseta: franja desde donde la media ya no cambia */
  if (pl && pl.flat) {
    const x0 = X(Math.max(0, pl.from - 1));
    ctx.fillStyle = 'rgba(' + BAND + ',.09)'; ctx.fillRect(x0, top - 1, w - x0, base - top + 2);
    ctx.strokeStyle = 'rgba(' + BAND + ',.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x0, top - 1); ctx.lineTo(x0, base + 1); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = font(9); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(' + BAND + ',.95)'; ctx.fillText(v.flatLabel ?? 'meseta', x0 + 3, top);
  }
  if (v.yLabel) { const left = v.yLabelAt === 'left'; ctx.font = font(8.5); ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(141,137,125,.95)'; ctx.fillText(v.yLabel(), left ? 3 : w - 4, top); }
  /* lo plegado: de su mínimo a su máximo; lo suelto: un punto por intento, muy tenue */
  ctx.fillStyle = 'rgba(' + rgb + ',.13)';
  for (const b of pts.buckets) { const y1 = Y(b.max), y2 = Y(b.min); ctx.fillRect(X(b.x0), y1, Math.max(1, X(b.x1) - X(b.x0)), Math.max(1, y2 - y1)); }
  ctx.fillStyle = 'rgba(' + rgb + ',.34)';
  for (const p of pts.raw) ctx.fillRect(X(p.x) - 0.7, Y(p.y) - 0.7, 1.4, 1.4);
  /* referencias */
  ctx.textAlign = 'right';
  for (const r of refs) {
    const ry = Y(r.value), below = !!r.below;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(' + r.rgb + ',.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = font(9.5); ctx.textBaseline = below ? 'top' : 'bottom';
    const lw = ctx.measureText(r.text).width, ly = below ? ry + 1 : ry - 13;
    ctx.fillStyle = 'rgba(12,12,14,.8)'; ctx.fillRect(w - lw - 7, ly, lw + 6, 12);
    ctx.fillStyle = 'rgba(' + r.rgb + ',.95)'; ctx.fillText(r.text, w - 3, below ? ry + 2 : ry - 2);
  }
  /* la línea suave: media móvil */
  if (pts.line.length) {
    ctx.strokeStyle = 'rgba(' + rgb + ',.95)'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    pts.line.forEach((p, i) => { const x = X(p.x), y = Y(p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    const e = pts.line[pts.line.length - 1];
    ctx.fillStyle = 'rgba(' + GOLD + ',1)'; ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), 2.6, 0, 6.2832); ctx.fill();
  } else {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(9.5); ctx.fillStyle = 'rgba(141,137,125,.85)'; ctx.fillText(v.empty, w / 2, (top + base) / 2);
  }
  ctx.textAlign = 'left';
}

/** Pone la curva en un lienzo, con su bucle (se pausa fuera de pantalla). Devuelve el bucle: `redraw()` cuando cambien los datos. */
export function mountLearningCurve(canvas: HTMLCanvasElement, v: CurveView): Loop {
  let last = '';
  return createLoop(canvas, {
    draw(ctx, w, h) {
      drawLearningCurve(ctx, w, h, v);
      if (v.aria) { const a = v.aria(); if (a !== last) { last = a; canvas.setAttribute('aria-label', a); } }
    },
  });
}
