import { describe, expect, it } from 'vitest';
import {
  DOUBT_TEXT, MAX_OUT, N0, NAMES, argmax, examSet, growNetwork, hslToRgb, judge, nameIndexOf, neighbours, newNet, noWordReason, sampleOf, score, trainNet, trainSet, verdictText, lowText, type Verdict,
} from '../src/data/colores';
import { buildScript, numWord, probeCaption, readMs, runAuto, type AutoApi, type AutoCtx } from '../src/data/coloresAuto';
import { rgbHex } from '../src/data/colores';
import type { NetworkN } from '@dniskav/neuron';

describe('Colores: los tres avisos al probar un color', () => {
  const net5 = (() => { const n = newNet(5); trainNet(n, trainSet(13, 5), 5); return n; })();
  const net3 = (() => { const n = newNet(3); trainNet(n, trainSet(13, 3), 3); return n; })();
  it('el nombre real aún no existe: dice qué responde, qué es, y por qué (rojo, verde y azul)', () => {
    const c = sampleOf(3), v = judge(net3.predict(c), c);
    expect(v.doubt).toBe('noword');
    expect(verdictText(v)).toBe('Dice «' + v.name + '»… pero es amarillo. Solo conoce rojo, verde y azul, y tiene que elegir uno');
    expect(noWordReason(3)).toBe('Solo conoce rojo, verde y azul, y tiene que elegir uno');
  });
  it('con más de 4 nombres conocidos dice cuántos', () => {
    expect(noWordReason(5)).toBe('Solo conoce sus 5 nombres, y tiene que elegir uno');
    expect(noWordReason(4)).toBe('Solo conoce rojo, verde, azul y amarillo, y tiene que elegir uno');
    const n = 7, net = newNet(n); trainNet(net, trainSet(8, n), n);
    const c = sampleOf(n), v = judge(net.predict(c), c);
    expect(v.real).toBe(n);
    expect(verdictText(v)).toContain('Solo conoce sus 7 nombres, y tiene que elegir uno');
  });
  it('el nombre existe pero la salida ganadora es floja: «Gana naranja, pero con poca seguridad: está entre el rojo y el amarillo»', () => {
    const c = sampleOf(NAMES.indexOf('naranja')), ps = net5.predict(c), v = judge(ps, c);
    expect(Math.max(...ps)).toBeLessThan(0.5);               // la salida REAL, no un número escrito a mano
    expect(v.doubt).toBe('low');
    expect(v.name).toBe(NAMES[argmax(ps)]);
    expect(v.between).toEqual(['rojo', 'amarillo']);
    expect(verdictText(v)).toBe('Gana «naranja», pero con poca seguridad: está entre el rojo y el amarillo');
    expect(lowText(v)).toBe(verdictText(v));
  });
  it('«low» sin par claro de vecinos omite la parte de «está entre»', () => {
    // sin amarillo (solo 3 nombres conocidos) el naranja no tiene vecino por arriba
    expect(neighbours(31, 3, NAMES.indexOf('naranja'))).toBeNull();
    const v: Verdict = { ps: [0.2, 0.1, 0.1], best: 0, p: 0.2, name: 'rojo', real: 0, realName: 'rojo', doubt: 'low', between: null };
    expect(verdictText(v)).toBe('Gana «rojo», pero con poca seguridad');
  });
  it('los vecinos salen de los tonos de COLORS (no cuentan el propio nombre ni los que se le solapan)', () => {
    const n = MAX_OUT, naranja = NAMES.indexOf('naranja');
    expect(neighbours(31, n, naranja)).toEqual(['rojo', 'amarillo']);   // el marrón comparte tono con el naranja: no cuenta
    expect(neighbours(200, n, NAMES.indexOf('celeste'))?.length).toBe(2);
    expect(neighbours(31, 3, naranja)).toBeNull();
  });
  it('un hueco de la rueda (cian, fucsia…) sigue siendo «color desconocido», con un texto claro', () => {
    const full = newNet(MAX_OUT); trainNet(full, trainSet(13, MAX_OUT), MAX_OUT);
    let gap: number[] | null = null;
    for (let h = 0; h < 360 && !gap; h += 5) for (const l of [0.3, 0.5, 0.65]) { const rgb = hslToRgb(h, 0.8, l).map((v) => Math.round(v * 100) / 100); if (nameIndexOf(rgb) < 0) { gap = rgb; break; } }
    const v = judge(full.predict(gap!), gap!);
    expect(v.doubt).toBe('hue');
    expect(verdictText(v)).toBe(DOUBT_TEXT);
    expect(DOUBT_TEXT).toBe('Este color no tiene nombre todavía: no sé cómo llamarlo');
  });
  it('un color bien reconocido no avisa de nada', () => {
    const c = sampleOf(0), v = judge(net5.predict(c), c);
    expect(v.doubt).toBeNull();
    expect(verdictText(v)).toBe('');
  });
  it('el naranja de la pantalla se enciende poco, como se midió (0,19–0,22)', () => {
    const c = sampleOf(4), p = net5.predict(c)[4];
    expect(p).toBeGreaterThan(0.1); expect(p).toBeLessThan(0.3);
  });
});

