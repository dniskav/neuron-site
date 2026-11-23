/**
 * Pantalla «¿Dónde caerá?» (Paleta): una neurona REAL (`NetworkN` de @dniskav/neuron) mira una bola y PREDICE dónde
 * cruzará la línea de la paleta. La paleta solo va ahí y se para: es código normal, no aprende.
 *
 * Nadie etiqueta nada: cuando la bola llega abajo se conoce dónde cayó, así que ese par (lo que vio → dónde cayó) se
 * guarda y la neurona REPASA todas las caídas guardadas. Con paredes la neurona sola no llega; un equipo (`[2, 8, 1]`) sí.
 *
 * Esta pantalla es solo el DIRECTOR (qué bola cuándo, cuándo se repasa). La física y el modelo viven en
 * src/data/paleta.ts; lo que se dibuja de cada neurona, en NeuronView/NetworkView.
 */
import type { NetworkN } from '@dniskav/neuron';
import {
  BLOCK_LABEL, BOUND_LABEL, BRAIN_SCALE, CONT_LABEL, CURVE_LABEL, HIDDEN, HW, INPUT_NAMES, RULES, TEAM, WALLS_LABEL, blockBox, blockExplain, boundExplain, caught, contExplain, curveExplain, rulesOf, feats, finalDrop, newBlockState, newModel,
  nextJourney, paddleAt, passesFor, predictX, refill, restart, returned, reviewChunk, review, teamActNames, wallsExplain,
  type BlockState, type Drop, type Journey, type Kind, type Part, type Prev, type Rules, type Team,
} from '../../data/paleta';
import { WINDOW, buildScript, runAuto, type AutoApi, type AutoCtx } from '../../data/paletaAuto';
import { newPaletaCodeState, rawText, renderCodeHtml, type PaletaCodeState } from '../../data/paletaCode';
import { TAU, font, glow, rrect } from '../../viz/core/canvas';
import { createLoop } from '../../viz/core/loop';
import { reducedMotion } from '../../viz/core/motion';
import { namedColumnsLayout, soloGeometry, type NetworkLayout } from '../../viz/geometry';
import { BrainMeter, fillOf } from '../../viz/BrainMeter';
import { NetworkView } from '../../viz/NetworkView';
import type { NeuronView, NeuronViewOptions } from '../../viz/NeuronView';
import type { NeuronDelta } from '../../viz/observe';
import { getPager } from '../../viz/Pager';
import { AutoMode, type AutoHandle } from '../ui/AutoMode';
import { CodePanel } from '../ui/CodePanel';
import { dockEls, linkPanels } from '../ui/dock';
import { brainAria, mountBrainMeter } from '../ui/mountMeter';
import { Narrator } from '../ui/Narrator';
import { PaletaBrainPanel } from '../ui/PaletaBrainPanel';
import { PauseControl } from '../ui/PauseControl';
import { ResultStrip } from '../ui/Strips';
import { Toggle } from '../ui/Toggle';

type Mode = 'slow' | 'fast' | 'batch';
type Phase = 'idle' | 'ball' | 'batch';
/**
 * El viaje de una bola: trozos en orden (sube desde la paleta, baja, choca con el bloque, vuelve a bajar…). Cada vez que
 * EMPIEZA A BAJAR la red mira y predice de nuevo (la paleta se mueve MIENTRAS tanto).
 */
interface Ball {
  j: Journey; mode: 'slow' | 'fast';
  /** El trozo en el que va, cuánto ha recorrido de él y de cuánto es cada trozo. */
  idx: number; dist: number; lens: { seg: number[]; len: number }[];
  /** La bajada en curso (null si va subiendo) y lo que predijo la red para ella. */
  d: Drop | null; pred: number;
  /** Distancia, dentro del trozo en curso, a la que toca el bloque (si lo toca en este trozo). */
  hitAt: number | null;
}
/** Lo que la red está haciendo con una bola, EN PARALELO a su movimiento: ve (`in`), las del medio (`mid`), dice (`out`). `sc` acorta el pensar si la bajada es corta. */
interface Look { d: Drop; pred: number; hs: number[]; stage: 'in' | 'mid' | 'out'; t: number; sc: number; re: boolean }
interface Rev { deltas: NeuronDelta[][]; t: number; snapped: boolean; dead: boolean; ref: number }
interface Fade { x: number; y: number; vx: number; vy: number; t: number }

const HUES: [number, number, number][] = [[110, 214, 196], [200, 150, 255], [255, 200, 130]];
const GOLD = '255,224,138', GREEN = '126,224,164', BLOCK_RGB = '150,190,255';
/* La bola no se para nunca: la red mira, predice y aprende mientras ella se mueve. La predicción sale antes de que la bola
   llegue abajo (en SLOW, a los 0,75 s; la bola tarda ≥ 1,25 s) y la paleta tiene tiempo de llegar. */
const SLOW = { in: 0.35, mid: 0.2, out: 0.2, speed: 0.8, paddle: 2.6 };
const FAST = { in: 0.08, mid: 0.04, out: 0.06, speed: 2.6, paddle: 8 };
const BATCH_DT = 0.022;
const SINCE = 10;
const CHUNK = 10;
const PERFECT = 100;
const REF = { solo: 0.06, equipo: 0.05 };
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const f2 = (x: number): string => x.toFixed(2);

/** Cómo se ve cada neurona: sin su bulbo propio (el número que dice lo dibuja la pantalla). */
function viewOptions(kind: Kind): (layer: number, neuron: number, last: boolean) => NeuronViewOptions {
  const solo = kind === 'solo';
  return (_l, n) => ({ wMax: solo ? 1.5 : 3, levelMin: solo ? -1.5 : -3, levelMax: solo ? 2.5 : 3, phase: 1.7 * (n + 1), chargeGain: 0.5, tint: false, lineLabel: false, bulb: false });
}
function layoutOf(kind: Kind): NetworkLayout | undefined {
  if (kind === 'solo') { const g = soloGeometry(INPUT_NAMES, HUES); return { size: g.size, neurons: [[g]] }; }
  return namedColumnsLayout([INPUT_NAMES.length, HIDDEN, 1], INPUT_NAMES, HUES).layout;
}
/** Longitud de cada tramo de un camino (en unidades del campo) y total. */
function lengths(path: [number, number][]): { seg: number[]; len: number } {
  const seg: number[] = []; let len = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); len += l; }
  return { seg, len };
}
/** Dónde está la bola al recorrer `dist` del camino. */
function posAt(path: [number, number][], seg: number[], dist: number): [number, number] {
  let d = dist;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, d / seg[i]) : 1; return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f]; }
    d -= seg[i];
  }
  return path[path.length - 1];
}

