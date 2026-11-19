import { glow, type Pt } from './core/canvas';
import { NeuronView, sourceOf, type NeuronViewOptions } from './NeuronView';
import { fanGeometry, threeInputGeometry, type NetworkLayout, type NeuronGeometry } from './geometry';
import { ObservedModel, neuronsOf, type NeuronDelta, type NeuronLike, type ObservableModel } from './observe';

/**
 * NetworkView: crea una NeuronView por cada neurona REAL del modelo (una `NeuronN` o un
 * `NetworkN`), leyendo su estructura, sus pesos y su sesgo del propio modelo.
 *
 * - Una `NeuronN` de 3 entradas usa la geometría del prototipo (rojo, verde, azul).
 * - Un `NetworkN([3, k, 1])` se reparte por columnas, con una NeuronView por neurona.
 *
 * Como cada NeuronView celebra según SU Δ, ninguna neurona aprende en silencio:
 * `train` aplica a cada una su propio cambio.
 */
export class NetworkView {
  readonly layers: NeuronView[][];
  readonly observed: ObservedModel;
  readonly size: { w: number; h: number };
  /** Puntos de entrada (solo en redes con capas). */
  private inputs: Pt[] = [];
  private view = { s: 1, ox: 0, oy: 0 };

  /**
   * `opts` puede ser una función por neurona (capa, posición, ¿es la última?). Con `layout` se usa un diseño
   * propio (por ejemplo `teamLayout`) en vez del reparto por columnas.
   */
  constructor(readonly model: ObservableModel, opts: NeuronViewOptions | ((layer: number, neuron: number, last: boolean) => NeuronViewOptions) = {}, layout?: NetworkLayout) {
    this.observed = new ObservedModel(model);
    const nl = neuronsOf(model);
    const optsOf = (l: number, n: number): NeuronViewOptions => (typeof opts === 'function' ? opts(l, n, l === nl.length - 1) : opts);
    if (layout) {
      this.size = layout.size;
      this.layers = nl.map((layer, li) => layer.map((n, ni) => this.make(li, ni, layout.neurons[li][ni], n, optsOf(li, ni))));
    } else if (!model.layers) {
      const n = nl[0][0];
      const geom: NeuronGeometry = n.weights.length === 3 ? threeInputGeometry() : NetworkView.fan(n.weights.length);
      this.size = geom.size;
      this.layers = [[this.make(0, 0, geom, n, optsOf(0, 0))]];
    } else {
      const W = 640, H = 420, nIn = nl[0][0].weights.length, cols = nl.length + 1;
      this.size = { w: W, h: H };
      const xAt = (c: number): number => 70 + (c * (W - 190)) / Math.max(1, cols - 1);
      const ys = (n: number): number[] => Array.from({ length: n }, (_, i) => (H * (i + 1)) / (n + 1));
      this.inputs = ys(nIn).map((y) => [xAt(0), y] as Pt);
      let prev: Pt[] = this.inputs;
      this.layers = nl.map((layer, li) => {
        const last = li === nl.length - 1, r = last ? 30 : 24;
        const pos = ys(layer.length).map((y) => [xAt(li + 1), y] as Pt);
        const views = layer.map((n, ni) => this.make(li, ni, fanGeometry({ x: pos[ni][0], y: pos[ni][1], r }, prev, this.size, last), n, optsOf(li, ni)));
        prev = pos;
        return views;
      });
    }
  }

  private static fan(n: number): NeuronGeometry {
    const W = 640, H = 420, src: Pt[] = Array.from({ length: n }, (_, i) => [90, (H * (i + 1)) / (n + 1)] as Pt);
    return fanGeometry({ x: 300, y: 210, r: 44 }, src, { w: W, h: H }, true);
  }

  private make(layer: number, neuron: number, geom: NeuronGeometry, n: NeuronLike, opts: NeuronViewOptions): NeuronView {
    const v = new NeuronView({ layer, neuron }, geom, opts);
    v.bind(sourceOf(n));
    return v;
  }

  /** La NeuronView única de una `NeuronN`. */
  get single(): NeuronView { return this.layers[0][0]; }

  /** Todas las NeuronView, de la primera capa a la última. */
  get neurons(): NeuronView[] { return this.layers.flat(); }

  /** Pasada hacia delante con las neuronas reales: cada una responde con su `predict`. Devuelve las salidas de la última capa. */
  respond(inputs: number[]): number[] {
    let x = inputs;
    const nl = neuronsOf(this.model);
    nl.forEach((layer, li) => {
      const out = layer.map((n) => (n as unknown as { predict(i: number[]): number }).predict(x));
      layer.forEach((_, ni) => this.layers[li][ni].respond(x, out[ni]));
      x = out;
    });
    return x;
  }

  /** Reparte a cada neurona SU cambio: pesos mostrados y celebración proporcional. Devuelve las intensidades. */
  applyDeltas(deltas: NeuronDelta[][], opts: { celebrate?: boolean } = {}): number[][] {
    return deltas.map((layer, li) => layer.map((d, ni) => this.layers[li][ni].learn(d, opts)));
  }

  /** Entrena un paso con el modelo real y reparte los cambios. */
  train(inputs: number[], target: number | number[], lr: number): NeuronDelta[][] {
    const d = this.observed.train(inputs, target, lr);
    this.applyDeltas(d);
    return d;
  }

  update(dt: number): void { for (const v of this.neurons) v.update(dt); }

  /** Ajusta el dibujo al lienzo `w`×`h` (conserva la proporción). */
  fit(w: number, h: number): void {
    const s = Math.min(w / this.size.w, h / this.size.h);
    this.view = { s, ox: (w - this.size.w * s) / 2, oy: (h - this.size.h * s) / 2 };
    for (const v of this.neurons) v.scale = s;
  }

  get transform(): { s: number; ox: number; oy: number } { return this.view; }

  /** Dibuja toda la red: entradas, hilos, cuerpos y frentes de cada neurona. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    this.fit(w, h);
    ctx.save();
    ctx.translate(this.view.ox, this.view.oy);
    ctx.scale(this.view.s, this.view.s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.inputs) glow(ctx, p[0], p[1], 9, 'rgba(242,239,230,.5)', 'rgba(242,239,230,0)');
    for (const v of this.neurons) v.drawWires(ctx);
    for (const v of this.neurons) v.drawBody(ctx, t);
    for (const v of this.neurons) v.drawFront(ctx);
    ctx.restore();
  }
}
