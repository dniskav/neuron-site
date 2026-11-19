import { describe, expect, it } from 'vitest';
import { Adam, NetworkN, seededRandom, setRandom } from '@dniskav/neuron';
import { EPOCHS, EXAM, FULLN, LR, NTRAIN, TRAIN, flatOf, labelOf, newTeam, runTeam, snapNet, specTags, trainPass, zoneOf } from '../src/data/equipo';
import { brainText, newTeamCodeState, rawText, verdictOf } from '../src/data/equipoCode';
import { NetworkView } from '../src/viz/NetworkView';
import { teamLayout } from '../src/viz/geometry';
import type { NeuronViewOptions } from '../src/viz/NeuronView';

/** Valores calculados ejecutando la lógica del prototipo (reference/prototype-v3.html, sección #equipo) con @dniskav/neuron 0.5.1 en node. */
const PROTO: Record<number, { pct: number; yes: number; flat: number[]; w0: number[][]; tags: string[] }> = {
  1: {
    pct: 67, yes: 0,
    flat: [0.6544708104950168, -0.6544323893484106, 0.3431067679852871, -0.9851425583303183],
    w0: [[0.25429598578598306, -0.5327070516292943, -0.05058489876513489, 0]], tags: [],
  },
  2: {
    pct: 100, yes: 4,
    flat: [-6.533632114845942, -18.032497096885564, -1.2774184520138079, 7.652526466925064, 3.5937295265191826, 8.36145319947752, 1.569335826697826, -8.827667138260628, -15.743593843720207, -14.014110017446102, 6.256199208554448],
    w0: [[0.25429598578598306, -0.5327070516292943, -0.05058489876513489, 0], [-0.49083085610738675, 0.30369246523560933, -0.021730981678683387, 0], [-0.018767215547198457, -0.47828622550817995, 0]],
    tags: ['osc', 'cla'],
  },
  3: {
    pct: 100, yes: 4,
    flat: [-6.351336804977638, -17.170583644977405, -1.2873922916580938, 8.080010882850258, 3.041860856377121, 7.81263034116058, 1.220809062287107, -7.675704735425891, -3.060471362853242, -4.9598869007414415, -1.0999307379888328, 5.7195510805234475, -18.08594394006509, -11.838094528020079, 8.842141159641068, 1.7196680969533082],
    w0: [[0.25429598578598306, -0.5327070516292943, -0.05058489876513489, 0], [-0.49083085610738675, 0.30369246523560933, -0.021730981678683387, 0], [-0.0153233673278212, -0.3905190678322562, -0.2733681144023007, 0], [0.060745590517088936, -0.35228036828114245, -0.4808255237074429, 0]],
    tags: ['osc', 'cla', 'noc'],
  },
};

describe('Equipo: datos deterministas', () => {
  it('60 colores de aprendizaje (20 de cada zona) y 12 de examen (4 de cada zona), a 2 decimales', () => {
    expect(TRAIN).toHaveLength(NTRAIN);
    expect(EXAM).toHaveLength(12);
    for (const z of [0, 1, 2]) {
      expect(TRAIN.filter((c) => zoneOf(c) === z)).toHaveLength(20);
      expect(EXAM.filter((c) => zoneOf(c) === z)).toHaveLength(4);
    }
    expect(TRAIN[0]).toEqual([0.01, 0.06, 0.98]);
    expect(TRAIN[59]).toEqual([0.17, 0.24, 0.2]);
    expect(EXAM[0]).toEqual([0.72, 0.46, 0.91]);
    for (const c of [...TRAIN, ...EXAM]) for (const v of c) expect(Math.round(v * 100) / 100).toBe(v);
  });
  it('el examen acierta 8 de 12 diciendo «no» a todo', () => {
    expect(EXAM.filter((c) => !labelOf(c))).toHaveLength(8);
  });
  for (const k of [1, 2, 3]) {
    it(`el equipo de ${k} nace con los pesos del prototipo y sesgo 0`, () => {
      expect(snapNet(newTeam(k)).map((n) => [...n.w, n.b])).toEqual(PROTO[k].w0);
    });
  }
});

