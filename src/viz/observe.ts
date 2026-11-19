/**
 * observe: cuánto cambió de verdad cada neurona tras un `train`.
 * Envuelve el modelo real de @dniskav/neuron sin tocar la librería: toma una foto de
 * los pesos y el sesgo antes, entrena, toma otra y calcula Δw y Δb por neurona.
 */

/** Lo mínimo que necesitamos de una neurona real (`NeuronN` o una de las `Layer` de un `NetworkN`). */
export interface NeuronLike {
  weights: number[];
  bias: number;
}

/** Un modelo real: una `NeuronN` suelta o un `NetworkN` (capas de neuronas). */
export interface ObservableModel {
  weights?: number[];
  bias?: number;
  layers?: { neurons: NeuronLike[] }[];
  train(inputs: number[], target: any, lr: number): unknown;
}

/** Foto de una neurona. */
export interface NeuronSnap {
  w: number[];
  b: number;
}

/** Lo que cambió en una neurona: valores nuevos y variación absoluta. */
export interface NeuronDelta {
  /** Pesos después del paso. */
  w: number[];
  /** Sesgo después del paso. */
  b: number;
  /** |Δw_i| de cada dendrita. */
  dw: number[];
  /** |Δb|. */
  db: number;
  /** Total: Σ|Δw_i| + |Δb|. */
  mag: number;
}

/** Las neuronas del modelo, por capas: una `NeuronN` es [[ella]]; un `NetworkN`, sus capas. */
export function neuronsOf(model: ObservableModel): NeuronLike[][] {
  if (model.layers) return model.layers.map((l) => l.neurons);
  return [[model as unknown as NeuronLike]];
}

export function snapshot(model: ObservableModel): NeuronSnap[][] {
  return neuronsOf(model).map((layer) => layer.map((n) => ({ w: n.weights.slice(), b: n.bias })));
}

export function deltaOf(prev: NeuronSnap, next: NeuronSnap): NeuronDelta {
  const dw = next.w.map((v, i) => Math.abs(v - prev.w[i]));
  const db = Math.abs(next.b - prev.b);
  return { w: next.w.slice(), b: next.b, dw, db, mag: dw.reduce((s, v) => s + v, db) };
}

export function diff(prev: NeuronSnap[][], next: NeuronSnap[][]): NeuronDelta[][] {
  return next.map((layer, li) => layer.map((n, ni) => deltaOf(prev[li][ni], n)));
}

/** Modelo observado: `train` devuelve, además, el Δ de cada neurona (por capa). */
export class ObservedModel {
  /** Último estado conocido: la referencia con la que se compara el siguiente paso. */
  last: NeuronSnap[][];
  constructor(public readonly model: ObservableModel) {
    this.last = snapshot(model);
  }
  /** Entrena un paso con el modelo real y devuelve la variación de cada neurona. */
  train(inputs: number[], target: number | number[], lr: number): NeuronDelta[][] {
    this.model.train(inputs, target, lr);
    const now = snapshot(this.model);
    const d = diff(this.last, now);
    this.last = now;
    return d;
  }
  /** Vuelve a tomar la foto (por si los pesos se cambiaron por fuera). */
  resync(): void {
    this.last = snapshot(this.model);
  }
  /** Δ acumulado respecto a la última foto, sin entrenar (para un bucle de repaso hecho por fuera). */
  poll(): NeuronDelta[][] {
    const now = snapshot(this.model);
    const d = diff(this.last, now);
    this.last = now;
    return d;
  }
}
