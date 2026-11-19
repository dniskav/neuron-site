/** Colores: conversiones y mezclas. Los canales de `css` van de 0 a 1; los de `rgb` y `lc`, de 0 a 255. */
export type Rgb = [number, number, number] | number[];

export function css(c: Rgb, a?: number): string {
  return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : a) + ')';
}

export function rgb(c: Rgb, a: number): string {
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

/** Canal 0..255 con alfa. */
export function chan(c: Rgb, a: number): string {
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

export function lc(a: Rgb, b: Rgb, f: number): number[] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Redondea cada canal a 2 decimales: lo que se ve en el código es lo que entrena. */
export function q2(c: number[]): number[] {
  return [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100, Math.round(c[2] * 100) / 100];
}

export function hexRgb(h: string): number[] {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}

export function hsl(h: number, sa: number, l: number): string {
  sa /= 100;
  l /= 100;
  const a = sa * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return ('0' + Math.round(c * 255).toString(16)).slice(-2);
  };
  return '#' + f(0) + f(8) + f(4);
}

export function mix(a: number, b: number, f: number): number {
  return Math.round(a + (b - a) * f);
}