describe('Equipo: paridad con el prototipo', () => {
  for (const k of [1, 2, 3]) {
    it(`${k} neurona(s): ${PROTO[k].pct} % del examen, y los pesos del prototipo`, () => {
      const r = runTeam(k);
      expect(r.pct).toBe(PROTO[k].pct);
      expect(r.yes).toBe(PROTO[k].yes);
      const real = snapNet(r.net).flatMap((n) => [...n.w, n.b]);
      real.forEach((v, i) => expect(v).toBeCloseTo(PROTO[k].flat[i], 9));
      expect(r.tags.map((t) => t.tag)).toEqual(PROTO[k].tags);
    });
  }
  it('k=1 → 67 %, k=2 → 100 %, k=3 → 100 %', () => {
    expect([1, 2, 3].map((k) => runTeam(k).pct)).toEqual([67, 100, 100]);
  });
  it('las etiquetas de especialización se miden en el examen (k=2: oscuros y claros, 4/4)', () => {
    const t = runTeam(2).tags;
    expect(t[0]).toEqual({ tag: 'osc', f: [4, 0, 0] });
    expect(t[1]).toEqual({ tag: 'cla', f: [0, 0, 4] });
    expect(runTeam(3).tags[2]).toEqual({ tag: 'noc', f: [4, 4, 0] });
  });
});

/** Ejecuta el código que muestra el panel </> y devuelve lo que imprime. */
function runSnippet(code: string): string {
  const body = code.replace(/^import .*$/m, '');
  const out: string[] = [];
  new Function('NetworkN', 'Adam', 'setRandom', 'seededRandom', 'console', body)(NetworkN, Adam, setRandom, seededRandom, { log: (s: string) => out.push(String(s)) });
  return out.join('\n');
}

describe('Equipo: el panel </>', () => {
  for (const k of [1, 2, 3]) {
    it(`el código de ${k} neurona(s) compila y reproduce ${PROTO[k].pct} %`, () => {
      const cs = { ...newTeamCodeState(), k, trained: true };
      expect(runSnippet(rawText(cs))).toBe(PROTO[k].pct + ' %');
    });
  }
  it('sin enseñarle nada imprime lo que acierta sin entrenar y no tiene bucle de aprendizaje con datos', () => {
    const cs = { ...newTeamCodeState(), k: 2, trained: false };
    const txt = rawText(cs);
    expect(txt).toContain('const ejemplos = [];');
    expect(runSnippet(txt)).toMatch(/^\d+ %$/);
  });
  it('el código con un color tuyo también compila', () => {
    const cs = { ...newTeamCodeState(), k: 2, trained: true, probe: [0.5, 0.5, 0.5] };
    expect(() => runSnippet(rawText(cs))).not.toThrow();
  });
  it('lo aprendido (panel del cerebro) se puede poner en una red nueva y da el mismo veredicto', () => {
    for (const k of [1, 2, 3]) {
      const r = runTeam(k);
      const txt = brainText(k, r.flat, verdictOf(k, r.flat), true);
      const out: string[] = [];
      const body = txt.replace(/^import .*$/m, '').replace(/^red\.predict(.*)$/m, (_m, rest) => 'console.log(red.predict' + rest.replace(/;?\s*\/\/.*$/, '') + ');');
      new Function('NetworkN', 'console', body)(NetworkN, { log: (s: string) => out.push(String(s)) });
      expect(out[0]).toBe(verdictOf(k, r.flat));
    }
  });
});

const opts = (_k: number) => (_l: number, n: number, last: boolean): NeuronViewOptions => ({ rng: () => 0.5, lineLabel: last, bulb: last, phase: last ? 0 : n, vocab: { idle: '¿intermedio?' } });

