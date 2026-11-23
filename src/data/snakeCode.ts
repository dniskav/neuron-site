/**
 * El código real que muestra el panel </> de «Nivel 1: aprender con premios»: se construye con lo que lleva la serpiente de
 * verdad (partidas, pasos, cuánto prueba al azar ahora y los últimos recuerdos guardados), así que lo que se ve es lo que hace.
 * Y el panel del cerebro: los 24 números aprendidos. Cada línea corresponde a una línea de `Session` (src/data/snake.ts).
 */
import { NetworkN, linear } from '@dniskav/neuron';
import { fmtCount } from '../viz/BrainMeter';
import { renderLines, type CodeLine, type CodeMode } from './ensenaleCode';
import { BATCH, GAMMA, INIT_SEED, LR, MOVES, OUT_N, REWARD, SYNC, MAX_IDLE, inCount, type Memory, type Vision } from './snake';

export interface SnakeCodeState {
  /** Lo que ve la red: sus ojos (7 entradas) o sus ojos y la ayuda (10). */
  vision: Vision;
  /** Partidas acabadas y pasos jugados. */
  games: number;
  steps: number;
  /** Cuánto prueba al azar ahora (0..1). */
  epsilon: number;
  /** Cuántos recuerdos hay guardados y los últimos (los más recientes al final). */
  memCount: number;
  recent: Memory[];
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}

const SHOW = 4;
const f2 = (x: number): string => x.toFixed(2);
const bits = (v: number[]): string => '[' + v.join(', ') + ']';
const mem = (m: Memory): string => '{ ve: ' + bits(m.ve) + ', jugada: ' + m.jugada + ', premio: ' + f2(m.premio) + ', siguiente: ' + bits(m.siguiente) + ', fin: ' + m.fin + ' }';

export function newSnakeCodeState(): SnakeCodeState {
  return { vision: 'ojos', games: 0, steps: 0, epsilon: 1, memCount: 0, recent: [], probe: null, open: { ej: false, ex: false }, mode: 'exam', cur: null };
}

/*SNIP-START*/
export function buildLines(cs: SnakeCodeState): CodeLine[] {
  const L: CodeLine[] = [];
  const add = (t: string, o?: Partial<CodeLine>): void => { L.push({ ...(o || {}), t } as CodeLine); };
  add('import { NetworkN, Adam, linear, setRandom, seededRandom } from "@dniskav/neuron";');
  add('');
  const IN_N = inCount(cs.vision), help = cs.vision === 'ayuda';
  add('// Una red SIN capa oculta: mira ' + IN_N + ' cosas y dice cuánto vale cada una de las ' + OUT_N + ' jugadas');
  add('// (girar a la izquierda, seguir recto, girar a la derecha)');
  add('setRandom(seededRandom(' + INIT_SEED + '));   // así nace la de esta pantalla');
  add('const red = new NetworkN([' + IN_N + ', ' + OUT_N + '], { activations: [linear], optimizer: () => new Adam() });');
  add('const copia = new NetworkN([' + IN_N + ', ' + OUT_N + '], { activations: [linear] });   // una copia congelada de la red');
  add('setRandom(null);');
  add('copia.setWeights(red.getWeights());');
  add('');
  add(cs.memCount ? '// Los recuerdos: lo que vio, qué jugada hizo, qué premio tuvo y lo que vio después (' + fmtCount(cs.memCount) + ' guardados)' : '// Los recuerdos: lo que vio, qué jugada hizo, qué premio tuvo y lo que vio después');
  if (cs.memCount) {
    add('const recuerdos = [');
    if (cs.memCount > SHOW) add('  // … y ' + fmtCount(cs.memCount - SHOW) + ' más', { disp: true });
    cs.recent.slice(-SHOW).forEach((m, i) => add('  ' + mem(m) + ',', { grp: 'ej', i }));
    add('];');
  } else add('const recuerdos = [];   // todavía no ha jugado nada');
  add('');
  if (help) {
    add('// ✍ ESCRITO POR UNA PERSONA: la red no lo aprende, se lo dan hecho');
    add('// Cuánto sitio le queda a la serpiente si hace esa jugada');
    add('function sitioTras(jugada) {');
    add('  const [x, y] = casillaAl(jugada);   // la casilla a la que iría');
    add('  if (choca(x, y)) return 0;           // pared o cuerpo');
    add('  const vistas = new Set([x + "," + y]), pila = [[x, y]];');
    add('  while (pila.length) {                // un «relleno»: se extiende por las casillas libres');
    add('    const [px, py] = pila.pop();');
    add('    for (const [vx, vy] of vecinas(px, py))');
    add('      if (!choca(vx, vy) && !vistas.has(vx + "," + vy)) { vistas.add(vx + "," + vy); pila.push([vx, vy]); }');
    add('  }');
    add('  return vistas.size;                  // casillas libres a las que podría llegar');
    add('}');
    add('// ✍ «¿cabe?»: sitio ÷ largo, como mucho 1 (1 = cabe entera, 0 = choca o se encierra)');
    add('const cabe = [0, 1, 2].map((j) => Math.min(sitioTras(j) / serpiente.largo, 1));   // [izquierda, recto, derecha]');
    add('');
  }
  add('// Cada paso: la red mira y dice cuánto vale cada jugada');
  add(help
    ? 'const ve = [peligroIzq, peligroDelante, peligroDer, comidaDelante, comidaDetras, comidaIzq, comidaDer, ...cabe];   // 7 de sus ojos + 3 de «¿cabe?»'
    : 'const ve = [peligroIzq, peligroDelante, peligroDer, comidaDelante, comidaDetras, comidaIzq, comidaDer];   // cada uno 0 o 1', { m: 'exam' });
  add('const valores = red.predict(ve);   // [izquierda, recto, derecha]', { m: 'exam' });
  add('');
  add('// Casi siempre elige la que más vale. Con probabilidad ' + f2(cs.epsilon) + ' tira un dado y prueba una al azar (así descubre cosas)');
  add('const alAzar = Math.random() < ' + f2(cs.epsilon) + ';', { m: 'exam' });
  add('const jugada = alAzar ? Math.floor(Math.random() * 3) : valores.indexOf(Math.max(...valores));', { m: 'exam' });
  add('');
  add('// El juego da el premio: +' + REWARD.eat + ' si come, ' + REWARD.die + ' si choca, ' + REWARD.step + ' por cada paso, ' + REWARD.loop + ' si da vueltas ' + MAX_IDLE + ' pasos sin comer');
  add('const premio = serpiente.mover(jugada);');
  add('recuerdos.push({ ve, jugada, premio, siguiente: serpiente.mira(), fin: serpiente.acabo });');
  add('');
  add('// Aprender: repasa ' + BATCH + ' recuerdos al azar. Nadie le dice qué jugada era la buena: solo lo que pasó después');
  add('for (let i = 0; i < ' + BATCH + '; i++) {');
  add('  const r = recuerdos[Math.floor(Math.random() * recuerdos.length)];');
  add('  // meta = su premio + (si no acabó) lo mejor que puede venir después, contado por la copia congelada');
  add('  const meta = r.premio + (r.fin ? 0 : ' + GAMMA + ' * Math.max(...copia.predict(r.siguiente)));');
  add('  const pedido = red.predict(r.ve);');
  add('  pedido[r.jugada] = meta;   // solo cambia la jugada que hizo; las otras se quedan como están');
  add('  red.train(r.ve, pedido, ' + LR + ');', { m: 'learn' });
  add('}');
  add('');
  add('// Cada ' + SYNC + ' pasos, la copia se pone al día');
  add('if (pasos % ' + SYNC + ' === 0) copia.setWeights(red.getWeights());');
  return L;
}
/*SNIP-END*/

