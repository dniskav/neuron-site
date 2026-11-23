import { glow, type Pt } from './core/canvas';
import { NeuronView, sourceOf, type NeuronViewOptions } from './NeuronView';
import { columnsLayout, fanGeometry, threeInputGeometry, type Dendrite, type NetworkLayout, type NeuronGeometry } from './geometry';
import { lodOf, type Lod } from './lod';
import { ObservedModel, neuronsOf, type NeuronDelta, type NeuronLike, type ObservableModel } from './observe';

/**
 * NetworkView: crea una NeuronView por cada neurona REAL del modelo (una `NeuronN` o un
 * `NetworkN`), leyendo su estructura, sus pesos y su sesgo del propio modelo.
 *
 * - Una `NeuronN` de 3 entradas usa la geometría del prototipo (rojo, verde, azul).
 * - Un `NetworkN` cualquiera se reparte por columnas, o con un diseño propio (`layerLayout`, `teamLayout`), con una NeuronView por neurona.
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
  constructor(readonly model: ObservableModel, opts: NeuronViewOptions | ((layer: number, neuron: number, last: boolean) => NeuronViewOptions) = {}, layout?: NetworkLayout, from?: NetworkView) {
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
      const cl = columnsLayout([nl[0][0].weights.length, ...nl.map((l) => l.length)]);
      this.size = cl.layout.size;
      this.inputs = cl.inputs;
      this.layers = nl.map((layer, li) => layer.map((n, ni) => this.make(li, ni, cl.layout.neurons[li][ni], n, optsOf(li, ni))));
    }
    this.lods = this.layers.map(() => undefined);
    /* la transición de nivel de detalle continúa desde la red a la que sustituye (si la hay) */
    if (from) this.layers.forEach((layer, li) => {
      const old = from.layers[Math.min(li, from.layers.length - 1)];
      const d = old && old.length ? old[0].detail : undefined, l0 = old && old.length ? old[0].lod : undefined;
      if (d !== undefined && l0) { this.lods[li] = l0; layer.forEach((v) => v.adoptDetail(d)); }
    });
  }

  private lods: (Lod | undefined)[];

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

  /** Espacio vertical lógico que le toca a cada neurona de la capa `li` (la menor distancia entre vecinas; sola: todo el alto). */
  layerPitch(li: number): number {
    const ys = this.layers[li].map((v) => v.geom.body.y).sort((p, q) => p - q);
    if (ys.length < 2) return this.size.h;
    let m = Infinity;
    for (let i = 1; i < ys.length; i++) m = Math.min(m, ys[i] - ys[i - 1]);
    return m;
  }

  /** Nivel de detalle de la capa `li` (según el espacio en píxeles de la última vez que se ajustó). */
  lodOfLayer(li: number): Lod { return this.lods[li] ?? 'full'; }

  /** Ajusta el dibujo al lienzo `w`×`h` (conserva la proporción) y elige el nivel de detalle de cada capa. */
  fit(w: number, h: number): void {
    const s = Math.min(w / this.size.w, h / this.size.h);
    this.view = { s, ox: (w - this.size.w * s) / 2, oy: (h - this.size.h * s) / 2 };
    this.layers.forEach((layer, li) => {
      const l = lodOf(this.layerPitch(li) * s, this.lods[li]);
      this.lods[li] = l;
      for (const v of layer) { v.scale = s; v.setLod(l); }
    });
  }

  get transform(): { s: number; ox: number; oy: number } { return this.view; }

  /**
   * El tronco de la neurona `neuron` de la capa `layer`: su ÚNICO axón y las ramas que salen de él, una por cada neurona
   * de la capa siguiente (son las dendritas de quien escucha: su grosor es el peso de quien escucha). Sin capa siguiente: sin ramas.
   */
  trunk(layer: number, neuron: number): { axon: [number, number][]; branches: Dendrite[] } {
    const next = this.layers[layer + 1] ?? [];
    return { axon: this.layers[layer][neuron].geom.axon, branches: next.map((v) => v.geom.dendrites[neuron]) };
  }

  /** La neurona más cercana al punto (x, y) del lienzo, a no más de `maxPx` píxeles. */
  pick(x: number, y: number, maxPx = 14): { layer: number; neuron: number; view: NeuronView } | null {
    const { s, ox, oy } = this.view, lx = (x - ox) / s, ly = (y - oy) / s;
    let best: { layer: number; neuron: number; view: NeuronView } | null = null, bd = Infinity;
    this.layers.forEach((layer, li) => layer.forEach((v, ni) => {
      const d = Math.hypot(v.geom.body.x - lx, v.geom.body.y - ly) * s - v.bodyR() * s;
      if (d < bd) { bd = d; best = { layer: li, neuron: ni, view: v }; }
    }));
    return bd <= maxPx ? best : null;
  }

  /** Dibuja todas las conexiones. Devuelve cuántas dibujó (siempre 3·N en la capa de nombres, en cualquier nivel de detalle). */
  drawConnections(ctx: CanvasRenderingContext2D): number {
    let n = 0;
    for (const v of this.neurons) n += v.drawWires(ctx);
    return n;
  }

  /** Dibuja toda la red: entradas, hilos, cuerpos y frentes de cada neurona. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    this.fit(w, h);
    ctx.save();
    ctx.translate(this.view.ox, this.view.oy);
    ctx.scale(this.view.s, this.view.s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.inputs) glow(ctx, p[0], p[1], 9, 'rgba(242,239,230,.5)', 'rgba(242,239,230,0)');
    this.drawConnections(ctx);
    for (const v of this.neurons) v.drawBody(ctx, t);
    for (const v of this.neurons) v.drawFront(ctx);
    ctx.restore();
  }
}
