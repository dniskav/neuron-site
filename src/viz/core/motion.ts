/** ¿El usuario pidió menos movimiento? (falso fuera del navegador). */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
