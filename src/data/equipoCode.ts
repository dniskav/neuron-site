/**
 * El código real que muestra el panel </> de «Ni claro ni oscuro»: se construye con los 60 colores
 * reales, así que lo que se ve es lo que entrena. Y el panel del cerebro: los números aprendidos.
 */
import { NetworkN } from '@dniskav/neuron';
import { renderLines, type CodeLine, type CodeMode } from './ensenaleCode';
import { EPOCHS, EXAM, HI, INIT_SEED, LO, LR, NTRAIN, TRAIN, labelOf, newTeam, structOf } from './equipo';

export interface TeamCodeState {
  k: number;
  trained: boolean;
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}

const LIM = 8, SHOW = 3;
const f2 = (x: number): string => x.toFixed(2);
const cl = (c: number[]): string => '{ r: ' + f2(c[0]) + ', g: ' + f2(c[1]) + ', b: ' + f2(c[2]) + ', intermedio: ' + (labelOf(c) ? 'true' : 'false') + ' }';

export function newTeamCodeState(): TeamCodeState {
  return { k: 1, trained: false, probe: null, open: { ej: false, ex: false }, mode: 'exam', cur: null };
}

/*SNIP-START*/
export function buildLines(cs: TeamCodeState): CodeLine[] {
  const L: CodeLine[] = [], k = cs.k;
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
  add('import { NetworkN, Adam, setRandom, seededRandom } from "@dniskav/neuron";'); add('');
  if (cs.trained) {
    add('// ' + NTRAIN + ' ejemplos. «intermedio» = ni muy claro ni muy oscuro');
    add('// (brillo entre ' + LO + ' y ' + HI + '; brillo = 0.299 r + 0.587 g + 0.114 b)');
    list('ejemplos', 'ej', TRAIN);
  } else add('const ejemplos = [];   // todavía no le has enseñado nada');
  add('');
  add(k === 1 ? '// Una sola neurona: 3 entradas (rojo, verde, azul) → 1 salida' : '// Un equipo: 3 entradas (rojo, verde, azul) → ' + k + ' neuronas → 1 que decide');
  add('setRandom(seededRandom(' + INIT_SEED + '));   // así nace la de esta pantalla');
  add('const red = new NetworkN([' + structOf(k).join(', ') + '], { optimizer: () => new Adam() });');
  add('setRandom(null);');
  add('');
  add('// Aprender: responde y la corrigen (intermedio = 1, el resto = 0)');
  add('for (let repaso = 0; repaso < ' + EPOCHS + '; repaso++)');
  add('  for (const { r, g, b, intermedio } of ejemplos)');
  add('    red.train([r, g, b], [intermedio ? 1 : 0], ' + LR + ');', { m: 'learn' });
  add('');
  add('// Examen: 12 colores nuevos, solo responde, nada cambia');
  list('examen', 'ex', EXAM);
  add('let aciertos = 0;');
  add('for (const { r, g, b, intermedio } of examen) {');
  add('  const [p] = red.predict([r, g, b]);', { m: 'exam' });
  add('  const respuesta = p > 0.5;', { m: 'exam' });
  add('  if (respuesta === intermedio) aciertos++;');
  add('}');
  add('console.log(Math.round(aciertos / 12 * 100) + " %");');
  if (cs.probe) {
    add(''); add('// Tu color: se prueba igual, sin corregir');
    add('const tuyo = red.predict([' + cs.probe.map(f2).join(', ') + '])[0] > 0.5 ? "intermedio" : "no";', { m: 'probe', sw: cs.probe });
  }
  return L;
}
/*SNIP-END*/

/** El texto copiable (sin las líneas «… y N más»). */
export function rawText(cs: TeamCodeState): string {
  return buildLines(cs).filter((l) => !l.disp).map((l) => l.t).join('\n');
}

export function renderCodeHtml(cs: TeamCodeState): string { return renderLines(buildLines(cs)); }

/*BRAIN-START*/
export function brainText(k: number, flat: number[], verdict: string, trained: boolean): string {
  const L = ['import { NetworkN } from "@dniskav/neuron";', '',
    trained ? '// Lo que aprendió ' + (k === 1 ? 'una sola neurona' : 'un equipo de ' + k + ' neuronas + la que decide') : '// Sin enseñarle nada: estos números son al azar',
    'const aprendido = ['];
  let i = 0;
  if (k === 1) L.push('  ' + flat.slice(0, 4).join(', ') + ',   // rojo, verde, azul, línea');
  else {
    for (let j = 0; j < k; j++, i += 4) L.push('  ' + flat.slice(i, i + 4).join(', ') + ',   // neurona ' + (j + 1) + ': rojo, verde, azul, línea');
    L.push('  ' + flat.slice(i, i + k + 1).join(', ') + ',   // la que decide: ' + Array.from({ length: k }, (_, q) => 'neurona ' + (q + 1)).join(', ') + ', línea');
  }
  L.push('];', '', '// Ponérselo a una red nueva: ya sabe, sin entrenar',
    'const red = new NetworkN([' + structOf(k).join(', ') + ']);', 'red.setWeights(aprendido);',
    'red.predict([0.50, 0.50, 0.50])[0] > 0.5 ? "intermedio" : "no";   // → ' + verdict);
  return L.join('\n');
}
/*BRAIN-END*/

/** Veredicto del color gris medio con los números redondeados del panel. */
export function verdictOf(k: number, flat: number[]): string {
  const n: NetworkN = newTeam(k);
  n.setWeights(flat);
  return n.predict([0.5, 0.5, 0.5])[0] > 0.5 ? 'intermedio' : 'no';
}
