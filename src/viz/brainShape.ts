/**
 * La silueta del cerebro (vista lateral, mirando a la izquierda: el lóbulo frontal a la izquierda, el occipital a la
 * derecha), en una caja de 200 × 150 unidades propias. Solo geometría: sin estado y sin DOM. Los dibuja `BrainMeter`.
 *
 * Partes: el cerebro (frontal, parietal, occipital y el lóbulo temporal que cuelga debajo, con su polo hacia delante),
 * el cerebelo (con sus pliegues) y el tronco. El cerebro y el cerebelo son lo que se llena; el tronco es solo contorno.
 */

/** Caja del dibujo. */
export const BW = 200, BH = 150;
/** Extremos del cerebro en horizontal (de polo a polo) y el techo y el suelo del llenado (corona y base del cerebelo). */
export const X0 = 18, X1 = 188, YTOP = 8, YBOT = 126;

/** Traza (sin pintar) el cerebro y el cerebelo como una sola figura: sirve para rellenar, recortar y dibujar el contorno. */
export function brainPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  // cerebro: frontal, corona, parietal y occipital; bajo el occipital, hacia el cerebelo; el temporal y su polo; la muesca bajo el frontal
  ctx.moveTo(20, 68);
  ctx.bezierCurveTo(14, 46, 34, 22, 62, 15);
  ctx.bezierCurveTo(86, 8, 118, 5, 144, 13);
  ctx.bezierCurveTo(168, 20, 188, 40, 188, 66);
  ctx.bezierCurveTo(188, 82, 178, 94, 162, 98);
  ctx.bezierCurveTo(148, 101, 134, 100, 122, 98);
  ctx.bezierCurveTo(114, 104, 102, 109, 88, 109);
  ctx.bezierCurveTo(70, 111, 54, 105, 46, 95);
  ctx.bezierCurveTo(40, 88, 36, 81, 29, 81);
  ctx.bezierCurveTo(22, 81, 20, 76, 20, 68);
  ctx.closePath();
  // cerebelo, bajo el occipital
  ctx.moveTo(122, 99);
  ctx.bezierCurveTo(124, 117, 146, 128, 167, 121);
  ctx.bezierCurveTo(179, 116, 178, 104, 164, 100);
  ctx.bezierCurveTo(150, 103, 134, 104, 122, 99);
  ctx.closePath();
}

/** Traza el tronco del encéfalo (solo contorno, detrás del cerebro). */
export function stemPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(104, 105);
  ctx.bezierCurveTo(105, 120, 108, 133, 114, 146);
  ctx.lineTo(126, 143);
  ctx.bezierCurveTo(121, 132, 119, 120, 118, 104);
}

/** Surcos y circunvoluciones: líneas finas dentro del cerebro (cada una es una curva cúbica: p0, c1, c2, p1). `dots` solo los principales. */
export const SULCI: { main: boolean; p: [number, number, number, number, number, number, number, number] }[] = [
  { main: true, p: [47, 94, 72, 83, 98, 82, 124, 70] },     // la cisura lateral, que separa el temporal
  { main: false, p: [30, 56, 40, 44, 52, 47, 61, 36] },
  { main: false, p: [38, 72, 52, 62, 66, 67, 78, 54] },
  { main: false, p: [124, 26, 136, 38, 128, 50, 141, 59] },
  { main: false, p: [151, 36, 162, 48, 156, 60, 171, 67] },
  { main: false, p: [58, 101, 72, 94, 84, 99, 98, 93] },
  { main: false, p: [110, 91, 124, 87, 132, 93, 143, 89] },
  { main: false, p: [132, 108, 144, 112, 156, 110, 168, 112] },  // pliegue del cerebelo
  { main: false, p: [136, 114, 148, 119, 158, 118, 168, 118] },
];

/** Traza los surcos (sin pintar). */
export function sulciPath(ctx: CanvasRenderingContext2D, onlyMain = false): void {
  ctx.beginPath();
  for (const s of SULCI) {
    if (onlyMain && !s.main) continue;
    const p = s.p;
    ctx.moveTo(p[0], p[1]);
    ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
  }
}

/**
 * La frontera `i` (1..n−1) entre dos neuronas, a la altura `y`: una línea que baja inclinada y ondulada, como un surco
 * (el central corre inclinado hacia delante), no una raya recta. Los bordes de fuera (`i` = 0 y `i` = n) son rectos y quedan
 * fuera del cerebro.
 */
export function cutX(i: number, n: number, y: number): number {
  const x = X0 + ((X1 - X0) * i) / n;
  if (i <= 0) return -40;
  if (i >= n) return BW + 40;
  const amp = Math.min(3.4, 0.35 * ((X1 - X0) / n) + 0.8);
  return x - 0.2 * (y - 68) + Math.sin(y * 0.085 + i * 1.7) * amp;
}

/** Traza (sin pintar) la sección `i` de `n`: lo que queda entre su frontera izquierda y la derecha. */
export function sectionPath(ctx: CanvasRenderingContext2D, i: number, n: number): void {
  ctx.beginPath();
  const y0 = -6, y1 = BH + 6, st = 6;
  for (let y = y0; y <= y1; y += st) { const x = cutX(i, n, y); if (y === y0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  for (let y = y1; y >= y0; y -= st) ctx.lineTo(cutX(i + 1, n, y), y);
  ctx.closePath();
}

/** Traza (sin pintar) la frontera `i` entre dos secciones. */
export function cutPath(ctx: CanvasRenderingContext2D, i: number, n: number): void {
  ctx.beginPath();
  for (let y = -6; y <= BH + 6; y += 6) { const x = cutX(i, n, y); if (y === -6) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
}
