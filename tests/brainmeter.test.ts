import { describe, expect, it } from 'vitest';
import { NeuronN } from '@dniskav/neuron';
import { BrainMeter, changeFrac, fillOf, fmtCount, lobeIndex, neuronCount } from '../src/viz/BrainMeter';
import { BH, BW, X0, X1, YBOT, YTOP, cutX } from '../src/viz/brainShape';
import { ObservedModel } from '../src/viz/observe';
import { newTeam, structOf, LR, TRAIN, EPOCHS as EQ_EPOCHS, BRAIN_SCALE as EQ_SCALE, labelOf as eqLabel, trainPass } from '../src/data/equipo';
import { BRAIN_SCALE as PA_SCALE, evaluate, newModel, playDrops } from '../src/data/paleta';
import { ALL, BRAIN_SCALE as ENS_SCALE, EPOCHS, LR as ENS_LR, labelOf, newNeuron } from '../src/data/ensenale';

/** Contexto 2D falso que cuenta las llamadas y guarda los rellenos de los rectángulos (los destellos). */
function recCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number>; rects: { x: number; w: number; fill: string }[]; texts: string[]; flashes: string[] } {
  const calls: Record<string, number> = {}, rects: { x: number; w: number; fill: string }[] = [], texts: string[] = [], flashes: string[] = [];
  const grad = { addColorStop: () => {} };
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(store, {
    get(t, k: string) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'fillRect') return (x: number, _y: number, w: number) => { calls[k] = (calls[k] || 0) + 1; rects.push({ x, w, fill: String(t.fillStyle) }); };
      if (k === 'measureText') return (txt: string) => ({ width: txt.length * 0.6 * (parseFloat(String(t.font).replace(/^\d+ /, '')) || 10) });
      if (k === 'fillText') return (txt: string) => { texts.push(txt); };
      if (k === 'fill') return () => { calls[k] = (calls[k] || 0) + 1; if (/255,236,160/.test(String(t.fillStyle))) flashes.push(String(t.fillStyle)); };
      if (k in t) return t[k];
      return () => { calls[k] = (calls[k] || 0) + 1; };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, rects, texts, flashes };
}

describe('BrainMeter: secciones = neuronas del modelo real', () => {
  it('una neurona sola (NeuronN) es 1 sección', () => {
    const m = new BrainMeter(1);
    m.setModel(newNeuron());
    expect(m.lobes).toBe(1);
    expect(neuronCount(new NeuronN(3))).toBe(1);
  });
  it('Equipo: k=1 es [3,1] (1 sección) y k>=2 es [3,k,1] (k + 1 secciones), leído de la estructura real', () => {
    const m = new BrainMeter(1);
    [1, 2, 3].forEach((k) => {
      const net = newTeam(k);
      m.setModel(net);
      const real = structOf(k).slice(1).reduce((s, n) => s + n, 0);
      expect(m.lobes).toBe(real);
      expect(m.lobes).toBe(net.layers.reduce((s, l) => s + l.neurons.length, 0));
      expect(m.flash).toHaveLength(m.lobes);
    });
    m.setModel(newTeam(3)); expect(m.lobes).toBe(4);
  });
  it('Paleta: 1 con la neurona sola, 8 + 1 con el equipo', () => {
    const m = new BrainMeter(1);
    m.setModel(newModel('solo')); expect(m.lobes).toBe(1);
    m.setModel(newModel('equipo')); expect(m.lobes).toBe(9);
  });
  it('los bordes reparten el cerebro en tantas secciones iguales como neuronas', () => {
    const m = new BrainMeter(9), b = m.bounds();
    expect(b).toHaveLength(10);
    const wd = b.slice(1).map((x, i) => x - b[i]);
    wd.forEach((v) => expect(v).toBeCloseTo(wd[0], 9));
  });
  it('el índice de sección sigue el orden capa por capa', () => {
    const net = newTeam(3);
    expect(lobeIndex(net, 0, 0)).toBe(0);
    expect(lobeIndex(net, 0, 2)).toBe(2);
    expect(lobeIndex(net, 1, 0)).toBe(3);
  });
  it('se dibujan todas las divisiones (n - 1) también con muchas secciones', () => {
    [1, 4, 9, 40].forEach((n) => {
      const m = new BrainMeter(n), { ctx, calls } = recCtx();
      m.draw(ctx, 60, 45, 1);
      const withNone = calls.stroke;
      // tronco + surcos + contorno + (n - 1) divisiones, cada una en oscuro y en claro (sin llenado no hay superficie de líquido)
      expect(withNone).toBe(3 + 2 * (n - 1));
    });
  });
});

