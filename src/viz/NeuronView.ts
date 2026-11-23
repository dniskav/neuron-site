import { TAU, glow, line, ptAt, font, type Pt } from './core/canvas';
import { chan, css, lc, rgb, type Rgb } from './core/colors';
import { reducedMotion } from './core/motion';
import { Celebration } from './Celebration';
import type { NeuronGeometry } from './geometry';
import { LOD_DETAIL, type Lod } from './lod';
import type { NeuronDelta, NeuronLike } from './observe';

/**
 * NeuronView: UNA neurona dibujada y enlazada a una neurona REAL del modelo.
 *
 * Aquí viven, una sola vez y para todas las neuronas, los comportamientos visuales:
 *  - brillo suave al responder (`respond`);
 *  - celebración al aprender, proporcional a SU |Δw|+|Δb| (`learn`);
 *  - pulso de corrección hacia atrás por cada dendrita, proporcional a |Δw_i| (`drawCorrection`);
 *  - grosor de cada dendrita según |w_i|, con trazo cortado y «resta» si w_i < 0 (`drawWires`);
 *  - el cuerpo como recipiente, con la línea del sesgo (`drawBody`);
 *  - el bulbo de salida (`drawFront`).
 *
 * No sabe nada de ninguna pantalla: quien la use le da una fuente (`NeuronSource`), una
 * geometría y, si quiere, un vocabulario. Todo lo que dibuja sale del modelo.
 */

/** Adaptador a UNA neurona real (una `NeuronN`, o la neurona j de la capa i de un `NetworkN`). */
export interface NeuronSource {
  getWeights(): number[];
  getBias(): number;
}

export function sourceOf(n: NeuronLike): NeuronSource {
  return { getWeights: () => n.weights, getBias: () => n.bias };
}

/** Palabras que aparecen en el dibujo (todas opcionales). */
export interface NeuronVocab {
  /** Etiqueta bajo el círculo de origen de la muestra. */
  origin: string;
  /** Etiqueta de las dendritas con peso negativo. */
  neg: string;
  /** Etiqueta de la línea del sesgo. */
  threshold: string;
  /** Respuesta cuando la neurona se enciende (p > .5). */
  high: string;
  /** Respuesta cuando no. */
  low: string;
  /** Prefijo de «lo correcto era …» al aprender. */
  was: string;
  /** Si existe, es lo único que se ve en el bulbo antes de la primera respuesta (en vez de «alta / baja»). */
  idle?: string;
  /** «Lo correcto era …» completo (si no, `was` + la respuesta). */
  wasHigh?: string;
  wasLow?: string;
}

export const DEFAULT_VOCAB: NeuronVocab = {
  origin: 'color',
  neg: 'resta',
  threshold: 'a partir de aquí: claro',
  high: 'claro',
  low: 'oscuro',
  was: 'era',
};

export interface NeuronViewOptions {
  vocab?: Partial<NeuronVocab>;
  /** |w| que llena el grosor máximo de una dendrita. */
  wMax?: number;
  /** Rango de lo que llena el recipiente. */
  levelMin?: number;
  levelMax?: number;
  /** Cambio que cuenta como «máximo» para el brillo del pulso de corrección. */
  pulseMax?: number;
  /** Cambio total que cuenta como celebración máxima. */
  celebrateMax?: number;
  /** Grosor de una dendrita según su peso (`null` = sin enlazar). */
  thick?: (w: number | null) => number;
  /** Fase de la ondulación del cuerpo (que dos neuronas no respiren a la vez). */
  phase?: number;
  /** Cuánto se llena el brillo del cuerpo al responder (por la probabilidad de respuesta). */
  chargeGain?: number;
  /** Tiñe el cuerpo con el color de la muestra al responder. */
  tint?: boolean;
  /** Dibuja la etiqueta de la línea del sesgo. */
  lineLabel?: boolean;
  /** Dibuja el terminal y el bulbo de salida. */
  bulb?: boolean;
  /** Separación entre el cuerpo y la etiqueta de la línea. */
  labelGap?: number;
  rng?: () => number;
}

export interface Answer {
  a: number;
  p: number;
  ok: boolean;
  /** Si se está aprendiendo: lo correcto era 1 / 0. */
  era: number | null;
  hold: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const DARK: Rgb = [22, 34, 78], LIGHT: Rgb = [255, 238, 176], NEUT: Rgb = [176, 168, 140];

export class NeuronView {
  readonly geom: NeuronGeometry;
  readonly vocab: NeuronVocab;
  readonly celebration: Celebration;
  private src: NeuronSource | null = null;
  private o: Required<Omit<NeuronViewOptions, 'vocab' | 'rng'>>;

