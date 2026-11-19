import { describe, expect, it, vi } from 'vitest';
import { NetworkN } from '@dniskav/neuron';
import { NetworkView } from '../src/viz/NetworkView';
import { Flask } from '../src/viz/Flask';
import { newNeuron } from '../src/data/ensenale';

/** Contexto 2D falso: acepta cualquier llamada y cuenta los trazos (sirve para cazar errores de ejecución al dibujar). */
function fakeCtx(): CanvasRenderingContext2D {
  const calls: Record<string, number> = {};
  const grad = { addColorStop: () => {} };
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, k: string) {
      if (k === '__calls') return calls;
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return (..._a: unknown[]) => { calls[k] = (calls[k] || 0) + 1; };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

describe('dibujo (contexto falso)', () => {
  it('NetworkView de una NeuronN dibuja cables, viaje, corrección, cuerpo y frente', () => {
    const net = newNeuron();
    const nv = new NetworkView(net, { rng: () => 0.5 });
    const v = nv.single, ctx = fakeCtx();
    v.scale = 1;
    v.showSample([0.9, 0.2, 0.4]);
    const p = net.predict([0.9, 0.2, 0.4]);
    v.respond([0.9, 0.2, 0.4], p);
    v.answer({ a: 1, p, ok: true, era: 1, hold: 2 });
    const [[d]] = nv.observed.train([0.9, 0.2, 0.4], 1, 0.5).map((l) => l);
    v.learn(d);
    for (let i = 0; i < 5; i++) {
      v.update(0.05);
      v.drawWires(ctx); v.drawInput(ctx, [0.9, 0.2, 0.4], 0.2 * i); v.drawInput(ctx, [0.9, 0.2, 0.4], 0.8);
      v.drawOutput(ctx, p, 1, 0.5); v.drawCorrection(ctx, 0.2, d); v.drawCorrection(ctx, 0.7, d);
      v.drawBody(ctx, i); v.drawFront(ctx);
    }
    expect((ctx as any).__calls.stroke).toBeGreaterThan(10);
  });
  it('una neurona sin modelo también se dibuja (estado inicial)', () => {
    const nv = new NetworkView(newNeuron());
    nv.single.bind(null);
    const ctx = fakeCtx();
    nv.single.drawWires(ctx); nv.single.drawBody(ctx, 0); nv.single.drawFront(ctx);
  });
  it('NetworkView de un NetworkN([3,3,1]) dibuja todas las neuronas', () => {
    const nv = new NetworkView(new NetworkN([3, 3, 1]));
    const ctx = fakeCtx();
    nv.respond([0.1, 0.5, 0.9]);
    nv.train([0.1, 0.5, 0.9], [1], 0.2);
    nv.update(0.05);
    nv.draw(ctx, 640, 420, 1);
    expect(nv.neurons).toHaveLength(4);
  });
  it('el frasco se dibuja', () => {
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} });
    const f = new Flask();
    f.ease(0.75, 0.5, false);
    f.draw(fakeCtx(), 200, 260, 1, '75%');
    f.lv = 0;
    f.draw(fakeCtx(), 200, 260, 1, '?');
    vi.unstubAllGlobals();
  });
});
