/**
 * Pantalla «Nivel 1: aprender con premios» y «Nivel 2: no encerrarse» (Snake): una serpiente juega y una red REAL (`NetworkN([7, 3])`
 * de @dniskav/neuron; con ayuda, `NetworkN([10, 3])`) aprende SOLO con premios: comer (+) y chocar (−). El nivel 2 es el mismo juego y la
 * misma red, pero 3 de sus entradas («¿cabe?») las calcula una persona con código (un relleno): la pantalla lo dice y lo dibuja distinto. Esta pantalla es el DIRECTOR (qué paso cuándo, qué se enseña); el juego, los
 * premios y la forma de aprender viven en src/data/snake.ts; lo que se dibuja de cada neurona, en NeuronView/NetworkView.
 *
 * Tres modos: una partida despacio (cada paso: la red mira, dice lo que vale cada jugada, elige —o tira el dado— y aprende),
 * una tanda de partidas deprisa (trabajo repartido en fotogramas: la página no se congela) y «Míralo solo».
 */
import {
  BRAIN_SCALE, HELP_RGB, LEVELS, MOVES, SIZE, WARM, Session, evaluate, fateOf, inCount, randomScore, ruleHelpScore, ruleScore, trappedShare,
  type Decision, type GameResult, type StepInfo, type Vision,
} from '../../data/snake';
import { WINDOW, buildScript, num, runAuto, type AutoApi, type AutoCtx } from '../../data/snakeAuto';
import { SNAKE_KIND, SNAKE_STORE_KEY, SNAKE_VERSION, loadSnake, toSave, type Counters } from '../../data/snakeSave';
import { newSnakeCodeState, rawText, renderCodeHtml, type SnakeCodeState } from '../../data/snakeCode';
import { TAU, font, glow, rrect } from '../../viz/core/canvas';
import { createLoop } from '../../viz/core/loop';
import { reducedMotion } from '../../viz/core/motion';
import { inputsOutputsLayout, type NetworkLayout } from '../../viz/geometry';
import { BrainMeter, fmtCount } from '../../viz/BrainMeter';
import { NetworkView } from '../../viz/NetworkView';
import type { NeuronViewOptions } from '../../viz/NeuronView';
import type { NeuronDelta } from '../../viz/observe';
import { getPager } from '../../viz/Pager';
import { AutoMode, type AutoHandle } from '../ui/AutoMode';
import { CodePanel } from '../ui/CodePanel';
import { dockEls, linkPanels } from '../ui/dock';
import { brainAria, mountBrainMeter } from '../ui/mountMeter';
import { Narrator } from '../ui/Narrator';
import { PauseControl } from '../ui/PauseControl';
import { SavedModel, els as savedEls } from '../ui/SavedModel';
import { SavedStore } from '../../viz/savedModel';
import { Toggle } from '../ui/Toggle';
import { SnakeBrainPanel } from '../ui/SnakeBrainPanel';
import { ValueBars } from '../ui/ValueBars';

type Mode = 'idle' | 'game' | 'batch';
/** Lo que la red hace en un paso despacio: ve (`in`), dice lo que vale cada jugada (`out`) y se queda un momento (`show`). */
interface Look { dec: Decision; stage: 'in' | 'out' | 'show'; t: number; f: number; net: boolean }
interface Pop { x: number; y: number; text: string; rgb: string; t: number }

/** Colores: la serpiente, la comida, el peligro; y el color de cada entrada y de cada jugada. */
const SNAKE = [110, 214, 196], GOLD = '255,224,138', RED = '255,138,120', GREEN = '126,224,164';
const HELP_HUE: [number, number, number] = HELP_RGB.split(',').map(Number) as [number, number, number];
const IN_HUES: [number, number, number][] = [[255, 138, 120], [255, 138, 120], [255, 138, 120], [126, 224, 164], [126, 224, 164], [126, 224, 164], [126, 224, 164], HELP_HUE, HELP_HUE, HELP_HUE];
const OUT_HUES = ['110,214,196', '200,150,255', '255,200,130'];
const OUT_ARROW = ['←', '↑', '→'];
/** Entradas con nombre corto en el dibujo (los largos están en el código y en el panel del cerebro). */
const IN_SHORT = ['peligro izq.', 'peligro delante', 'peligro der.', 'comida delante', 'comida detrás', 'comida izq.', 'comida der.', '✍ cabe izq.', '✍ cabe recto', '✍ cabe der.'];
/** Una tanda deprisa: cuántas partidas como máximo por fotograma (para que se vea crecer la tira) y cuánto trabajo por fotograma (ms). */
const GAMES_PER_FRAME = 2, BUDGET_MS = 9;
/** Cuánto cambio medio de un peso cuenta como «máximo» al pulsar la corrección de una neurona (ver `NeuronView.learn`). */
const REF = 0.12;
const CHART_N = WINDOW * 3;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function layoutOf(v: Vision): { layout: NetworkLayout; inputs: [number, number][] } {
  const r = inputsOutputsLayout(inCount(v), 3, v === 'ayuda' ? { labelW: 185, extraRows: 1 } : {});
  r.layout.neurons[0].forEach((g) => g.dendrites.forEach((d, i) => { d.rgb = IN_HUES[i]; d.name = ''; d.labelBelow = false; d.tipGlow = true; }));
  return r;
}
const viewOptions = (_l: number, n: number): NeuronViewOptions => ({ wMax: 2, levelMin: -1.5, levelMax: 1.5, phase: 1.7 * (n + 1), chargeGain: 0.5, tint: false, lineLabel: false, bulb: false });