/** La API del guion con la red REAL y sin dibujo: lo mismo que hacen los botones, sin animación. */
function headless(log: string[]): AutoApi & { net: () => NetworkN; n: () => number; captions: string[]; exams: { ok: number; total: number }[]; sizes: number[] } {
  let n = N0, net = newNet(n);
  const captions: string[] = [], exams: { ok: number; total: number }[] = [], sizes: number[] = [];
  let taught = false;
  return {
    net: () => net, n: () => n, captions, exams, sizes,
    reset() { n = N0; net = newNet(n); taught = false; log.push('reset'); sizes.push(n); },
    addName() { const g = growNetwork({ n }, { outputs: 1 }); n = g.n; net = g.net; taught = false; log.push('addName'); sizes.push(n); return n; },
    async teach(quick) { trainNet(net, trainSet(13, n), n); taught = true; log.push(quick ? 'teach-quick' : 'teach'); },
    async exam() { const s = score(net, n); exams.push({ ok: s.ok, total: examSet(n).length }); log.push('exam'); return exams[exams.length - 1]; },
    async probe(c, hex) { log.push('probe'); expect(hex).toBe(rgbHex(c)); return judge(net.predict(c), c); },
    caption(t) { captions.push(t); },
    async sleep() { /* sin esperar */ },
    cancelled: () => false,
  };
}