/** El texto copiable (sin las líneas «… y N más»). */
export function rawText(cs: SnakeCodeState): string {
  return buildLines(cs).filter((l) => !l.disp).map((l) => l.t).join('\n');
}
export function renderCodeHtml(cs: SnakeCodeState): string { return renderLines(buildLines(cs)); }

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Una situación de muestra: pared delante, comida a la derecha (con ayuda: a los lados cabe entera; delante choca, no cabe). */
export const sampleOf = (v: Vision): number[] => (v === 'ayuda' ? [0, 1, 0, 0, 0, 0, 1, 1, 0, 1] : [0, 1, 0, 0, 0, 0, 1]);
export const SAMPLE = sampleOf('ojos');

/*BRAIN-START*/
export function brainText(flat: number[], verdict: string, trained: boolean, vision: Vision = 'ojos'): string {
  const IN_N = inCount(vision);
  return [
    'import { NetworkN, linear } from "@dniskav/neuron";', '',
    trained ? '// Lo que aprendió: ' + flat.length + ' números (' + (IN_N + 1) + ' por cada jugada)' : '// Sin enseñarle nada: estos números son al azar',
    'const aprendido = [' + flat.map(r3).join(', ') + '];', '',
    '// Ponérselo a una red nueva: ya sabe jugar, sin entrenar',
    'const red = new NetworkN([' + IN_N + ', ' + OUT_N + '], { activations: [linear] });',
    'red.setWeights(aprendido);',
    'red.predict(' + bits(sampleOf(vision)) + ');   // pared delante y comida a la derecha' + (vision === 'ayuda' ? ' (cabe a los lados, delante no)' : '') + ' → ' + verdict,
  ].join('\n');
}
/*BRAIN-END*/

/** Lo que dice una red con los números redondeados del panel para la situación de muestra: los tres valores y la jugada que elegiría. */
export function verdictOf(flat: number[], vision: Vision = 'ojos'): string {
  const n = new NetworkN([inCount(vision), OUT_N], { activations: [linear] });
  n.setWeights(flat.map(r3));
  const q = n.predict(sampleOf(vision));
  return '[' + q.map(f2).join(', ') + '] ' + MOVES[q.indexOf(Math.max(...q))];
}