export function startPaleta(): void {
  const reduced = reducedMotion();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const fcv = $<HTMLCanvasElement>('pafield'), ncv = $<HTMLCanvasElement>('panet'), mcv = $<HTMLCanvasElement>('pameter'), sec = $('paleta');
  const goBtn = $<HTMLButtonElement>('pago'), b10 = $<HTMLButtonElement>('pa10'), b100 = $<HTMLButtonElement>('pa100');
  const teamBtn = $<HTMLButtonElement>('pateam'), resetBtn = $('pareset');
  const tg = (id: string): Toggle => new Toggle($(id), $(id + 'exp'));
  const walls$ = tg('pawalls'), cont$ = tg('pacont'), block$ = tg('pablock'), curve$ = tg('pacurve'), bound$ = tg('pabound');
  const nar = new Narrator({ status: $('pastatus'), live: $('palive') });
  const countEl = $('pacount'), noteEl = $('panotebrain');

  let kind: Kind = 'solo', walls = RULES.walls, cont = RULES.rebound, blockOn = !!RULES.block, team: Team = { ...TEAM }, net: NetworkN = newModel(kind, team), trained = false;
  /** El bloque que hay ahora (y cuántos han salido: el siguiente es siempre el mismo). */
  let bs: BlockState = newBlockState(blockOn);
  let nv = new NetworkView(net, viewOptions(kind), layoutOf(kind));
  /** El cerebro pequeño: una sección por neurona en uso; su nivel es el % de atrapadas de la tira reciente. */
  const meter = new BrainMeter(1);
  meter.setModel(net); meter.track(nv.observed, BRAIN_SCALE[kind]);
  let saved: Drop[] = [];
  /** La caída anterior (si la paleta atrapó y hay rebote, la bola sigue en juego). */
  let carry: Prev | null = null;
  const recent: boolean[] = [];
  let phase: Phase = 'idle';
  let queue = { left: 0, mode: 'slow' as Mode, acc: 0, since: 0, ok: 0, done: 0, endless: false };
  /** Juego continuo: cuántas veces seguidas la ha devuelto la paleta, el récord y el aviso de la última partida. */
  let streak = 0, best = 0, gameMsg = '';
  let ball: Ball | null = null;
  let revs: Rev[] = [];
  /** El repaso de lo aprendido, por tandas, mientras la bola sigue: `active` hasta que termina. */
  let rv = { active: false, done: 0, total: 0, rt: 0, chunk: 0 };
  let look: Look | null = null;
  /** Lo que se ve en el campo. */
  const paddle = { x: 0.5, target: 0.5, flash: 0, bad: 0 };
  /** `shown` es dónde se dibuja «cree: aquí»: se desliza hasta `pred` cuando la red vuelve a predecir. */
  const marks: { pred: number | null; land: number | null; t: number; shown: number | null } = { pred: null, land: null, t: 0, shown: null };
  let trail: { j: Journey; a: number } | null = null;
  let fades: Fade[] = [];
  let ghost: { j: Journey; t: number } | null = null;
  /** El bloque tal como se dibuja: aparece (`k` de 0 a 1) y, al chocar, estalla (`poof`). */
  let shownBlock: { b: BlockState['block']; k: number } | null = null;
  let poofs: { b: NonNullable<BlockState['block']>; t: number }[] = [];
  let shownPred: { v: number; t: number } | null = null;
  let rate = SLOW;

  // ---------- paneles ----------
  const dock = dockEls('pa');
  const code = new CodePanel<PaletaCodeState>(
    dock.code,
    { newState: () => ({ ...newPaletaCodeState(), kind, walls, ceiling: cont, rebound: cont, block: blockOn, team: { ...team } }), renderHtml: renderCodeHtml, rawText },
  );
  const brain = new PaletaBrainPanel(dock.brain, () => ({ net, kind, trained, team }));
  linkPanels(code, brain);
  const pager = getPager();
  /** Pausa: congela la bola, la paleta, las animaciones de la red, el repaso y los lanzamientos en curso; al reanudar sigue donde estaba. */
  const pause = new PauseControl({ button: $('papause'), icon: $('papi'), section: sec, say: (t) => nar.say(t), onChange: () => redraw(), pager });

  // ---------- interfaz ----------
  const setStatus = (t: string): void => nar.status(t), say = (t: string): void => nar.say(t);
  const busy = (): boolean => phase !== 'idle' || queue.left > 0 || rv.active;
  const okCount = (): number => recent.filter(Boolean).length;
  const strip = new ResultStrip($('pastrip'), countEl, {
    count: (ok, n, extra) => ok + '/' + n + ' atrapadas (' + Math.round((ok / n) * 100) + ' %)' + extra,
    empty: 'Ninguna bola todavía',
    aria: (ok, n) => 'Las últimas ' + n + ' bolas: ' + ok + ' atrapadas',
    emptyAria: 'Las últimas bolas: todavía ninguna',
  });
  /**
   * Un cerebro lleno y un % bajo es CORRECTO: el llenado es lo que ha cambiado cada neurona; el % es lo que acierta la red entera.
   * Medido (`BRAIN_SCALE` en `data/paleta.ts`): la neurona sola con paredes acumula 2,0 de cambio a las 10 caídas, 7,9 a las 30 y 75 a
   * las 100 (sin paredes, 4,8 y 7,9) y se queda en ~27 %: cambia mucho y no puede con el rebote.
   */
  function paintBrainNote(): void {
    const n = recent.length, travel = nv.observed.travelFlat();
    const changed = kind === 'solo' && walls && n >= 10 && okCount() / n < 0.5 && fillOf(travel[0] ?? 0, BRAIN_SCALE.solo) >= 0.6;
    noteEl.hidden = !changed; noteEl.textContent = changed ? 'Ha cambiado mucho, pero una sola neurona no puede con los rebotes.' : '';
  }
  function paintStrip(): void { strip.paint(recent, ' · ' + saved.length + (saved.length === 1 ? ' guardada' : ' guardadas')); paintBrainNote(); }
  function paintButtons(): void {
    const dis = busy() && !auto.running;
    goBtn.disabled = b10.disabled = b100.disabled = dis;
    walls$.paint({ label: WALLS_LABEL(walls), on: walls, explain: wallsExplain(walls) });
    cont$.paint({ label: CONT_LABEL(cont), on: cont, explain: contExplain(cont) });
    block$.paint({ label: BLOCK_LABEL(blockOn), on: blockOn, explain: blockExplain(blockOn) });
    teamBtn.textContent = 'Cerebro: ' + (kind === 'equipo' ? 'equipo' : 'neurona'); teamBtn.setAttribute('aria-pressed', kind === 'equipo' ? 'true' : 'false');
    teamBtn.classList.toggle('on', kind === 'equipo');
    const [actMid, actEnd] = teamActNames(team);
    curve$.paint({ label: CURVE_LABEL(team.curve), fn: actMid, on: team.curve, tint: true, explain: curveExplain(team.curve, walls), disabled: dis });
    bound$.paint({ label: BOUND_LABEL(team.bounded), fn: actEnd, on: team.bounded, tint: true, explain: boundExplain(team.bounded), disabled: dis });
    sec.dataset.walls = walls ? '1' : '0'; sec.dataset.kind = kind;
    ncv.setAttribute('aria-label', kind === 'solo'
      ? 'La neurona real: recibe dónde está la bola, cuánto se inclina y a qué altura empieza a bajar, y dice dónde cree que caerá. Al aprender, después de responder llega la corrección y las conexiones cambian de grosor.'
      : 'Un equipo real: la bola entra por tres conexiones a ocho neuronas ayudantes, y la última dice dónde cree que caerá. Al aprender llega la corrección y las conexiones cambian de grosor.');
  }
  const streakTxt = (): string => (cont && streak > 0 ? ' · la ha devuelto ' + streak + (streak === 1 ? ' vez seguida' : ' veces seguidas') + (best > streak ? ' (récord ' + best + ')' : '') : '');
  function idleStatus(): string {
    if (cont && gameMsg) return gameMsg;
    if (!saved.length) return (kind === 'solo' ? 'Neurona nueva' : 'Equipo nuevo') + ' · pulsa «Lanzar bola»';
    const n = recent.length;
    return 'Atrapó ' + okCount() + ' de ' + (n >= WINDOW ? 'las últimas ' : '') + n;
  }
  function pushRecent(ok: boolean): void { recent.push(ok); while (recent.length > WINDOW) recent.shift(); }
  function updateCode(): void { code.patch({ kind, walls, ceiling: cont, rebound: cont, block: blockOn, team: { ...team }, saved: saved.slice(-400) }); }

  const outView = (): NeuronView => nv.layers[nv.layers.length - 1][0];
  const firstLayer = (): NeuronView[] => nv.layers[0];
  const ref = (): number => REF[kind];

  // ---------- director ----------
  function cancelRun(): void {
    queue = { left: 0, mode: 'slow', acc: 0, since: 0, ok: 0, done: 0, endless: false };
    ball = null; look = null; rv.active = false; carry = null; revs = []; phase = 'idle'; ghost = null; fades = [];
    paddle.target = paddle.x; code.mode('exam'); code.cur(null);
    syncBlock();
    nv.neurons.forEach((v) => v.sync(true)); nv.observed.resync();
    paintButtons();
  }
  /** Modelo nuevo (la neurona sola o el equipo), con las caídas guardadas que se le digan. */
  function setModel(k: Kind): void {
    cancelRun();
    const r = restart({ kind: k, rules: rulesNow(), team }); kind = r.cfg.kind; net = r.net; carry = r.prev; trained = false; bs = r.bs; shownBlock = null; poofs = []; syncBlock();
    nv = new NetworkView(net, viewOptions(k), layoutOf(k), nv);
    meter.setModel(net); meter.track(nv.observed, BRAIN_SCALE[k]);
    saved = r.saved; recent.length = 0; streak = best = 0; gameMsg = '';
    marks.pred = marks.land = marks.shown = null; trail = null; shownPred = null;
    paddle.x = paddle.target = 0.5;
    updateCode(); paintStrip(); paintButtons(); setStatus(idleStatus());
    redraw();
  }
  /** «Empezar de cero»: conserva TODO lo elegido (cerebro, paredes, techo, rebote, activaciones) y solo crea pesos nuevos
   *  y vacía las caídas guardadas, la tira y el contador (si no, reaprendería al instante de la memoria). */
  function reset(): void {
    setModel(kind);
    setStatus((kind === 'solo' ? 'Neurona nueva' : 'Equipo nuevo') + ', sin saber nada · pulsa «Lanzar bola»');
    say('Empiezas de cero: una red nueva con la misma configuración y ninguna caída guardada.');
  }
  /** Para «Míralo solo»: el guion parte siempre de lo mismo (neurona, sin paredes, techo sí, sin rebote). */
  function resetDefaults(): void {
    walls = RULES.walls; cont = RULES.rebound; blockOn = !!RULES.block; team = { ...TEAM }; setModel('solo');
    say('Vuelves a empezar: una neurona nueva, sin ninguna caída guardada.');
  }
  function setWalls(on: boolean): void {
    if (walls === on) return;
    cancelRun(); sec.dataset.tog = 'walls';
    walls = on; saved = []; recent.length = 0; marks.pred = marks.land = marks.shown = null; trail = null;
    updateCode(); paintStrip(); paintButtons();
    setStatus(on ? 'Con paredes la bola rebota · las caídas de antes ya no sirven · lanza bolas' : 'Sin paredes · lanza bolas');
    say(on ? 'Paredes puestas: la bola rebota. Se borran las caídas guardadas.' : 'Sin paredes. Se borran las caídas guardadas.');
    redraw();
  }
  /** «Juego continuo» no cambia lo que se aprende (toda bajada empieza en el techo): las caídas guardadas siguen valiendo. */
  function setCont(on: boolean): void {
    if (cont === on) return;
    cancelRun(); cont = on; sec.dataset.tog = 'cont';
    updateCode(); paintButtons(); setStatus(idleStatus()); say(contExplain(on)); redraw();
  }
  /**
   * «Bloque»: no cambia la red (siempre mira tres cosas: dónde está, cuánto se inclina y a qué altura empieza a bajar) ni lo que
   * vale cada caída guardada: todas siguen siendo pares válidos. Solo cambia qué bolas llegan.
   */
  function setBlock(on: boolean): void {
    if (blockOn === on) return;
    cancelRun(); blockOn = on; sec.dataset.tog = 'block';
    bs = newBlockState(on); shownBlock = null; poofs = []; syncBlock();
    updateCode(); paintButtons(); setStatus(idleStatus()); say(blockExplain(on)); redraw();
  }
  /** El cerebro (neurona sola o equipo) es independiente de las paredes: la red nace NUEVA y vacía, con su contador a cero. */
  function setBrain(k: Kind): void {
    if (k === kind) return;
    setModel(k);
    setStatus((k === 'equipo' ? 'Equipo nuevo' : 'Neurona nueva') + ', sin saber nada · pulsa «Lanzar bola»');
    say(k === 'equipo' ? 'Ahora hay un equipo de ' + HIDDEN + ' neuronas ayudantes, nuevo y vacío.' : 'Ahora hay una sola neurona, nueva y vacía.');
  }
  function useTeam(): void { setBrain('equipo'); }
  /** Un interruptor del equipo: la red nace NUEVA y vacía (con las paredes como estén), tira y contador a cero. */
  function setTeam(patch: Partial<Team>, which: 'curve' | 'bound'): void {
    const next = { ...team, ...patch };
    if (next.curve === team.curve && next.bounded === team.bounded) return;
    team = next; sec.dataset.tog = which;
    setModel('equipo');
    setStatus('Equipo nuevo, sin saber nada · pulsa «Lanzar bola»');
    say(which === 'curve' ? curveExplain(team.curve, walls) : boundExplain(team.bounded));
  }

  /** Lanza `count` bolas. 1 = una a una con calma; hasta 30 = deprisa; más = en bloque, sin animar cada una. */
  function launch(count: number, mode: Mode): void {
    if (busy()) return;
    pause.set(false);
    /* «Lanzar bola» con juego continuo = una partida: sigue sola hasta que la paleta falla (con un tope de 100 seguidas) */
    queue = { left: cont && count === 1 && mode === 'slow' ? PERFECT : count, mode, acc: 0, since: 0, ok: 0, done: 0, endless: cont && count === 1 && mode === 'slow' };
    carry = null; streak = 0; gameMsg = '';
    rate = mode === 'slow' ? SLOW : FAST;
    if (reduced) { runInstant(queue.left); return; }
    paintButtons();
  }
  function runInstant(count: number): void {
    for (let i = 0; i < count; i++) {
      const j = pick(), d = finalDrop(j), pred = predictX(net, d), ok = caught(pred, d.land);
      if (j.hit) bs.block = null;
      carry = { d, paddleX: paddleAt(pred), ok }; noteStreak(ok);
      saved.push(d); pushRecent(ok);
      const stop = queue.endless && (!ok || i === count - 1);
      if ((i + 1) % SINCE === 0 || i === count - 1 || stop) { review(net, saved, kind); trained = true; }
      if (stop) { gameMsg = endMsg(ok); marks.pred = marks.shown = pred; marks.land = d.land; syncBlock(); break; }
      marks.pred = marks.shown = pred; marks.land = d.land; trail = { j, a: 1 }; paddle.x = paddle.target = paddleAt(pred); shownPred = { v: pred, t: 99 };
      syncBlock();
    }
    queue.left = 0; nv.neurons.forEach((v) => v.sync(true)); nv.observed.resync();
    updateCode(); paintStrip(); paintButtons(); setStatus(idleStatus()); say(countEl.textContent ?? '');
    redraw();
  }
  const rulesNow = (): Rules => rulesOf(walls, cont, blockOn);
  /** Que se vea el bloque que hay (o el siguiente, si se acaba de llevar el último). */
  function syncBlock(): void {
    if (!blockOn) { shownBlock = null; return; }
    refill(bs);
    if (bs.block && (!shownBlock || shownBlock.b !== bs.block)) shownBlock = { b: bs.block, k: reduced ? 1 : 0 };
  }
  /** La bola toca el bloque: rebota (ya lo decidió el viaje) y el bloque desaparece. */
  function popBlock(): void {
    if (!bs.block) return;
    if (shownBlock?.b) poofs.push({ b: shownBlock.b, t: 0 });
    bs.block = null; shownBlock = null;
    say('La bola choca con el bloque, rebota y el bloque desaparece.');
  }
  /** El próximo viaje: la bola que sale rebotada de la paleta, o una nueva desde el techo; con el bloque que haya en el campo. */
  const pick = (): Journey => { syncBlock(); return nextJourney(saved.length, carry, rulesNow(), bs.block); };
  const lensOf = (j: Journey): Ball['lens'] => j.parts.map((p) => lengths(p.kind === 'fall' ? p.d.path : p.path));
  const pathOf = (p: Part): [number, number][] => (p.kind === 'fall' ? p.d.path : p.path);
  /** La bola entra en juego: sale ya moviéndose (rebotada de la paleta, o nueva desde el techo). No hay pausa. */
  function startBall(): void {
    const j = pick();
    ball = { j, mode: queue.mode === 'slow' ? 'slow' : 'fast', idx: 0, dist: 0, lens: lensOf(j), d: null, pred: 0, hitAt: null };
    phase = 'ball';
    code.mode('exam'); code.cur(null);
    enterPart(ball, 0);
  }
  /** La bola pasa al trozo `i` de su viaje: si baja, la red mira y predice de nuevo; si sube, solo vuela. */
  function enterPart(b: Ball, i: number): void {
    b.idx = i; b.dist = 0;
    const p = b.j.parts[i], L = b.lens[i];
    b.hitAt = p.hit !== undefined ? L.seg.slice(0, p.hit).reduce((a, c) => a + c, 0) : null;
    const afterBlock = i > 0 && b.j.parts[i - 1].hit !== undefined;
    if (p.kind === 'fall') { b.d = p.d; beginDescent(b, p.d, afterBlock); }
    else { b.d = null; setStatus(afterBlock ? 'La bola rebota en el bloque y sube…' : i === 0 && returned(b.j) ? 'La paleta la devuelve hacia arriba…' : 'La bola sube…'); }
  }
  const inputs01 = (d: Drop): number[] => [clamp01(d.x), clamp01((d.slope + 1.2) / 2.4), clamp01((d.y - 0.5) / 0.5)];
  /**
   * Empieza a bajar (desde el techo, o tras rebotar en el bloque): la red mira la bola (con lo que ya aprendió) y su animación
   * corre en paralelo. Si es por un rebote en el bloque (`re`), vuelve a predecir y «cree: aquí» se desliza al nuevo sitio.
   * Una bajada corta se piensa más deprisa, para que a la paleta le dé tiempo.
   */
  function beginDescent(b: Ball, d: Drop, re: boolean): void {
    if (rv.active) finishReview();   // lo aprendido de la bola anterior ya cuenta para esta
    b.pred = predictX(net, d);
    nv.respond(feats(d));
    look = { d, pred: b.pred, hs: kind === 'equipo' ? net.layers[0].neurons.map((n) => Math.abs(n.predict(feats(d)))) : [], stage: 'in', t: 0, sc: Math.max(0.3, Math.min(1, b.lens[b.idx].len / 1.25)), re };
    if (!re) { marks.pred = null; marks.shown = null; shownPred = null; }
    setStatus((re ? 'Rebotó en el bloque: vuelve a mirar y corrige…' : 'Mirando la bola… cae mientras la neurona piensa') + streakTxt());
  }
  /** La predicción existe: la paleta empieza a ir hacia ella (la bola sigue bajando). */
  function emerge(l: Look): void {
    outView().termFlash = 1; outView().flash = Math.max(outView().flash, 0.2);
    shownPred = { v: l.pred, t: 0 };
    marks.pred = l.pred; if (marks.shown === null) marks.shown = l.pred; paddle.target = paddleAt(l.pred);
    look = null;
    setStatus((l.re ? 'Ahora cree que caerá aquí' : 'Cree que caerá aquí') + ' (x = ' + f2(l.pred) + ') · la paleta va allí' + streakTxt());
  }
  function advanceLook(l: Look, dt: number): void {
    if (l.stage === 'in') { l.t += dt / (rate.in * l.sc); if (l.t >= 1) { l.t = 0; l.stage = kind === 'equipo' ? 'mid' : 'out'; } }
    else if (l.stage === 'mid') { l.t += dt / (rate.mid * l.sc); if (l.t >= 1) { l.t = 0; l.stage = 'out'; } }
    else { l.t += dt / (rate.out * l.sc); if (l.t >= 1) emerge(l); }
  }
  /** La racha del juego continuo: cuenta las bajadas seguidas que la paleta devuelve; si falla, vuelve a cero. */
  function noteStreak(ok: boolean): void { if (ok) { streak++; best = Math.max(best, streak); } else lastStreak = streak, streak = 0; }
  let lastStreak = 0;
  function endMsg(ok: boolean): string {
    const n = ok ? streak : lastStreak;
    const head = ok ? '¡' + n + ' seguidas, partida perfecta!' : n === 0 ? 'La bola cayó: la paleta no pudo devolverla ni una vez' : 'La bola cayó. La ha devuelto ' + n + (n === 1 ? ' vez seguida' : ' veces seguidas');
    return head + (best > 0 ? ' · récord ' + best : '') + ' · pulsa «Lanzar bola» para otra partida';
  }
  function land(b: Ball): void {
    const d = b.d as Drop, ok = caught(b.pred, d.land);
    if (look) emerge(look);
    if (b.j.hit) popBlock();   // por si acaso: si tocó el bloque, ya no está
    marks.land = d.land; trail = { j: b.j, a: 1 };
    carry = { d, paddleX: paddleAt(b.pred), ok };
    saved.push(d); pushRecent(ok); queue.ok += ok ? 1 : 0; queue.done++; queue.left--;
    noteStreak(ok);
    if (queue.endless && (!ok || queue.left <= 0)) { queue.left = 0; gameMsg = endMsg(ok); }
    if (ok) paddle.flash = 1;
    else {
      paddle.bad = 1;
      const [x, y] = d.path[d.path.length - 1], [px, py] = d.path[d.path.length - 2], dx = x - px, dy = y - py, l = Math.hypot(dx, dy) || 1;
      fades.push({ x, y, vx: dx / l, vy: dy / l, t: 0 });
    }
    ball = null; syncBlock();   // si el bloque se llevó el golpe, aparece otro
    updateCode(); code.cur('ej', saved.length - 1); code.mode('learn'); paintStrip();
    setStatus(cont && queue.endless && queue.left <= 0 ? gameMsg : (ok ? '¡Atrapada!' : 'No la atrapó: cayó a un lado.') + ' Ya sabe dónde cayó: la guarda y repasa' + streakTxt());
    /* aprender ocurre en paralelo: la bola siguiente (o la rebotada) ya se está moviendo */
    if (b.mode === 'slow') rv = { active: true, done: 0, total: passesFor(kind, saved.length), rt: 0.05, chunk: 0 };
    else { review(net, saved, kind); trained = true; pulse(ref()); }
    if (queue.left > 0) startBall(); else phase = 'ball';
  }
  /** Termina de golpe lo que quede del repaso (la siguiente bola necesita lo aprendido). */
  function finishReview(): void {
    if (!rv.active) return;
    const n = rv.total - rv.done;
    if (n > 0) { reviewChunk(net, saved, kind, n, rv.chunk++); trained = true; pulse(ref()); }
    rv.active = false; rv.done = rv.total;
  }
  function finishRun(): void {
    phase = 'idle'; queue.left = 0; ball = null; look = null; rv.active = false; code.mode('exam'); code.cur(null);
    paintButtons(); setStatus(idleStatus()); say(countEl.textContent ?? '');
  }
  /** Un «repaso»: se entrena de verdad y el pulso de vuelta lleva el cambio real de cada neurona. */
  function pulse(r: number): void {
    const deltas = nv.observed.poll();
    revs.push({ deltas, t: 0, snapped: false, dead: false, ref: r });
    outView().flash = Math.max(outView().flash, 0.4);
    paintBrainNote();
  }
  /** Una bola del bloque: sin animación propia; la paleta salta y queda su rastro. */
  function batchBall(): void {
    const j = pick(), d = finalDrop(j), pred = predictX(net, d), ok = caught(pred, d.land);
    if (j.hit) bs.block = null;
    carry = { d, paddleX: paddleAt(pred), ok };
    noteStreak(ok);
    saved.push(d); pushRecent(ok); queue.ok += ok ? 1 : 0; queue.done++; queue.left--; queue.since++;
    paddle.x = paddle.target = paddleAt(pred); marks.pred = marks.shown = pred; marks.land = d.land; ghost = { j, t: 0 }; shownPred = { v: pred, t: 0 }; syncBlock();
    if (ok) paddle.flash = 0.6; else paddle.bad = 0.6;
    if (queue.since >= SINCE || queue.left <= 0) {
      queue.since = 0; review(net, saved, kind); trained = true; pulse(ref());
      paintStrip(); setStatus('Lanzando… ' + queue.done + '/' + (queue.done + queue.left) + ' · atrapadas ' + okCount() + ' de ' + recent.length);
    }
  }

  function advanceBall(b: Ball, dt: number): void {
    const p = b.j.parts[b.idx], len = b.lens[b.idx].len;
    b.dist += dt * rate.speed;
    if (b.hitAt !== null && b.dist >= b.hitAt) { b.hitAt = null; popBlock(); }
    if (b.dist < Math.max(len, 1e-6)) return;
    if (p.kind === 'fall' && !p.d.cut) land(b);
    else enterPart(b, b.idx + 1);   // chocó con el bloque o salió del campo: sigue el viaje
  }

  function tick(dt: number): void {
    if (phase === 'idle' && queue.left > 0) {
      if (queue.mode === 'batch') { phase = 'batch'; setStatus('Lanzando… 0/' + queue.left); } else startBall();
    }
    if (phase === 'ball') {
      if (ball) advanceBall(ball, dt);
      if (look) advanceLook(look, dt);
      if (!ball && !look && queue.left <= 0 && !rv.active) finishRun();
    } else if (phase === 'batch') {
      queue.acc += dt;
      while (queue.acc >= BATCH_DT && queue.left > 0) { queue.acc -= BATCH_DT; batchBall(); }
      if (queue.left <= 0) { paintStrip(); updateCode(); finishRun(); }
    }
    if (rv.active) {
      rv.rt -= dt;
      if (rv.rt <= 0) {
        const n = Math.min(CHUNK, rv.total - rv.done);
        reviewChunk(net, saved, kind, n, rv.chunk++);
        rv.done += n; trained = true; pulse(ref());
        rv.rt = 0.07;
        if (rv.done >= rv.total) { rv.active = false; if (phase === 'ball' && !ball) setStatus('repasó ' + rv.total + ' veces'); }
      }
    }
    /* la paleta: código normal. Va adonde se le dice, a su velocidad, y se para */
    const step = rate.paddle * dt, dx = paddle.target - paddle.x;
    paddle.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
    paddle.flash = Math.max(0, paddle.flash - dt * 2.2); paddle.bad = Math.max(0, paddle.bad - dt * 2.2);
    if (ghost) { ghost.t += dt; if (ghost.t > 0.5) ghost = null; }
    if (shownPred) shownPred.t += dt;
    if (marks.pred !== null && marks.shown !== null) marks.shown += (marks.pred - marks.shown) * Math.min(1, dt * 9);
    if (shownBlock && shownBlock.k < 1) shownBlock.k = Math.min(1, shownBlock.k + dt * 3);
    poofs.forEach((q) => { q.t += dt; }); poofs = poofs.filter((q) => q.t < 0.5);
    fades.forEach((f) => { f.t += dt; }); fades = fades.filter((f) => f.t < 0.5);
    revs.forEach((r) => {
      r.t += dt / 0.35;
      if (!r.snapped && r.t >= 0.4) { r.snapped = true; r.deltas.forEach((layer, li) => layer.forEach((d, ni) => meter.learned(meter.lobeOf(net, li, ni), nv.layers[li][ni].learn(d, { ref: r.ref })))); }
      if (r.t >= 1) r.dead = true;
    });
    revs = revs.filter((r) => !r.dead);
  }

  // ---------- dibujo: el campo ----------
  const pathLine = (ctx: CanvasRenderingContext2D, X: (u: number) => number, Y: (u: number) => number, path: [number, number][], upTo?: number, seg?: number[]): void => {
    ctx.beginPath(); ctx.moveTo(X(path[0][0]), Y(path[0][1]));
    if (upTo !== undefined && seg) {
      let d = upTo;
      for (let i = 1; i < path.length; i++) {
        const l = seg[i - 1];
        if (d >= l) { ctx.lineTo(X(path[i][0]), Y(path[i][1])); d -= l; } else { const p = posAt(path, seg, upTo); ctx.lineTo(X(p[0]), Y(p[1])); break; }
      }
    } else for (let i = 1; i < path.length; i++) ctx.lineTo(X(path[i][0]), Y(path[i][1]));
    ctx.stroke();
  };
  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, rgb: string, a: number): void {
    ctx.font = font(11); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width, cx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, x));
    ctx.fillStyle = 'rgba(' + rgb + ',' + a + ')'; ctx.fillText(text, cx, y);
  }
  function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const padX = 14, yT = 18, yL = h - 40, x0 = padX, x1 = w - padX, FW = x1 - x0;
    const X = (u: number): number => x0 + u * FW, Y = (u: number): number => yL - u * (yL - yT);
    /* el campo */
    ctx.fillStyle = 'rgba(255,255,255,.025)'; rrect(ctx, x0, yT - 8, FW, h - yT - 2, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (walls) {
      [x0, x1].forEach((x) => {
        ctx.strokeStyle = 'rgba(' + GOLD + ',.16)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, yT - 4); ctx.lineTo(x, yL + 4); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + GOLD + ',.85)'; ctx.lineWidth = 3; ctx.stroke();
      });
    } else {
      ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.2;
      [x0, x1].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, yT - 4); ctx.lineTo(x, yL + 4); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    if (cont) {
      ctx.strokeStyle = 'rgba(' + GOLD + ',.16)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x0, yT - 2); ctx.lineTo(x1, yT - 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + GOLD + ',.85)'; ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, yT - 2); ctx.lineTo(x1, yT - 2); ctx.stroke(); ctx.setLineDash([]);
    }
    /* la línea de la paleta y dónde han caído las bolas guardadas */
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(' + GOLD + ',.28)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, yL); ctx.lineTo(x1, yL); ctx.stroke(); ctx.setLineDash([]);
    saved.slice(-120).forEach((d) => { ctx.fillStyle = 'rgba(' + GREEN + ',.32)'; ctx.beginPath(); ctx.arc(X(d.land), yL + 9, 2.2, 0, TAU); ctx.fill(); });
    /* trayectoria tenue de la última bola */
    const faint = ghost ? ghost.j : trail ? trail.j : null;
    if (faint && !ball) { ctx.strokeStyle = 'rgba(255,255,255,' + (ghost ? 0.4 : 0.2) + ')'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 5]); faint.parts.forEach((q) => pathLine(ctx, X, Y, pathOf(q))); ctx.setLineDash([]); }
    /* el bloque (la red no lo ve) y su estallido al chocar */
    if (shownBlock?.b) {
      const [bx0, bx1, by0, by1] = blockBox(shownBlock.b), k = shownBlock.k, cx = X((bx0 + bx1) / 2), cy = Y((by0 + by1) / 2), bw = (X(bx1) - X(bx0)), bh = Y(by0) - Y(by1);
      ctx.globalAlpha = k; ctx.fillStyle = 'rgba(' + BLOCK_RGB + ',.28)'; rrect(ctx, cx - (bw / 2) * (0.6 + 0.4 * k), cy - bh / 2, bw * (0.6 + 0.4 * k), bh, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(' + BLOCK_RGB + ',.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    }
    poofs.forEach((q) => {
      const [bx0, bx1, by0, by1] = blockBox(q.b), k = q.t / 0.5, cx = X((bx0 + bx1) / 2), cy = Y((by0 + by1) / 2), bw = X(bx1) - X(bx0), bh = Y(by0) - Y(by1);
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(' + BLOCK_RGB + ',.9)'; ctx.lineWidth = 2;
      rrect(ctx, cx - (bw / 2) * (1 + 1.5 * k), cy - (bh / 2) * (1 + 0.3 * k), bw * (1 + 1.5 * k), bh * (1 + 0.3 * k), 4); ctx.stroke(); ctx.globalAlpha = 1;
    });
    /* la bola que cae */
    if (ball) {
      const b = ball, p = b.j.parts[b.idx], L = b.lens[b.idx], path = pathOf(p);
      /* lo que ya recorrió este viaje, tenue (el camino hasta el bloque) */
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.6; ctx.setLineDash([]);
      for (let i = 0; i < b.idx; i++) pathLine(ctx, X, Y, pathOf(b.j.parts[i]));
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.8; pathLine(ctx, X, Y, path, b.dist, L.seg);
      const pos = posAt(path, L.seg, b.dist);
      const fade = p.kind === 'fly' && p.exit ? Math.max(0, Math.min(1, (L.len - b.dist) / Math.max(0.01, 0.2 * L.len))) : 1;
      /* lo que ve la neurona: dónde estaba al empezar a bajar y hacia dónde se inclinaba (se desvanece; la bola no espera) */
      if (look && look.stage === 'in') {
        const Ln = 30, dx = look.d.slope * FW, dy = yL - yT, n = Math.hypot(dx, dy) || 1, sx = X(look.d.x), sy = Y(look.d.y);
        ctx.globalAlpha = 1 - 0.7 * look.t; ctx.strokeStyle = 'rgba(' + HUES[1].join(',') + ',.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (dx / n) * Ln, sy + (dy / n) * Ln); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      const bx = X(pos[0]), by = Y(pos[1]);
      ctx.globalAlpha = fade;
      glow(ctx, bx, by, 18, 'rgba(255,240,200,.55)', 'rgba(255,240,200,0)');
      ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    fades.forEach((f) => {
      const k = f.t / 0.5, bx = X(f.x) + f.vx * FW * 0.08 * k, by = Y(f.y) - f.vy * (yL - yT) * 0.12 * k;
      ctx.globalAlpha = 1 - k; glow(ctx, bx, by, 14, 'rgba(255,240,200,.4)', 'rgba(255,240,200,0)');
      ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    });
    if (ghost) { const g = finalDrop(ghost.j), k = 1 - ghost.t / 0.5; ctx.fillStyle = 'rgba(255,248,224,' + k + ')'; ctx.beginPath(); ctx.arc(X(g.land), yL, 4, 0, TAU); ctx.fill(); }
    /* la paleta: va adonde le dicen y se para */
    const pw = 2 * HW * FW, px = X(paddle.x) - pw / 2, py = yL - 1;
    if (paddle.flash > 0.01) glow(ctx, X(paddle.x), yL, pw * 0.7, 'rgba(' + GOLD + ',' + 0.55 * paddle.flash + ')', 'rgba(' + GOLD + ',0)');
    const pg = ctx.createLinearGradient(0, py, 0, py + 10);
    pg.addColorStop(0, paddle.bad > 0.01 ? 'rgb(255,170,150)' : '#ffe9a8'); pg.addColorStop(1, paddle.bad > 0.01 ? '#c25a48' : '#c9a227');
    ctx.fillStyle = pg; rrect(ctx, px, py, pw, 10, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.stroke();
    /* «cree: aquí» (dorada, encima de la línea) y «cayó: aquí» (verde, debajo) */
    if (marks.pred !== null) {
      const mx = X(clamp01(marks.shown ?? marks.pred)), a = 0.95;
      ctx.fillStyle = 'rgba(' + GOLD + ',' + a + ')'; ctx.beginPath(); ctx.moveTo(mx - 6, yL - 22); ctx.lineTo(mx + 6, yL - 22); ctx.lineTo(mx, yL - 12); ctx.closePath(); ctx.fill();
      label(ctx, 'cree: aquí', mx, yL - 31, w, GOLD, a);
    }
    if (marks.land !== null) {
      const mx = X(marks.land);
      ctx.fillStyle = 'rgba(' + GREEN + ',.95)'; ctx.beginPath(); ctx.moveTo(mx - 6, yL + 20); ctx.lineTo(mx + 6, yL + 20); ctx.lineTo(mx, yL + 11); ctx.closePath(); ctx.fill();
      label(ctx, 'cayó: aquí', mx, yL + 30, w, GREEN, 0.95);
    }
    void t;
  }

  // ---------- dibujo: la neurona ----------
  function drawNet(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    nv.fit(w, h);
    const tr = nv.transform, last = outView();
    ctx.save(); ctx.translate(tr.ox, tr.oy); ctx.scale(tr.s, tr.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    nv.neurons.forEach((v) => v.drawWires(ctx));
    if (look) {
      const l = look;
      if (l.stage === 'in') firstLayer().forEach((v) => v.drawInput(ctx, inputs01(l.d), l.t));
      else if (l.stage === 'mid') last.drawRelay(ctx, l.hs.map((v) => clamp01(v)), l.t);
      else last.drawOutput(ctx, clamp01(l.pred), 1, l.t);
    }
    revs.forEach((r) => {
      const d = r.deltas, u = r.t;
      if (kind === 'solo') last.drawCorrection(ctx, u, d[0][0], { axon: [0, 0.4], dendrites: [0.4, 1], ref: r.ref });
      else {
        last.drawCorrection(ctx, u, d[1][0], { axon: [0, 0.25], dendrites: [0.25, 0.6], ref: r.ref });
        nv.layers[0].forEach((v, j) => v.drawCorrection(ctx, u, d[0][j], { dendrites: [0.6, 1], ref: r.ref }));
      }
    });
    nv.neurons.forEach((v) => v.drawBody(ctx, t));
    nv.neurons.forEach((v) => v.drawFront(ctx));
    /* la salida: lo que la neurona CREE (un punto del campo, de 0 a 1) */
    const [tx, ty] = last.geom.terminal, sp = shownPred, al = sp ? Math.min(1, sp.t * 5) : 0, fs = last.fs(13);
    glow(ctx, tx, ty, 13, 'rgba(255,224,138,' + (0.25 + 0.35 * last.termFlash) + ')', 'rgba(255,224,138,0)');
    ctx.fillStyle = 'rgba(190,155,40,.9)'; ctx.beginPath(); ctx.arc(tx, ty, 5 + 2 * last.termFlash, 0, TAU); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(fs * 1.15); ctx.fillStyle = sp ? 'rgba(255,233,160,' + (0.35 + 0.65 * al) + ')' : 'rgba(255,224,138,.4)';
    ctx.fillText(sp ? f2(sp.v) : '?', tx, ty - fs * 1.7);
    ctx.font = font(fs * 0.8); ctx.fillStyle = 'rgba(141,137,125,.95)'; ctx.fillText('cree', tx, ty + fs * 1.5);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  const fieldLoop = createLoop(fcv, {
    draw(ctx, w, h, dt, t) {
      if (!reduced && !pause.paused) tick(dt);
      drawField(ctx, w, h, t);
    },
  });
  const netLoop = createLoop(ncv, {
    draw(ctx, w, h, dt, t) {
      nv.update(pause.scale(dt));
      drawNet(ctx, w, h, t);
    },
  });
  const meterLoop = mountBrainMeter({
    canvas: mcv, meter, reduced, dt: (dt) => pause.scale(dt),
    labelSize: 40,
    aria: () => brainAria(meter, recent.length ? Math.round((okCount() / recent.length) * 100) : null, 'de bolas atrapadas'),
  });
  function redraw(): void { fieldLoop.redraw(); netLoop.redraw(); meterLoop.redraw(); }

  // ---------- controles ----------
  goBtn.addEventListener('click', () => launch(1, 'slow'));
  b10.addEventListener('click', () => launch(10, 'fast'));
  b100.addEventListener('click', () => launch(100, 'batch'));
  walls$.button.addEventListener('click', () => setWalls(!walls));
  cont$.button.addEventListener('click', () => setCont(!cont));
  teamBtn.addEventListener('click', () => setBrain(kind === 'equipo' ? 'solo' : 'equipo'));
  block$.button.addEventListener('click', () => setBlock(!blockOn));
  curve$.button.addEventListener('click', () => setTeam({ curve: !team.curve }, 'curve'));
  bound$.button.addEventListener('click', () => setTeam({ bounded: !team.bounded }, 'bound'));
  resetBtn.addEventListener('click', reset);

  // ---------- «Míralo solo»: el guion (src/data/paletaAuto.ts) llama a las MISMAS funciones que los botones ----------
  const auto = new AutoMode({
    section: sec, button: $('paauto'), caption: $('pacap'), link: { id: 'snake', text: '→ Snake' }, pager, reduced,
    say, keep: [$('papause')], paused: () => pause.paused,
    beforeStart: () => cancelRun(),
    onChange: () => paintButtons(),
    /* para en seco: lo que se estaba lanzando se corta (los pesos solo cambian al repasar, nunca a medias) */
    onStop: () => { cancelRun(); setStatus(idleStatus()); },
  });
  const ctxNow = (): AutoCtx => ({ kind, walls, block: blockOn, curve: team.curve, n: saved.length, recent: { ok: okCount(), total: recent.length }, last: lastBall });
  let lastBall: AutoCtx['last'] = null;
  function autoApi(h: AutoHandle): AutoApi {
    return {
      reset: () => resetDefaults(),
      launch: async (count, slow) => {
        const mode: Mode = slow || count === 1 ? 'slow' : count <= 30 ? 'fast' : 'batch';
        launch(count, mode);
        await h.until(() => !busy());
        const d = saved[saved.length - 1];
        if (d) { const pred = predictX(net, d); lastBall = { ok: recent[recent.length - 1], pred, land: d.land }; }
      },
      walls: (on) => setWalls(on),
      block: (on) => setBlock(on),
      team: () => useTeam(),
      curve: (on) => setTeam({ curve: on }, 'curve'),
      ctx: ctxNow,
      caption: h.caption,
      /* la pausa congela también la espera del guion: al reanudar sigue donde estaba, sin perder su paso */
      sleep: h.sleep,
      cancelled: h.dead,
    };
  }
  auto.onPress((h) => runAuto(buildScript(), autoApi(h), { reduced }));

  sec.dataset.tog = 'cont';
  paintStrip(); paintButtons(); setStatus(idleStatus()); updateCode();

  /* esta pantalla puede ser más alta que la ventana (móvil): la marcamos como activa al cruzar el centro */
  pager.followCenter(sec, (here) => pause.setHere(here));
}