export function startSnake(): void {
  const reduced = reducedMotion();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const bcv = $<HTMLCanvasElement>('snboard'), ncv = $<HTMLCanvasElement>('snnet'), mcv = $<HTMLCanvasElement>('snmeter'), ccv = $<HTMLCanvasElement>('sncurve'), sec = $('snake');
  const goBtn = $<HTMLButtonElement>('sngo'), b10 = $<HTMLButtonElement>('sn10'), b100 = $<HTMLButtonElement>('sn100'), resetBtn = $('snreset');
  const nar = new Narrator({ status: $('snstatus'), live: $('snlive') });
  const bars = new ValueBars($('snvals'), 1.5);
  const rule = ruleScore(), random = randomScore();
  /** La regla escrita a mano con el sitio que queda (nivel 2): se calcula la primera vez que hace falta (≈ 0,2 s). */
  let ruleHelp: number | null = null;
  const helpRule = (): number => (ruleHelp ??= ruleHelpScore());
  /** Lo que comía la red con sus ojos justo antes de pasar al nivel 2 (para el «Míralo solo»). */
  let eyesMean: number | null = null, eyesSkill: number | null = null;
  const vis$ = new Toggle($('snvision'), $('snvisionexp'));
  const titleEl = $('t-snake'), subEl = $('snsub'), encEl = $('snenc'), encVal = $('snencv'), legEl = $('snleg');
  const nowEl = $('snnow'), bestEl = $('snbest'), recEl = $('snrec');

  let seed = 11;
  let vision: Vision = 'ojos';
  let session = new Session(seed), trained = false;
  const lays = { ojos: layoutOf('ojos'), ayuda: layoutOf('ayuda') };
  let lay = lays.ojos;
  let nv = new NetworkView(session.net, viewOptions, lay.layout);
  const meter = new BrainMeter(3);
  meter.setModel(session.net); meter.track(nv.observed, BRAIN_SCALE);

  let mode: Mode = 'idle';
  let queue = { left: 0, done: 0 };
  let look: Look | null = null;
  /** Lo último que decidió la red (se queda a la vista: las barras, lo que ve, la flecha) y cuánto tiempo falta para que el paso siguiente empiece. */
  let lastDec: Decision | null = null, wait = 0;
  /** Al acabar una partida despacio, el tablero se queda un momento tal como quedó. */
  let over: { res: GameResult; t: number } | null = null;
  let pops: Pop[] = [], bursts: { x: number; y: number; t: number }[] = [], dead: { x: number; y: number; t: number } | null = null;
  let revs: { deltas: NeuronDelta[][]; t: number; snapped: boolean }[] = [];
  let lastCode = 0, pumping = false;

  // ---------- marcador: comidas de esta partida y récord ----------
  let shownNow = '', shownBest = '', shownEnc = '', recTimer = 0;
  function paintScore(): void {
    const n = String(session.game.eaten), b = String(session.best);
    if (n !== shownNow) { shownNow = n; nowEl.textContent = n; }
    if (b !== shownBest) { shownBest = b; bestEl.textContent = b; }
    /* «Encerrada»: de las últimas 20 partidas que acabaron mal, cuántas murieron sin sitio (solo con datos suficientes) */
    const t = session.games >= 10 ? trappedShare(session.results, WINDOW) : null, e = t === null ? '' : Math.round(t * 100) + ' %';
    if (e !== shownEnc) { shownEnc = e; encEl.hidden = t === null; encVal.textContent = e || '–'; }
  }
  function flashRecord(): void { recEl.hidden = false; clearTimeout(recTimer); recTimer = window.setTimeout(() => { recEl.hidden = true; }, 2500); }

  // ---------- paneles ----------
  const dock = dockEls('sn');
  const codeState = (): Partial<SnakeCodeState> => ({ vision: session.vision, games: session.games, steps: session.steps, epsilon: session.epsilon, memCount: session.memory.length, recent: session.memory.slice(-4) });
  const code = new CodePanel<SnakeCodeState>(dock.code, { newState: () => ({ ...newSnakeCodeState(), ...codeState() }), renderHtml: renderCodeHtml, rawText });
  const brain = new SnakeBrainPanel(dock.brain, () => ({ net: session.net, trained, vision: session.vision }));
  linkPanels(code, brain);
  const brainCounters = (): Counters => ({ steps: nv.observed.steps, travel: nv.observed.travel });
  const saved = new SavedModel({
    els: savedEls('sn'), store: new SavedStore(SNAKE_STORE_KEY), kind: SNAKE_KIND, version: SNAKE_VERSION,
    getState: () => toSave(session, seed, brainCounters()),
    load: (text) => {
      const r = loadSnake(text);
      if (!r.ok) return r;
      install(r.session, r.brain, r.seed);
      return { ok: true, message: r.session.games + (r.session.games === 1 ? ' partida' : ' partidas') + ', récord ' + r.session.best + ', ' + fmtCount(r.brain.steps) + ' ajustes · ' + (r.session.vision === 'ayuda' ? 'con ayuda' : 'sus ojos') };
    },
    fileName: () => 'serpiente-neuron-' + (session.vision === 'ayuda' ? 'con-ayuda-' : '') + session.games + '-partidas.json',
    slotName: (d) => (session.vision === 'ayuda' ? 'Con ayuda · ' : 'Sus ojos · ') + 'Partida ' + session.games + ' · récord ' + session.best + ' · ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
    held: () => auto.running,
  });
  code.panel.exclusive(brain.panel, saved.panel); brain.panel.exclusive(code.panel, saved.panel); saved.panel.exclusive(code.panel, brain.panel);
  const pager = getPager();
  const pause = new PauseControl({ button: $('snpause'), icon: $('snpi'), section: sec, say: (t) => nar.say(t), onChange: () => redraw(), pager });

  // ---------- interfaz ----------
  const busy = (): boolean => mode !== 'idle';
  const say = (t: string): void => nar.say(t), setStatus = (t: string): void => nar.status(t);
  const meanText = (): string => {
    const n = Math.min(WINDOW, session.games);
    if (!n) return 'aún sin partidas';
    return n === 1 ? 'comidas en la primera partida: ' + num(session.meanLast(1), 0) : 'comidas: media de las ' + (n < WINDOW ? '' : 'últimas ') + n + (n < WINDOW ? ' partidas' : '') + ' = ' + num(session.meanLast(WINDOW));
  };
  function paintButtons(): void {
    const dis = busy() && !auto.running;
    goBtn.disabled = b10.disabled = b100.disabled = dis;
    vis$.paint({ label: LEVELS[vision].toggle, on: vision === 'ayuda', explain: LEVELS[vision].explain, tint: true, disabled: dis });
    sec.dataset.mode = mode;
    sec.dataset.vision = vision;
  }
  /** Todo lo que cambia con el nivel: título, frase de abajo, descripción para lectores de pantalla y leyenda. */
  function paintLevel(): void {
    const L = LEVELS[vision];
    titleEl.textContent = L.title; subEl.textContent = L.sub;
    $('snvhojos').hidden = vision !== 'ojos'; $('snvhayuda').hidden = vision !== 'ayuda';
    ncv.setAttribute('aria-label', vision === 'ayuda'
      ? 'La red real: mira diez cosas. Siete son sus ojos (peligro a la izquierda, delante y a la derecha, y dónde está la comida) y tres, marcadas con una mano, las calcula una persona con código: si cabe la serpiente si gira a la izquierda, sigue recto o gira a la derecha. Tiene tres neuronas, una por jugada, que dicen cuánto vale cada una. Al aprender, las conexiones cambian de grosor.'
      : 'La red real: mira siete cosas (peligro a la izquierda, delante y a la derecha, y dónde está la comida) y tiene tres neuronas, una por jugada, que dicen cuánto vale cada una. Al aprender, después de jugar llega la corrección y las conexiones cambian de grosor.');
    legEl.textContent = (vision === 'ayuda' ? L.note + ' · ' : '') + 'Más grueso = cuenta más · cortado = resta. Cada neurona dice cuánto vale una jugada; la serpiente elige la que más vale, o a veces tira un dado.';
  }
  function updateCode(force = false): void {
    const now = performance.now();
    if (!force && now - lastCode < 250) return;
    lastCode = now; code.patch(codeState());
  }
  /** Cómo murió, con las mismas palabras que la investigación: «se encerró» (ya no le quedaba sitio), «chocó» (tenía una salida) o «dio vueltas». */
  const how = (r: GameResult): string => {
    const f = fateOf(r), what = r.death === 'pared' ? 'con la pared' : 'con su cola';
    return (f === 'encerró' ? 'Se encerró y chocó ' + what : f === 'chocó' ? 'Chocó ' + what + ' (tenía salida)' : f === 'vueltas' ? 'Dio vueltas sin comer' : 'Acabó')
      + ' · ' + (r.food === 1 ? '1 comida' : r.food + ' comidas');
  };
  function idleStatus(): string {
    if (!session.games) return (vision === 'ayuda' ? 'Red nueva, con ayuda' : 'Red nueva') + ' · pulsa «Una partida»';
    const r = session.results[session.results.length - 1];
    return 'Partida ' + session.games + ': ' + how(r).toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
  function paintBars(dec: Decision | null): void {
    if (!dec) { bars.paint({ values: null }); return; }
    const same = dec.move === dec.best;
    bars.paint({
      values: dec.values, chosen: dec.move, best: dec.best, random: dec.explored,
      note: dec.explored ? (same ? 'Tiró el dado y salió la que más valía' : 'Probó al azar: no era la que más valía') : 'Elige la que más vale',
    });
  }
  /** Con el tablero parado, la red dice lo que haría ahora (sin dado): lo que se ve en las barras y en la red es lo del tablero que se ve. */
  function showIdle(): void {
    if (!session.games) return;
    lastDec = session.peek(); bars.paint({ values: lastDec.values, best: lastDec.best, note: 'Así lo vería ahora' });
  }
  const moveWords = (dec: Decision): string => 'ir ' + MOVES[dec.move];

  // ---------- director ----------
  function cancelRun(): void {
    mode = 'idle'; queue = { left: 0, done: 0 }; look = null; wait = 0; over = null; pops = []; bursts = []; dead = null; revs = []; pumping = false;
    if (session.game.done) session.next();
    code.mode('exam');
    nv.neurons.forEach((v) => v.sync(true)); nv.observed.resync();
    paintButtons();
  }
  /** Pone una serpiente (nueva, o recuperada de un guardado con sus contadores) y lo deja todo como ella: red, cerebro, tira, marcador. */
  function install(s: Session, counters?: Counters, newSeed?: number): void {
    cancelRun();
    if (newSeed !== undefined) seed = newSeed;
    session = s; vision = s.vision; lay = lays[vision]; trained = !!counters && counters.steps > 0;
    nv = new NetworkView(session.net, viewOptions, lay.layout, nv);
    if (counters) nv.observed.restore(counters);
    meter.setModel(session.net); meter.track(nv.observed, BRAIN_SCALE);
    if (counters) meter.ease(0, true);
    lastDec = null; bars.paint({ values: null }); showIdle();
    recEl.hidden = true; shownEnc = '\u0000'; paintScore();
    paintLevel(); updateCode(true); paintButtons(); setStatus(idleStatus()); redraw();
    if (vision === 'ayuda' && ruleHelp === null) setTimeout(() => { helpRule(); curveLoop.redraw(); }, 30);
  }
  /** Red nueva y vacía (en el nivel que esté puesto; la semilla cambia para que no sea siempre la misma historia). */
  function fresh(v: Vision = vision): void { install(new Session(seed + 1, undefined, v), undefined, seed + 1); }
  /** El interruptor «Lo que ve»: red nueva y vacía en el otro nivel (con lo demás como estaba). */
  function setVision(v: Vision): void {
    if (v === vision) return;
    eyesMean = v === 'ayuda' && session.games >= WINDOW ? session.meanLast(WINDOW) : null;
    eyesSkill = v === 'ayuda' && session.games >= 50 ? evaluate(session.net, 40, 5, 'ojos') : null;
    fresh(v);
    setStatus((v === 'ayuda' ? 'Red nueva, con ayuda' : 'Red nueva, con sus ojos') + ' · pulsa «Una partida»');
    say(v === 'ayuda'
      ? 'Nivel 2: ahora la red recibe tres números más, que calcula una persona con código: cuánto sitio le queda si gira a la izquierda, sigue recto o gira a la derecha. Red nueva y vacía.'
      : 'Nivel 1: la red vuelve a mirar solo con sus ojos. Red nueva y vacía.');
  }
  function reset(): void { fresh(); saved.clear(); setStatus('Red nueva, sin saber nada · pulsa «Una partida»'); say('Empiezas de cero: una red nueva, sin recuerdos y sin partidas.'); }

  /** Una partida despacio, o `n` partidas deprisa. */
  function launch(n: number, slow: boolean): void {
    if (busy()) return;
    pause.set(false);
    if (session.game.done) session.next();
    over = null;
    if (slow) {
      mode = 'game'; queue = { left: 1, done: 0 }; look = null; wait = 0;
      if (reduced) { playWhole(); return; }
      setStatus('Empieza una partida…');
    } else {
      mode = 'batch'; queue = { left: n, done: 0 };
      setStatus('Entrenando… 0/' + n + ' partidas');
      if (reduced) { pumping = true; pump(); }
    }
    paintButtons();
  }
  /** «Menos movimiento»: la partida entera de golpe, sin animación. */
  function playWhole(): void {
    let info: StepInfo;
    do { const dec = session.look(); lastDec = dec; info = session.move(dec); trained = trained || info.trains > 0; } while (!info.gameOver);
    if (info.record) flashRecord();
    paintScore(); paintBars(lastDec);
    finishGame(session.results[session.results.length - 1], true);
  }
  /** Con «menos movimiento» las tandas no tienen bucle de dibujo: se reparten con temporizadores, igual de ligeras. */
  function pump(): void {
    if (!pumping) return;
    runBatch();
    if (mode === 'batch') setTimeout(pump, 0);
  }
  function afterStep(info: StepInfo): void {
    if (info.trains > 0) trained = true;
  }
  /** La red mira: empieza un paso despacio. */
  function startLook(): void {
    const dec = session.look(), f = session.game.steps < 8 ? 1 : session.game.steps < 25 ? 0.3 : 0.1;
    look = { dec, stage: 'in', t: 0, f, net: f > 0.2 };
    lastDec = dec;
    if (look.net) nv.respond(dec.ve);
    code.mode('exam'); updateCode();
    setStatus(session.game.steps < 8 ? (vision === 'ayuda' ? 'Mira a su alrededor: peligros, comida y cuánto sitio le queda…' : 'Mira a su alrededor: peligros y comida…') : 'Jugando… partida ' + (session.games + 1) + ' · ' + session.game.eaten + ' comidas');
  }
  /** La jugada se hace: el juego da el premio y la red aprende de lo que pasó. */
  function doMove(l: Look): void {
    const g = session.game, [hx, hy] = g.body[0];
    const info = session.move(l.dec);
    afterStep(info);
    if (info.record) flashRecord();
    paintScore();
    const [nhx, nhy] = session.game.body[0];
    if (info.ate) { pops.push({ x: nhx, y: nhy, text: '+1', rgb: GREEN, t: 0 }); bursts.push({ x: nhx, y: nhy, t: 0 }); }
    if (info.done && !info.ate) { dead = { x: hx, y: hy, t: 0 }; pops.push({ x: hx, y: hy, text: info.death === 'vueltas' ? '−0,5' : '−1', rgb: RED, t: 0 }); }
    if (info.trains > 0 && l.net) pulse();
    look = null; wait = 0;
    if (info.gameOver) { code.mode('learn'); finishGame(session.results[session.results.length - 1], false); } else { code.mode('learn'); updateCode(); }
  }
  function finishGame(res: GameResult, instant: boolean): void {
    updateCode(true); saved.save();
    setStatus(how(res) + (session.memory.length < WARM ? ' · lo guarda (aún tiene pocos recuerdos para repasar)' : ' · lo guarda y lo repasa'));
    say(how(res) + '. ' + meanText());
    if (instant) { mode = 'idle'; queue.left = 0; paintButtons(); redraw(); return; }
    over = { res, t: 0 };
  }
  function finishOver(): void {
    over = null; session.next(); paintScore(); mode = 'idle'; queue.left = 0; look = null; showIdle(); paintButtons(); setStatus(idleStatus()); code.mode('exam');
  }
  /** Un pulso de «lo que cambió»: se entrenó de verdad, y cada neurona celebra según su propio cambio. */
  function pulse(): void {
    const deltas = nv.observed.poll();
    revs.push({ deltas, t: 0, snapped: false });
    if (revs.length > 3) revs.shift();
  }
  /** Una tanda deprisa: trabajo repartido en fotogramas (un presupuesto de milisegundos y pocas partidas por vez). */
  function runBatch(): void {
    const t0 = performance.now();
    let games = 0;
    while (queue.left > 0 && games < (reduced ? 8 : GAMES_PER_FRAME) && performance.now() - t0 < BUDGET_MS) {
      const info = session.stepOnce();
      afterStep(info);
      lastDec = info.decision;
      if (info.record) flashRecord();
      if (info.gameOver) { queue.left--; queue.done++; games++; }
    }
    if (!reduced) pulse(); else nv.observed.poll();
    setStatus('Entrenando… ' + queue.done + '/' + (queue.done + queue.left) + ' partidas · come de media ' + num(session.meanLast(WINDOW)));
    updateCode(); paintScore(); saved.save(1500);
    if (queue.left <= 0) {
      mode = 'idle'; pumping = false; look = null; showIdle(); updateCode(true); paintButtons(); setStatus(idleStatus()); say(meanText());
      nv.neurons.forEach((v) => v.sync(true)); saved.save(); redraw();
    }
  }

  // ---------- el tiempo ----------
  const LOOK_T = { in: 0.25, out: 0.2, show: 0.3 };
  function tick(dt: number): void {
    if (mode === 'game') {
      if (over) { over.t += dt; if (over.t > 1.4) finishOver(); }
      else if (look) {
        const l = look;
        l.t += dt / (LOOK_T[l.stage] * l.f);
        if (l.t >= 1) {
          l.t = 0;
          if (l.stage === 'in') { l.stage = 'out'; paintBars(l.dec); setStatus(l.dec.explored ? 'Tira el dado: prueba ' + moveWords(l.dec) + ' al azar' : 'Cree que lo mejor es ' + moveWords(l.dec)); }
          else if (l.stage === 'out') l.stage = 'show';
          else doMove(l);
        }
      } else {
        wait -= dt;
        if (wait <= 0) startLook();
      }
    } else if (mode === 'batch') runBatch();
    pops.forEach((p) => { p.t += dt; }); pops = pops.filter((p) => p.t < 0.9);
    bursts.forEach((b) => { b.t += dt; }); bursts = bursts.filter((b) => b.t < 0.6);
    if (dead) { dead.t += dt; if (dead.t > 1.6) dead = null; }
    revs.forEach((r) => {
      r.t += dt / 0.35;
      if (!r.snapped && r.t >= 0.4) { r.snapped = true; r.deltas.forEach((layer, li) => layer.forEach((d, ni) => meter.learned(meter.lobeOf(session.net, li, ni), nv.layers[li][ni].learn(d, { ref: REF })))); }
    });
    revs = revs.filter((r) => r.t < 1);
  }

  // ---------- dibujo: el tablero ----------
  function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const pad = 7, cell = (Math.min(w, h) - 2 * pad) / SIZE, ox = (w - cell * SIZE) / 2, oy = (h - cell * SIZE) / 2;
    const g = session.game, CX = (x: number): number => ox + (x + 0.5) * cell, CY = (y: number): number => oy + (y + 0.5) * cell;
    ctx.fillStyle = 'rgba(255,255,255,.03)'; rrect(ctx, ox - 3, oy - 3, cell * SIZE + 6, cell * SIZE + 6, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.028)';
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if ((x + y) % 2) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    /* la pared: choca el que se sale */
    ctx.strokeStyle = 'rgba(' + GOLD + ',.55)'; ctx.lineWidth = 2; rrect(ctx, ox - 3, oy - 3, cell * SIZE + 6, cell * SIZE + 6, 9); ctx.stroke();
    /* la comida */
    const [fx, fy] = g.food, pulseF = 1 + 0.08 * Math.sin(t * 4);
    glow(ctx, CX(fx), CY(fy), cell * 0.95, 'rgba(' + GOLD + ',.55)', 'rgba(' + GOLD + ',0)');
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(CX(fx), CY(fy), cell * 0.3 * pulseF, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.stroke();
    bursts.forEach((b) => { ctx.strokeStyle = 'rgba(' + GOLD + ',' + (1 - b.t / 0.6) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX(b.x), CY(b.y), cell * (0.4 + 1.4 * (b.t / 0.6)), 0, TAU); ctx.stroke(); });
    /* la serpiente: la cola más tenue y la cabeza brillante */
    const n = g.body.length;
    for (let i = n - 1; i >= 0; i--) {
      const [x, y] = g.body[i], k = n > 1 ? 1 - i / (n - 1) : 1, a = 0.4 + 0.6 * k;
      ctx.fillStyle = 'rgba(' + SNAKE.join(',') + ',' + a + ')'; rrect(ctx, ox + x * cell + cell * 0.08, oy + y * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28); ctx.fill();
    }
    const [hx, hy] = g.body[0], D = [[0, -1], [1, 0], [0, 1], [-1, 0]][g.dir];
    if (dead) { glow(ctx, CX(hx), CY(hy), cell * 1.3, 'rgba(' + RED + ',' + 0.7 * (1 - dead.t / 1.6) + ')', 'rgba(' + RED + ',0)'); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; rrect(ctx, ox + hx * cell + cell * 0.08, oy + hy * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28); ctx.stroke();
    ctx.fillStyle = '#0d1a17';
    [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(CX(hx) + D[0] * cell * 0.18 - D[1] * s * cell * 0.17, CY(hy) + D[1] * cell * 0.18 + D[0] * s * cell * 0.17, cell * 0.09, 0, TAU); ctx.fill(); });
    /* lo que ve y lo que elige (solo cuando la red está pensando este paso: despacio) */
    if (look && !over) {
      const dec = look.dec, pick = look.stage !== 'in';
      for (let m = 0; m < 3; m++) {
        const ab = (g.dir + m + 3) % 4, dx = [0, 1, 0, -1][ab], dy = [-1, 0, 1, 0][ab];
        const px = CX(hx) + dx * cell * 0.95, py = CY(hy) + dy * cell * 0.95, danger = dec.ve[m] === 1;
        ctx.fillStyle = danger ? 'rgba(' + RED + ',.95)' : 'rgba(' + GREEN + ',.5)'; ctx.beginPath(); ctx.arc(px, py, cell * (danger ? 0.2 : 0.13), 0, TAU); ctx.fill();
        /* nivel 2: el «¿cabe?» que calculó una persona, como un anillo azul que se llena según cuánto cabe (entero = cabe entera) */
        if (vision === 'ayuda') {
          const fit = dec.ve[7 + m];
          ctx.strokeStyle = 'rgba(' + HELP_RGB + ',.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, cell * 0.3, 0, TAU); ctx.stroke();
          if (fit > 0) { ctx.strokeStyle = 'rgba(' + HELP_RGB + ',.95)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(px, py, cell * 0.3, -Math.PI / 2, -Math.PI / 2 + TAU * fit); ctx.stroke(); }
        }
        if (pick && m === dec.move) {
          const rgb = dec.explored ? '200,150,255' : GOLD, k = look.stage === 'show' ? 1 : look.t, ax = CX(hx) + dx * cell * (0.7 + 0.55 * k), ay = CY(hy) + dy * cell * (0.7 + 0.55 * k);
          ctx.fillStyle = 'rgba(' + rgb + ',.95)'; ctx.beginPath();
          ctx.moveTo(ax + dx * cell * 0.3, ay + dy * cell * 0.3); ctx.lineTo(ax - dy * cell * 0.22 - dx * cell * 0.05, ay + dx * cell * 0.22 - dy * cell * 0.05); ctx.lineTo(ax + dy * cell * 0.22 - dx * cell * 0.05, ay - dx * cell * 0.22 - dy * cell * 0.05); ctx.closePath(); ctx.fill();
        }
      }
    }
    pops.forEach((p) => {
      const k = p.t / 0.9;
      ctx.globalAlpha = 1 - k; ctx.font = font(Math.max(13, cell * 0.95)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(' + p.rgb + ',1)'; ctx.fillText(p.text, CX(p.x), CY(p.y) - cell * (0.9 + 1.2 * k)); ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';
  }

  // ---------- dibujo: la red ----------
  function drawNet(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    nv.fit(w, h);
    const tr = nv.transform, first = nv.layers[0];
    ctx.save(); ctx.translate(tr.ox, tr.oy); ctx.scale(tr.s, tr.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    nv.neurons.forEach((v) => v.drawWires(ctx));
    if (look && look.net) {
      const l = look;
      if (l.stage === 'in') first.forEach((v) => v.drawInput(ctx, l.dec.ve, l.t));
      else if (l.stage === 'out') first.forEach((v, k) => v.drawOutput(ctx, clamp01(0.5 + l.dec.values[k] / 3), k === l.dec.move && !l.dec.explored ? 1 : 0, l.t));
    }
    revs.forEach((r) => { first.forEach((v, k) => v.drawCorrection(ctx, r.t, r.deltas[0][k], { axon: [0, 0.4], dendrites: [0.4, 1], ref: REF })); });
    nv.neurons.forEach((v) => v.drawBody(ctx, t));
    nv.neurons.forEach((v) => v.drawFront(ctx));
    /* lo que ve, con palabras: el nombre de cada entrada junto a su punta (encendido si ahora vale 1) */
    const fs = first[0].fs(11);
    ctx.font = font(fs); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    lay.inputs.forEach(([x, y], i) => {
      const v = lastDec ? lastDec.ve[i] : 0, help = i >= 7, on = v === 1 || (help && v > 0), rgb = IN_HUES[i].join(',');
      ctx.fillStyle = 'rgba(' + rgb + ',' + (on ? 1 : 0.62) + ')';
      /* las de ayuda llevan el número (cuánto cabe, de 0 a 1): lo calculó una persona, no la red */
      ctx.fillText(help && lastDec ? IN_SHORT[i] + ' ' + (v === 0 ? '0' : v === 1 ? '1' : v.toFixed(1).replace('.', ',')) : IN_SHORT[i], x - 14, y);
      if (on) { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill(); }
    });
    /* la leyenda: lo azul con ✍ lo calcula una persona con código; la red solo aprende a usarlo */
    if (vision === 'ayuda') {
      const ys = lay.inputs.slice(7).map((p) => p[1]), top = ys[0] - 9, bot = ys[ys.length - 1] + 9, ls = first[0].fs(10);
      ctx.strokeStyle = 'rgba(' + HELP_RGB + ',.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(10, top); ctx.lineTo(4, top); ctx.lineTo(4, bot); ctx.lineTo(10, bot); ctx.stroke();
      ctx.font = font(ls); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(' + HELP_RGB + ',.95)'; ctx.fillText('✍ calculado por una persona', 4, ys[ys.length - 1] + (ys[1] - ys[0]));
    }
    /* lo que dice cada neurona: cuánto vale su jugada (el número real de la salida) */
    ctx.textAlign = 'left';
    first.forEach((v, k) => {
      const [tx, ty] = v.geom.terminal, chosen = lastDec ? lastDec.move === k : false, val = lastDec ? lastDec.values[k] : null;
      const rgb = chosen ? (lastDec && lastDec.explored ? '200,150,255' : GOLD) : OUT_HUES[k];
      glow(ctx, tx, ty, 12, 'rgba(' + rgb + ',' + (chosen ? 0.5 : 0.22) + ')', 'rgba(' + rgb + ',0)');
      ctx.fillStyle = 'rgba(' + rgb + ',.95)'; ctx.beginPath(); ctx.arc(tx, ty, chosen ? 5.5 : 4, 0, TAU); ctx.fill();
      ctx.font = font(fs); ctx.fillStyle = 'rgba(' + rgb + ',' + (chosen ? 1 : 0.8) + ')';
      ctx.fillText(OUT_ARROW[k] + ' ' + MOVES[k].replace('a la ', ''), tx + 12, ty - fs * 0.7);
      ctx.fillStyle = 'rgba(242,239,230,' + (val === null ? 0.35 : 0.95) + ')'; ctx.fillText(val === null ? '?' : (val < 0 ? '−' : '+') + Math.abs(val).toFixed(2), tx + 12, ty + fs * 0.85);
    });
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ---------- dibujo: las comidas de cada partida ----------
  function drawCurve(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const res = session.results.slice(-CHART_N), yMax = Math.max(Math.ceil(vision === 'ayuda' && ruleHelp !== null ? ruleHelp : rule) + 4, ...res.map((r) => r.food + 1)), base = h - 3, top = 12, Y = (v: number): number => base - (v / yMax) * (base - top);
    const bw = w / CHART_N;
    ctx.fillStyle = 'rgba(255,255,255,.04)'; rrect(ctx, 0, top - 2, w, base - top + 5, 5); ctx.fill();
    res.forEach((r, i) => {
      const x = i * bw, last = i === res.length - 1;
      ctx.fillStyle = last ? 'rgba(' + GOLD + ',.95)' : 'rgba(106,167,255,.78)';
      if (r.food > 0) { ctx.fillRect(x + bw * 0.12, Y(r.food), bw * 0.76, base - Y(r.food)); } else { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + bw * 0.12, base - 1.5, bw * 0.76, 1.5); }
    });
    /* las reglas escritas a mano: lo que come una persona que sabe jugar y se lo escribió como «si» (nivel 2: también la que cuenta el sitio) */
    const refLine = (v: number, text: string, rgb: string, below: boolean): void => {
      const ry = Y(v);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(' + rgb + ',.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(9.5); ctx.textBaseline = below ? 'top' : 'bottom'; ctx.textAlign = 'right';
      const lw = ctx.measureText(text).width, ly = below ? ry + 1 : ry - 13;
      ctx.fillStyle = 'rgba(12,12,14,.8)'; ctx.fillRect(w - lw - 7, ly, lw + 6, 12);
      ctx.fillStyle = 'rgba(' + rgb + ',.95)'; ctx.fillText(text, w - 3, below ? ry + 2 : ry - 2);
    };
    refLine(rule, 'regla escrita a mano: ' + num(rule, 0), GOLD, vision === 'ayuda');
    if (vision === 'ayuda' && ruleHelp !== null) refLine(ruleHelp, 'regla con ayuda: ' + num(ruleHelp, 0), HELP_RGB, false);
    if (!res.length) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(141,137,125,.8)'; ctx.fillText('aquí irán las comidas de cada partida', w / 2, (top + base) / 2 + 4); ctx.textAlign = 'left'; }
  }

  const boardLoop = createLoop(bcv, {
    draw(ctx, w, h, dt, t) {
      if (!reduced && !pause.paused) tick(dt);
      drawBoard(ctx, w, h, t);
    },
  });
  const netLoop = createLoop(ncv, { draw(ctx, w, h, dt, t) { nv.update(pause.scale(dt)); drawNet(ctx, w, h, t); } });
  const curveLoop = createLoop(ccv, { draw(ctx, w, h) { drawCurve(ctx, w, h); } });
  const meterLoop = mountBrainMeter({
    canvas: mcv, meter, reduced, dt: (dt) => pause.scale(dt), labelSize: 40,
    caption: { el: $('sncount'), text: meanText },
    aria: () => brainAria(meter, null) + (session.games ? '; ' + meanText() : ''),
  });
  function redraw(): void { boardLoop.redraw(); netLoop.redraw(); meterLoop.redraw(); curveLoop.redraw(); }

  // ---------- controles ----------
  goBtn.addEventListener('click', () => launch(1, true));
  b10.addEventListener('click', () => launch(10, false));
  b100.addEventListener('click', () => launch(100, false));
  resetBtn.addEventListener('click', reset);
  vis$.button.addEventListener('click', () => { if (!(vis$.button as HTMLButtonElement).disabled) setVision(vision === 'ayuda' ? 'ojos' : 'ayuda'); });

  // ---------- «Míralo solo»: el guion (src/data/snakeAuto.ts) llama a las MISMAS funciones que los botones ----------
  const auto = new AutoMode({
    section: sec, button: $('snauto'), caption: $('sncap'), link: { id: 'juegos', text: '→ Juegos' }, pager, reduced,
    say, keep: [$('snpause')], paused: () => pause.paused,
    beforeStart: () => cancelRun(),
    onChange: () => paintButtons(),
    onStop: () => { cancelRun(); setStatus(idleStatus()); },
  });
  const ctxNow = (): AutoCtx => {
    const last = session.results[session.results.length - 1];
    return {
      games: session.games, mean10: session.meanLast(10), mean20: session.meanLast(WINDOW), last: last ? { food: last.food, death: last.death, trapped: last.trapped } : null, rule, random,
      vision, ruleHelp: helpRule(), eyesMean, trapped: trappedShare(session.results, WINDOW), eyesSkill,
      skill: session.games >= 50 ? evaluate(session.net, 40, 5, vision) : null,
    };
  };
  function autoApi(h: AutoHandle): AutoApi {
    return {
      reset: () => { eyesMean = null; eyesSkill = null; fresh('ojos'); say('Vuelves a empezar: una red nueva, sin ninguna partida.'); },
      setVision: (v) => setVision(v),
      watch: async () => { launch(1, true); await h.until(() => !busy()); },
      train: async (n) => { launch(n, false); await h.until(() => !busy()); },
      ctx: ctxNow, caption: h.caption, sleep: h.sleep, cancelled: h.dead,
    };
  }
  auto.onPress((h) => runAuto(buildScript(), autoApi(h), { reduced }));

  paintButtons(); paintLevel(); setStatus(idleStatus()); updateCode(true);
  /* Al entrar: si hay algo guardado, la serpiente sigue donde estaba (y se dice); si está roto o es de otra versión, red nueva (y se dice). */
  const boot = saved.restore();
  if (boot !== 'none') {
    if (boot.ok) setStatus('Sigo donde lo dejé: ' + boot.message + ' · pulsa «Una partida»');
    else setStatus('Lo guardado no se pudo usar (' + boot.reason + '): empiezo con una red nueva');
  }
  const leave = (): void => { if (session.steps > 0) saved.save(); };
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  paintScore();
  pager.followCenter(sec, (here) => pause.setHere(here));
}
