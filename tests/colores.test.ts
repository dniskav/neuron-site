import { describe, expect, it } from 'vitest';
import { Adam, NetworkN, seededRandom, setRandom } from '@dniskav/neuron';
import {
  COLORS, EPOCHS, LIGHT_LEVELS, LR, MAX_OUT, N0, NAMES, NH, PER, PER_DEFAULT, RING_COLORS, DOUBT_TEXT, hslToRgb, argmax, countText, dullPhrase, examSet, growNetwork, judge, lightActs, lightTrend, nameIndexOf, examFastPlan, knownColors,
  namePhrase, neuronPhrase, newNet, quickSamples, paramCount, ringActs, ringNames, ringPhrase, runSet, score, sampleOf, trainSet, verdictText,
} from '../src/data/colores';
import { brainText, newColoresCodeState, rawText, verdictOf } from '../src/data/coloresCode';
import { flatOf, snapNet } from '../src/data/equipo';
import { NetworkView } from '../src/viz/NetworkView';
import { layerLayout } from '../src/viz/geometry';
import { ringSvg } from '../src/viz/Ring';

describe('Colores: datos deterministas', () => {
  it('la capa empieza con 3 nombres y crece en el orden de la lista', () => {
    expect(N0).toBe(3);
    expect(NAMES.slice(0, 3)).toEqual(['rojo', 'verde', 'azul']);
    expect(MAX_OUT).toBe(COLORS.length);
  });
  it('la lista tiene los 16 nombres verificados, en su orden', () => {
    expect(NAMES).toEqual(['rojo', 'verde', 'azul', 'amarillo', 'naranja', 'morado', 'rosa', 'celeste', 'turquesa', 'verde lima', 'marrón', 'blanco', 'negro', 'gris', 'azul marino', 'lila']);
    expect(PER_DEFAULT).toBe(13);
    expect(EPOCHS).toBe(100);
    expect(LR).toBe(0.05);
  });
  it('cada nombre de la lista es el de sus propios ejemplos (salvo algún borde)', () => {
    const ex = examSet(MAX_OUT), good = ex.filter((e) => nameIndexOf(e.c) === e.y).length;
    expect(good / ex.length).toBeGreaterThan(0.97);
  });
  it('los conjuntos son de per·n ejemplos solo de los nombres que la red ya tiene', () => {
    expect(PER.map((p) => trainSet(p, 6).length)).toEqual([6, 18, 30, 48, 78, 126]);
    expect(PER.map((p) => trainSet(p, 3).length)).toEqual([3, 9, 15, 24, 39, 63]);
    expect(new Set(trainSet(21, 3).map((e) => e.y))).toEqual(new Set([0, 1, 2]));
    expect(trainSet(21, 4)).toBe(trainSet(21, 4));
  });
  it('el examen fijo tiene 12 colores por nombre, a 2 decimales', () => {
    expect(examSet(6)).toHaveLength(72);
    expect(examSet(3)).toHaveLength(36);
    for (const e of examSet(6)) for (const v of e.c) expect(Math.round(v * 100) / 100).toBe(v);
    expect(JSON.stringify(examSet(6).slice(0, 3))).toBe(JSON.stringify(examSet(6).slice(0, 3)));
  });
  it('los ejemplos de un nombre no cambian cuando la red gana otros', () => {
    const a = trainSet(8, 3).filter((e) => e.y === 1).map((e) => e.c), b = trainSet(8, 6).filter((e) => e.y === 1).map((e) => e.c);
    expect(b).toEqual(a);
  });
  it('el total de números es 4·n: 3 pesos y el sesgo de cada neurona', () => {
    expect(paramCount(3)).toBe(12);
    expect(paramCount(16)).toBe(64);
    expect(flatOf(snapNet(newNet(4)))).toHaveLength(paramCount(4));
  });
  it('el modelo es UNA capa: NetworkN([3, n]), sin capa oculta', () => {
    for (const n of [3, 8, 16]) expect(newNet(n).structure).toEqual([3, n]);
    expect(newNet(5).layers).toHaveLength(1);
  });
  it('el contador dice cuántas neuronas hay, una por nombre', () => {
    expect(countText(3)).toBe('3 neuronas, una por nombre');
    expect(countText(16)).toBe('16 neuronas, una por nombre');
  });
});

