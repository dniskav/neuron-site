import { describe, expect, it } from 'vitest';
import { NetworkN, NeuronN } from '@dniskav/neuron';
import { NetworkView } from '../src/viz/NetworkView';
import { NeuronView, sourceOf } from '../src/viz/NeuronView';
import { ObservedModel, snapshot, diff } from '../src/viz/observe';
import { threeInputGeometry } from '../src/viz/geometry';
import { newNeuron } from '../src/data/ensenale';
import { seededRandom, withRandom } from '@dniskav/neuron';

describe('observe: Δw y Δb por neurona', () => {
  it('un azul puro solo cambia el peso azul (y el sesgo)', () => {
    const n = newNeuron();
    const obs = new ObservedModel(n);
    const [[d]] = obs.train([0, 0, 1], 1, 0.5);
    expect(d.dw[0]).toBe(0);
    expect(d.dw[1]).toBe(0);
    expect(d.dw[2]).toBeGreaterThan(0);
    expect(d.db).toBeGreaterThan(0);
    expect(d.mag).toBeCloseTo(d.dw[2] + d.db, 12);
  });
  it('lee el modelo real: los pesos nuevos del Δ son los de la neurona', () => {
    const n = newNeuron();
    const obs = new ObservedModel(n);
    const [[d]] = obs.train([0.9, 0.1, 0.2], 1, 0.5);
    expect(d.w).toEqual(n.weights);
    expect(d.b).toBe(n.bias);
  });
  it('un rojo puro solo cambia el peso rojo', () => {
    const n = newNeuron();
    const [[d]] = new ObservedModel(n).train([1, 0, 0], 0, 0.5);
    expect(d.dw[1]).toBe(0);
    expect(d.dw[2]).toBe(0);
    expect(d.dw[0]).toBeGreaterThan(0);
  });
  it('con una red real devuelve un Δ por neurona y capa', () => {
    const net = new NetworkN([3, 2, 1]);
    const d = new ObservedModel(net).train([0.2, 0.5, 0.9], [1], 0.1);
    expect(d.map((l) => l.length)).toEqual([2, 1]);
    expect(d[0][0].dw).toHaveLength(3);
    expect(d[1][0].dw).toHaveLength(2);
  });
  it('diff compara dos fotos', () => {
    const n = new NeuronN(2);
    const a = snapshot(n);
    n.weights[0] += 0.25;
    const [[d]] = diff(a, snapshot(n));
    expect(d.dw[0]).toBeCloseTo(0.25, 12);
    expect(d.dw[1]).toBe(0);
  });
});

describe('NeuronView', () => {
  it('el pulso de cada dendrita es proporcional a su |Δw|: azul puro, solo la azul', () => {
    const n = newNeuron();
    const v = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
    v.bind(sourceOf(n));
    const [[d]] = new ObservedModel(n).train([0, 0, 1], 1, 0.5);
    const p = v.pulseOf(d);
    expect(p.dendrites[0]).toBe(0);
    expect(p.dendrites[1]).toBe(0);
    expect(p.dendrites[2]).toBeGreaterThan(0);
    expect(p.axon).toBeGreaterThan(0);
  });
  it('una dendrita con el doble de cambio pulsa el doble (por debajo del tope)', () => {
    const v = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
    const p = v.pulseOf({ w: [0, 0, 0], b: 0, dw: [0.02, 0.04, 0], db: 0, mag: 0.06 });
    expect(p.dendrites[1]).toBeCloseTo(2 * p.dendrites[0], 12);
  });
  it('celebra al aprender en proporción a su propio Δ', () => {
    const mk = () => new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry(), { rng: () => 0.5 });
    const a = mk(), b = mk();
    const sa = a.learn({ w: [0, 0, 0], b: 0, dw: [0.05, 0, 0], db: 0, mag: 0.05 });
    const sb = b.learn({ w: [0, 0, 0], b: 0, dw: [0.2, 0, 0], db: 0, mag: 0.2 });
    expect(sa).toBeCloseTo(0.1, 12);
    expect(sb).toBeCloseTo(0.4, 12);
    expect(a.celebration.active).toBe(1);
    expect(b.celebration.pop()).toBeGreaterThanOrEqual(1);
  });
  it('un cambio mínimo no celebra', () => {
    const v = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
    v.learn({ w: [0, 0, 0], b: 0, dw: [0.001, 0, 0], db: 0, mag: 0.001 });
    expect(v.celebration.active).toBe(0);
  });
  it('los pesos mostrados se acercan a los reales con inercia', () => {
    const n = newNeuron();
    const v = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
    v.bind(sourceOf(n));
    expect(v.wD).toEqual(n.weights);
    const [[d]] = new ObservedModel(n).train([1, 0, 0], 1, 0.5);
    v.learn(d);
    const before = v.wD![0];
    v.update(0.05);
    expect(v.wD![0]).toBeGreaterThan(before);
    expect(v.wD![0]).toBeLessThan(n.weights[0]);
    for (let i = 0; i < 200; i++) v.update(0.05);
    expect(v.wD![0]).toBeCloseTo(n.weights[0], 6);
  });
  it('responder suma Σ w·x con los pesos reales', () => {
    const n = newNeuron();
    const v = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
    v.bind(sourceOf(n));
    const z = v.respond([1, 0, 0], n.predict([1, 0, 0]));
    expect(z).toBeCloseTo(n.weights[0], 12);
    expect(v.level.a).toBeGreaterThan(0);
  });
});

describe('NetworkView', () => {
  it('una NeuronN crea una NeuronView con 3 dendritas', () => {
    const nv = new NetworkView(newNeuron());
    expect(nv.layers.map((l) => l.length)).toEqual([1]);
    expect(nv.single.geom.dendrites).toHaveLength(3);
  });
  it('un NetworkN([3,2,1]) crea una NeuronView por neurona real', () => {
    const net = new NetworkN([3, 2, 1]);
    const nv = new NetworkView(net);
    expect(nv.layers.map((l) => l.length)).toEqual([2, 1]);
    expect(nv.layers[0][1].geom.dendrites).toHaveLength(3);
    expect(nv.layers[1][0].geom.dendrites).toHaveLength(2);
    expect(nv.layers[0][0].wD).toEqual(net.layers[0].neurons[0].weights);
  });
  it('cada neurona celebra según SU Δ: ninguna aprende en silencio', () => {
    withRandom(seededRandom(3), () => {
      const net = new NetworkN([3, 3, 1]);
      const nv = new NetworkView(net, { rng: () => 0.5 });
      const deltas = nv.train([0.9, 0.1, 0.4], [1], 0.5);
      deltas.forEach((layer, li) => layer.forEach((d, ni) => {
        const v = nv.layers[li][ni];
        expect(v.lastStrength).toBeCloseTo(Math.min(1, d.mag / 0.5), 12);
        if (v.lastStrength >= 0.03) expect(v.celebration.active).toBe(1);
      }));
      expect(nv.neurons.filter((v) => v.celebration.active > 0).length).toBeGreaterThan(1);
    });
  });
  it('respond usa el predict real de cada neurona', () => {
    const net = new NetworkN([3, 2, 1]);
    const nv = new NetworkView(net);
    const out = nv.respond([0.3, 0.6, 0.9]);
    expect(out[0]).toBeCloseTo(net.predict([0.3, 0.6, 0.9])[0], 12);
  });
});