  /** Pesos y sesgo mostrados (con inercia) y objetivo. */
  wD: number[] | null = null;
  bD = 0;
  private wT: number[] | null = null;
  private bT = 0;

  // estado visual
  level = { z: 0, a: 0 };
  private lvD: number;
  charge = 0;
  shown = 0;
  flash = 0;
  termFlash = 0;
  private lastIn: number[] | null = null;
  private lastInT = 0;
  private sample: number[] | null = null;
  private sampleT = 0;
  private ripples: { x: number; y: number; t: number; c: number }[] = [];
  ans: (Answer & { t: number }) | null = null;
  /** Intensidad de la última celebración pedida (0..1), útil para probar la proporcionalidad. */
  lastStrength = 0;
  /** Última intensidad de pulso por dendrita (0..1) calculada con `pulseOf`. */
  scale = 1;
  /** Nivel de detalle pedido y su valor mostrado (0 puntos, 1 compacto, 2 completo), que se acerca con suavidad. */
  lod: Lod = 'full';
  detail = 2;
  private lodSet = false;

  constructor(readonly index: { layer: number; neuron: number }, geom: NeuronGeometry, opts: NeuronViewOptions = {}) {
    this.geom = geom;
    this.vocab = { ...DEFAULT_VOCAB, ...(opts.vocab || {}) };
    const wMax = opts.wMax ?? 6;
    this.o = {
      wMax, levelMin: opts.levelMin ?? -1.5, levelMax: opts.levelMax ?? 7, pulseMax: opts.pulseMax ?? 0.1, celebrateMax: opts.celebrateMax ?? 0.5,
      thick: opts.thick ?? ((w) => (w === null ? 4 : 1.6 + 9 * Math.min(1, Math.abs(w) / wMax))),
      phase: opts.phase ?? 0, chargeGain: opts.chargeGain ?? 0.3, tint: opts.tint ?? true, lineLabel: opts.lineLabel ?? true,
      bulb: opts.bulb ?? true, labelGap: opts.labelGap ?? 12,
    };
    this.lvD = this.o.levelMin;
    this.celebration = new Celebration(opts.rng);
  }

  // ---------- enlace con el modelo ----------

  /** Enlaza con una neurona real y toma sus pesos al instante (neurona nueva). */
  bind(src: NeuronSource | null): void {
    this.src = src;
    this.sync(true);
    this.charge = 0; this.flash = 0; this.termFlash = 0; this.ans = null; this.lastIn = null; this.lastInT = 0;
    this.sample = null; this.sampleT = 0; this.level = { z: 0, a: 0 }; this.lvD = this.o.levelMin;
    this.ripples = []; this.celebration.reset();
  }

  /** Lee los pesos reales. Con `now`, el dibujo salta; si no, se acerca con inercia. */
  sync(now = false, w?: number[], b?: number): void {
    if (!this.src) { this.wD = this.wT = null; return; }
    const ww = (w ?? this.src.getWeights()).slice(), bb = b ?? this.src.getBias();
    this.wT = ww; this.bT = bb;
    if (now || !this.wD) { this.wD = ww.slice(); this.bD = bb; }
  }

  get bound(): boolean { return !!this.src; }

  // ---------- nivel de detalle ----------

  /** Pide un nivel de detalle. La primera vez salta; después la transición es suave (ver `update`). */
  setLod(l: Lod): void {
    this.lod = l;
    if (!this.lodSet) { this.detail = LOD_DETAIL[l]; this.lodSet = true; }
  }
  /** Toma el detalle mostrado de otra neurona (red nueva que sustituye a otra: la transición continúa). */
  adoptDetail(d: number): void { this.detail = d; this.lodSet = true; }
  /** 0..1: cuánto hay de «completo» (decoraciones, etiquetas, bulbo). */
  get full(): number { return clamp01(this.detail - 1); }
  /** 0..1: cuánto hay de «más que un punto». */
  get comp(): number { return clamp01(this.detail); }
  /** Radio con el que se dibuja el cuerpo ahora (un punto, un cuerpo pequeño o el completo). */
  bodyR(): number {
    const dot = Math.max(1.7, 2.7 / this.scale), small = this.geom.body.r * 0.6;
    return mix(dot, mix(Math.min(small, Math.max(dot, 5.5 / this.scale)), this.geom.body.r, this.full), this.comp);
  }

  // ---------- comportamientos ----------

  /** El cuerpo suma lo que llega por las dendritas (Σ w_i·x_i) y responde con `p`: el predict real. */
  respond(inputs: number[], p: number): number {
    const w = this.src ? this.src.getWeights() : [];
    let z = 0;
    for (let i = 0; i < inputs.length; i++) z += inputs[i] * (w[i] || 0);
    this.level = { z, a: 1.4 };
    this.charge = Math.max(this.charge, 0.25 + this.o.chargeGain * p);
    this.flash = Math.max(this.flash, 0.16);
    this.lastIn = inputs;
    this.lastInT = 0.8;
    return z;
  }

