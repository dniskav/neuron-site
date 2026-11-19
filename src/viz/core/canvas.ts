/** Ayudas de canvas compartidas por todas las visualizaciones. TS puro, sin DOM global. */
export type Pt = [number, number];

export const TAU = 6.2832;

/** Punto de una curva de Bézier cúbica. */
export function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Punto a la fracción u (0..1) de una polilínea. */
export function ptAt(pts: Pt[], u: number): Pt {
  const n = pts.length - 1;
  const k = Math.max(0, Math.min(1, u)) * n;
  const i0 = Math.floor(k);
  const f = k - i0;
  const a = pts[i0], b = pts[Math.min(n, i0 + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Resplandor radial. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Rectángulo redondeado (con respaldo si el navegador no tiene roundRect). */
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Polilínea por tramos: con `taper` se afina hacia el origen; con `dashed` salta tramos (trazo cortado). */
export function line(ctx: CanvasRenderingContext2D, pts: Pt[], wBase: number, taper: boolean, dashed?: boolean): void {
  for (let i = 1; i < pts.length; i++) {
    if (dashed && Math.floor(i / 3) % 2 === 1) continue;
    ctx.lineWidth = wBase * (taper ? 0.35 + (0.65 * i) / pts.length : 1);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
}

export function font(n: number): string {
  return '600 ' + n + 'px "Inter Tight",system-ui,sans-serif';
}