describe('Equipo: cada neurona aprende y se ve aprender', () => {
  it('en k=2, durante el entrenamiento, las neuronas del medio reciben deltas > 0 y celebran', () => {
    const net = newTeam(2);
    const nv = new NetworkView(net, opts(2), teamLayout(2));
    const celebrated = [0, 0];
    for (let i = 0; i < FULLN + 8; i++) {
      const c = TRAIN[i];
      const d = nv.observed.train(c, [labelOf(c)], LR);
      expect(d.map((l) => l.length)).toEqual([2, 1]);
      d[0].forEach((dn, j) => {
        expect(dn.mag).toBeGreaterThan(0);
        expect(dn.dw.some((x) => x > 0)).toBe(true);
        const v = nv.layers[0][j];
        v.celebration.reset();
        v.learn(dn, { ref: LR });
        expect(v.lastStrength).toBeGreaterThan(0.03);
        if (v.celebration.active > 0) celebrated[j]++;
        for (let s = 0; s < 40; s++) v.update(0.05);
      });
      nv.layers[1][0].learn(d[1][0], { ref: LR });
    }
    expect(celebrated[0]).toBeGreaterThan(0);
    expect(celebrated[1]).toBeGreaterThan(0);
  });
  it('en un repaso, cada neurona recibe SU cambio (distinto del de las demás)', () => {
    const net = newTeam(3);
    const nv = new NetworkView(net, opts(3), teamLayout(3));
    trainPass(net);
    const d = nv.observed.poll();
    const mags = d[0].map((x) => x.mag);
    expect(new Set(mags.map((m) => m.toFixed(6))).size).toBe(3);
    d.forEach((layer, li) => layer.forEach((dn, ni) => {
      const v = nv.layers[li][ni];
      v.learn(dn, { ref: 2 });
      expect(v.lastStrength).toBeCloseTo(Math.min(1, 1.5 * v.changeOf(dn, 2)), 12);
      expect(v.celebration.active).toBe(1);
    }));
  });
  it('el diseño del equipo: k=1 una neurona; k>=2 las del medio comparten las tres entradas y la última tiene una dendrita por cada una', () => {
    expect(teamLayout(1).neurons.map((l) => l.length)).toEqual([1]);
    for (const k of [2, 3]) {
      const L = teamLayout(k);
      expect(L.neurons.map((l) => l.length)).toEqual([k, 1]);
      L.neurons[0].forEach((g) => expect(g.dendrites).toHaveLength(3));
      expect(L.neurons[1][0].dendrites).toHaveLength(k);
      expect(L.neurons[1][0].axon.length).toBeGreaterThan(0);
      expect(L.neurons[0][0].axon).toHaveLength(0);
      expect(L.neurons[0].filter((g) => g.origin)).toHaveLength(1);
    }
  });
  it('flatOf aplana por neurona: pesos y sesgo', () => {
    const net = newTeam(2);
    expect(flatOf(snapNet(net))).toHaveLength(11);
    expect(EPOCHS).toBe(200);
  });
});

describe('Equipo: dibujo (contexto falso)', () => {
  it('dibuja cables, viaje, relevo, corrección y frentes de k=1, 2 y 3 sin errores', () => {
    const grad = { addColorStop: () => {} };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) {
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
        if (k === 'measureText') return () => ({ width: 10 });
        if (k in t) return t[k];
        return () => {};
      },
      set(t, k: string, v) { t[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    for (const k of [1, 2, 3]) {
      const net = newTeam(k), nv = new NetworkView(net, opts(k), teamLayout(k));
      nv.fit(800, 500);
      const c = TRAIN[3];
      const d = nv.observed.train(c, [labelOf(c)], LR);
      nv.layers.forEach((layer, li) => layer.forEach((v, ni) => { v.respond(c, 0.5); v.learn(d[li][ni], { ref: LR }); v.update(0.05); }));
      const F = nv.layers[nv.layers.length - 1][0];
      nv.neurons.forEach((v) => v.drawWires(ctx));
      nv.layers[0].forEach((v) => { v.drawInput(ctx, c, 0.1); v.drawInput(ctx, c, 0.8); });
      F.drawRelay(ctx, [0.2, 0.9, 0.5], 0.5);
      F.drawOutput(ctx, 0.7, 1, 0.5);
      F.drawCorrection(ctx, 0.2, d[nv.layers.length - 1][0], { axon: [0, 0.25], dendrites: [0.25, 0.6], ref: LR });
      nv.layers[0].forEach((v, j) => v.drawCorrection(ctx, 0.8, d[0][j], { dendrites: [0.6, 1], ref: LR }));
      nv.neurons.forEach((v) => { v.drawBody(ctx, 1); v.drawFront(ctx); });
      expect(specTags(net)).toHaveLength(k === 1 ? 0 : k);
    }
  });
});