  /** Muestra de la entrada en el círculo de origen. */
  showSample(c: number[] | null, ttl = 1.6): void { this.sample = c; this.sampleT = c ? ttl : 0; }

  /** Fija directamente el nivel del recipiente (modo «menos movimiento»). */
  setLevel(z: number, a: number): void { this.level = { z, a }; }

  /** La respuesta llega al terminal: enciende el bulbo. */
  answer(a: Answer): void {
    this.ans = { ...a, t: 0 };
    this.termFlash = 1;
  }

  /** Intensidad de la celebración para un cambio dado, de 0 a 1. */
  strengthOf(delta: NeuronDelta): number { return Math.min(1, delta.mag / this.o.celebrateMax); }

  /** Cambio medio de la neurona como fracción de `ref` (lo máximo que un peso podía moverse): de 0 a 1. */
  changeOf(delta: NeuronDelta, ref: number): number {
    let tot = 0;
    for (const d of delta.dw) tot += Math.min(1, d / ref);
    tot += Math.min(1, delta.db / ref);
    return tot / (delta.dw.length + 1);
  }

  /** Intensidad del pulso de cada dendrita (y del axón al final) de 0 a 1: proporcional a |Δw_i| y |Δb|. `ref` sustituye al tope por defecto. */
  pulseOf(delta: NeuronDelta, ref: number = this.o.pulseMax): { dendrites: number[]; axon: number } {
    return { dendrites: delta.dw.map((d) => Math.min(1, d / ref)), axon: Math.min(1, delta.db / ref) };
  }

  /**
   * La corrección llegó: los pesos mostrados se encaminan a los nuevos y la neurona celebra
   * según SU propio cambio. Es imposible aprender en silencio: si cambian los pesos, celebra.
   */
  learn(delta: NeuronDelta, opts: { celebrate?: boolean; flash?: number; ref?: number } = {}): number {
    this.wT = delta.w.slice();
    this.bT = delta.b;
    let flash = opts.flash ?? 0.15, s: number;
    if (opts.ref) {
      /* con una referencia (lo máximo que podía moverse un peso), todo sale del cambio medio de ESTA neurona */
      const m = this.changeOf(delta, opts.ref);
      s = Math.min(1, m * 1.5);
      flash = Math.max(flash, 0.15 + 0.5 * m);
    } else s = this.strengthOf(delta);
    this.flash = Math.max(this.flash, flash);
    this.lastStrength = s;
    if (opts.celebrate !== false) this.celebration.fire(s);
    return s;
  }

  ripple(blue = false): void { this.ripples.push({ x: this.geom.body.x, y: this.geom.body.y, t: 0, c: blue ? 1 : 0 }); }

  /** Avanza el estado visual `dt` segundos. */
  update(dt: number): void {
    const reduced = reducedMotion();
    if (this.wD && this.wT) {
      const ke = reduced ? 1 : Math.min(1, dt * 5);
      for (let i = 0; i < this.wD.length; i++) this.wD[i] += (this.wT[i] - this.wD[i]) * ke;
      this.bD += (this.bT - this.bD) * ke;
    }
    const dt2 = LOD_DETAIL[this.lod];
    this.detail = reduced ? dt2 : Math.abs(dt2 - this.detail) < 0.01 ? dt2 : this.detail + (dt2 - this.detail) * Math.min(1, dt * 6);
    if (this.level.a > 0) this.lvD += (this.level.z - this.lvD) * (reduced ? 1 : Math.min(1, dt * 5));
    else this.lvD = this.o.levelMin;
    this.shown += (Math.min(this.charge, 1) - this.shown) * Math.min(1, dt * 6);
    this.charge = Math.max(0, this.charge - dt * 0.9);
    if (this.charge > 1.2) this.charge = 1.2;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.termFlash = Math.max(0, this.termFlash - dt * 1.3);
    this.lastInT = Math.max(0, this.lastInT - dt * 0.9);
    this.sampleT = Math.max(0, this.sampleT - dt * 0.6);
    this.level.a = Math.max(0, this.level.a - dt * 0.55);
    this.celebration.update(dt);
    if (this.ans) { this.ans.t += dt; if (this.ans.t > this.ans.hold) this.ans = null; }
    for (let r = this.ripples.length - 1; r >= 0; r--) { this.ripples[r].t += dt; if (this.ripples[r].t > 1) this.ripples.splice(r, 1); }
  }

  /** Tamaño de letra legible a cualquier escala del dibujo. */
  fs(n: number): number { return Math.min(n * 1.7, Math.max(n, 10.5 / this.scale)); }

