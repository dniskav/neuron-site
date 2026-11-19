/**
 * El código real que muestra el panel </> de «Enséñale»: se construye con los ejemplos reales
 * del conjunto activo, así que lo que se ve es lo que entrena.
 */
import { css } from '../viz/core/colors';
import { highlight } from '../viz/highlight';
import { ALL, EXAM, labelOf } from './ensenale';

export type CodeMode = 'learn' | 'exam' | 'probe';

export interface CodeState {
  k: number | null;
  w0: number[] | null;
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}

export interface CodeLine {
  t: string;
  m?: CodeMode;
  sw?: number[];
  grp?: string;
  i?: number;
  hid?: boolean;
  more?: string;
  less?: string;
  disp?: boolean;
}

const LIM = 8, SHOW = 3;
const f2 = (x: number): string => x.toFixed(2);
const cl = (c: number[]): string => '{ r: ' + f2(c[0]) + ', g: ' + f2(c[1]) + ', b: ' + f2(c[2]) + ', claro: ' + (labelOf(c) ? 'true' : 'false') + ' }';

export function newCodeState(): CodeState {
  return { k: null, w0: null, probe: null, open: { ej: false, ex: false }, mode: 'learn', cur: null };
}

/*SNIP-START*/
export function buildLines(cs: CodeState): CodeLine[] {
  const L: CodeLine[] = [], k = cs.k, set = k ? ALL.slice(0, k) : [];
  const add = (t: string, o?: Partial<CodeLine>): CodeLine => { const l = { ...(o || {}), t } as CodeLine; L.push(l); return l; };
  const list = (name: string, grp: string, arr: number[][]): void => {
    add('const ' + name + ' = [');
    const coll = arr.length > LIM && !cs.open[grp as 'ej' | 'ex'];
    arr.forEach((c, i) => {
      add('  ' + cl(c) + ',', { sw: c, grp, i, hid: coll && i >= SHOW });
      if (coll && i === SHOW - 1) add('  // … y ' + (arr.length - SHOW) + ' más', { more: grp, disp: true });
    });
    if (arr.length > LIM && cs.open[grp as 'ej' | 'ex']) add('  // mostrar menos', { less: grp, disp: true });
    add('];');
  };
  add('import { NeuronN } from "@dniskav/neuron";'); add('');
  if (k) { add('// ' + k + ' ejemplos (conjunto «' + k + '»)'); list('ejemplos', 'ej', set); }
  else add('const ejemplos = [];   // todavía no le has enseñado nada');
  add('');
  add('const neurona = new NeuronN(3);   // 3 entradas: rojo, verde, azul');
  if (cs.w0) add('neurona.weights = [' + cs.w0.join(', ') + '];   // con estos pesos nace la de esta pantalla');
  add('');
  add('// Aprender: responde y la corrigen (claro = 1, oscuro = 0)');
  add('for (let repaso = 0; repaso < 40; repaso++)');
  add('  for (const { r, g, b, claro } of ejemplos)');
  add('    neurona.train([r, g, b], claro ? 1 : 0, 0.5);', { m: 'learn' });
  add('');
  add('// Examen: 12 colores nuevos, solo responde, nada cambia');
  list('examen', 'ex', EXAM);
  add('let aciertos = 0;');
  add('for (const { r, g, b, claro } of examen) {');
  add('  const p = neurona.predict([r, g, b]);', { m: 'exam' });
  add('  const respuesta = p > 0.5 ? "claro" : "oscuro";', { m: 'exam' });
  add('  if ((respuesta === "claro") === claro) aciertos++;');
  add('}');
  add('console.log(Math.round(aciertos / 12 * 100) + " %");');
  if (cs.probe) {
    add(''); add('// Tu color: se prueba igual, sin corregir');
    add('const tuyo = neurona.predict([' + cs.probe.map(f2).join(', ') + ']) > 0.5 ? "claro" : "oscuro";', { m: 'probe', sw: cs.probe });
  }
  return L;
}
/*SNIP-END*/

/** El texto copiable (sin las líneas «… y N más»). */
export function rawText(cs: CodeState): string {
  return buildLines(cs).filter((l) => !l.disp).map((l) => l.t).join('\n');
}

/** HTML de unas líneas de código: una por `<span class="ln">`, con el resaltado y la muestra de color. */
export function renderLines(lines: CodeLine[]): string {
  let html = '';
  lines.forEach((l) => {
    if (l.hid) return;
    if (l.more || l.less) {
      html += '<button type="button" class="ln more" data-tog="' + (l.more || l.less) + '" aria-expanded="' + (l.less ? 'true' : 'false') + '">' + highlight(l.t) + '</button>';
      return;
    }
    html += '<span class="ln"' + (l.m ? ' data-m="' + l.m + '"' : '') + (l.grp ? ' data-g="' + l.grp + '" data-i="' + l.i + '"' : '') + '>' + (highlight(l.t) || ' ') + (l.sw ? '<i class="sw" style="background:' + css(l.sw) + '"></i>' : '') + '</span>';
  });
  return html;
}

/** HTML del panel de «Enséñale». */
export function renderCodeHtml(cs: CodeState): string { return renderLines(buildLines(cs)); }

const r4 = (x: number): number => Math.round(x * 10000) / 10000;
export { r4 };

/*BRAIN-START*/
export function brainText(k: number | null, w: number[], b: number, verdict: string): string {
  return [
    'import { NeuronN } from "@dniskav/neuron";', '',
    k ? '// Lo que aprendió con el conjunto «' + k + '»' : '// Sin enseñarle nada: estos números son al azar',
    'const aprendido = { pesos: [' + w.map(r4).join(', ') + '], sesgo: ' + r4(b) + ' };', '',
    '// Ponérselo a una neurona nueva: ya sabe, sin entrenar',
    'const neurona = new NeuronN(3);',
    'neurona.weights = [...aprendido.pesos];',
    'neurona.bias = aprendido.sesgo;',
    'neurona.predict([0.90, 0.80, 0.40]) > 0.5 ? "claro" : "oscuro";   // → ' + verdict,
  ].join('\n');
}
/*BRAIN-END*/

/** Veredicto del color de muestra [0.90, 0.80, 0.40] con los números redondeados del panel. */
export function verdictOf(w: number[], b: number): string {
  let z = r4(b);
  [0, 1, 2].forEach((j) => { z += r4(w[j]) * [0.9, 0.8, 0.4][j]; });
  return z > 0 ? 'claro' : 'oscuro';
}