describe('BrainMeter: cada sección se llena con lo que aprendió SU neurona (cambio real acumulado)', () => {
  it('fillOf: 0 sin cambio, creciente y saturante, nunca pasa de 1', () => {
    expect(fillOf(0, 10)).toBe(0);
    expect(fillOf(10, 10)).toBeCloseTo(1 - Math.exp(-1), 12);
    let prev = 0;
    [1, 5, 20, 100, 1000].forEach((t) => { const f = fillOf(t, 10); expect(f).toBeGreaterThan(prev); expect(f).toBeLessThanOrEqual(1); prev = f; });
    expect(fillOf(-3, 10)).toBe(0);
  });
  it('ObservedModel.travel suma, paso a paso, Σ|Δw| + |Δb| de cada neurona (también con train directo del modelo)', () => {
    const net = newTeam(3), obs = new ObservedModel(net);
    let manual = net.layers.map((l) => l.neurons.map(() => 0));
    for (let i = 0; i < 25; i++) {
      const before = net.layers.map((l) => l.neurons.map((n) => ({ w: n.weights.slice(), b: n.bias })));
      if (i % 2) net.train([0.9, 0.2, 0.4], [1], LR); else obs.train([0.1, 0.7, 0.3], [0], LR);   // directo y por el observador
      net.layers.forEach((l, li) => l.neurons.forEach((n, ni) => {
        manual[li][ni] += n.weights.reduce((s, w, k) => s + Math.abs(w - before[li][ni].w[k]), 0) + Math.abs(n.bias - before[li][ni].b);
      }));
    }
    manual.forEach((l, li) => l.forEach((v, ni) => { expect(obs.travel[li][ni]).toBeCloseTo(v, 12); expect(v).toBeGreaterThan(0); }));
    expect(obs.travelFlat()).toHaveLength(4);
  });
  it('una red nueva empieza vacía; entrenar llena; otra red nueva vuelve a vaciarlo', () => {
    const m = new BrainMeter(1), net = newNeuron(), obs = new ObservedModel(net);
    m.setModel(net); m.track(obs, 25);
    m.ease(1, true); expect(m.fill[0]).toBe(0);
    for (let i = 0; i < 40; i++) obs.train([0.9, 0.9, 0.9], 1, 0.5);
    m.ease(1, true); expect(m.fill[0]).toBeGreaterThan(0);
    expect(m.fill[0]).toBeCloseTo(fillOf(obs.travel[0][0], 25), 12);
    m.setModel(newNeuron());    // red nueva: aunque tenga las mismas secciones
    expect(m.fill).toEqual([0]); expect(m.flash).toEqual([0]);
    m.ease(1, true); expect(m.fill[0]).toBe(0);
  });
  it('cada sección tiene SU nivel: solo se llena la de la neurona que cambió', () => {
    const m = new BrainMeter(4);
    m.setTravel([200, 0, 5, 0], 10);
    m.ease(1, true);
    expect(m.fill[0]).toBeGreaterThan(0.99); expect(m.fill[1]).toBe(0); expect(m.fill[3]).toBe(0);
    expect(m.fill[2]).toBeCloseTo(fillOf(5, 10), 12);
    expect(m.level()).toBeCloseTo((m.fill[0] + m.fill[2]) / 4, 12);
    expect(BrainMeter.surfaceY(0)).toBeGreaterThan(BrainMeter.surfaceY(0.5));
    expect(BrainMeter.surfaceY(0.5)).toBeGreaterThan(BrainMeter.surfaceY(1));
  });
  it('con inercia se acerca sin saltar; con «menos movimiento» llega de golpe', () => {
    const m = new BrainMeter(1); m.setTravel([100], 10);
    m.ease(0.1, false); expect(m.fill[0]).toBeGreaterThan(0); expect(m.fill[0]).toBeLessThan(m.goal[0]);
    m.ease(1, true); expect(m.fill[0]).toBeCloseTo(m.goal[0], 12);
  });
  it('se dibuja el líquido solo en las secciones con algo (una pasada de líquido por sección llena)', () => {
    const empty = recCtx(); new BrainMeter(4).draw(empty.ctx, 200, 150, 1);
    const m = new BrainMeter(4); m.setTravel([100, 0, 100, 0], 10); m.ease(1, true);
    const two = recCtx(); m.draw(two.ctx, 200, 150, 1);
    expect((two.calls.stroke || 0) - (empty.calls.stroke || 0)).toBe(2);
  });
  it('el número del centro son los ajustes (no el %) y NO llena el cerebro', () => {
    const m = new BrainMeter(2), { ctx, texts } = recCtx();
    m.setAdjustments(12345); m.draw(ctx, 200, 150, 1);
    expect(texts).toEqual(['12.345', 'ajustes']); expect(m.level()).toBe(0);
    const one = recCtx(); m.setAdjustments(1); m.draw(one.ctx, 200, 150, 1);
    expect(one.texts).toEqual(['1', 'ajuste']);
  });
  it('los ajustes cuentan un train real cada uno (venga de donde venga) y vuelven a 0 con una red nueva', () => {
    const net = newNeuron(), obs = new ObservedModel(net), m = new BrainMeter(1);
    m.setModel(net); m.track(obs, ENS_SCALE);
    expect(m.adjustments()).toBe(0);
    obs.train([0.2, 0.4, 0.6], 1, ENS_LR);
    for (let i = 0; i < 9; i++) net.train([0.1, 0.1, 0.1], 0, ENS_LR);
    expect(obs.steps).toBe(10); expect(m.adjustments()).toBe(10);
    const fresh = newNeuron(); m.setModel(fresh); m.track(new ObservedModel(fresh), ENS_SCALE);
    expect(m.adjustments()).toBe(0);
  });
  it('fmtCount: punto de miles como en español', () => {
    expect([0, 7, 999, 1000, 1234, 120000, 1234567].map(fmtCount)).toEqual(['0', '7', '999', '1.000', '1.234', '120.000', '1.234.567']);
  });
  it('escalas medidas: bien entrenado casi lleno, sin entrenar vacío (cada modelo real)', () => {
    // Enséñale: 34 ejemplos y 40 repasos; sin enseñar nada
    const full = newNeuron(), of = new ObservedModel(full);
    for (let e = 0; e < EPOCHS; e++) ALL.slice(0, 34).forEach((c) => full.train(c, labelOf(c), ENS_LR));
    expect(fillOf(of.travel[0][0], ENS_SCALE)).toBeGreaterThan(0.9);
    expect(fillOf(new ObservedModel(newNeuron()).travel[0][0], ENS_SCALE)).toBe(0);
    // Equipo: 60 ejemplos y 200 repasos con 3 neuronas; cada sección bastante llena
    const team = newTeam(3), ot = new ObservedModel(team);
    TRAIN.forEach((c) => team.train(c, [eqLabel(c)], LR));
    for (let e = 0; e < EQ_EPOCHS; e++) trainPass(team);
    ot.travelFlat().forEach((t) => expect(fillOf(t, EQ_SCALE)).toBeGreaterThan(0.8));
  });
  it('Paleta: un cerebro LLENO con un % bajo es correcto (neurona sola con paredes), y el equipo con paredes llena y acierta', () => {
    const solo = newModel('solo'), os = new ObservedModel(solo);
    playDrops(solo, 'solo', true, [], 30, 10);
    expect(evaluate(solo, true)).toBeLessThan(40);                             // acierta poco…
    expect(fillOf(os.travel[0][0], PA_SCALE.solo)).toBeGreaterThan(0.9);       // …y ha cambiado mucho
    const easy = newModel('solo'), oe = new ObservedModel(easy);
    playDrops(easy, 'solo', false, [], 30, 10);
    expect(evaluate(easy, false)).toBeGreaterThanOrEqual(90);
    expect(os.travel[0][0]).toBeGreaterThan(oe.travel[0][0]);                  // con paredes se mueve más que sin ellas
    const team = newModel('equipo'), ot = new ObservedModel(team);
    playDrops(team, 'equipo', true, [], 100, 10);
    expect(evaluate(team, true)).toBeGreaterThanOrEqual(90);
    ot.travelFlat().forEach((t) => expect(fillOf(t, PA_SCALE.equipo)).toBeGreaterThan(0.9));
    const fresh = new ObservedModel(newModel('equipo'));
    fresh.travelFlat().forEach((t) => expect(fillOf(t, PA_SCALE.equipo)).toBe(0));
  });
});

