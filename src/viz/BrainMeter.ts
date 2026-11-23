import { glow } from './core/canvas';
import { mix } from './core/colors';
import { BH, BW, X0, X1, YBOT, YTOP, brainPath, cutPath, sectionPath, stemPath, sulciPath } from './brainShape';
import { lodOf, type Lod } from './lod';
import { neuronsOf, type NeuronDelta, type ObservableModel, type ObservedModel } from './observe';

/**
 * El cerebro: un cerebro de lado (`brainShape.ts`) dividido en tantas secciones como NEURONAS tiene el modelo real en
 * ese momento (se cuentan en la estructura del modelo, no se eligen).
 *
 * Lo que se dibuja es lo que pasa:
 *  - LLENADO: cada sección es UNA neurona y se llena con lo que ESA neurona ha aprendido de verdad: su cambio acumulado de
 *    pesos y sesgo, Σ|Δw| + |Δb| desde que se creó la red (`ObservedModel.travel`, de `observe.ts`), con una curva que se
 *    satura: `1 − exp(−cambio / escala)`. La escala es de cada modelo (ver `BRAIN_SCALE` en `src/data/*`): un modelo bien
 *    entrenado queda casi lleno y uno sin entrenar, vacío. Una red nueva empieza vacía.
 *  - DESTELLO: cuando una neurona cambia sus pesos al aprender, SU sección destella en proporción a su |Δw|+|Δb| real.
 *  - EL NÚMERO del centro es el % de aciertos de la red ENTERA (no existe un «% por neurona»): lo pone la pantalla y NO
 *    llena el cerebro. Un cerebro lleno con un % bajo es correcto: la neurona ha cambiado mucho y aun así no puede con la tarea.
 *
 * Con muchas secciones aplica el nivel de detalle de todo el sitio (`lod.ts`): las divisiones se afinan pero están todas.
 */

/** Cuánto cambió la neurona como fracción de `ref` (lo máximo que un peso podía moverse): de 0 a 1. Misma medida que `NeuronView.changeOf`. */
export function changeFrac(delta: NeuronDelta, ref: number): number {
  let tot = 0;
  for (const d of delta.dw) tot += Math.min(1, d / ref);
  tot += Math.min(1, delta.db / ref);
  return tot / (delta.dw.length + 1);
}

/** Cuánto se llena una sección con `travel` = Σ|Δw| + |Δb| acumulado de su neurona; `scale` es el cambio con el que se llena al 63 %. */
export function fillOf(travel: number, scale: number): number {
  return 1 - Math.exp(-Math.max(0, travel) / scale);
}

/** Cuántas neuronas tiene el modelo real (todas las capas): una `NeuronN` es 1; `NetworkN([3, 8, 1])` son 9. */
export function neuronCount(model: ObservableModel): number {
  return neuronsOf(model).reduce((s, layer) => s + layer.length, 0);
}

/** Índice (entre todas las neuronas, capa por capa) de la neurona `neuron` de la capa `layer`. */
export function lobeIndex(model: ObservableModel, layer: number, neuron: number): number {
  const layers = neuronsOf(model);
  let i = 0;
  for (let l = 0; l < layer; l++) i += layers[l].length;
  return i + neuron;
}

export class BrainMeter {
  /** Número de secciones = neuronas del modelo. */
  lobes: number;
  /** Destello actual de cada sección (0..1). */
  flash: number[];
  /** Cuánto lleva mostrado cada sección (0..1, con inercia). */
  fill: number[];
  /** A cuánto va cada sección (0..1): sale del cambio real acumulado de su neurona. */
  goal: number[];
  lod: Lod = 'full';
  private src: ObservedModel | null = null;
  private scale = 1;

  constructor(lobes = 1) {
    this.lobes = Math.max(1, Math.floor(lobes));
    this.flash = new Array(this.lobes).fill(0);
    this.fill = new Array(this.lobes).fill(0);
    this.goal = new Array(this.lobes).fill(0);
  }

