/**
 * «Nivel 1: aprender con premios» (Snake). Todo lo que NO es dibujo, puro y determinista (con semilla): el juego, los premios,
 * la red real de @dniskav/neuron y la forma de aprender. La verificación previa vive en `experiments/snake/` (RESULTADOS.md).
 *
 * Nadie le dice a la serpiente qué hacer. Solo recibe premios: +1 si come, −1 si choca, un poquito menos por cada paso (para
 * que no pierda el tiempo) y −0,5 si da vueltas 100 pasos sin comer. La red mira 7 cosas (peligro a la izquierda, delante y a
 * la derecha; dónde está la comida respecto a su rumbo) y dice cuánto VALE cada una de las 3 jugadas (girar a la izquierda,
 * seguir recto, girar a la derecha). Elige la que más vale; a veces, a propósito, tira un dado y prueba otra (si no, nunca
 * descubriría nada nuevo). Lo que pasa después le dice si acertó: cada jugada se guarda y la red repasa recuerdos al azar.
 *
 * Red: `NetworkN([7, 3])`, salida lineal, Adam, SIN capa oculta (medido: igual de buena que con una oculta de 8 y 3 veces más rápida).
 *
 * «Nivel 2: no encerrarse»: la misma red con 3 entradas más (`NetworkN([10, 3])`): «¿cabe si giro a la izquierda / sigo recto / giro a la
 * derecha?». Las calcula UNA PERSONA con código (`Game.room`: un relleno que cuenta el sitio libre que queda; `Game.fits`: sitio ÷ largo,
 * como mucho 1); la red no lo aprende, solo aprende cuándo fiarse de ello y cuándo ir a por la comida. Medido en
 * `experiments/snake/RESULTADOS2.md` (variante 4b): ≈ 33 comidas por partida frente a ≈ 19 con solo sus ojos.
 */
import { Adam, NetworkN, linear, seededRandom, setRandom } from '@dniskav/neuron';
import { mulberry32 } from '../viz/core/rng';
import { CurveHistory, type CurveData } from '../viz/learningCurve';

/** Cuándo se dice que la red «ya no mejora» (ver `plateau` en `viz/learningCurve.ts`): 50 partidas frente a las 50 de antes, no antes de 150 partidas ni dentro de la fase del dado ε (`EPS_GAMES`). */
export const PLATEAU = { window: 50, minGames: 150, skip: 70, minGain: 0.5, k: 0.4, better: 'up' } as const;

// ---------- el juego ----------
export const SIZE = 10;
export const START_LEN = 3;
/** Pasos seguidos sin comer tras los que la partida acaba por dar vueltas. */
export const MAX_IDLE = 100;
/** Los premios. */
export const REWARD = { eat: 1, die: -1, step: -0.01, loop: -0.5 } as const;

/** 0 = arriba, 1 = derecha, 2 = abajo, 3 = izquierda. */
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
/** Jugadas relativas al rumbo: girar a la izquierda, seguir recto, girar a la derecha (el orden de las 3 salidas de la red). */
export const MOVES = ['a la izquierda', 'recto', 'a la derecha'] as const;
export type Move = 0 | 1 | 2;
export type Death = 'none' | 'pared' | 'cuerpo' | 'vueltas';
/** Lo que ve la red: solo «sus ojos» (7 números del tablero) o «con ayuda» (esos 7 + 3 que calcula una persona con código: ¿cabe si giro?). */
export type Vision = 'ojos' | 'ayuda';

export interface StepResult {
  reward: number;
  ate: boolean;
  done: boolean;
  death: Death;
}