  // ---------- dibujo ----------

  /**
   * Origen de la muestra, ramitas, dendritas (grosor = |w|; cortado = resta), axón y terminal.
   * Dibuja SIEMPRE todas las conexiones, en cualquier nivel de detalle (más finas, con opacidad según |w|, nunca ocultas)
   * y devuelve cuántas dibujó.
   */
  drawWires(ctx: CanvasRenderingContext2D): number {
    const g = this.geom, fs = (n: number) => this.fs(n), F = this.full, C = this.comp, ga = ctx.globalAlpha;
    if (g.origin) {
      const SW = g.origin;
      ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.3; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(SW.x, SW.y, SW.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (this.sample && this.sampleT > 0) {
        const sa = Math.min(1, this.sampleT * 2);
        glow(ctx, SW.x, SW.y, SW.r * 2.2, css(this.sample, 0.4 * sa), css(this.sample, 0));
        ctx.fillStyle = css(this.sample, sa); ctx.beginPath(); ctx.arc(SW.x, SW.y, SW.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + 0.55 * sa + ')'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      if (F > 0.02) {
        ctx.globalAlpha = ga * F;
        ctx.font = font(fs(10.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(141,137,125,.95)';
        ctx.fillText(this.vocab.origin, SW.x, SW.y + SW.r + fs(10.5) * 0.9);
        ctx.globalAlpha = ga;
      }
    }
    // ramitas (decoración de cada dendrita): solo en el nivel completo
    if (F > 0.02) g.dendrites.forEach((d) => {
      ctx.strokeStyle = 'rgba(201,162,39,' + 0.22 * F + ')'; ctx.lineWidth = 1.2;
      d.branches.forEach((b) => { ctx.beginPath(); ctx.moveTo(b.p[0], b.p[1]); ctx.quadraticCurveTo(b.c[0], b.c[1], b.e[0], b.e[1]); ctx.stroke(); });
    });
    // las dendritas: grosor = |peso| real; trazo cortado = peso negativo («resta»). Todas, siempre.
    const floor = (1 - F) * 1.1 / this.scale;
    let drawn = 0;
    g.dendrites.forEach((d, i) => {
      const wv = this.wD ? this.wD[i] : null, neg = wv !== null && wv < 0;
      const mag = wv === null ? 0.5 : Math.min(1, Math.abs(wv) / this.o.wMax);
      const wd = Math.max(this.o.thick(wv) * mix(0.5, mix(0.7, 1, F), C), floor);
      const al = mix(0.3 + 0.7 * Math.sqrt(mag), 1, F);
      ctx.strokeStyle = chan(d.rgb, 0.07 * F); if (F > 0.02) line(ctx, d.pts, wd * 3, true, neg);
      ctx.strokeStyle = 'rgba(214,176,52,' + 0.78 * al + ')'; line(ctx, d.pts, wd, true, neg);
      ctx.strokeStyle = chan(d.rgb, 0.34 * al); line(ctx, d.pts, wd, true, neg);
      if (neg && F < 1) { ctx.strokeStyle = 'rgba(140,180,255,' + 0.6 * (1 - F) + ')'; line(ctx, d.pts, wd, true, true); }
      drawn++;
      if (d.tipGlow !== false) glow(ctx, d.tip[0], d.tip[1], 9, chan(d.rgb, 0.5 * mix(0.5, 1, F)), chan(d.rgb, 0));
      if (d.name && F > 0.02) {
        ctx.globalAlpha = ga * F;
        const ty = d.labelBelow ? d.tip[1] + fs(12) * 1.5 : d.tip[1] - fs(12) * 1.3;
        ctx.font = font(fs(12)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = chan(d.rgb, 0.95); ctx.fillText(d.name, d.tip[0], ty);
        if (neg) { ctx.font = font(fs(10.5)); ctx.fillStyle = 'rgba(242,239,230,.7)'; ctx.fillText(this.vocab.neg, d.tip[0], ty + (d.labelBelow ? 1 : -1) * fs(10.5) * 1.2); }
        ctx.globalAlpha = ga;
      }
    });
    // axón y terminal
    if (g.axon.length) {
      const AX = g.axon, AN = AX.length, endP = AX[AN - 1], term = g.terminal, thin = mix(0.4, 1, F);
      if (F > 0.02) { ctx.strokeStyle = 'rgba(201,162,39,' + 0.08 * F + ')'; line(ctx, AX, 14, false); }
      ctx.strokeStyle = 'rgba(190,155,40,' + mix(0.4, 0.75, F) + ')'; line(ctx, AX, Math.max(4 * thin, floor), false);
      if (F > 0.02) {
        ctx.strokeStyle = 'rgba(255,224,138,' + 0.12 * F + ')'; ctx.lineWidth = 11;
        [0.25, 0.5, 0.75].forEach((f) => {
          const kk = Math.round(f * (AN - 1)), a = AX[Math.max(0, kk - 2)], b = AX[Math.min(AN - 1, kk + 2)];
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        });
      }
      ctx.strokeStyle = 'rgba(190,155,40,' + mix(0.4, 0.7, F) + ')'; ctx.lineWidth = Math.max(2.4 * thin, floor);
      ctx.beginPath(); ctx.moveTo(endP[0], endP[1]); ctx.lineTo(term[0], term[1]); ctx.stroke();
    }
    return drawn;
  }

  /** La muestra viaja por las dendritas (`u` de 0 a 1): tamaño y brillo según el valor de cada canal. */
  drawInput(ctx: CanvasRenderingContext2D, c: number[], u: number): void {
    const g = this.geom;
    g.dendrites.forEach((d, i) => {
      const v = c[i], al = 0.35 + 0.65 * v, rad = 3 + v * 7.5, tipP = d.pts[0], phased = !!g.origin || !!g.sharedOrigin;
      let pos: Pt;
      if (u < 0.3 && phased) {
        if (!g.origin) return; /* el origen y su primer tramo los dibuja la otra neurona */
        let e = u / 0.3; e = e * e * (3 - 2 * e);
        const sx = g.origin.x + g.origin.r * 0.6;
        pos = [sx + (tipP[0] - sx) * e, g.origin.y + (tipP[1] - g.origin.y) * e];
        ctx.strokeStyle = chan(d.rgb, al * 0.4 * (1 - e * 0.4)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx, g.origin.y); ctx.lineTo(pos[0], pos[1]); ctx.stroke();
      } else {
        const fq = phased ? (u - 0.3) / 0.7 : u, uu = fq * fq * (3 - 2 * fq) * 0.35 + fq * 0.65;
        for (let k = 3; k >= 1; k--) { const q = ptAt(d.pts, uu - k * 0.035); glow(ctx, q[0], q[1], rad * 0.9, chan(d.rgb, 0.12 * (4 - k) * al), chan(d.rgb, 0)); }
        pos = ptAt(d.pts, uu);
      }
      glow(ctx, pos[0], pos[1], rad * 2.6, chan(d.rgb, al * 0.6), chan(d.rgb, 0));
      ctx.fillStyle = chan(d.rgb, al); ctx.beginPath(); ctx.arc(pos[0], pos[1], rad, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + al * 0.6 + ')'; ctx.lineWidth = 1.2; ctx.stroke();
    });
  }

  /** La respuesta viaja por el axón (`u` de 0 a 1). */
  drawOutput(ctx: CanvasRenderingContext2D, p: number, a: number, u: number): void {
    const m = Math.min(1, u * 1.4), cc = lc(NEUT, lc(DARK, LIGHT, p), m), hc = lc([200, 190, 150], a ? [255, 226, 140] : [100, 150, 255], m);
    const pos = ptAt(this.geom.axon, u);
    glow(ctx, pos[0], pos[1], 26, rgb(hc, 0.8), rgb(hc, 0));
    ctx.fillStyle = rgb(cc, 1); ctx.beginPath(); ctx.arc(pos[0], pos[1], 6.5 * mix(0.5, 1, this.full), 0, TAU); ctx.fill();
    ctx.strokeStyle = a ? 'rgba(255,255,255,.85)' : 'rgba(130,175,255,.95)'; ctx.lineWidth = 1.8; ctx.stroke();
  }

  /**
   * Las salidas de la capa anterior avisan por mis dendritas (`u` de 0 a 1): más grandes y brillantes
   * cuanto más se encendió cada una (`values`, de 0 a 1).
   */
  drawRelay(ctx: CanvasRenderingContext2D, values: number[], u: number): void {
    const sz = mix(0.45, 1, this.full);
    this.geom.dendrites.forEach((d, j) => {
      /* lo que lleva cada conexión: lo que se encendió la neurona de origen, por el peso de ESTA conexión */
      const w = this.wD ? this.wD[j] : null, carry = w === null ? 1 : 0.3 + 0.7 * Math.sqrt(Math.min(1, Math.abs(w) / this.o.wMax));
      const hh = (values[j] ?? 0) * carry, pp = ptAt(d.travel ?? d.pts, u * u * (3 - 2 * u)), rr = (3 + hh * 7) * sz;
      glow(ctx, pp[0], pp[1], rr * 3, 'rgba(255,226,140,' + (0.15 + 0.6 * hh) + ')', 'rgba(255,200,80,0)');
      ctx.fillStyle = 'rgba(255,240,190,' + (0.25 + 0.75 * hh) + ')'; ctx.beginPath(); ctx.arc(pp[0], pp[1], rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.2 + 0.5 * hh) + ')'; ctx.lineWidth = 1.2; ctx.stroke();
    });
  }

  /**
   * La corrección vuelve hacia atrás (`u` de 0 a 1), en azul frío: primero por el axón
   * (proporcional al cambio del sesgo) y luego por cada dendrita, proporcional a su |Δw_i|.
   */
  drawCorrection(ctx: CanvasRenderingContext2D, u: number, delta: NeuronDelta, opts: { axon?: [number, number]; dendrites?: [number, number]; ref?: number } = {}): void {
    /* en una red, cada capa tiene su tramo del viaje de vuelta: el axón, luego las dendritas de la última, luego las de la anterior… */
    const g = this.geom, pulse = this.pulseOf(delta, opts.ref), bp: [Pt, number][] = [];
    const ax = opts.axon ?? [0, 0.4], de = opts.dendrites ?? [0.4, 1];
    if (u >= ax[0] && u < ax[1] && g.axon.length) bp.push([ptAt(g.axon, 1 - (u - ax[0]) / (ax[1] - ax[0])), pulse.axon]);
    else if (u >= de[0] && u <= de[1]) g.dendrites.forEach((d, i) => bp.push([ptAt(d.travel ?? d.pts, 1 - (u - de[0]) / (de[1] - de[0])), pulse.dendrites[i] || 0]));
    bp.forEach(([p, sv]) => {
      if (sv < 0.04) return;
      glow(ctx, p[0], p[1], 8 + 16 * sv, 'rgba(120,175,255,' + (0.2 + 0.65 * sv) + ')', 'rgba(106,167,255,0)');
      ctx.fillStyle = 'rgba(220,235,255,' + (0.4 + 0.6 * sv) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.5 + 2.8 * sv, 0, TAU); ctx.fill();
    });
  }

  /** Cuerpo: recipiente que se llena con lo que llega, con la línea del sesgo y el «pop» elástico al aprender. */
  drawBody(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.detail > 1.98) { this.drawBodyFull(ctx, t, 1); return; }
    const F = this.full, ga = ctx.globalAlpha, S = this.geom.body, r = this.bodyR();
    if (F < 1) {
      /* compacto o punto: un disco que brilla con lo que le llega, sin recipiente ni detalles */
      const lit = this.shown * 0.6 + this.flash * 0.4, R = r * this.celebration.pop();
      ctx.globalAlpha = ga * (1 - F);
      glow(ctx, S.x, S.y, R * (2.2 + lit * 3.2), 'rgba(255,205,90,' + (0.12 + lit * 0.6) + ')', 'rgba(201,162,39,0)');
      ctx.fillStyle = 'rgb(' + ((70 + lit * 185) | 0) + ',' + ((52 + lit * 172) | 0) + ',' + ((14 + lit * 124) | 0) + ')';
      ctx.beginPath(); ctx.arc(S.x, S.y, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,138,' + (0.4 + lit * 0.55) + ')'; ctx.lineWidth = Math.max(1, 1.2 / this.scale); ctx.stroke();
      ctx.globalAlpha = ga;
    }
    if (F > 0.02) { ctx.globalAlpha = ga * F; this.drawBodyFull(ctx, t, r / S.r); ctx.globalAlpha = ga; }
  }

  private drawBodyFull(ctx: CanvasRenderingContext2D, t: number, rMul: number): void {
    const S = this.geom.body, lit = this.shown * 0.6 + this.flash * 0.4;
    const BR = S.r * rMul * this.celebration.pop(), ga0 = ctx.globalAlpha;
    glow(ctx, S.x, S.y, BR * (2 + lit * 2.2), 'rgba(255,205,90,' + (0.1 + lit * 0.5) + ')', 'rgba(201,162,39,0)');
    if (this.flash > 0.3) glow(ctx, S.x, S.y, BR * 4, 'rgba(180,215,255,' + this.flash * 0.3 + ')', 'rgba(106,167,255,0)');
    const bodyPath = (): void => {
      ctx.beginPath();
      for (let q2 = 0; q2 <= 64; q2++) {
        const th = (q2 / 64) * 6.2832, ph = this.o.phase, rr = BR * (1 + 0.05 * Math.sin(th * 3 + t * 0.8 + ph) + 0.035 * Math.sin(th * 5 - t * 0.6 + ph) + lit * 0.05);
        const px = S.x + Math.cos(th) * rr, py = S.y + Math.sin(th) * rr;
        if (q2) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    bodyPath();
    const bg = ctx.createRadialGradient(S.x - BR * 0.18, S.y - BR * 0.22, 2, S.x, S.y, BR * 1.1);
    bg.addColorStop(0, 'rgba(255,' + ((215 + lit * 30) | 0) + ',' + ((130 + lit * 80) | 0) + ',' + (0.55 + lit * 0.45) + ')');
    bg.addColorStop(0.6, 'rgba(' + ((150 + lit * 90) | 0) + ',' + ((110 + lit * 70) | 0) + ',25,' + (0.5 + lit * 0.4) + ')');
    bg.addColorStop(1, 'rgba(60,42,8,.85)');
    ctx.fillStyle = bg; ctx.fill();
    // el cuerpo es un recipiente: se llena hasta «lo que llega» (Σ w·x) y una línea dorada marca dónde
    // la respuesta pasa a «encendida» (el umbral real de predict > 0.5, o sea -sesgo)
    const GMIN = this.o.levelMin, GMAX = this.o.levelMax;
    let lineY = 0;
    const haveLine = !!this.wD;
    const fr = (z: number): number => Math.max(0.03, Math.min(0.97, (z - GMIN) / (GMAX - GMIN)));
    const yAt = (f: number): number => S.y + BR - f * 2 * BR;
    if (haveLine) {
      const fl = Math.max(0.07, Math.min(0.93, fr(-this.bD)));
      let fz = fr(this.lvD);
      const above = this.lvD > -this.bD;
      if (above) fz = Math.max(fz, fl + 0.04); else fz = Math.min(fz, fl - 0.04);
      lineY = yAt(fl);
      ctx.save(); bodyPath(); ctx.clip();
      const la = Math.min(1, this.level.a);
      let x: number;
      if (la > 0) {
        const yz = yAt(fz);
        ctx.beginPath(); ctx.moveTo(S.x - BR - 4, S.y + BR + 4);
        for (x = S.x - BR - 4; x <= S.x + BR + 4; x += 4) ctx.lineTo(x, yz + Math.sin(x * 0.13 + t * 3) * 2.2);
        ctx.lineTo(S.x + BR + 4, S.y + BR + 4); ctx.closePath();
        const lg = ctx.createLinearGradient(0, yz, 0, S.y + BR);
        if (above) { lg.addColorStop(0, 'rgba(255,240,170,.95)'); lg.addColorStop(1, 'rgba(255,190,70,.85)'); }
        else { lg.addColorStop(0, 'rgba(165,200,255,.92)'); lg.addColorStop(1, 'rgba(60,100,215,.85)'); }
        ctx.globalAlpha = ga0 * la; ctx.fillStyle = lg; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4; ctx.beginPath();
        for (x = S.x - BR - 4; x <= S.x + BR + 4; x += 4) { const yy = yz + Math.sin(x * 0.13 + t * 3) * 2.2; if (x > S.x - BR - 4) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
        ctx.stroke(); ctx.globalAlpha = ga0;
      }
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.6; ctx.shadowColor = '#c9a227'; ctx.shadowBlur = 8; ctx.beginPath();
      for (x = S.x - BR - 4; x <= S.x + BR + 4; x += 4) { const yl2 = lineY + Math.sin(x * 0.2 + t * 1.5) * 1.6; if (x > S.x - BR - 4) ctx.lineTo(x, yl2); else ctx.moveTo(x, yl2); }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.restore();
    }
    bodyPath();
    ctx.strokeStyle = 'rgba(255,224,138,' + (0.45 + lit * 0.5) + ')'; ctx.lineWidth = 2; ctx.stroke();
    glow(ctx, S.x + BR * 0.1, S.y + BR * 0.05, BR * 0.27, 'rgba(255,250,230,' + (0.2 + lit * 0.5) + ')', 'rgba(255,224,138,0)');
    if (this.o.tint && this.lastIn && this.lastInT > 0) glow(ctx, S.x, S.y, S.r * 0.95, css(this.lastIn, 0.6 * this.lastInT), css(this.lastIn, 0));
    this.lineY = lineY;
  }

  /** Altura (y) de la línea del sesgo en el último dibujo del cuerpo. */
  lineY = 0;

  /** Ondas, celebración, etiqueta de la línea y bulbo de salida. */
  drawFront(ctx: CanvasRenderingContext2D): void {
    const S = this.geom.body, fs = (n: number) => this.fs(n), F = this.full, ga = ctx.globalAlpha;
    for (const rp of this.ripples) {
      ctx.strokeStyle = (rp.c ? 'rgba(120,175,255,' : 'rgba(160,200,255,') + (1 - rp.t) * 0.7 + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + rp.t * 34, 0, TAU); ctx.stroke();
    }
    this.celebration.draw(ctx, S.x, S.y, this.bodyR(), fs);
    ctx.globalAlpha = ga * F;
    // etiqueta de la línea
    if (this.wD && this.o.lineLabel) {
      const lf = Math.min(13, fs(10.5)), lx = S.x + S.r + this.o.labelGap, lineY = this.lineY;
      let ly = lineY;
      if (Math.abs(ly - S.y) < 18) ly = ly <= S.y ? S.y - 24 : S.y + 26;
      const ex = S.x + Math.sqrt(Math.max(0, S.r * S.r - (lineY - S.y) * (lineY - S.y)));
      ctx.strokeStyle = 'rgba(255,224,138,.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(ex, lineY); ctx.lineTo(lx - 3, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(lf); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,224,138,.92)';
      ctx.fillText(this.vocab.threshold, lx, ly);
      if (this.level.a > 0 && this.lvD > this.o.levelMax) { ctx.textAlign = 'center'; ctx.fillText('▲', S.x, S.y - S.r - 6); }
    }
    if (this.o.bulb && F > 0.02) this.drawBulb(ctx);
    ctx.globalAlpha = ga;
    ctx.textAlign = 'left';
  }

  /** Salida: UN solo terminal, un bulbo luminoso que toma el color de la respuesta. */
  drawBulb(ctx: CanvasRenderingContext2D): void {
    const ans = this.ans, fs = (n: number) => this.fs(n), v = this.vocab;
    const bx0 = this.geom.terminal[0], by0 = this.geom.terminal[1], tx = bx0 + 18;
    const al2 = ans ? Math.max(0, Math.min(1, ans.t * 6, (ans.hold - ans.t) * 3)) : 0;
    glow(ctx, bx0, by0, 12, 'rgba(255,224,138,.25)', 'rgba(255,224,138,0)');
    ctx.fillStyle = 'rgba(190,155,40,.7)'; ctx.beginPath(); ctx.arc(bx0, by0, 5, 0, TAU); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (ans && al2 > 0) {
      const warm = ans.a, br = 8 + this.termFlash * 3, word = warm ? v.high : v.low;
      ctx.globalAlpha = al2;
      if (warm) {
        glow(ctx, bx0, by0, 30 + this.termFlash * 8, 'rgba(255,230,150,.85)', 'rgba(255,200,80,0)');
        const wg = ctx.createRadialGradient(bx0 - 2, by0 - 2, 1, bx0, by0, br);
        wg.addColorStop(0, '#fffbe6'); wg.addColorStop(1, '#ffd45a');
        ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(bx0, by0, br, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        glow(ctx, bx0, by0, 24 + this.termFlash * 6, 'rgba(70,110,230,.55)', 'rgba(60,100,220,0)');
        const dg = ctx.createRadialGradient(bx0, by0, 1, bx0, by0, br);
        dg.addColorStop(0, '#070b1c'); dg.addColorStop(1, '#1b2c64');
        ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(bx0, by0, br, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(125,175,255,.95)'; ctx.lineWidth = 2; ctx.stroke();
      }
      const f1 = fs(17); ctx.font = font(f1);
      ctx.shadowColor = warm ? '#ffd45a' : '#5b8cff'; ctx.shadowBlur = 14; ctx.fillStyle = warm ? '#fff3c4' : '#c4dcff';
      ctx.fillText(word, tx, by0); ctx.shadowBlur = 0;
      const ww = ctx.measureText(word).width; ctx.font = font(fs(13));
      ctx.fillStyle = ans.ok ? (warm ? '#ffe9a0' : '#8fd0ff') : '#ff6a55'; ctx.fillText(ans.ok ? '✓' : '✗', tx + ww + 7, by0);
      if (ans.era !== null) {
        ctx.font = font(fs(12)); ctx.shadowColor = '#5b8cff'; ctx.shadowBlur = 8; ctx.fillStyle = 'rgba(150,195,255,1)';
        ctx.fillText((ans.era ? v.wasHigh : v.wasLow) ?? v.was + ' ' + (ans.era ? v.high : v.low), tx, by0 + f1 * 0.95 + fs(12) * 0.8); ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
    if (!ans || al2 < 1) {
      const f2 = fs(14); ctx.font = font(f2); ctx.globalAlpha = 1 - al2;
      if (v.idle) { ctx.fillStyle = 'rgba(255,224,138,.45)'; ctx.fillText(v.idle, tx, by0); }
      else {
        const wc = ctx.measureText(v.high).width, ws = ctx.measureText(' / ').width;
        ctx.fillStyle = 'rgba(255,224,138,.45)'; ctx.fillText(v.high, tx, by0);
        ctx.fillStyle = 'rgba(141,137,125,.5)'; ctx.fillText(' / ', tx + wc, by0);
        ctx.fillStyle = 'rgba(140,175,255,.5)'; ctx.fillText(v.low, tx + wc + ws, by0);
      }
      ctx.globalAlpha = 1;
    }
  }
}
