/**
 * El código real que muestra el panel </> de «¿Dónde caerá?»: se construye con las caídas guardadas de verdad y con el
 * modelo que hay ahora (la neurona sola o el equipo), así que lo que se ve es lo que entrena. Y el panel del cerebro:
 * los números aprendidos.
 */
import { NetworkN, linear, sigmoid, tanh } from '@dniskav/neuron';
import { renderLines, type CodeLine, type CodeMode } from './ensenaleCode';
import { HIDDEN, INIT_SEED, LR, TEAM, passesFor, teamActNames, type Drop, type Kind, type Team } from './paleta';

export interface PaletaCodeState {
  kind: Kind;
  walls: boolean;
  /** Techo y rebote en la paleta (por defecto: techo sí, rebote no). Solo cambian qué bolas llegan, no lo que se aprende. */
  ceiling?: boolean;
  rebound?: boolean;
  /** Hay un bloque que la red no ve. */
  block?: boolean;
  /** Los interruptores del equipo. */
  team: Team;
  /** Las caídas guardadas (las más recientes al final). */
  saved: Drop[];
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}

const LIM = 8, SHOW = 3;
/** Los nombres distintos de activaciones, en orden, para el import. */
const importNames = (a: string[]): string => [...new Set(a)].join(', ');
const f2 = (x: number): string => x.toFixed(2);
const cl = (d: Drop): string => '{ x: ' + f2(d.x) + ', inclinacion: ' + f2(d.slope) + ', altura: ' + f2(d.y) + ', cayo: ' + f2(d.land) + ' }';

export function newPaletaCodeState(): PaletaCodeState {
  return { kind: 'solo', walls: false, team: { ...TEAM }, saved: [], probe: null, open: { ej: false, ex: false }, mode: 'exam', cur: null };
}

/*SNIP-START*/
export function buildLines(cs: PaletaCodeState): CodeLine[] {
  const L: CodeLine[] = [], solo = cs.kind === 'solo', saved = cs.saved, nom = solo ? 'neurona' : 'red';
  const add = (t: string, o?: Partial<CodeLine>): CodeLine => { const l = { ...(o || {}), t } as CodeLine; L.push(l); return l; };
  const acts = teamActNames(cs.team);
  add(solo ? 'import { NetworkN, Adam, linear, setRandom, seededRandom } from "@dniskav/neuron";' : 'import { NetworkN, Adam, ' + importNames(acts) + ', setRandom, seededRandom } from "@dniskav/neuron";');
  add('');
  if (saved.length) {
    add('// Lo que vio y dónde cayó, bola a bola (' + saved.length + (saved.length === 1 ? ' caída guardada)' : ' caídas guardadas)'));
    add('const caidas = [');
    const coll = saved.length > LIM && !cs.open.ej;
    saved.forEach((d, i) => {
      add('  ' + cl(d) + ',', { grp: 'ej', i, hid: coll && i >= SHOW });
      if (coll && i === SHOW - 1) add('  // … y ' + (saved.length - SHOW) + ' más', { more: 'ej', disp: true });
    });
    if (saved.length > LIM && cs.open.ej) add('  // mostrar menos', { less: 'ej', disp: true });
    add('];');
  } else add('const caidas = [];   // todavía no ha caído ninguna bola');
  add('');
  if (solo) {
    add('// Una sola neurona: ve dónde está la bola, cuánto se inclina y a qué altura empieza a bajar, y dice dónde caerá');
    add('setRandom(seededRandom(' + INIT_SEED + '));   // así nace la de esta pantalla');
    add('const neurona = new NetworkN([3, 1], { activations: [linear], optimizer: () => new Adam() });');
    add('setRandom(null);');
  } else {
    add('// Un equipo: ' + HIDDEN + ' neuronas ayudantes entre lo que ve y lo que dice');
    add('setRandom(seededRandom(' + INIT_SEED + '));   // así nace la de esta pantalla');
    add('// medio: ' + (cs.team.curve ? 'tanh (dobla la respuesta)' : 'linear (no dobla)') + ' · final: ' + (cs.team.bounded ? 'sigmoid (entre 0 y 1)' : 'linear (sin límite)'));
    add('const red = new NetworkN([3, ' + HIDDEN + ', 1], { activations: [' + acts.join(', ') + '], optimizer: () => new Adam() });');
    add('setRandom(null);');
  }
  add('');
  add('// Cada vez que la bola empieza a bajar, la ' + nom + ' dice dónde caerá y la paleta va ahí y se para (código normal, no aprende)');
  add('const dondeCae = ' + nom + '.predict([bola.x, bola.inclinacion, bola.altura])[0];', { m: 'exam' });
  add('paleta.irA(dondeCae);', { m: 'exam' });
  add('');
  add('// Cuando la bola llega abajo ya se sabe dónde cayó: se guarda, sin que nadie etiquete nada');
  add('caidas.push({ x: bola.x, inclinacion: bola.inclinacion, altura: bola.altura, cayo: bola.xAbajo });');
  add('');
  add('// Y se REPASAN todas las caídas guardadas: responde y la corrigen');
  const np = passesFor(cs.kind, saved.length);
  add('for (let repaso = 0; repaso < ' + np + '; repaso++)');
  add('  for (const c of caidas)');
  add('    ' + nom + '.train([c.x, c.inclinacion, c.altura], [c.cayo], ' + LR[cs.kind] + ');', { m: 'learn' });
  if (cs.walls) { add(''); add('// Con paredes la bola rebota: ' + (solo ? 'una línea recta no puede seguir tantos giros' : cs.team.curve ? 'las neuronas ayudantes dibujan los giros' : 'sin doblarse, las ayudantes siguen siendo una recta y no siguen los giros')); }
  if (cs.rebound) {
    add('');
    add('// Si la paleta la atrapa, la devuelve hacia arriba (según dónde pegue) y el juego sigue.');
    add('// ' + (cs.ceiling === false ? 'Sin techo: si sube, sale por arriba y se lanza otra bola.' : 'Con techo: rebota arriba y vuelve a bajar.'));
    add('// ' + (cs.block ? 'Cada bajada se guarda igual, como un par (lo que vio → dónde cayó).' : 'Toda bajada empieza a la altura del techo: se guarda igual, como un par (lo que vio → dónde cayó).'));
  }
  if (cs.block) {
    add('');
    add('// Hay un bloque que la ' + nom + ' NO ve. Si la bola rebota en él, empieza a bajar de nuevo, desde otra altura:');
    add('// la ' + nom + ' vuelve a mirar (dónde está, inclinación y la altura nueva) y la paleta corrige.');
    add('// Esa bajada cortada no se guarda (no llegó abajo): el ejemplo es la que llega sin chocar con nada.');
  }
  return L;
}
/*SNIP-END*/

