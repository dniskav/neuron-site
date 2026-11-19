/**
 * «Compáralos»: lo aprendido con cada conjunto (los 8 estados), calculado con las mismas
 * semillas y el mismo entrenamiento que la pantalla. Se calcula al construir el sitio.
 */
import { SIZES, runSet } from './ensenale';

export const WM = 6;
export const CHC = ['255,96,84', '96,214,112', '104,152,255', '255,224,138'];
export const CHNN = ['rojo', 'verde', 'azul', 'línea'];
const NM = ['el rojo', 'el verde', 'el azul'];

export interface CmpRow { w: number[]; b: number; pct: number }

export function computeCmp(): Record<number, CmpRow> {
  const cmp: Record<number, CmpRow> = {};
  [0, ...SIZES].forEach((k) => { const r = runSet(k); cmp[k] = { w: r.w, b: r.b, pct: r.pct }; });
  return cmp;
}

export function rowTitle(k: number, d: CmpRow): string {
  const vals = d.w.concat([d.b]);
  return (k ? k + ' ejemplos' : 'sin enseñar') + ': ' + vals.map((v, i) => CHNN[i] + ' ' + (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2)).join(' · ') + ' · ' + d.pct + ' % de aciertos';
}

/** Contenido interior de un botón `.crow`. */
export function rowInner(k: number, d: CmpRow): string {
  const vals = d.w.concat([d.b]);
  return '<span class="cl">' + (k ? k + ' ej.' : 'sin enseñar') + '</span><span class="cm" aria-hidden="true">' + vals.map((v, i) => {
    const wd = Math.min(1, Math.abs(v) / WM) * 50;
    return '<i class="' + (v < 0 ? 'n' : '') + '" style="--c:' + CHC[i] + ';top:' + (1 + i * 5) + 'px;width:' + wd + '%;left:' + (v >= 0 ? 50 : 50 - wd) + '%"></i>';
  }).join('') + '</span><span class="cp">' + d.pct + ' %</span>';
}

/** Frase basada en los números reales. */
export function comparePhrase(cmp: Record<number, CmpRow>): string {
  const topOf = (k: number): number => { const w = cmp[k].w; let t = 0; for (let i = 1; i < 3; i++) if (Math.abs(w[i]) > Math.abs(w[t])) t = i; return t; };
  const tf = topOf(5), tm = topOf(34);
  let txt = 'Sin enseñar, sus números son azar. ';
  txt += tf !== tm ? 'Con 5 ejemplos lo que más pesa es ' + NM[tf] + '; con 34, ' + NM[tm] + '.' : 'Con pocos y con muchos ejemplos lo que más pesa es ' + NM[tm] + ', pero con muchos ejemplos pesa mucho más.';
  return txt;
}