  /** Vacía el cerebro: sin llenado ni destellos (una red nueva). */
  reset(): void {
    this.flash = new Array(this.lobes).fill(0);
    this.fill = new Array(this.lobes).fill(0);
    this.goal = new Array(this.lobes).fill(0);
  }
  /** Cambia el número de secciones (otro modelo): el cerebro se vacía. */
  setLobes(n: number): void {
    this.lobes = Math.max(1, Math.floor(n));
    this.reset();
  }
  /** Índice de la sección de la neurona `neuron` de la capa `layer` del modelo. */
  lobeOf(model: ObservableModel, layer: number, neuron: number): number { return lobeIndex(model, layer, neuron); }
  /** Red nueva: toma las secciones de la estructura REAL del modelo y vacía el cerebro (también si son las mismas). */
  setModel(model: ObservableModel): void { this.src = null; this.setLobes(neuronCount(model)); }
  /** Que el llenado lea lo que cambia cada neurona del modelo observado (de la red nueva); `scale`: ver `fillOf`. */
  track(obs: ObservedModel, scale: number): void { this.src = obs; this.scale = scale; }
  /** Pone a mano el cambio acumulado de cada sección (en el orden de las neuronas) y la escala. Sin `track`. */
  setTravel(travel: number[], scale: number): void {
    this.scale = scale;
    this.goal = this.goal.map((_, i) => fillOf(travel[i] ?? 0, scale));
  }

  /** Acerca el llenado de cada sección a lo que ha cambiado de verdad su neurona (sin inercia con «menos movimiento»). */
  ease(dt: number, reduced: boolean): void {
    if (this.src) this.setTravel(this.src.travelFlat(), this.scale);
    const k = reduced ? 1 : Math.min(1, dt * 2.6);
    for (let i = 0; i < this.lobes; i++) this.fill[i] += (this.goal[i] - this.fill[i]) * k;
  }
  /** Cuánto lleva el cerebro en total (la media de sus secciones, de 0 a 1). */
  level(): number { return this.fill.reduce((s, v) => s + v, 0) / this.lobes; }

  /** La neurona `lobe` (índice entre todas, capa por capa) cambió sus pesos con intensidad `strength` (0..1, proporcional a su Δ). */
  learned(lobe: number, strength: number): void {
    if (lobe < 0 || lobe >= this.lobes) return;
    this.flash[lobe] = Math.max(this.flash[lobe], Math.max(0, Math.min(1, strength)));
  }

  /** Bordes nominales de las secciones (lobes + 1 valores, unidades del dibujo): todas del mismo ancho. */
  bounds(): number[] {
    const out: number[] = [];
    for (let i = 0; i <= this.lobes; i++) out.push(X0 + ((X1 - X0) * i) / this.lobes);
    return out;
  }
  /** Altura de la superficie del líquido de una sección con llenado `f`. */
  static surfaceY(f: number): number { return YBOT - (YBOT - YTOP) * f; }

  /** Avanza los destellos (se apagan solos). */
  tick(dt: number, reduced: boolean): void {
    for (let i = 0; i < this.flash.length; i++) this.flash[i] = reduced ? 0 : Math.max(0, this.flash[i] - dt * 1.4);
  }

