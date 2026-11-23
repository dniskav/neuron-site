/**
 * Lo que se guarda de la serpiente y cómo se recupera (puro, sin DOM). Se guarda LO APRENDIDO: qué veía la red (`vision`: «ojos» o «ayuda»), los 24 números de la red (33 con ayuda) y los de
 * su copia congelada (con `ModelSaver` de @dniskav/neuron, que ya comprueba su forma), las partidas, los pasos, el récord, las
 * últimas 60 partidas (lo que dibuja la curva), y lo que cuenta el cerebro (ajustes y cambio acumulado de cada neurona). El
 * dado (ε) no se guarda: sale de las partidas jugadas (`epsilonAt`). NO se guarda la memoria de jugadas: a 100 partidas son
 * unas 6.000 jugadas (≈ 400 KB de texto) y a 300 llena las 20.000; lo aprendido ya está en los pesos. Tras recuperar, la red
 * sigue jugando y vuelve a juntar recuerdos (no repasa hasta tener 50). Tampoco el estado de Adam (sus medias móviles): con
 * los mismos pesos predice igual, y Adam las rehace en unos pasos.
 */
import { ModelSaver, type NetworkN } from '@dniskav/neuron';
import { SAVE_APP, decode, encode, stringify, type Decoded, type Envelope } from '../viz/savedModel';
import { OUT_N, SIZE, Session, newNet, type Death, type GameResult, type Vision } from './snake';

export const SNAKE_KIND = 'snake';
/**
 * Sube si cambia lo que se guarda: lo desconocido se rechaza (y se dice) en vez de adivinarse.
 * 2: añade `vision` («ojos» o «ayuda», el nivel 2) y `trapped` en cada partida. La 1 sigue leyéndose: es siempre «sus ojos».
 */
export const SNAKE_VERSION = 2;
export const SNAKE_OLDER = [1] as const;
export const VISIONS: Vision[] = ['ojos', 'ayuda'];
/** Partidas recientes que se guardan (las que dibuja la curva). */
export const RESULTS_KEEP = 60;
export const SNAKE_STORE_KEY = SAVE_APP + ':' + SNAKE_KIND;

type Weights = Record<string, unknown>;
export interface Counters { steps: number; travel: number[][] }
export interface SnakeSave {
  /** Lo que ve la red: «ojos» (7 entradas) o «ayuda» (10: las 7 y las 3 de «¿cabe?», calculadas por una persona). */
  vision: Vision;
  seed: number;
  games: number;
  steps: number;
  best: number;
  results: GameResult[];
  /** `ModelSaver.toJSON` de la red y de su copia congelada. */
  net: Weights;
  target: Weights;
  /** Lo que cuenta el cerebro: ajustes y cambio acumulado de cada neurona (`ObservedModel`). */
  brain: Counters;
}

const DEATHS: Death[] = ['none', 'pared', 'cuerpo', 'vueltas'];
const nat = (x: unknown, max = 1e9): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max;
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const bad = (what: string): never => { throw new Error('«' + what + '» no es válido'); };

/** Foto de una serpiente que aprende (con el seed de su serie y los contadores de su cerebro). */
export function toSave(session: Session, seed: number, brain: Counters): SnakeSave {
  return {
    vision: session.vision, seed, games: session.games, steps: session.steps, best: session.best,
    results: session.results.slice(-RESULTS_KEEP).map((r) => ({ food: r.food, steps: r.steps, death: r.death, explored: r.explored, ...(r.trapped === undefined ? {} : { trapped: r.trapped }) })),
    net: JSON.parse(ModelSaver.toJSON(session.net)), target: JSON.parse(ModelSaver.toJSON(session.target)),
    brain: { steps: brain.steps, travel: brain.travel.map((l) => l.slice()) },
  };
}