/** El texto copiable (sin las líneas «… y N más»). */
export function rawText(cs: PaletaCodeState): string {
  return buildLines(cs).filter((l) => !l.disp).map((l) => l.t).join('\n');
}
export function renderCodeHtml(cs: PaletaCodeState): string { return renderLines(buildLines(cs)); }

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/*BRAIN-START*/
export function brainText(kind: Kind, flat: number[], verdict: string, trained: boolean, team: Team = TEAM): string {
  const solo = kind === 'solo', acts = teamActNames(team);
  return [
    'import { NetworkN' + (solo ? ', linear' : ', ' + importNames(acts)) + ' } from "@dniskav/neuron";', '',
    trained ? '// Lo que aprendió: ' + flat.length + ' números' : '// Sin enseñarle nada: estos números son al azar',
    'const aprendido = [' + flat.map(r3).join(', ') + '];', '',
    '// Ponérselo a ' + (solo ? 'una neurona' : 'una red') + ' nueva: ya sabe, sin entrenar',
    solo ? 'const neurona = new NetworkN([3, 1], { activations: [linear] });' : 'const red = new NetworkN([3, ' + HIDDEN + ', 1], { activations: [' + acts.join(', ') + '] });',
    (solo ? 'neurona' : 'red') + '.setWeights(aprendido);',
    (solo ? 'neurona' : 'red') + '.predict([0.30, 0.50, 1.00])[0];   // → ' + verdict,
  ].join('\n');
}
/*BRAIN-END*/

/** Lo que dice una red con los números redondeados del panel para una bola en x = 0,3, inclinación 0,5 y altura 1 (el techo). */
export function verdictOf(kind: Kind, flat: number[], team: Team = TEAM): string {
  const n = kind === 'solo' ? new NetworkN([3, 1], { activations: [linear] }) : new NetworkN([3, HIDDEN, 1], { activations: [team.curve ? tanh : linear, team.bounded ? sigmoid : linear] });
  n.setWeights(flat.map(r3));
  return f2(n.predict([0.3, 0.5, 1])[0]);
}