describe('brainShape: la silueta y las divisiones', () => {
  it('cada frontera es una línea ondulada e inclinada (no una raya recta) y las fronteras van en orden', () => {
    const n = 5, xs = (i: number): number[] => [0, 40, 80, 120].map((y) => cutX(i, n, y));
    for (let i = 1; i < n; i++) { const v = xs(i); expect(new Set(v.map((x) => x.toFixed(2))).size).toBeGreaterThan(1); }
    [0, 40, 80, 120].forEach((y) => { for (let i = 1; i < n - 1; i++) expect(cutX(i, n, y)).toBeLessThan(cutX(i + 1, n, y)); });
    expect(cutX(0, n, 50)).toBeLessThan(0); expect(cutX(n, n, 50)).toBeGreaterThan(200);
  });
  it('la silueta cabe en la caja y deja sitio al tronco', () => {
    expect(X0).toBeGreaterThan(0); expect(X1).toBeLessThan(BW); expect(YBOT).toBeLessThan(BH); expect(YTOP).toBeGreaterThan(0);
  });
});

describe('BrainMeter: el destello de cada sección sale del Δ real de SU neurona', () => {
  it('changeFrac crece con |Δw| + |Δb| y se queda en 0..1', () => {
    const d = (dw: number[], db: number) => ({ w: dw, b: 0, dw, db, mag: dw.reduce((s, v) => s + v, db) });
    expect(changeFrac(d([0, 0], 0), 0.02)).toBe(0);
    const a = changeFrac(d([0.002, 0.002], 0.002), 0.02), b = changeFrac(d([0.004, 0.004], 0.004), 0.02);
    expect(a).toBeCloseTo(0.1, 9); expect(b).toBeCloseTo(2 * a, 9);
    expect(changeFrac(d([1, 1], 1), 0.02)).toBe(1);
  });
  it('solo destella la sección de la neurona que cambió, en proporción a su cambio', () => {
    const net = newTeam(3), obs = new ObservedModel(net), m = new BrainMeter(1);
    m.setModel(net);
    const deltas = obs.train([0.9, 0.2, 0.4], [1], LR);
    // dejamos que solo una neurona (la 2.ª del medio) «cambie» y comparamos con el Δ real de cada una
    const flat = deltas.flat();
    flat.forEach((d, i) => m.learned(i, changeFrac(d, LR)));
    flat.forEach((d, i) => expect(m.flash[i]).toBeCloseTo(Math.min(1, changeFrac(d, LR)), 9));
    // y ordenadas igual que sus cambios: más Δ, más destello
    const byMag = flat.map((d, i) => [d.mag, m.flash[i]]).sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < byMag.length; i++) expect(byMag[i][1]).toBeGreaterThanOrEqual(byMag[i - 1][1] - 1e-12);
    // una sola sección destella: las demás siguen en 0
    const m2 = new BrainMeter(4); m2.learned(2, 0.5);
    expect(m2.flash).toEqual([0, 0, 0.5, 0]);
  });
  it('se dibuja el destello solo en la sección de esa neurona, más fuerte con más cambio', () => {
    const m = new BrainMeter(4);
    m.learned(1, 0.3); m.learned(3, 0.9);
    const { ctx, flashes } = recCtx();
    m.draw(ctx, 200, 150, 1);
    expect(flashes).toHaveLength(2);                      // solo las secciones 1 y 3, en ese orden
    const alpha = (f: string): number => parseFloat(f.split(',')[3]);
    expect(alpha(flashes[1]) / alpha(flashes[0])).toBeCloseTo(3, 1);
  });
  it('los destellos se apagan solos, y con «menos movimiento» no hay destello', () => {
    const m = new BrainMeter(2); m.learned(0, 1);
    m.tick(0.3, false); expect(m.flash[0]).toBeLessThan(1); expect(m.flash[0]).toBeGreaterThan(0);
    m.tick(5, false); expect(m.flash[0]).toBe(0);
    m.learned(1, 1); m.tick(0.01, true); expect(m.flash[1]).toBe(0);
  });
  it('una sección fuera de rango se ignora', () => {
    const m = new BrainMeter(2); m.learned(5, 1); m.learned(-1, 1);
    expect(m.flash).toEqual([0, 0]);
  });
});