export class Game {
  readonly n: number;
  /** [x, y] de cada trozo, la cabeza primero. */
  body: [number, number][] = [];
  private grid: Uint8Array;
  dir = 1;
  food: [number, number] = [0, 0];
  eaten = 0;
  steps = 0;
  /** Pasos desde la última comida. */
  idle = 0;
  done = false;
  death: Death = 'none';
  /** Si murió chocando: ¿estaba ya encerrada (sin ninguna jugada que dejara sitio para su largo)? Es la definición de la investigación (`experiments/snake`). */
  trapped = false;
  constructor(private rng: () => number, n = SIZE) {
    this.n = n;
    this.grid = new Uint8Array(n * n);
    this.reset();
  }
  /** Partida nueva: serpiente de 3 en la fila del medio, mirando a la derecha, y una comida al azar. */
  reset(): void {
    const n = this.n, y0 = (n / 2) | 0, x0 = ((n - START_LEN) / 2 + START_LEN - 1) | 0;
    this.grid.fill(0);
    this.body = Array.from({ length: START_LEN }, (_, i) => [x0 - i, y0] as [number, number]);
    for (const [x, y] of this.body) this.grid[y * n + x] = 1;
    this.dir = 1; this.eaten = 0; this.steps = 0; this.idle = 0; this.done = false; this.death = 'none'; this.trapped = false;
    this.placeFood();
  }
  private placeFood(): void {
    const n = this.n;
    for (;;) {
      const x = (this.rng() * n) | 0, y = (this.rng() * n) | 0;
      if (!this.grid[y * n + x]) { this.food = [x, y]; return; }
    }
  }
  /** ¿Hay pared o cuerpo en esa casilla? */
  blocked(x: number, y: number): boolean { return x < 0 || y < 0 || x >= this.n || y >= this.n || this.grid[y * this.n + x] === 1; }
  /** El rumbo absoluto de una jugada relativa (0 izquierda, 1 recto, 2 derecha). */
  absDir(move: number): number { return (this.dir + move + 3) % 4; }
  /** La casilla a la que iría con esa jugada. */
  cellAfter(move: number): [number, number] {
    const d = this.absDir(move), [hx, hy] = this.body[0];
    return [hx + DX[d], hy + DY[d]];
  }
  /**
   * Lo que la red MIRA, 7 números de 0 o 1: peligro a la izquierda, delante y a la derecha (pared o cuerpo en la casilla de al
   * lado), y dónde está la comida respecto a su rumbo: delante, detrás, a la izquierda, a la derecha.
   */
  vision(): number[] {
    const [hx, hy] = this.body[0], d = this.dir;
    const danger = [0, 1, 2].map((m) => { const [x, y] = this.cellAfter(m); return this.blocked(x, y) ? 1 : 0; });
    const dx = this.food[0] - hx, dy = this.food[1] - hy;
    const ahead = dx * DX[d] + dy * DY[d], left = dx * DX[(d + 3) % 4] + dy * DY[(d + 3) % 4];
    return [...danger, ahead > 0 ? 1 : 0, ahead < 0 ? 1 : 0, left > 0 ? 1 : 0, left < 0 ? 1 : 0];
  }
  /**
   * ESCRITO POR UNA PERSONA (no lo aprende la red): cuántas casillas libres podría alcanzar la serpiente tras esa jugada, contando
   * con un «relleno» que se extiende desde la casilla de al lado (el cuerpo y la pared cierran el paso; la cola cuenta como cuerpo,
   * que es lo prudente). 0 si esa jugada choca.
   */
  room(move: number): number {
    const [sx, sy] = this.cellAfter(move), n = this.n;
    if (this.blocked(sx, sy)) return 0;
    const seen = new Uint8Array(n * n), stack = [sx + sy * n];
    seen[sx + sy * n] = 1;
    let count = 0;
    while (stack.length) {
      const p = stack.pop() as number, px = p % n, py = (p / n) | 0;
      count++;
      for (let d = 0; d < 4; d++) {
        const x = px + DX[d], y = py + DY[d];
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const q = x + y * n;
        if (!seen[q] && !this.grid[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    return count;
  }
  /** «¿Cabe?»: el sitio que queda tras esa jugada dividido por su largo, como mucho 1 (1 = cabe entera; 0 = choca o se encierra sin sitio). */
  fits(move: number): number { return Math.min(this.room(move) / this.body.length, 1); }
  /** Lo que ve la red en cada nivel: 7 números, o esos 7 y los 3 de «¿cabe?» (izquierda, recto, derecha). */
  visionFor(v: Vision): number[] {
    const base = this.vision();
    return v === 'ayuda' ? [...base, this.fits(0), this.fits(1), this.fits(2)] : base;
  }
  /** ¿Está encerrada ahora? Ninguna jugada libre deja sitio (≥ su largo) para moverse. */
  isTrapped(): boolean {
    for (let m = 0; m < 3; m++) {
      const [x, y] = this.cellAfter(m);
      if (!this.blocked(x, y) && this.room(m) >= this.body.length) return false;
    }
    return true;
  }
  /** Da un paso con una jugada y devuelve el premio. */
  step(move: number): StepResult {
    if (this.done) throw new Error('Game.step: la partida ya acabó');
    const d = this.absDir(move), [nx, ny] = this.cellAfter(move), n = this.n;
    this.steps++; this.idle++;
    const tail = this.body[this.body.length - 1];
    const eating = nx === this.food[0] && ny === this.food[1];
    /* la cola se mueve (libera su casilla) salvo que coma, que entonces crece */
    const hitBody = this.grid[ny * n + nx] === 1 && !(!eating && nx === tail[0] && ny === tail[1]);
    if (nx < 0 || ny < 0 || nx >= n || ny >= n) { this.trapped = this.isTrapped(); this.done = true; this.death = 'pared'; return { reward: REWARD.die, ate: false, done: true, death: 'pared' }; }
    if (hitBody) { this.trapped = this.isTrapped(); this.done = true; this.death = 'cuerpo'; return { reward: REWARD.die, ate: false, done: true, death: 'cuerpo' }; }
    this.dir = d;
    this.body.unshift([nx, ny]); this.grid[ny * n + nx] = 1;
    if (eating) {
      this.eaten++; this.idle = 0;
      if (this.body.length >= n * n - 1) { this.done = true; return { reward: REWARD.eat, ate: true, done: true, death: 'none' }; }
      this.placeFood();
      return { reward: REWARD.eat, ate: true, done: false, death: 'none' };
    }
    const t = this.body.pop() as [number, number]; this.grid[t[1] * n + t[0]] = 0;
    if (this.idle > MAX_IDLE) { this.done = true; this.death = 'vueltas'; return { reward: REWARD.loop, ate: false, done: true, death: 'vueltas' }; }
    return { reward: REWARD.step, ate: false, done: false, death: 'none' };
  }
}

// ---------- referencias: el azar y una regla escrita a mano ----------
/** La regla «si»: de las jugadas sin choque inmediato, la que deja la comida más cerca (a igual, recto antes que girar). Nadie la aprende: la escribe una persona. */
export function ruleMove(g: Game): Move {
  const [fx, fy] = g.food;
  let best: Move = 1, bd = Infinity;
  for (const m of [1, 0, 2] as Move[]) {
    const [x, y] = g.cellAfter(m);
    if (g.blocked(x, y)) continue;
    const dist = Math.abs(x - fx) + Math.abs(y - fy);
    if (dist < bd) { bd = dist; best = m; }
  }
  return best;
}
/**
 * La regla «si» con ayuda, también escrita a mano (la de `experiments/snake`): de las jugadas sin choque, solo las que dejan sitio para
 * todo su largo (`room ≥ largo`); entre ellas, la que deja la comida más cerca; si ninguna cabe, la que deja más sitio. Nadie la aprende.
 */
export function ruleHelpMove(g: Game): Move {
  const [fx, fy] = g.food, len = g.body.length;
  let best = -1, bd = Infinity, fallback = -1, fallbackRoom = -1;
  for (const m of [1, 0, 2] as Move[]) {
    const [x, y] = g.cellAfter(m);
    if (g.blocked(x, y)) continue;
    const room = g.room(m);
    if (room > fallbackRoom) { fallbackRoom = room; fallback = m; }
    if (room >= len) { const dist = Math.abs(x - fx) + Math.abs(y - fy); if (dist < bd) { bd = dist; best = m; } }
  }
  return (best >= 0 ? best : fallback >= 0 ? fallback : 1) as Move;
}
/** Comidas por partida de una jugada fija (media de `games` partidas con esa semilla). */
export function meanFood(pick: (g: Game, rng: () => number) => number, games: number, seed: number): number {
  const rng = mulberry32(seed), g = new Game(rng);
  let total = 0;
  for (let i = 0; i < games; i++) { g.reset(); while (!g.done) g.step(pick(g, rng)); total += g.eaten; }
  return total / games;
}
/** Lo que come jugando al azar (medido: ≈ 0,15 por partida). */
export const randomScore = (games = 200, seed = 5): number => meanFood((_g, r) => (r() * 3) | 0, games, seed);
/** Lo que come la regla escrita a mano (medido: ≈ 18 por partida). */
export const ruleScore = (games = 200, seed = 5): number => meanFood((g) => ruleMove(g), games, seed);

/** Lo que come la regla escrita a mano que cuenta el sitio que queda (medido: ≈ 30 por partida, el doble que la regla `if` sola). */
export const ruleHelpScore = (games = 200, seed = 5): number => meanFood((g) => ruleHelpMove(g), games, seed);
/** La regla de referencia de cada nivel: la `if` (nivel 1) o la `if` con el sitio que queda (nivel 2). */
export const refScore = (v: Vision, games = 200, seed = 5): number => (v === 'ayuda' ? ruleHelpScore(games, seed) : ruleScore(games, seed));

// ---------- la red y la forma de aprender ----------
export const INPUT_NAMES = ['peligro a la izquierda', 'peligro delante', 'peligro a la derecha', 'comida delante', 'comida detrás', 'comida a la izquierda', 'comida a la derecha'];
export const IN_N = INPUT_NAMES.length;
/** Las 3 entradas que calcula una persona (nivel 2): ¿cabe si giro a la izquierda / sigo recto / giro a la derecha? */
export const HELP_NAMES = ['¿cabe a la izquierda?', '¿cabe recto?', '¿cabe a la derecha?'];
export const INPUT_NAMES_HELP = [...INPUT_NAMES, ...HELP_NAMES];
export const IN_HELP = INPUT_NAMES_HELP.length;
/** El color de lo que calcula una persona (las 3 entradas de ayuda): distinto del rojo del peligro y del verde de la comida. */
export const HELP_RGB = '106,167,255';
export const inCount = (v: Vision): number => (v === 'ayuda' ? IN_HELP : IN_N);
export const OUT_N = 3;
export const INIT_SEED = 7;
export const LR = 0.003;
/** Cuánto pesa lo que vendrá después (0,9: lo próximo cuenta, pero menos que lo de ahora). */
export const GAMMA = 0.9;
/** Recuerdos que repasa tras cada paso. */
export const BATCH = 8;
/** Cada cuántos pasos se copia la red a la copia congelada (la «meta» se mide con esta copia, que no se mueve a cada paso). */
export const SYNC = 500;
export const MEMORY = 20000;
/** No empieza a repasar hasta tener estos recuerdos (medido: 50 y 200 dan lo mismo a las 100 partidas; con 50 aprende desde la primera partida). */
export const WARM = 50;
/**
 * Cuánto prueba al azar (la probabilidad de tirar el dado), según las partidas que lleva: empieza en 1 (todo al azar), baja
 * en línea recta hasta `EPS_END` tras `EPS_GAMES` partidas y se queda ahí.
 */
export const EPS_END = 0.02;
export const EPS_GAMES = 70;
export const epsilonAt = (games: number): number => Math.max(EPS_END, 1 - (1 - EPS_END) * (games / EPS_GAMES));
/**
 * Con cuánto cambio acumulado se llena una neurona al 63 % (`fillOf`): la suma, paso a paso, de Σ|Δw| + |Δb| (`ObservedModel.travel`).
 * Medido con la red real (media de las 3 neuronas, 3 semillas): 20 partidas → 4; 50 → 24; 100 → 140; 200 → 430; 400 → 980 (sigue
 * subiendo porque, ya jugando bien, cada partida dura más pasos). Escala 100: 50 partidas llenan ~20 %, 100 ~75 %, 200 ~98 %.
 * Mide cuánto se ha movido cada neurona, no lo bien que come la serpiente.
 */
export const BRAIN_SCALE = 100;

/** Red nueva: nace siempre con los mismos pesos. Sin capa oculta: 3 neuronas, cada una «cuánto vale esta jugada» (7 entradas, o 10 con ayuda). */
export function newNet(v: Vision = 'ojos'): NetworkN {
  setRandom(seededRandom(INIT_SEED));
  try { return new NetworkN([inCount(v), OUT_N], { activations: [linear], optimizer: () => new Adam() }); } finally { setRandom(null); }
}

/** Un recuerdo: lo que vio, lo que hizo, el premio y lo que vio después. */
export interface Memory { ve: number[]; jugada: number; premio: number; siguiente: number[]; fin: boolean }
/** Lo que decide la red en un paso. `explored`: tiró el dado y probó una jugada al azar; `best`: la que más valía. */
export interface Decision { ve: number[]; values: number[]; best: number; move: Move; explored: boolean }
/** Lo que pasa en un paso completo. */
export interface StepInfo extends StepResult { decision: Decision; trains: number; gameOver: boolean; length: number; record: boolean }
/** Cómo acabó una partida. */
export interface GameResult {
  food: number; steps: number; death: Death; explored: number;
  /** Si chocó: ¿estaba ya encerrada? (`undefined` en lo guardado antes del nivel 2: no se sabe) */
  trapped?: boolean;
}
/** Cómo murió, en una palabra: «se encerró» (chocó cuando ya no había sitio), «chocó» (chocó teniendo una salida) o «dio vueltas». */
export type Fate = 'encerró' | 'chocó' | 'vueltas' | 'ninguna';
export function fateOf(r: { death: Death; trapped?: boolean }): Fate {
  if (r.death === 'vueltas') return 'vueltas';
  if (r.death === 'none') return 'ninguna';
  return r.trapped ? 'encerró' : 'chocó';
}
/** De las últimas `n` partidas que acabaron mal (chocar o dar vueltas), la parte que murió encerrada (0..1; null si no hay ninguna con el dato). Es el «% encerrada» de la investigación. */
export function trappedShare(results: GameResult[], n = 20): number | null {
  const r = results.slice(-n).filter((x) => x.death === 'vueltas' || (x.death !== 'none' && x.trapped !== undefined));
  return r.length ? r.filter((x) => x.death !== 'vueltas' && x.trapped).length / r.length : null;
}

/** Los textos de cada nivel (los usa la pantalla; el HTML de partida es el del nivel 1). */
export const LEVELS: Record<Vision, { title: string; sub: string; toggle: string; explain: string; note: string }> = {
  ojos: {
    title: 'Nivel 1: aprender con premios',
    sub: 'Nadie le dice a la serpiente qué hacer. Solo sabe dos cosas: «comí» (+) y «choqué» (−). Con eso aprende a jugar sola.',
    toggle: 'Lo que ve: sus ojos',
    explain: 'Solo mira lo que tiene pegado a la cabeza y dónde está la comida. No sabe cuánto sitio le queda.',
    note: '',
  },
  ayuda: {
    title: 'Nivel 2: no encerrarse',
    sub: 'Se encierra porque no sabe cuánto sitio le queda. Una persona escribió código que lo cuenta y se lo da a la red; la red aprende cuándo fiarse de eso.',
    toggle: 'Lo que ve: con ayuda',
    explain: 'Además de sus ojos, recibe 3 números que calcula una persona con código: cuánto sitio le queda si gira a la izquierda, sigue recto o gira a la derecha.',
    note: '✍ = calculado por una persona (código normal, no lo aprende la red)',
  },
};

const argmax = (v: number[]): number => v.indexOf(Math.max(...v));

/** La meta de un recuerdo: su premio, más lo que vale lo mejor que puede venir después (según la copia congelada). 0 más si la partida acabó. */
export const goalOf = (m: Memory, target: NetworkN): number => m.premio + (m.fin ? 0 : GAMMA * Math.max(...target.predict(m.siguiente)));

/**
 * Una serpiente aprendiendo: el juego, la red, su copia congelada y la memoria de jugadas. Todo lo aleatorio (comida, dado,
 * recuerdos elegidos) sale de UNA semilla, así que la misma semilla da siempre la misma historia.
 */
export class Session {
  readonly game: Game;
  readonly net: NetworkN;
  readonly target: NetworkN;
  readonly memory: Memory[] = [];
  /** Lo que ve la red: sus ojos (7) o sus ojos y la ayuda de «¿cabe?» (10). */
  readonly vision: Vision;
  /** Pasos jugados en total y partidas acabadas. */
  steps = 0;
  games = 0;
  /** Comidas de cada partida acabada, en orden. */
  results: GameResult[] = [];
  /** Comidas de TODAS las partidas desde que nació la red, acotado (ver `viz/learningCurve.ts`): lo que dibuja la curva de aprendizaje. */
  readonly curve = new CurveHistory();
  /** El récord: lo más que ha comido en UNA partida desde que se creó esta red (se guarda aparte: `results` puede estar recortada). */
  best = 0;
  /** Jugadas de esta partida en las que tiró el dado. */
  private rolled = 0;
  private write = 0;
  private rng: () => number;
  constructor(readonly seed = 1, net?: NetworkN, vision: Vision = 'ojos') {
    this.vision = vision;
    this.rng = mulberry32(seed * 7919 + 13);
    this.game = new Game(this.rng);
    this.net = net ?? newNet(vision);
    this.target = newNet(vision);
    this.target.setWeights(this.net.getWeights());
  }
  /** Cuánto prueba al azar ahora. */
  get epsilon(): number { return epsilonAt(this.games); }

  /** La red mira, dice cuánto vale cada jugada y elige (casi siempre la que más vale; a veces, el dado). */
  look(): Decision {
    const ve = this.game.visionFor(this.vision), values = this.net.predict(ve).slice(), best = argmax(values);
    const explored = this.rng() < this.epsilon;
    const move = (explored ? (this.rng() * 3) | 0 : best) as Move;
    return { ve, values, best, move, explored };
  }
  /** Lo que la red diría ahora, sin tirar el dado ni gastar nada del azar (para enseñar el tablero parado). */
  peek(): Decision {
    const ve = this.game.visionFor(this.vision), values = this.net.predict(ve).slice(), best = argmax(values);
    return { ve, values, best, move: best as Move, explored: false };
  }
  /** Hace la jugada, guarda el recuerdo y repasa recuerdos al azar. Si la partida acaba, anota el resultado (la partida NUEVA la empieza `next()`). */
  move(dec: Decision): StepInfo {
    const r = this.game.step(dec.move);
    this.steps++;
    if (dec.explored) this.rolled++;
    const mem: Memory = { ve: dec.ve, jugada: dec.move, premio: r.reward, siguiente: this.game.visionFor(this.vision), fin: r.done };
    this.memory[this.write] = mem; this.write = (this.write + 1) % MEMORY;
    const trains = this.learn();
    if (this.steps % SYNC === 0) this.target.setWeights(this.net.getWeights());
    let record = false;
    if (r.done) {
      this.results.push({ food: this.game.eaten, steps: this.game.steps, death: r.death, explored: this.rolled, trapped: this.game.trapped }); this.curve.add(this.game.eaten); this.games++;
      if (this.game.eaten > this.best) { this.best = this.game.eaten; record = true; }
    }
    return { ...r, decision: dec, trains, gameOver: r.done, length: this.game.body.length, record };
  }
  /** Repasa `BATCH` recuerdos al azar; cada uno cambia SOLO la salida de la jugada que se hizo (las otras se piden igual que la red ya las daba). Devuelve cuántos `train` hizo. */
  learn(): number {
    if (this.memory.length < WARM) return 0;
    for (let b = 0; b < BATCH; b++) {
      const m = this.memory[(this.rng() * this.memory.length) | 0];
      const t = this.net.predict(m.ve).slice();
      t[m.jugada] = goalOf(m, this.target);
      this.net.train(m.ve, t, LR);
    }
    return BATCH;
  }
  /** Lo que se guarda y se recupera de lo jugado (la red y la copia congelada se restauran aparte; la memoria de jugadas no se guarda). */
  restoreProgress(p: { steps: number; games: number; best: number; results: GameResult[]; curve?: CurveData }): void {
    this.steps = p.steps; this.games = p.games; this.best = p.best; this.results = p.results.map((r) => ({ ...r }));
    /* sin curva (guardado antiguo): arranca de las últimas partidas que sí se guardaron */
    if (p.curve) this.curve.load(p.curve); else this.curve.seed(this.results.map((r) => r.food));
  }
  /** Empieza la partida siguiente. */
  next(): void { this.game.reset(); this.rolled = 0; }
  /** Un paso entero (mirar y mover); si la partida acaba, empieza la siguiente. */
  stepOnce(): StepInfo {
    const info = this.move(this.look());
    if (info.gameOver) this.next();
    return info;
  }
  /** Juega partidas enteras de golpe (para los tests y las tandas). */
  playGames(n: number): void {
    const target = this.games + n;
    while (this.games < target) this.stepOnce();
  }
  /** La media de comidas de las últimas `n` partidas (null si todavía no hay ninguna). */
  meanLast(n: number): number | null {
    const r = this.results.slice(-n);
    return r.length ? r.reduce((s, x) => s + x.food, 0) / r.length : null;
  }
}

/** Comidas por partida de la red, jugando SIN azar (la mejor jugada siempre). Para medir lo aprendido, sin tocar la red. */
export function evaluate(net: NetworkN, games = 100, seed = 5, vision: Vision = 'ojos'): number {
  return meanFood((g) => argmax(net.predict(g.visionFor(vision))), games, seed);
}