describe('Colores: «Míralo solo» (el guion y su ejecutor)', () => {
  const script = buildScript();
  it('el guion es una lista de datos con el orden de la historia', () => {
    expect(script.slice(0, 5).map((s) => s.act)).toEqual(['reset', 'teach', 'exam', 'probe', 'addName']);
    const acts = script.map((s) => s.act);
    expect(acts.filter((a) => a === 'reset')).toHaveLength(1);
    expect(acts.filter((a) => a === 'addName')).toHaveLength(MAX_OUT - N0);    // 13 nombres nuevos: de 3 a 16
    expect(script[script.length - 1].link).toBe(true);
  });
  it('el ejecutor sigue el orden y la capa crece de 3 a 16 sin saltarse nombres', async () => {
    const log: string[] = [], api = headless(log), run = await runAuto(script, api);
    expect(run.finished).toBe(true);
    expect(run.steps).toBe(script.length);
    expect(log[0]).toBe('reset');
    expect(log.slice(0, 5)).toEqual(['reset', 'teach', 'exam', 'probe', 'addName']);
    expect(api.sizes).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(api.n()).toBe(MAX_OUT);
    expect(run.ctx.n).toBe(MAX_OUT);
    // cada enseñanza va después de crecer y cada examen después de enseñar
    log.forEach((a, i) => { if (a === 'addName') expect(log[i + 1]).toMatch(/^teach/); if (a === 'exam') expect(log[i - 1]).toMatch(/^teach/); });
    // el amarillo llega con 3 nombres y el naranja con 5
    expect(log.filter((a) => a === 'probe')).toHaveLength(2);
  });
  it('los «X de Y» de los textos son los del examen real', async () => {
    const log: string[] = [], api = headless(log);
    await runAuto(script, api);
    const first = api.exams[0], real3 = (() => { const n = newNet(3); trainNet(n, trainSet(13, 3), 3); return score(n, 3); })();
    expect(first).toEqual({ ok: real3.ok, total: 36 });
    expect(api.captions).toContain('Examen: colores que nunca vio. Acierta ' + real3.ok + ' de 36.');
    // la frase de cada nombre nuevo lleva el acierto real de ESE examen
    api.exams.slice(3).forEach((e, i) => {
      const n = 6 + i;
      if (n < MAX_OUT) expect(api.captions).toContain('«' + NAMES[n - 1] + '»: ' + n + ' neuronas. Acierta ' + e.ok + ' de ' + e.total + '.');
    });
    const last = api.exams[api.exams.length - 1], pct = Math.round((last.ok / last.total) * 100);
    expect(last.total).toBe(MAX_OUT * 12);
    expect(api.captions[api.captions.length - 1]).toContain('16 neuronas, una por nombre, aciertan ' + pct + ' %');
  });
  it('el amarillo y el naranja se explican con lo que respondió la red de verdad', async () => {
    const api = headless([]);
    await runAuto(script, api);
    const net3 = newNet(3); trainNet(net3, trainSet(13, 3), 3);
    const cy = sampleOf(3), vy = judge(net3.predict(cy), cy);
    expect(vy.doubt).toBe('noword');
    expect(api.captions).toContain('Dice «' + vy.name + '». No tiene palabra para el amarillo: solo puede elegir entre las que conoce.');
    expect(api.captions).toContain('Gana «naranja», pero apenas se enciende: está entre el rojo y el amarillo, y una neurona sola no sabe quedarse con lo de en medio.');
  });
  it('probeCaption no inventa: si no duda, no dice que se enciende poco', () => {
    const net = newNet(5); trainNet(net, trainSet(13, 5), 5);
    const c = sampleOf(0), v = judge(net.predict(c), c);
    expect(probeCaption(v)).toBe('Dice «rojo» y acierta.');
    expect(probeCaption(null)).toBe('');
  });
  it('para entre pasos en cuanto se pide, sin dejar nada a medias', async () => {
    const log: string[] = [], api = headless(log);
    let stop = false;
    const run = await runAuto(script, { ...api, cancelled: () => stop, async exam(q) { const r = await api.exam(q); stop = true; return r; } });
    expect(run.finished).toBe(false);
    expect(log).toEqual(['reset', 'teach', 'exam']);                  // el examen empezado terminó entero; no hay pasos nuevos
    expect(run.steps).toBe(2);                                         // el paso en marcha (el examen) no se cuenta como hecho
  });
  it('sin animación (prefers-reduced-motion) las pausas dan tiempo a leer cada rótulo', async () => {
    const sleeps: number[] = [], api = headless([]);
    await runAuto(script, { ...api, async sleep(ms) { sleeps.push(ms); } }, { reduced: true });
    expect(sleeps.filter((ms) => ms >= 1800).length).toBeGreaterThanOrEqual(12);   // todo paso con rótulo da tiempo a leerlo
    sleeps.forEach((ms) => expect(ms).toBeGreaterThanOrEqual(300));
    expect(readMs('x'.repeat(100))).toBe(1800 + 4500);
  });
  it('las palabras de los números de neuronas', () => {
    expect([numWord(3), numWord(4), numWord(5), numWord(16), numWord(17)]).toEqual(['tres', 'cuatro', 'cinco', 'dieciséis', '17']);
  });
  it('la historia dura unos 60-90 s: suma de pausas del guion (sin lo que dura cada animación)', () => {
    const holds = script.reduce((t, s) => t + s.hold, 0) / 1000;
    expect(holds).toBeGreaterThan(20); expect(holds).toBeLessThan(45);
  });
});