/** Comprueba la forma de lo guardado (números enteros y finitos, listas de su largo). Lanza con el motivo en español. */
export function checkSave(x: unknown, version: number = SNAKE_VERSION): SnakeSave {
  if (!obj(x)) return bad('lo guardado');
  /* la versión 1 (solo el nivel 1) no decía qué veía la red: veía solo con sus ojos */
  const vision = version < 2 ? 'ojos' : x.vision;
  if (!VISIONS.includes(vision as Vision)) bad('lo que ve la red');
  const { seed, games, steps, best, results, net, target, brain } = x;
  if (!nat(seed) || seed < 1) bad('semilla');
  if (!nat(games, 1e7)) bad('partidas');
  if (!nat(steps, 1e9)) bad('pasos');
  if (!nat(best, SIZE * SIZE)) bad('récord');
  if (!Array.isArray(results) || results.length !== Math.min(games as number, RESULTS_KEEP)) bad('últimas partidas');
  const rs = (results as unknown[]).map((r) => {
    if (!obj(r) || !nat(r.food, SIZE * SIZE) || !nat(r.steps, 1e6) || !DEATHS.includes(r.death as Death) || !nat(r.explored, 1e6)
      || (r.trapped !== undefined && typeof r.trapped !== 'boolean')) return bad('una de las últimas partidas');
    return { food: r.food, steps: r.steps, death: r.death as Death, explored: r.explored, ...(r.trapped === undefined ? {} : { trapped: r.trapped }) } as GameResult;
  });
  if (rs.some((r) => r.food > (best as number))) bad('récord (hay una partida que comió más)');
  if (!obj(net)) bad('red');
  if (!obj(target)) bad('copia de la red');
  if (!obj(brain) || !nat(brain.steps) || !Array.isArray(brain.travel) || brain.travel.length !== 1 || !Array.isArray(brain.travel[0])
    || brain.travel[0].length !== OUT_N || !brain.travel[0].every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) bad('cerebro');
  return { vision: vision as Vision, seed: seed as number, games: games as number, steps: steps as number, best: best as number, results: rs, net: net as Weights, target: target as Weights, brain: { steps: (brain as Counters).steps, travel: (brain as Counters).travel.map((l) => l.slice()) } };
}

/** Pone los pesos de un texto de `ModelSaver` en una red nueva (comprueba forma y números; lanza si no encaja). */
function weightsInto(net: NetworkN, w: Weights, what: string): void {
  try { ModelSaver.fromJSON(net, JSON.stringify(w)); }
  catch (e) { throw new Error('los números de ' + what + ' no encajan con esta red (' + String((e as Error).message).replace(/^ModelSaver\.fromJSON:\s*/, '') + ')'); }
}

/** Una serpiente como estaba al guardar (la memoria de jugadas, vacía). Lanza, sin devolver nada a medias, si algo no encaja. */
export function restoreSession(save: SnakeSave): { session: Session; brain: Counters; seed: number } {
  const net = newNet(save.vision), target = newNet(save.vision);
  weightsInto(net, save.net, 'la red'); weightsInto(target, save.target, 'su copia');
  const session = new Session(save.seed, net, save.vision);
  session.target.setWeights(target.getWeights());
  session.restoreProgress(save);
  return { session, brain: { steps: save.brain.steps, travel: save.brain.travel.map((l) => l.slice()) }, seed: save.seed };
}

export type LoadedSnake = { ok: true; session: Session; brain: Counters; seed: number; savedAt: string } | { ok: false; reason: string };

/** El texto de un guardado (almacén o archivo) a una serpiente lista, o el motivo por el que no se puede usar. Nunca lanza. */
export function loadSnake(text: string): LoadedSnake {
  const d: Decoded<SnakeSave> = decode(text, SNAKE_KIND, SNAKE_VERSION, checkSave, SNAKE_OLDER);
  if (!d.ok) return d;
  try { return { ok: true, ...restoreSession(d.state), savedAt: d.savedAt }; }
  catch (e) { return { ok: false, reason: (e as Error).message }; }
}

/** El sobre que se guarda y se descarga. */
export const snakeEnvelope = (session: Session, seed: number, brain: Counters, now?: Date): Envelope<SnakeSave> => encode(SNAKE_KIND, SNAKE_VERSION, toSave(session, seed, brain), now);
export const snakeText = (session: Session, seed: number, brain: Counters, pretty = true, now?: Date): string => stringify(snakeEnvelope(session, seed, brain, now), pretty);
