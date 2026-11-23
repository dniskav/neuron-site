import { describe, expect, it } from 'vitest';
import { NetworkN } from '@dniskav/neuron';
import { NetworkView } from '../src/viz/NetworkView';
import { NeuronView } from '../src/viz/NeuronView';
import { layerLayout } from '../src/viz/geometry';
import { LOD, lodOf } from '../src/viz/lod';
import { countText, newNet, shortName } from '../src/data/colores';

const DESKTOP = { w: 600, h: 430 }, MOBILE = { w: 343, h: 214 };

function fakeCtx(): { ctx: CanvasRenderingContext2D; strokes: () => number } {
  const grad = { addColorStop: () => {} };
  let strokes = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'stroke') return () => { strokes++; };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, strokes: () => strokes };
}
const view = (n: number): NetworkView => new NetworkView(newNet(n), { rng: () => 0.5 }, layerLayout(n));
const lodAt = (n: number, c: { w: number; h: number }): string => { const nv = view(n); nv.fit(c.w, c.h); return nv.lodOfLayer(0); };

describe('LOD: los umbrales viven en un solo sitio', () => {
  it('elige el nivel según el espacio por neurona en píxeles', () => {
    expect(LOD.fullMin).toBe(32);
    expect(LOD.compactMin).toBe(14);
    expect(lodOf(80)).toBe('full');
    expect(lodOf(32)).toBe('full');
    expect(lodOf(31.9)).toBe('compact');
    expect(lodOf(14)).toBe('compact');
    expect(lodOf(13.9)).toBe('dots');
    expect(lodOf(0)).toBe('dots');
  });
  it('la histéresis evita el parpadeo en el borde', () => {
    expect(lodOf(31, 'full')).toBe('full');
    expect(lodOf(33, 'compact')).toBe('compact');
    expect(lodOf(15, 'dots')).toBe('dots');
    expect(lodOf(13, 'compact')).toBe('compact');
  });
  it('N = 3, 6, 10 y 16 nombres a 1280 px (lienzo ~600×430) y a 375 px (lienzo ~343×214, sin crecer)', () => {
    expect([3, 6, 10, 16].map((n) => lodAt(n, DESKTOP))).toEqual(['full', 'full', 'full', 'compact']);
    expect([3, 6, 10, 16].map((n) => lodAt(n, MOBILE))).toEqual(['full', 'full', 'compact', 'dots']);
  });
  it('con 3 nombres se ven completas también en móvil', () => {
    expect(lodAt(3, MOBILE)).toBe('full');
  });
  it('la transición entre niveles es suave: el detalle se acerca poco a poco', () => {
    const nv = view(16); nv.fit(DESKTOP.w, DESKTOP.h);
    const v = nv.layers[0][0];
    expect(v.lod).toBe('compact'); expect(v.detail).toBe(1);
    nv.fit(300, 175);
    expect(v.lod).toBe('dots');
    expect(v.detail).toBe(1);
    v.update(0.05);
    expect(v.detail).toBeLessThan(1); expect(v.detail).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) v.update(0.05);
    expect(v.detail).toBe(0);
  });
  it('una red nueva continúa la transición de la anterior (no vuelve a «completo»)', () => {
    const a = view(16); a.fit(MOBILE.w, MOBILE.h);
    for (let i = 0; i < 60; i++) a.update(0.05);
    const b = new NetworkView(newNet(16), {}, layerLayout(16), a);
    expect(b.layers[0][0].detail).toBe(0);
    expect(b.layers[0][0].full).toBe(0);
  });
});

describe('Una sola salida que se ramifica (redes con capas)', () => {
  it('también en el reparto por columnas de un NetworkN cualquiera', () => {
    const nv = new NetworkView(new NetworkN([3, 4, 5, 2]));
    expect(nv.trunk(0, 2).branches).toHaveLength(5);
    expect(nv.trunk(1, 0).branches).toHaveLength(2);
    expect(nv.trunk(2, 1).branches).toHaveLength(0);
  });
  it('con una sola neurona que escucha no hay tronco: la rama va directa (como en Equipo)', () => {
    const nv = new NetworkView(new NetworkN([3, 2, 1]));
    expect(nv.trunk(0, 0).axon).toHaveLength(0);
    expect(nv.trunk(0, 0).branches).toHaveLength(1);
  });
});

describe('Colores: las neuronas de nombre son neuronas reales', () => {
  it('hay N NeuronView, cada una con cuerpo, sus 3 ramas (rojo, verde, azul) y axón, y ninguna neurona central', () => {
    for (const n of [3, 6, 10, 16]) {
      const nv = view(n);
      expect(nv.layers).toHaveLength(1);
      expect(nv.layers[0]).toHaveLength(n);
      nv.layers[0].forEach((v, o) => {
        expect(v).toBeInstanceOf(NeuronView);
        expect(v.geom.dendrites).toHaveLength(3);
        expect(v.geom.axon.length).toBeGreaterThan(0);
        expect(v.bound).toBe(true);
        expect(v.wD).toEqual(nv.model.layers![0].neurons[o].weights);
      });
    }
  });
  it('el contador dice cuántas neuronas hay', () => {
    expect(countText(3)).toBe('3 neuronas, una por nombre');
    expect(countText(16)).toBe('16 neuronas, una por nombre');
  });
  it('las etiquetas cortas no se repiten entre los nombres', () => {
    const names = ['rojo', 'verde', 'azul', 'amarillo', 'naranja', 'morado', 'rosa', 'celeste', 'turquesa', 'verde lima', 'marrón', 'blanco', 'negro', 'gris', 'azul marino', 'lila'];
    expect(new Set(names.map(shortName)).size).toBe(names.length);
  });
});

