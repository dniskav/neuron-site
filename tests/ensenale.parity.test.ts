import { describe, expect, it } from 'vitest';
import { NeuronN } from '@dniskav/neuron';
import { ALL, EXAM, SIZES, labelOf, newNeuron, runSet } from '../src/data/ensenale';
import { buildLines, newCodeState, rawText, brainText, verdictOf } from '../src/data/ensenaleCode';

/** Valores calculados ejecutando la lógica del prototipo (reference/prototype-v3.html) con @dniskav/neuron 0.5.1. */
const PROTO: Record<number, { pct: number; w: number[]; b: number }> = {
  0: { pct: 58, w: [0.489, -0.193, -0.321], b: 0 },
  2: { pct: 50, w: [1.3390922049080125, 0.19228765621214242, 0.28646473788635884], b: 0.8586789948565784 },
  3: { pct: 67, w: [2.039446396151839, 0.07491482234230741, -0.378591478703814], b: -0.5032963303713723 },
  5: { pct: 75, w: [2.1627641802365103, 0.5327714762749474, -0.34970026581746083], b: -0.26468922244496373 },
  8: { pct: 83, w: [2.2126694205477806, 0.8356197359247783, 0.19049039896062805], b: -1.1043388873829763 },
  13: { pct: 92, w: [2.6142353302578707, 1.8009472389137435, 0.7599926502469667], b: -2.3813733977124043 },
  21: { pct: 100, w: [1.6058302380232288, 3.9803454512517047, 1.2695958059230192], b: -2.7831648006180854 },
  34: { pct: 100, w: [1.5301112171199496, 5.943546841383305, 0.6767035843098771], b: -3.511262945211788 },
};

describe('datos deterministas', () => {
  it('34 colores de aprendizaje y 12 de examen, a 2 decimales', () => {
    expect(ALL).toHaveLength(34);
    expect(EXAM).toHaveLength(12);
    expect(ALL[0]).toEqual([0.99, 0.41, 0.78]);
    expect(EXAM[0]).toEqual([0.69, 0.77, 0.22]);
    for (const c of [...ALL, ...EXAM]) for (const v of c) expect(Math.round(v * 100) / 100).toBe(v);
  });
  it('el examen está equilibrado: 6 claros y 6 oscuros', () => {
    expect(EXAM.filter(labelOf)).toHaveLength(6);
  });
  it('la neurona nueva nace siempre con los mismos pesos y sesgo 0', () => {
    expect(newNeuron().weights).toEqual([0.489, -0.193, -0.321]);
    expect(newNeuron().bias).toBe(0);
  });
});

describe('Enséñale: paridad con el prototipo', () => {
  for (const k of [0, ...SIZES]) {
    it(`conjunto ${k}: ${PROTO[k].pct} % del examen y los pesos del prototipo`, () => {
      const r = runSet(k);
      expect(r.pct).toBe(PROTO[k].pct);
      r.w.forEach((v, i) => expect(v).toBeCloseTo(PROTO[k].w[i], 10));
      expect(r.b).toBeCloseTo(PROTO[k].b, 10);
    });
  }
  it('los pesos finales del conjunto 34 coinciden', () => {
    const r = runSet(34);
    expect(r.w[0]).toBeCloseTo(1.5301112171199496, 10);
    expect(r.w[1]).toBeCloseTo(5.943546841383305, 10);
    expect(r.w[2]).toBeCloseTo(0.6767035843098771, 10);
    expect(r.b).toBeCloseTo(-3.511262945211788, 10);
  });
});

/** Ejecuta el código que muestra el panel </> y devuelve lo que imprime. */
function runSnippet(code: string): string {
  const body = code.replace(/^import .*$/m, '');
  const out: string[] = [];
  new Function('NeuronN', 'console', body)(NeuronN, { log: (s: string) => out.push(String(s)) });
  return out.join('\n');
}

describe('el código del panel </> compila y reproduce los porcentajes', () => {
  for (const k of [0, ...SIZES]) {
    it(`conjunto ${k}`, () => {
      const cs = newCodeState();
      cs.k = k;
      cs.w0 = newNeuron().weights;
      const code = rawText(cs);
      expect(code.startsWith('import { NeuronN } from "@dniskav/neuron";')).toBe(true);
      expect(runSnippet(code)).toBe(PROTO[k].pct + ' %');
    });
  }
  it('con un color propio sigue compilando', () => {
    const cs = newCodeState();
    cs.k = 5; cs.w0 = newNeuron().weights; cs.probe = [0.96, 0.84, 0.26];
    expect(rawText(cs)).toContain('const tuyo = neurona.predict([0.96, 0.84, 0.26])');
    expect(runSnippet(rawText(cs))).toBe('75 %');
  });
  it('las listas largas se pliegan pero el texto copiable las trae completas', () => {
    const cs = newCodeState();
    cs.k = 34;
    const lines = buildLines(cs);
    expect(lines.filter((l) => l.hid).length).toBe(34 - 3 + (12 - 3));
    expect(rawText(cs)).toContain('const ejemplos = [');
    expect(rawText(cs).split('\n').filter((l) => l.startsWith('  { r:')).length).toBe(34 + 12);
  });
  it('el texto del cerebro es código válido y dice lo mismo que el modelo', () => {
    const r = runSet(34);
    const txt = brainText(34, r.w, r.b, verdictOf(r.w, r.b));
    expect(txt).toContain('sesgo: -3.5113');
    expect(txt).toContain('// → claro');
  });
});
