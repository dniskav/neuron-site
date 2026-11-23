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
  /** Último estado conocido: la referencia con la que se compara el siguiente paso (para los Δ de cada pulso). */
  last: NeuronSnap[][];
  /**
   * Lo que ha cambiado cada neurona desde que se creó este modelo observado (red nueva = cuenta a cero): la suma de
   * los Σ|Δw| + |Δb| de CADA paso de aprendizaje, por capa. Se cuenta paso a paso, venga el `train` de donde venga (de
   * esta clase o directo del modelo, p. ej. en un repaso), porque `train` del modelo se envuelve (solo este objeto, la
   * librería no se toca): el camino recorrido, no solo la distancia entre dos fotos.
   */
  readonly travel: number[][];
  /**
   * Cuántas veces ha aprendido este modelo desde que se creó (red nueva = 0): una por cada `train` real, venga de donde
   * venga. Cada una ajusta TODOS sus pesos y sesgos un poco, así que sigue subiendo aunque la red ya acierte todo.
   */
  steps = 0;
  private step: NeuronSnap[][];
  constructor(public readonly model: ObservableModel) {
    this.last = snapshot(model);
    this.step = this.last;
    this.travel = this.last.map((layer) => layer.map(() => 0));
    const train = model.train.bind(model);
    model.train = (inputs: number[], target: unknown, lr: number): unknown => {
      const out = train(inputs, target, lr);
      const now = snapshot(model);
      diff(this.step, now).forEach((layer, li) => layer.forEach((n, ni) => { this.travel[li][ni] += n.mag; }));
      this.step = now;
      this.steps++;
      return out;
    };
  }
  /** Compara con la última foto y la deja como referencia (el cambio de cada neurona desde entonces). */
  private advance(): NeuronDelta[][] {
    const now = snapshot(this.model);
    const d = diff(this.last, now);
    this.last = now;
    return d;
  }
  /** Entrena un paso con el modelo real y devuelve la variación de cada neurona. */
  train(inputs: number[], target: number | number[], lr: number): NeuronDelta[][] {
    this.model.train(inputs, target, lr);
    return this.advance();
  }
  /** Vuelve a tomar la foto (por si los pesos se cambiaron por fuera). */
  resync(): void {
    this.advance();
  }
  /** Δ acumulado respecto a la última foto, sin entrenar (para un bucle de repaso hecho por fuera). */
  poll(): NeuronDelta[][] {
    return this.advance();
  }
  /** `travel` aplanado, capa por capa (el mismo orden que las secciones del cerebro). */
  travelFlat(): number[] {
    return this.travel.flat();
  }
}