describe('Todas las conexiones, en los tres niveles de detalle', () => {
  const sizes = [DESKTOP, MOBILE, { w: 300, h: 140 }];
  it('se dibujan 3·N conexiones, en completo, compacto y puntos', () => {
    const seen = new Set<string>();
    for (const n of [3, 6, 10, 16]) {
      for (const c of sizes) {
        const nv = view(n), { ctx, strokes } = fakeCtx();
        nv.fit(c.w, c.h);
        seen.add(nv.lodOfLayer(0));
        const s0 = strokes();
        expect(nv.drawConnections(ctx)).toBe(3 * n);
        expect(strokes() - s0).toBeGreaterThanOrEqual(3 * n);
      }
    }
    expect([...seen].sort()).toEqual(['compact', 'dots', 'full']);
  });
  it('también durante la transición (detalle a medias)', () => {
    const nv = view(16), { ctx } = fakeCtx();
    nv.fit(DESKTOP.w, DESKTOP.h); nv.fit(300, 140); nv.update(0.05);
    expect(nv.layers[0][0].detail).toBeGreaterThan(0); expect(nv.layers[0][0].detail).toBeLessThan(1);
    expect(nv.drawConnections(ctx)).toBe(3 * 16);
  });
  it('en cada nivel la conexión sigue su peso: con más |w| se ve más gruesa o más opaca, y la negativa va cortada', () => {
    for (const c of [DESKTOP, { w: 300, h: 140 }]) {
      const nv = view(3); nv.fit(c.w, c.h);
      const v = nv.layers[0][0];
      v.sync(true, [0.2, 0.2, 0.2], 0); const a = widths(v);
      v.sync(true, [12, 12, 12], 0); const b = widths(v);
      expect(b.maxWidth).toBeGreaterThan(a.maxWidth);
      v.sync(true, [-12, -12, -12], 0);
      expect(widths(v).dashed).toBeGreaterThan(0);
      expect(a.dashed).toBe(0);
    }
  });
  it('la corrección y la respuesta recorren el axón y las 3 ramas de cada neurona', () => {
    const nv = view(4), { ctx } = fakeCtx();
    nv.fit(DESKTOP.w, DESKTOP.h);
    const d = nv.observed.train([0.3, 0.6, 0.2], [0, 1, 0, 0], 0.02);
    nv.layers[0].forEach((v, o) => { v.drawOutput(ctx, 0.5, 1, 0.5); v.drawCorrection(ctx, 0.2, d[0][o], { axon: [0, 0.3], dendrites: [0.3, 1], ref: 0.02 }); v.drawCorrection(ctx, 0.6, d[0][o], { axon: [0, 0.3], dendrites: [0.3, 1], ref: 0.02 }); });
  });
});

/** Mide lo que dibuja `drawWires`: grosor máximo y cuántos trazos son cortados. */
function widths(v: NeuronView): { maxWidth: number; dashed: number } {
  let maxWidth = 0, dashed = 0;
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'setLineDash') return () => {};
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k: string, val) { if (k === 'lineWidth') maxWidth = Math.max(maxWidth, val as number); t[k] = val; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const before = v.geom.dendrites[0].pts.length;
  /* trazos por dendrita: un peso negativo salta tramos, así que dibuja menos segmentos */
  let segs = 0;
  const counting = new Proxy(ctx as unknown as Record<string, unknown>, {
    get(t, k: string) { if (k === 'lineTo') return () => { segs++; }; return (t as Record<string, unknown>)[k]; },
    set(t, k: string, val) { (t as Record<string, unknown>)[k] = val; return true; },
  }) as unknown as CanvasRenderingContext2D;
  v.drawWires(counting);
  const full = (before - 1) * 3 * (v.geom.dendrites.length);
  dashed = segs < full ? 1 : 0;
  return { maxWidth, dashed };
}

describe('Las neuronas de nombre se ven como neuronas', () => {
  it('con pocos nombres su cuerpo es al menos el 70 % del de la neurona de Enséñale (44) y caben en el lienzo', () => {
    for (const n of [3, 4, 6]) {
      const L = layerLayout(n);
      L.neurons[0].forEach((g) => {
        expect(g.body.r).toBeGreaterThanOrEqual(0.7 * 44);
        expect(g.body.y - g.body.r).toBeGreaterThanOrEqual(0);
        expect(g.body.y + g.body.r).toBeLessThanOrEqual(L.size.h);
        expect(g.terminal[0]).toBeLessThan(L.size.w - 150);
      });
    }
    for (const n of [3, 10, 16]) layerLayout(n).neurons[0].forEach((g) => expect(g.body.y + g.body.r).toBeLessThanOrEqual(420));
  });
  it('las tres entradas son las mismas para todas: comparten sus puntas', () => {
    const L = layerLayout(6).neurons[0];
    L.forEach((g) => g.dendrites.forEach((d, i) => expect(d.tip).toEqual(L[0].dendrites[i].tip)));
  });
  it('deja margen arriba y abajo para las etiquetas (N = 3, 6, 10, 13, 16)', () => {
    for (const n of [3, 6, 10, 13, 16]) {
      const L = layerLayout(n), ys = L.neurons[0].map((g) => g.body.y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(24);
      expect(Math.max(...ys)).toBeLessThanOrEqual(L.size.h - 24);
      L.neurons[0].forEach((g) => expect(g.terminal[0] + 160).toBeLessThanOrEqual(L.size.w + 40));
    }
  });
});
