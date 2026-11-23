/**
 * El código real que muestra el panel </> de «¿Qué color es?»: se construye con los ejemplos reales del
 * conjunto activo y el número de nombres actual, así que lo que se ve es lo que entrena. Y el panel del cerebro: los
 * números aprendidos. Nada tiene el número de nombres fijo: sale de la red actual (`n`) y de la lista `NAMES`.
 */
import type { NetworkN } from '@dniskav/neuron';
import { renderLines, type CodeLine, type CodeMode } from './ensenaleCode';
import { EPOCHS, INIT_SEED, LR, N0, NAMES, examSet, newNet, trainSet, type Ex } from './colores';

export interface ColoresCodeState {
  /** Cuántos nombres (neuronas) tiene la capa. */
  n: number;
  per: number;
  trained: boolean;
  /** Se está repitiendo el examen con la misma red: solo predict, nada de train. */
  reexam?: boolean;
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}

const LIM = 8, SHOW = 3;
const f2 = (x: number): string => x.toFixed(2);
const cl = (e: Ex): string => '{ r: ' + f2(e.c[0]) + ', g: ' + f2(e.c[1]) + ', b: ' + f2(e.c[2]) + ', nombre: "' + NAMES[e.y] + '" }';
const names = (n: number): string => '[' + NAMES.slice(0, n).map((x) => '"' + x + '"').join(', ') + ']';

export function newColoresCodeState(): ColoresCodeState {
  return { n: N0, per: 21, trained: false, probe: null, open: { ej: false, ex: false }, mode: 'exam', cur: null };
}

/*SNIP-START*/
export function buildLines(cs: ColoresCodeState): CodeLine[] {
  const L: CodeLine[] = [], n = cs.n, set = trainSet(cs.per, n), exam = examSet(n);
  const add = (t: string, o?: Partial<CodeLine>): CodeLine => { const l = { ...(o || {}), t } as CodeLine; L.push(l); return l; };
  const list = (name: string, grp: string, arr: Ex[]): void => {
    add('const ' + name + ' = [');
    const coll = arr.length > LIM && !cs.open[grp as 'ej' | 'ex'];
    arr.forEach((e, i) => {
      add('  ' + cl(e) + ',', { sw: e.c, grp, i, hid: coll && i >= SHOW });
      if (coll && i === SHOW - 1) add('  // … y ' + (arr.length - SHOW) + ' más', { more: grp, disp: true });
    });
    if (arr.length > LIM && cs.open[grp as 'ej' | 'ex']) add('  // mostrar menos', { less: grp, disp: true });
    add('];');
  };
  add('import { NetworkN, Adam, setRandom, seededRandom } from "@dniskav/neuron";'); add('');
  add('// Los nombres que la red tiene ahora: una neurona para cada uno');
  add('const nombres = ' + names(n) + ';');
  add('');
  if (cs.trained) { add('// ' + set.length + ' ejemplos: ' + cs.per + ' de cada nombre'); list('ejemplos', 'ej', set); }
  else add('const ejemplos = [];   // todavía no le has enseñado nada');
  add('');
  add('// Una capa de ' + n + ' neuronas, una por nombre: cada una es la de «Enséñale», copiada');
  add('setRandom(seededRandom(' + INIT_SEED + '));   // así nace la de esta pantalla');
  add('const red = new NetworkN([3, ' + n + '], { optimizer: () => new Adam() });   // [entradas, neuronas]');
  add('setRandom(null);');
  add('');
  add('// Aprender: responde y la corrigen (1 en el nombre correcto, 0 en los demás)');
  add('for (let repaso = 0; repaso < ' + EPOCHS + '; repaso++)');
  add('  for (const { r, g, b, nombre } of ejemplos)');
  add('    red.train([r, g, b], nombres.map((n) => (n === nombre ? 1 : 0)), ' + LR + ');', { m: 'learn' });
  add('');
  add(cs.reexam ? '// Examinar otra vez con la MISMA red: solo se llama a predict, no se llama a train y los pesos no cambian' : '// Examen: ' + exam.length + ' colores nuevos, solo responde, nada cambia');
  list('examen', 'ex', exam);
  add('let aciertos = 0;');
  add('for (const { r, g, b, nombre } of examen) {');
  add('  const salidas = red.predict([r, g, b]);', { m: 'exam' });
  add('  const respuesta = nombres[salidas.indexOf(Math.max(...salidas))];', { m: 'exam' });
  add('  if (respuesta === nombre) aciertos++;');
  add('}');
  add('console.log(Math.round(aciertos / examen.length * 100) + " %");');
  if (cs.probe) {
    add(''); add('// Tu color: se prueba igual, sin corregir');
    add('const tuyas = red.predict([' + cs.probe.map(f2).join(', ') + ']);', { m: 'probe', sw: cs.probe });
    add('const tuyo = nombres[tuyas.indexOf(Math.max(...tuyas))];', { m: 'probe' });
  }
  return L;
}
/*SNIP-END*/

/** El texto copiable (sin las líneas «… y N más»). */
export function rawText(cs: ColoresCodeState): string {
  return buildLines(cs).filter((l) => !l.disp).map((l) => l.t).join('\n');
}
export function renderCodeHtml(cs: ColoresCodeState): string { return renderLines(buildLines(cs)); }

/*BRAIN-START*/
export function brainText(n: number, flat: number[], verdict: string, trained: boolean): string {
  const L = ['import { NetworkN } from "@dniskav/neuron";', '',
    'const nombres = ' + names(n) + ';', '',
    trained ? '// Lo que aprendió cada neurona' : '// Sin enseñarle nada: estos números son al azar',
    'const aprendido = ['];
  for (let o = 0, i = 0; o < n; o++, i += 4) L.push('  ' + flat.slice(i, i + 4).join(', ') + ',   // «' + NAMES[o] + '»: rojo, verde, azul, línea');
  L.push('];', '', '// Ponérselo a una red nueva: ya sabe, sin entrenar',
    'const red = new NetworkN([3, ' + n + ']);', 'red.setWeights(aprendido);',
    'const salidas = red.predict([0.90, 0.40, 0.10]);',
    'nombres[salidas.indexOf(Math.max(...salidas))];   // → ' + verdict);
  return L.join('\n');
}
/*BRAIN-END*/

/** Veredicto del color de muestra [0.90, 0.40, 0.10] con los números redondeados del panel. */
export function verdictOf(n: number, flat: number[]): string {
  const net: NetworkN = newNet(n);
  net.setWeights(flat);
  const s = net.predict([0.9, 0.4, 0.1]);
  return NAMES[s.indexOf(Math.max(...s))];
}