  /** Líquido de una sección: sube hasta su nivel, con una superficie que ondula. Recortado a la sección y al cerebro por quien llama. */
  private liquid(ctx: CanvasRenderingContext2D, q: number, t: number): void {
    const top = BrainMeter.surfaceY(q), a = 2.2 + (1 - Math.abs(q - 0.5)) * 1.6;
    const wave = (x: number): number => top + Math.sin(x * 0.07 + t * 2.2) * a + Math.sin(x * 0.13 - t * 1.4) * a * 0.5;
    ctx.beginPath(); ctx.moveTo(0, BH);
    for (let x = 0; x <= BW; x += 5) ctx.lineTo(x, wave(x));
    ctx.lineTo(BW, BH); ctx.closePath();
    const g = ctx.createLinearGradient(0, top - 6, 0, YBOT);
    g.addColorStop(0, 'rgba(' + mix(130, 190, q) + ',' + mix(125, 225, q) + ',' + mix(105, 255, q) + ',' + (0.62 + q * 0.33).toFixed(2) + ')');
    g.addColorStop(0.55, 'rgba(' + mix(95, 255, q) + ',' + mix(88, 214, q) + ',' + mix(70, 100, q) + ',' + (0.72 + q * 0.26).toFixed(2) + ')');
    g.addColorStop(1, 'rgba(' + mix(52, 201, q) + ',' + mix(48, 162, q) + ',' + mix(40, 39, q) + ',.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + q * 0.45).toFixed(2) + ')'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let x = 0; x <= BW; x += 5) { if (x) ctx.lineTo(x, wave(x)); else ctx.moveTo(x, wave(x)); }
    ctx.stroke();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, labelShown: string, labelSize = 30): void {
    const s = Math.min(w / BW, h / BH), ox = (w - BW * s) / 2, oy = (h - BH * s) / 2, n = this.lobes, q = this.level();
    this.lod = lodOf(((X1 - X0) * s) / n, this.lod);
    const dv = this.lod === 'full' ? [0.5, 1.4] : this.lod === 'compact' ? [0.4, 1.1] : [0.3, 0.9];
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    glow(ctx, 100, 66, 120, 'rgba(255,210,100,' + (0.04 + q * 0.3).toFixed(3) + ')', 'rgba(255,210,100,0)');
    if (q > 0.6) glow(ctx, 100, 60, 100, 'rgba(120,175,255,' + ((q - 0.6) * 0.35).toFixed(3) + ')', 'rgba(106,167,255,0)');
    // tronco (solo el contorno, detrás)
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    stemPath(ctx); ctx.stroke();
    brainPath(ctx);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
    ctx.save(); brainPath(ctx); ctx.clip();
    // el llenado de cada sección: su propio nivel (lo que ha aprendido SU neurona)
    for (let i = 0; i < n; i++) {
      if (this.fill[i] <= 0.004) continue;
      ctx.save(); sectionPath(ctx, i, n); ctx.clip();
      this.liquid(ctx, this.fill[i], t);
      ctx.restore();
    }
    // el destello de cada sección: solo la de la neurona que cambió sus pesos, tan fuerte como su cambio
    for (let i = 0; i < n; i++) {
      const f = this.flash[i];
      if (f <= 0.01) continue;
      ctx.fillStyle = 'rgba(255,236,160,' + (0.5 * f).toFixed(3) + ')';
      sectionPath(ctx, i, n); ctx.fill();
    }
    // los surcos: finos, para que se reconozca un cerebro
    ctx.strokeStyle = 'rgba(255,255,255,' + (this.lod === 'dots' ? 0.1 : 0.16) + ')'; ctx.lineWidth = this.lod === 'dots' ? 1 : 1.2;
    sulciPath(ctx, this.lod === 'dots'); ctx.stroke();
    // las divisiones: una por cada frontera entre neuronas, siempre todas (oscuras y claras: se ven sobre el vacío y sobre el líquido)
    for (const [col, dx, k] of [['0,0,0', 0, 0.9], ['255,255,255', 1, 0.7]] as const) {
      ctx.strokeStyle = 'rgba(' + col + ',' + (dv[0] * k).toFixed(2) + ')'; ctx.lineWidth = dv[1] * (dx ? 0.7 : 1);
      if (dx) { ctx.save(); ctx.translate(1, 0); }
      for (let i = 1; i < n; i++) { cutPath(ctx, i, n); ctx.stroke(); }
      if (dx) ctx.restore();
    }
    ctx.restore();
    brainPath(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 ' + labelSize + 'px "Inter Tight",system-ui,sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 8;
    ctx.fillStyle = labelShown === '?' ? 'rgba(242,239,230,.4)' : '#fff';
    ctx.fillText(labelShown, 100, 56);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
