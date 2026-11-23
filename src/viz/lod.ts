/**
 * Nivel de detalle (LOD) de una capa de neuronas, según el espacio vertical que le toca a cada una EN PÍXELES.
 * Los umbrales viven aquí y en ningún otro sitio.
 *
 *  - completo: cuerpo, ramas y bulbo (la neurona de Equipo);
 *  - compacto: cuerpo pequeño sin detalles, ramas finas, etiqueta corta;
 *  - puntos: un punto que brilla; las conexiones siguen todas, más finas; etiquetas al pasar o tocar.
 *
 * Las CONEXIONES se dibujan siempre, en los tres niveles: lo que cambia es su grosor, no que existan.
 */
export type Lod = 'full' | 'compact' | 'dots';

export const LOD = {
  /** Por debajo de este espacio por neurona (px) deja de ser «completo». */
  fullMin: 32,
  /** Por debajo de este espacio por neurona (px) pasa a puntos. */
  compactMin: 14,
  /** Histéresis (px): evita que parpadee al redimensionar. */
  hysteresis: 2,
} as const;

/** Valor numérico de cada nivel (para la transición suave): 0 puntos, 1 compacto, 2 completo. */
export const LOD_DETAIL: Record<Lod, number> = { dots: 0, compact: 1, full: 2 };

/** Nivel para `px` píxeles de espacio vertical por neurona; con `prev` se aplica la histéresis. */
export function lodOf(px: number, prev?: Lod): Lod {
  const h = LOD.hysteresis;
  const fullMin = prev === 'full' ? LOD.fullMin - h : prev ? LOD.fullMin + h : LOD.fullMin;
  const compactMin = prev === 'dots' ? LOD.compactMin + h : prev ? LOD.compactMin - h : LOD.compactMin;
  return px >= fullMin ? 'full' : px >= compactMin ? 'compact' : 'dots';
}