describe('Colores: aprende (semilla fija)', () => {
  it('con 3 nombres acierta al menos el 95 %', () => {
    expect(runSet(3, PER_DEFAULT).pct).toBeGreaterThanOrEqual(95);
  });
  it('con los 16 nombres y 13 por nombre acierta al menos el 95 %', () => {
    expect(runSet(MAX_OUT, PER_DEFAULT).pct).toBeGreaterThanOrEqual(95);
  });
  it('entrena de verdad: sin enseñarle acierta mucho menos', () => {
    const net = newNet(MAX_OUT);
    expect(score(net, MAX_OUT).pct).toBeLessThan(40);
  });
  it('entrenar tarda poco', () => {
    const t = Date.now();
    runSet(6, 21);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe('Colores: crecer la capa', () => {
  it('growNetwork crea un NetworkN nuevo con una neurona más', () => {
    const a = growNetwork({ n: 3 }, { outputs: 1 });
    expect(a.n).toBe(4);
    expect(a.net.structure).toEqual([3, 4]);
    const b = growNetwork(a, { outputs: 2 });
    expect(b.net.structure).toEqual([3, 6]);
    expect(b.net).not.toBe(a.net);
  });
  it('respeta el tope: la lista de nombres', () => {
    expect(growNetwork({ n: MAX_OUT }, { outputs: 1 }).n).toBe(MAX_OUT);
  });
  it('la capa nueva nace sin enseñar y se entrena desde cero con los nombres que tiene', () => {
    const g = growNetwork({ n: 3 }, { outputs: 1 });
    expect(snapNet(g.net).map((n) => n.b)).toEqual(snapNet(newNet(4)).map((n) => n.b));
    expect(trainSet(8, g.n).every((e) => e.y < g.n)).toBe(true);
  });
});

describe('Colores: el anillo y su frase salen de la activación real', () => {
  const acts = (on: (h: number) => boolean): number[] => Array.from({ length: NH }, (_, i) => (on(i * 15) ? 0.95 : 0.04));
  it('un arco azul-morado-rosa-rojo da «azules, morados, rosas y rojos»', () => {
    const a = acts((h) => h >= 195 && h <= 345);
    expect(ringPhrase(a)).toBe('Se enciende con: azules, morados, rosas y rojos');
  });
  it('casos límite', () => {
    expect(ringPhrase(acts(() => false))).toBe('Casi nunca se enciende');
    expect(ringPhrase(acts(() => true))).toBe('Se enciende con todos los colores');
    expect(ringPhrase(acts((h) => h >= 75 && h <= 150))).toBe('Se enciende con: verdes');
    expect(ringNames(acts((h) => h >= 165 && h <= 180))).toEqual(['cianes']);
  });
  it('con una red real, cada nombre de la frase tiene tonos encendidos', () => {
    const { net } = runSet(6, 21);
    for (let j = 0; j < 3; j++) {
      const a = ringActs(net, j), phrase = ringPhrase(a);
      expect(a).toHaveLength(NH);
      expect(phrase.startsWith('Se enciende con: ') || phrase.startsWith('Casi') || phrase.startsWith('Se enciende con todos')).toBe(true);
      const on = a.filter((v) => v > 0.5).length;
      expect(on).toBeGreaterThan(0);
      expect(on).toBeLessThan(NH);
      const named = phrase.replace('Se enciende con: ', '').split(/, | y /);
      expect(named.length).toBeGreaterThan(0);
      // la red real predice lo que dice el anillo
      RING_COLORS.forEach((c, i) => expect(net.layers[0].neurons[j].predict(c)).toBeCloseTo(a[i], 12));
    }
  });
  it('el SVG del anillo tiene un segmento por tono', () => {
    expect((ringSvg(Array(NH).fill(0.5)).match(/<path/g) || []).length).toBe(NH);
    expect((ringSvg(Array(NH).fill(0.5), Array(LIGHT_LEVELS.length).fill(0.5)).match(/<rect/g) || []).length).toBe(LIGHT_LEVELS.length);
  });
});

describe('Colores: avisos honestos (salen de la etiqueta real, no de la salida)', () => {
  const net = runSet(3, 21).net;
  const say = (c: number[]) => judge(net.predict(c), c);
  it('un color con nombre que la red aún no tiene: dice lo que responde la red y lo que es de verdad', () => {
    const amarillo = [0.9, 0.85, 0.2], ps = net.predict(amarillo), v = say(amarillo);
    expect(nameIndexOf(amarillo)).toBe(NAMES.indexOf('amarillo'));
    expect(v.doubt).toBe('noword');
    expect(v.name).toBe(NAMES[argmax(ps)]);   // la respuesta REAL de la red
    expect(v.realName).toBe('amarillo');      // la etiqueta REAL del color
    expect(verdictText(v)).toBe('Dice «' + v.name + '»… pero es amarillo. Solo conoce rojo, verde y azul, y tiene que elegir uno');
    expect(['rojo', 'verde', 'azul']).toContain(v.name);
  });
  it('el aviso no depende de lo segura que esté la red: aunque responda con confianza, avisa', () => {
    const naranja = [0.95, 0.55, 0.1], v = say(naranja);
    expect(v.p).toBeGreaterThan(0.5);
    expect(v.doubt).toBe('noword');
  });
  it('un color que ya tiene nombre no avisa de eso', () => {
    expect(say([0.1, 0.3, 0.9]).doubt).not.toBe('noword');
    expect(say([0.9, 0.1, 0.1]).doubt).toBeNull();
  });
  it('sampleOf(n) es un color del siguiente nombre, y la red de n nombres no tiene palabra para él', () => {
    for (const n of [3, 4, 8]) {
      const c = sampleOf(n), v = judge(runSet(n, 3).net.predict(c), c);
      expect(v.real).toBe(n);
      expect(v.doubt).toBe('noword');
    }
  });
  it('un color que no cae en ningún nombre avisa de que no lo conoce bien', () => {
    const full = runSet(MAX_OUT, 13).net;
    let gap: number[] | null = null;
    for (let h = 0; h < 360 && !gap; h += 5) for (const l of [0.3, 0.5, 0.65]) { const rgb = hslToRgb(h, 0.8, l).map((v) => Math.round(v * 100) / 100); if (nameIndexOf(rgb) < 0) { gap = rgb; break; } }
    expect(gap).not.toBeNull();
    const v = judge(full.predict(gap!), gap!);
    expect(v.doubt).toBe('hue');
    expect(verdictText(v)).toBe(DOUBT_TEXT);
  });
});

describe('Colores: la banda de luz', () => {
  it('lightActs es la activación real: la media sobre cada nivel de luz', () => {
    const net = runSet(MAX_OUT, 13).net, b = lightActs(net, 0);
    expect(b).toHaveLength(LIGHT_LEVELS.length);
    b.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
  });
  it('la frase dice «con lo oscuro» o «con lo claro» solo cuando la banda lo justifica', () => {
    const off = Array(NH).fill(0.03), dark = [0.95, 0.9, 0.7, 0.3, 0.1, 0.05, 0.02], light = [...dark].reverse();
    expect(lightTrend(dark)).toBe('oscuro');
    expect(lightTrend(light)).toBe('claro');
    expect(lightTrend([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBeNull();
    expect(neuronPhrase(off, dark)).toBe('Se enciende con lo oscuro, sea el color que sea');
    expect(neuronPhrase(off, light)).toBe('Se enciende con lo claro, sea el color que sea');
    expect(neuronPhrase(off, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBe('Casi nunca se enciende');
    const arc = Array.from({ length: NH }, (_, i) => (i * 15 >= 195 && i * 15 <= 250 ? 0.95 : 0.03));
    expect(neuronPhrase(arc, dark)).toBe('Se enciende con: azules');
  });
});

describe('Colores: la zona de cada neurona sale de su activación real', () => {
  it('la frase lleva el nombre y la zona: «verde: se enciende con verdes»', () => {
    const ring = (on: (h: number) => boolean): number[] => Array.from({ length: NH }, (_, i) => (on(i * 15) ? 0.95 : 0.04));
    expect(namePhrase('verde', ring((h) => h >= 75 && h <= 150))).toBe('verde: se enciende con verdes');
    expect(namePhrase('azul', ring((h) => h >= 195 && h <= 345))).toBe('azul: se enciende con azules, morados, rosas y rojos');
  });
  it('en una capa real, cada neurona de color se enciende con los tonos de su nombre', () => {
    const net = runSet(MAX_OUT, PER_DEFAULT).net;
    expect(namePhrase('verde', ringActs(net, 1), lightActs(net, 1), dullPhrase(net, 1))).toContain('verdes');
    expect(namePhrase('azul', ringActs(net, 2), lightActs(net, 2), dullPhrase(net, 2))).toContain('azules');
    expect(namePhrase('amarillo', ringActs(net, 3), lightActs(net, 3), dullPhrase(net, 3))).toContain('amarillos');
  });
  it('blanco y negro no tienen tono: se miden en los grises, con la propia neurona', () => {
    const net = runSet(MAX_OUT, PER_DEFAULT).net;
    expect(dullPhrase(net, NAMES.indexOf('blanco'))).toBe('se enciende con blancos');
    expect(dullPhrase(net, NAMES.indexOf('negro'))).toBe('se enciende con negros');
  });
});

describe('Colores: NetworkView de la capa de nombres', () => {
  it('con N neuronas crea N vistas, cada una con sus 3 ramas y sin ninguna neurona central', () => {
    for (const n of [3, 4, 6, 16]) {
      const nv = new NetworkView(newNet(n), {}, layerLayout(n));
      expect(nv.layers).toHaveLength(1);
      expect(nv.layers[0]).toHaveLength(n);
      expect(nv.layers[0].every((v) => v.geom.dendrites.length === 3 && v.geom.axon.length > 0)).toBe(true);
    }
  });
  it('con N cualquiera (hasta 16) las neuronas caben en el lienzo y no se solapan', () => {
    for (const n of [3, 4, 6, 10, 16]) {
      const L = layerLayout(n), outs = L.neurons[0];
      expect(outs).toHaveLength(n);
      outs.forEach((g) => { expect(g.body.y - g.body.r).toBeGreaterThanOrEqual(0); expect(g.body.y + g.body.r).toBeLessThanOrEqual(L.size.h); });
      for (let i = 1; i < n; i++) expect(outs[i].body.y - outs[i - 1].body.y).toBeGreaterThan(outs[i].body.r + outs[i - 1].body.r - 0.001);
    }
  });
  it('cada neurona recibe su propio cambio al entrenar', () => {
    const net = newNet(4), nv = new NetworkView(net, { rng: () => 0.5 }, layerLayout(4));
    const d = nv.observed.train([0.9, 0.2, 0.1], [1, 0, 0, 0], 0.02);
    expect(d.map((l) => l.length)).toEqual([4]);
    nv.layers[0].forEach((v, ni) => { v.learn(d[0][ni], { ref: 0.02 }); expect(v.lastStrength).toBeGreaterThan(0); });
  });
  it('dibuja con contexto falso para N = 3..16', () => {
    const grad = { addColorStop: () => {} };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) { if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad; if (k === 'measureText') return () => ({ width: 10 }); if (k in t) return t[k]; return () => {}; },
      set(t, k: string, v) { t[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    for (const n of [3, 4, 6, 10, 16]) {
      const nv = new NetworkView(newNet(n), { rng: () => 0.5, bulb: false }, layerLayout(n));
      nv.fit(800, 500);
      const c = [0.3, 0.6, 0.2], d = nv.observed.train(c, target1(n), 0.02);
      nv.neurons.forEach((v) => { v.drawWires(ctx); v.drawBody(ctx, 1); v.drawFront(ctx); });
      nv.layers[0].forEach((v, o) => { v.drawInput(ctx, c, 0.5); v.drawOutput(ctx, 0.5, 1, 0.5); v.drawCorrection(ctx, 0.1, d[0][o], { axon: [0, 0.3], dendrites: [0.3, 1], ref: 0.02 }); });
    }
  });
});
const target1 = (n: number): number[] => Array.from({ length: n }, (_, i) => (i === 1 ? 1 : 0));

describe('Colores: el código del panel </> es el real', () => {
  const run = (txt: string): string[] => {
    const out: string[] = [];
    new Function('NetworkN', 'Adam', 'setRandom', 'seededRandom', 'console', txt.replace(/^import .*$/m, ''))(NetworkN, Adam, setRandom, seededRandom, { log: (s: string) => out.push(String(s)) });
    return out;
  };
  it('refleja n y el conjunto actuales', () => {
    const t = rawText({ ...newColoresCodeState(), n: 4, per: 3, trained: true });
    expect(t).toContain('new NetworkN([3, 4]');
    expect(t).toContain('const nombres = ["rojo", "verde", "azul", "amarillo"]');
    expect(t).toContain('// 12 ejemplos: 3 de cada nombre');
  });
  it('se ejecuta y da el mismo acierto que la pantalla', () => {
    const cs = { ...newColoresCodeState(), n: 3, per: 5, trained: true };
    const out = run(rawText(cs));
    expect(out[0]).toBe(runSet(3, 5).pct + ' %');
  });
  it('sin enseñar, el código no trae ejemplos y también se ejecuta', () => {
    const out = run(rawText({ ...newColoresCodeState(), trained: false, probe: [0.9, 0.4, 0.1] }));
    expect(out).toHaveLength(1);
  });
  it('lo aprendido se puede poner en una red nueva y da el mismo veredicto', () => {
    for (const n of [3, 4]) {
      const net = runSet(n, 8).net, fl = flatOf(snapNet(net));
      const txt = brainText(n, fl, verdictOf(n, fl), true);
      expect(txt).toContain('new NetworkN([3, ' + n + '])');
      const out: string[] = [];
      const body = txt.replace(/^import .*$/m, '').replace(/^nombres\[(.*)$/m, (_m, rest) => 'console.log(nombres[' + rest.replace(/;?\s*\/\/.*$/, '') + ');');
      new Function('NetworkN', 'console', body)(NetworkN, { log: (s: string) => out.push(String(s)) });
      expect(out[0]).toBe(verdictOf(n, fl));
    }
  });
  it('EPOCHS está en el código', () => {
    expect(rawText({ ...newColoresCodeState(), trained: true })).toContain('repaso < ' + EPOCHS);
  });
});

describe('Colores: muestras rápidas para probar (dinámicas)', () => {
  it('con 3 nombres: uno de cada nombre conocido y los siguientes que aún no conoce, todos con su nombre', () => {
    const q = quickSamples(3);
    expect(q.filter((x) => x.known).map((x) => x.name)).toEqual(['rojo', 'verde', 'azul']);
    expect(q.filter((x) => !x.known).map((x) => x.name)).toEqual(['amarillo', 'naranja']);
    expect(q.length).toBeGreaterThanOrEqual(5);
    expect(q.length).toBeLessThanOrEqual(8);
    q.forEach((x) => { expect(x.hex).toMatch(/^#[0-9a-f]{6}$/); expect(x.name.length).toBeGreaterThan(0); });
  });
  it('se recalculan al añadir un nombre: el siguiente pasa de «desconocido» a «conocido»', () => {
    const a = quickSamples(3), b = quickSamples(4);
    expect(a.find((x) => x.name === 'amarillo')!.known).toBe(false);
    expect(b.find((x) => x.name === 'amarillo')!.known).toBe(true);
    expect(b.filter((x) => !x.known)[0].name).toBe('naranja');
  });
  it('con muchos nombres reparte hasta 6 conocidos y sin colores repetidos ni el del selector', () => {
    const q = quickSamples(16, 6, 2);
    expect(q.filter((x) => x.known).length).toBeLessThanOrEqual(6);
    expect(new Set(q.map((x) => x.hex)).size).toBe(q.length);
    const avoid = q[0].hex;
    expect(quickSamples(16, 6, 2, avoid).some((x) => x.hex === avoid)).toBe(false);
    expect(quickSamples(MAX_OUT).every((x) => x.known)).toBe(true);
  });
  it('probar un color de un nombre desconocido da el mensaje con la etiqueta real y la respuesta real de la red', () => {
    const net = runSet(3, 13).net;
    const u = quickSamples(3).find((x) => !x.known)!, c = [1, 3, 5].map((k) => parseInt(u.hex.slice(k, k + 2), 16) / 255), v = judge(net.predict(c), c);
    expect(v.doubt).toBe('noword');
    expect(v.realName).toBe(u.name);
    expect(v.name).toBe(NAMES[argmax(net.predict(c))]);
  });
});

describe('Colores: examinar otra vez', () => {
  it('el código lo dice y sigue ejecutándose; no entrena de más', () => {
    const t = rawText({ ...newColoresCodeState(), n: 3, per: 5, trained: true, reexam: true });
    expect(t).toContain('solo se llama a predict');
    const net = runSet(3, 5).net, before = JSON.stringify(flatOf(snapNet(net)));
    expect(score(net, 3).pct).toBe(runSet(3, 5).pct);
    expect(JSON.stringify(flatOf(snapNet(net)))).toBe(before);
  });
});

describe('Colores: examen rápido', () => {
  it.each([36, 192])('con %i colores la parte rápida dura entre 3 y 5 s y los intervalos se acortan', (n) => {
    const { times, total } = examFastPlan(n - 3);
    expect(times).toHaveLength(n - 3);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(5);
    for (let k = 2; k < times.length; k++) expect(times[k] - times[k - 1]).toBeLessThanOrEqual(times[k - 1] - times[k - 2] + 1e-9);
  });
  it('un examen sin colores rápidos no dura nada', () => { expect(examFastPlan(0)).toEqual({ times: [], total: 0 }); });
  it('el porcentaje dice de qué colores es', () => {
    expect(knownColors(3)).toBe('de los colores que conoce: rojo, verde y azul');
    expect(knownColors(4)).toBe('de los colores que conoce: rojo, verde, azul y amarillo');
    expect(knownColors(9)).toBe('de sus 9 nombres');
  });
});
