/**
 * Pantalla «¿Qué color es?» (Colores): una CAPA real (`NetworkN([3, n])` de @dniskav/neuron, sin capa oculta) en la
 * que cada nombre es una neurona, la de «Enséñale» copiada: recibe el rojo, el verde y el azul del color y responde
 * «¿soy yo?». Gana la que más brilla.
 *
 * La capa CRECE: empieza con 3 nombres. Un color sin nombre («No tengo palabra para este color») es el motivo para
 * añadir un nombre (una neurona más). Crecer = crear una red nueva con la estructura nueva, siempre con `growNetwork`.
 *
 * Esta pantalla es solo el DIRECTOR: decide qué color viaja cuándo, entrena y examina con el modelo real y
 * pasa a la vista lo que ocurre. Todo lo que se dibuja de cada neurona vive en NeuronView, y NetworkView crea una
 * por neurona real: cada una celebra y recibe su pulso según SU Δ.
 *
 * Cada color es un «ejemplo» con etapas: in (se descompone y viaja por las tres entradas), out (cada neurona
 * responde) y, solo al aprender, back (llega la corrección y vuelve).
 */
import type { NetworkN } from '@dniskav/neuron';
import {
  CHUNK, EPOCHS, FULLN, LR, MAX_OUT, N0, NAMES, NAME_COLOR, PER, PER_DEFAULT,
  argmax, countText, examFastPlan, FAST_DUR, FAST_TOTAL, FAST_TOTAL_TURBO, knownColors, noWordReason, shortName, quickSamples, examSet, growNetwork, judge, newNet, ringActs, sampleOf, target, trainPass, trainSet, verdictText, type Ex,
} from '../../data/colores';
import { buildScript, runAuto, type AutoApi } from '../../data/coloresAuto';
import { newColoresCodeState, rawText, renderCodeHtml, type ColoresCodeState } from '../../data/coloresCode';
import { font } from '../../viz/core/canvas';
import { css, hexRgb } from '../../viz/core/colors';
import { createLoop } from '../../viz/core/loop';
import { reducedMotion } from '../../viz/core/motion';
import { Flask } from '../../viz/Flask';
import { layerLayout } from '../../viz/geometry';
import { NetworkView } from '../../viz/NetworkView';
import type { NeuronView, NeuronViewOptions } from '../../viz/NeuronView';
import type { NeuronDelta } from '../../viz/observe';
import { getPager } from '../../viz/Pager';
import { drawRing } from '../../viz/Ring';
import { AutoMode, type AutoHandle } from '../ui/AutoMode';
import { bindColorPicker } from '../ui/ColorPicker';
import { CodePanel } from '../ui/CodePanel';
import { ColoresBrainPanel, neuronCardInner, nameRgb, zonePhrase } from '../ui/ColoresBrainPanel';

type Phase = 'idle' | 'feed' | 'review' | 'settle' | 'exam' | 'done';
interface Dur { in?: number; out?: number; back?: number }
interface Item {
  kind: 'train' | 'exam' | 'probe' | 'rev';
  /** Un color que llega solo (no lo probó la persona): el del siguiente nombre de la lista. */
  auto?: boolean;
  c: number[]; y: number; i: number; d: Dur;
  stage: 'in' | 'out' | 'back';
  t: number; ps: number[]; win: number; dead: boolean;
  deltas?: NeuronDelta[][]; ref: number; snapped?: boolean;
}
interface State {
  phase: Phase; net: NetworkN; trained: boolean;
  idx: number; seen: number; pass: number; sp: number; rt: number; eidx: number; et: number; done: number; correct: number;
}
/** Lo que se ve en las salidas: sus valores reales, la ganadora y (al aprender) cuál era la correcta. */
interface Show { vals: number[]; win: number; era: number | null; t: number; hold: number }

const FULL: Dur = { in: 0.95, out: 0.5, back: 1.0 };
const EXAMD: Dur = { in: 0.7, out: 0.4 };
const FASTD: Dur = { in: FAST_DUR.in, out: FAST_DUR.out };
/** Los primeros colores del examen viajan despacio; todos los demás pasan después, cada vez más deprisa. */
const EXAM_ANIM = 3;
const DREF1 = LR, DREFC = 2;
const WMAX = 16;
const BORN_T = 0.9;
const ease = (u: number): number => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };

/** Cómo se ve cada neurona de nombre: como la de Enséñale, sin su bulbo (el bulbo con nombre lo dibuja `drawBulbs`). */
function viewOptions(): (layer: number, neuron: number, last: boolean) => NeuronViewOptions {
  const thick = (w: number | null): number => (w === null ? 3 : 1.3 + 7 * Math.sqrt(Math.min(1, Math.abs(w) / WMAX)));
  return (_l, n) => ({ thick, phase: 1.7 * (n + 1), levelMin: -26, levelMax: 16, chargeGain: 0.5, tint: true, lineLabel: false, bulb: false, labelGap: 10 });
}

export function startColores(): void {
  const reduced = reducedMotion();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const cv = $<HTMLCanvasElement>('nneuron'), fcv = $<HTMLCanvasElement>('nflask'), sec = $('colores');
  const goBtn = $('ngo'), b0 = $('n0');
  const nameBtn = $<HTMLButtonElement>('nname'), nameCount = $('nncount'), resetBtn = $('nreset');
  const totalEl = $('ntotal'), statusEl = $('nstatus'), phraseEl = $('nphrase'), liveEl = $('nlive'), legEl = $('neleg'), pdot = $('npdot'), warnEl = $('nwarn');
  const quickEl = $('npq'), infoBtn = $('ninfo'), accFill = $('naccfill'), accTxt = $('nacctxt');
  const zoneEl = $('nzone'), dotsEl = $('ndots'), nlab = $('nnlab'), chipsEl = $('nchips'), examEl = $('nexam'), exn = $('nexn');
  const setBtns: Record<number, HTMLElement> = {}, jars: Record<number, HTMLElement> = {};
  document.querySelectorAll<HTMLElement>('#nsets .cset').forEach((b) => { setBtns[+(b.dataset.per as string)] = b; });
  document.querySelectorAll<HTMLElement>('#njars .jar').forEach((j) => { jars[+(j.dataset.per as string)] = j; });
  /** % del examen por número de nombres y conjunto, ya probados con enseñanza. */
  const results: Record<string, number> = {};

  let N = N0, per = PER_DEFAULT, set: Ex[] = trainSet(per, N), exam: Ex[] = examSet(N);
  let st: State = { phase: 'idle', net: newNet(N), trained: false, idx: 0, seen: 0, pass: 0, sp: 0, rt: 0, eidx: 0, et: 0, done: 0, correct: 0 };
  let nv: NetworkView = new NetworkView(st.net, viewOptions(), layerLayout(N));
  let fastT = 0, fastK = 0, fastPlan = examFastPlan(0).times;
  /** «Míralo solo» va deprisa con los nombres del final: sin colores de ejemplo lentos, repaso corto y examen rápido. Se fija al empezar cada enseñanza. */
  let turbo = false, fullN = FULLN, examAnim = EXAM_ANIM, reviewDt = 0.13, reviewChunk = CHUNK, fastTotal = FAST_TOTAL;
  /** Lo último que respondió la red a un color probado (para «Míralo solo»). */
  let lastVerdict: ReturnType<typeof judge> | null = null;
  const pager = getPager();
  /** El modo automático («Míralo solo»): el botón, el rótulo y parar los lleva `AutoMode`; el guion, `runScript`. */
  const auto = new AutoMode({
    section: sec, button: $('nauto'), caption: $('nautocap'), link: { id: 'equipo', text: '→ Equipo' }, pager, reduced,
    say: (t) => say(t),
    /* al acabar o parar, lo que está a medias termina solo (enseñar y examinar no se cortan), sin pasos nuevos */
    onChange: (running) => { if (!running) turbo = false; },
  });
  let items: Item[] = [], target01 = 0, labelShown = '?', show: Show | null = null;
  let rings: number[][] = [];
  /** La neurona de nombre sobre la que está el puntero o el dedo (en el nivel de puntos se lee su nombre al pasar o tocar). */
  let hoverOut = -1;
  /** La neurona cuya zona se lee abajo: la que se tocó o, tras probar un color, la que ganó (-1: ninguna todavía). */
  let focus = -1;
  /** El color que la persona eligió con el selector (las muestras rápidas no lo repiten). */
  let pickHex: string | null = null;
  let chips: HTMLElement[] = [], marks: HTMLElement[] = [];
  /** Las neuronas que acaban de aparecer al crecer la capa (0..1: cuánto llevan de aparición). */
  const born = new Map<NeuronView, number>();
  const flask = new Flask();

  // ---------- paneles ----------
  const code = new CodePanel<ColoresCodeState>(
    { pre: $('nccode'), btn: $('ncbtn'), panel: $('ncpanel'), wrap: $('ncode'), copy: $('nccopy') },
    { newState: () => ({ ...newColoresCodeState(), per, n: N }), renderHtml: renderCodeHtml, rawText },
  );
  const brain = new ColoresBrainPanel(
    { btn: $('nbbtn'), panel: $('nbpanel'), wrap: $('ncode'), copy: $('nbcopy'), root: $('nbpanel') },
    () => ({ net: st.net, n: N, per, trained: st.trained }),
  );
  code.panel.exclusive(brain.panel);
  brain.panel.exclusive(code.panel);

  // ---------- interfaz ----------
  const setStatus = (t: string): void => { statusEl.textContent = t; };
  /** El acierto del examen: lo ve el matraz (escritorio) y la barra compacta (móvil). */
  function setTarget(v: number, label: string): void {
    target01 = v; labelShown = label;
    accFill.style.width = (v * 100).toFixed(0) + '%';
    accTxt.textContent = label === '?' ? '–' : label;
  }
  const say = (t: string): void => { liveEl.textContent = t; };
  function setLeg(m: 'learn' | 'exam'): void { legEl.className = 'eleg m-' + m; code.mode(m); }
  const keyOf = (p: number): string => N + ':' + p;
  function paintResults(): void {
    PER.forEach((p) => {
      const pct = results[keyOf(p)], j = jars[p], l = j.querySelector('.liq') as HTMLElement;
      j.classList.toggle('empty', pct === undefined);
      l.style.setProperty('--h', (pct ?? 0) + '%'); l.style.setProperty('--q', ((pct ?? 0) / 100).toFixed(2));
      (j.querySelector('.jp') as HTMLElement).textContent = pct === undefined ? '–' : pct + '%';
      j.title = p + ' por nombre' + (pct === undefined ? '' : ': ' + pct + ' % de aciertos');
      j.classList.toggle('on', p === per);
      (setBtns[p].querySelector('.res') as HTMLElement).textContent = pct === undefined ? '' : pct + ' %';
    });
  }
  function setUI(): void {
    nameCount.textContent = String(N);
    totalEl.textContent = countText(N);
    cv.setAttribute('aria-label', 'Una capa real de ' + N + ' neuronas, una por nombre de color. Las tres entradas, rojo, verde y azul, llegan a todas; cada una es la neurona de Enséñale, copiada, y responde si el color es su nombre. Gana la que más brilla. Al aprender llega la corrección y las conexiones cambian de grosor; en el examen solo responde.');
    nameBtn.disabled = N >= MAX_OUT;
    PER.forEach((p) => {
      setBtns[p].classList.toggle('on', p === per); setBtns[p].setAttribute('aria-pressed', p === per ? 'true' : 'false');
      setBtns[p].setAttribute('aria-label', p + ' por nombre: ' + p * N + ' ejemplos');
    });
    nlab.textContent = String(set.length);
    dotsEl.innerHTML = set.map((e) => '<i style="background:' + css(e.c) + '"></i>').join('');
    chipsEl.innerHTML = NAMES.slice(0, N).map((n, i) => '<span class="nchip" style="--c:' + NAME_COLOR[i] + '"><i></i><span>' + n + '</span></span>').join('');
    chips = Array.from(chipsEl.querySelectorAll<HTMLElement>('.nchip'));
    examEl.innerHTML = exam.map((e, i) => '<i style="background:' + css(e.c) + '" aria-label="Color ' + (i + 1) + ' del examen"></i>').join('');
    marks = Array.from(examEl.querySelectorAll<HTMLElement>('i'));
    exn.textContent = String(exam.length);
    paintResults(); buildQuick(); paintExamBtn();
  }
  /** Las muestras rápidas se recalculan con los nombres que la red conoce ahora (y 1–2 que aún no). */
  function buildQuick(): void {
    quickEl.innerHTML = quickSamples(N, 6, 2, pickHex).map((q) => '<button type="button" style="background:' + q.hex + '" title="' + q.name + '" aria-label="Probar ' + q.name + '" data-hex="' + q.hex + '"></button>').join('');
  }
  /** «Examinar otra vez» cuando la red ya aprendió y examinó; si no, «Examinar sin enseñarle». */
  const canReexam = (): boolean => st.trained && (st.phase === 'done' || st.phase === 'exam');
  function paintExamBtn(): void { b0.textContent = canReexam() ? 'Examinar otra vez' : 'Examinar sin enseñarle'; }
  const dotEls = (): HTMLElement[] => Array.from(dotsEl.querySelectorAll<HTMLElement>('i'));
  function setMark(i: number, ok: boolean): void { marks[i].classList.remove('now'); marks[i].classList.add(ok ? 'ok' : 'bad'); }

  /** Los chips de salida: cada uno brilla según su valor real; la ganadora destaca. */
  function paintChips(): void {
    chips.forEach((c, i) => {
      c.style.setProperty('--v', show ? Math.max(0.08, show.vals[i] ?? 0).toFixed(2) : '.15');
      c.classList.toggle('win', !!show && show.win === i);
      c.classList.toggle('was', !!show && show.era === i);
    });
  }
  function setShow(s: Show | null): void { show = s; paintChips(); }

  /** Anillos de cada neurona de nombre, recalculados con los pesos de ahora (de su activación real). */
  function refreshRings(): void {
    rings = [];
    for (let o = 0; o < N; o++) rings.push(ringActs(st.net, o));
    paintZone();
  }
  /** La zona de una neurona (anillo, banda de luz y frase) en una tarjeta bajo el dibujo; se elige tocando o pasando por una neurona. */
  let zoneKey = '';
  function paintZone(force = false): void {
    const o = hoverOut >= 0 ? hoverOut : focus;
    if (o < 0 || o >= N) {
      if (zoneKey !== 'none') { zoneKey = 'none'; zoneEl.innerHTML = '<p class="nzhint">Toca una neurona para ver con qué colores se enciende.</p>'; }
      return;
    }
    const key = o + '|' + N + '|' + (st.trained ? 1 : 0) + '|' + st.pass + '|' + st.phase + '|' + st.seen;
    if (!force && key === zoneKey) return;
    zoneKey = key;
    zoneEl.innerHTML = '<div class="ncard" style="--c:' + nameRgb(o) + '"><b>' + (o + 1) + '</b>' + neuronCardInner(st.net, o) + '</div>';
  }
  function buildCards(): void { zoneKey = ''; refreshRings(); }

  const outViews = (): NeuronView[] => nv.layers[0];
  const firstView = (): NeuronView => nv.layers[0][0];

  // ---------- director ----------
  /** Capa nueva de `n` neuronas: la crea `growNetwork` (o se pasa ya creada). `from` es desde qué neurona son nuevas (aparecen con animación). */
  function fresh(n: number, net?: NetworkN, from?: number): void {
    N = n;
    set = trainSet(per, N); exam = examSet(N);
    const nn = net ?? newNet(n);
    nv = new NetworkView(nn, viewOptions(), layerLayout(n), nv);
    st = { phase: 'idle', net: nn, trained: false, idx: 0, seen: 0, pass: 0, sp: 0, rt: 0, eidx: 0, et: 0, done: 0, correct: 0 };
    items = []; setTarget(0, '?'); born.clear();
    phraseEl.innerHTML = ''; warnEl.textContent = ''; sec.dataset.arrived = '0'; setShow(null); setUI(); buildCards();
    if (!auto.running) auto.setCaption('');
    code.reset({ n, per, trained: false, reexam: false });
    setLeg('exam');
    if (from !== undefined && !reduced) {
      /* la neurona que acaba de aparecer entra con una animación: aparece, una onda y una celebración */
      outViews().forEach((v, o) => { if (o >= from) { born.set(v, 0); v.ripple(false); v.celebration.fire(1); } });
    }
    neuronLoop.redraw(); flaskLoop.redraw();
  }
  /** Crece la capa (un nombre más: una neurona más) con la ÚNICA función que crea estructura nueva. */
  function grow(by: { outputs?: number }, msg: string): void {
    const g = growNetwork({ n: N }, by);
    if (g.n === N) return;
    const was = N;
    fresh(g.n, g.net, was);
    setStatus(msg + ' · pulsa «Enséñale»');
    say(msg + '. La red es nueva: hay que enseñarle otra vez.');
  }
  function setPer(p: number): void {
    per = p; fresh(N);
    setStatus('Red nueva con ' + set.length + ' ejemplos para aprender · pulsa «Enséñale»');
    say('Ahora aprenderá con ' + p + ' ejemplos de cada nombre, ' + set.length + ' en total.');
  }
  function start(trainIt: boolean): void {
    fresh(N);
    st.trained = trainIt;
    code.reset({ n: N, per, trained: trainIt, reexam: false });
    setLeg(trainIt ? 'learn' : 'exam');
    fullN = turbo ? 0 : FULLN; reviewDt = turbo ? 0.05 : 0.13; reviewChunk = turbo ? 20 : CHUNK;
    outViews()[0].ripple(false);
    say(trainIt ? 'Red nueva, ' + countText(N) + '. Le enseñas ' + set.length + ' colores.' : 'Red nueva, sin enseñarle nada.');
    if (reduced) { instant(); return; }
    if (!trainIt) { setStatus('Red nueva, sin enseñarle nada'); beginExam(); }
    else { st.phase = 'feed'; setStatus('Red nueva · aprendiendo… 0/' + set.length); }
  }
  function beginExam(): void {
    nv.neurons.forEach((v) => v.sync(false));
    code.cur(null);
    st.phase = 'exam'; paintExamBtn(); examAnim = turbo ? 0 : EXAM_ANIM; fastTotal = turbo ? FAST_TOTAL_TURBO : FAST_TOTAL;
    st.eidx = 0; st.et = turbo ? 0.15 : 0.6; fastT = 0; fastK = 0; fastPlan = examFastPlan(Math.max(0, exam.length - examAnim), fastTotal).times; st.done = 0; st.correct = 0; setLeg('exam');
    setStatus(st.trained ? 'Examen · solo responde, no cambia' : 'Examen sin haberle enseñado');
  }
  function launch(kind: Item['kind'], e: Ex, i: number, d: Dur): void {
    code.cur(kind === 'train' ? 'ej' : 'ex', i);
    if (kind === 'train') dotEls()[i]?.classList.add('now');
    if (kind === 'exam') { marks.forEach((m) => m.classList.remove('now')); marks[i].classList.add('now'); }
    items.push({ kind, c: e.c, y: e.y, i, d, stage: 'in', t: 0, ps: [], win: 0, dead: false, ref: DREF1 });
    firstView().showSample(e.c, 1.6);
  }

  function phraseFor(): { m: string; extra: string } {
    const ok = st.correct, n = exam.length, chance = Math.round(n / N);
    if (!st.trained) return { m: 'Sin enseñarle nada, acierta ' + ok + ' de ' + n + ' (' + knownColors(N) + '): casi por casualidad.', extra: 'Adivinando al azar acertaría ' + chance + ' de ' + n + '.' };
    return {
      m: 'Cada neurona aprendió su nombre y juntas aciertan ' + ok + ' de ' + n + ' (' + knownColors(N) + ').',
      extra: 'Vio ' + set.length + ' colores, ' + EPOCHS + ' veces cada uno. Adivinar al azar acierta ' + chance + ' de ' + n + '.',
    };
  }
  function finish(): void {
    const pct = Math.round((st.correct / exam.length) * 100);
    code.cur(null);
    st.phase = 'done'; paintExamBtn(); setTarget(st.correct / exam.length, pct + '%');
    if (st.trained) { results[keyOf(per)] = pct; paintResults(); }
    refreshRings();
    const p = phraseFor();
    phraseEl.innerHTML = p.m + '<small>' + p.extra + '</small>';
    setStatus('Examen terminado · ' + st.correct + ' de ' + exam.length);
    say(p.m + ' ' + p.extra);
    fcv.setAttribute('aria-label', 'Frasco lleno al ' + pct + ' por ciento ' + knownColors(N));
    accTxt.title = pct + ' % ' + knownColors(N);
    /* si aún quedan nombres, LLEGA un color del siguiente nombre de la lista: la capa no tiene ninguna neurona para decirlo */
    if (st.trained && N < MAX_OUT && !auto.running) arrive();
  }
  function instant(train = true): void {
    if (st.trained && train) { for (let e = 0; e < EPOCHS; e++) trainPass(st.net, set, N); dotEls().forEach((d) => d.classList.add('seen')); }
    nv.neurons.forEach((v) => v.sync(true)); nv.observed.resync();
    st.correct = 0;
    exam.forEach((x, n) => { const ok = argmax(st.net.predict(x.c)) === x.y; if (ok) st.correct++; setMark(n, ok); });
    finish(); flask.lv = target01;
    flaskLoop.redraw(); neuronLoop.redraw();
  }

  /** El color llegó a las neuronas: cada una suma lo que le llega por sus tres ramas y responde con el predict real («¿soy yo?»). */
  function arriveF(it: Item): void {
    it.ps = st.net.predict(it.c); it.win = argmax(it.ps);
    outViews().forEach((v, o) => v.respond(it.c, it.ps[o]));
  }
  function emerge(it: Item): void {
    const ok = it.win === it.y;
    outViews().forEach((v) => { v.flash = Math.max(v.flash, 0.1); v.termFlash = 1; });
    if (it.kind === 'probe') { it.dead = true; probeSay(it); return; }
    if (it.kind === 'exam') {
      setShow({ vals: it.ps, win: it.win, era: null, t: 0, hold: 1.2 });
      setMark(it.i, ok); st.done++; if (ok) st.correct++; it.dead = true;
      setTarget(st.correct / exam.length, Math.round((st.correct / Math.max(1, st.done)) * 100) + '%');
      setStatus('Examen · ' + st.done + '/' + exam.length);
    } else {
      setShow({ vals: it.ps, win: it.win, era: it.y, t: 0, hold: 2.2 });
      /* llega la corrección: cada neurona ajusta cuánto cuenta cada entrada (pesos y sesgo) */
      it.deltas = nv.observed.train(it.c, target(it.y, N), LR);
      st.seen++;
      setStatus('Red nueva · aprendiendo… ' + st.seen + '/' + set.length);
      it.stage = 'back'; it.t = 0;
    }
  }
  function advance(it: Item, dt: number): void {
    if (it.stage === 'in') {
      it.t += dt / (it.d.in as number);
      if (it.t >= 1) { arriveF(it); it.stage = 'out'; it.t = 0; }
    } else if (it.stage === 'out') {
      it.t += dt / (it.d.out as number);
      if (it.t >= 1) emerge(it);
    } else {
      it.t += dt / (it.d.back || (FULL.back as number));
      /* a las 4 décimas de la vuelta llegan los pesos nuevos y CADA neurona celebra según SU propio cambio */
      if (!it.snapped && it.t >= 0.4) {
        it.snapped = true;
        (it.deltas as NeuronDelta[][]).forEach((layer, li) => layer.forEach((d, ni) => nv.layers[li][ni].learn(d, { ref: it.ref })));
      }
      if (it.t >= 1) {
        it.dead = true;
        if (it.kind === 'train') { const d = dotEls()[it.i]; d?.classList.remove('now'); d?.classList.add('seen'); refreshRings(); }
      }
    }
  }

  /** Examinar otra vez: la MISMA red, sin tocar los pesos (solo `predict`; ni `fresh` ni `train`). */
  function reexam(): void {
    items = []; marks.forEach((m) => { m.className = ''; }); setShow(null); warnEl.textContent = ''; phraseEl.innerHTML = '';
    code.reset({ n: N, per, trained: true, reexam: true });
    setLeg('exam');
    say('Examen otra vez, con la misma red. Solo responde, no cambia.');
    if (reduced) { instant(false); return; }
    beginExam();
  }

  // ---------- probar un color ----------
  function probeSay(it: Item): void {
    const v = judge(it.ps, it.c), txt = verdictText(v);
    lastVerdict = v;
    setShow({ vals: it.ps, win: it.win, era: null, t: 0, hold: 1e9 });
    /* el estado dice qué neurona ganó y, de su activación real, con qué colores se enciende (también en móvil) */
    focus = v.best; paintZone(true);
    setStatus('Creo que es: ' + v.name + ' · ' + zonePhrase(st.net, v.best).replace(/^[^:]+: /, ''));
    if (v.doubt === 'noword') {
      /* la verdad sale de la etiqueta real del color, no de la salida de la red: la red llama «rojo» a un amarillo con confianza */
      if (!auto.running) warnEl.innerHTML = 'Dice «' + v.name + '»… pero es <i class="nsw" style="background:' + css(it.c) + '"></i><b>' + v.realName + '</b>. ' + noWordReason(v.ps.length);
      if (it.auto) {
        sec.dataset.arrived = '1';
        const line = 'Para el ' + v.realName + ' aún no tiene palabra';
        phraseEl.insertAdjacentHTML('beforeend', '<small>' + line + '</small>');
      }
    } else warnEl.textContent = auto.running ? '' : txt;
    say('Creo que es: ' + v.name + '. ' + zonePhrase(st.net, v.best) + '. ' + (txt ? txt + '.' : ''));
  }
  /** Llega por las dendritas un color del siguiente nombre de la lista (el amarillo, por ejemplo). */
  function arrive(): void {
    const c = sampleOf(N), it: Item = { kind: 'probe', auto: true, c, y: -1, i: 0, d: EXAMD, stage: 'in', t: 0, ps: [], win: 0, dead: false, ref: DREF1 };
    if (reduced) { arriveF(it); probeSay(it); firstView().showSample(c, 99); return; }
    items.push(it);
    firstView().showSample(c, 1.6);
    setStatus('Llega un color nuevo…');
  }
  function probe(hex: string): void {
    /* el selector muestra el color propio que se eligió; las muestras rápidas no lo cambian */
    if (!Array.from(quickEl.children).some((b) => (b as HTMLElement).dataset.hex === hex)) { pdot.style.background = hex; pickHex = hex; }
    if (st.phase === 'feed' || st.phase === 'review' || st.phase === 'settle' || st.phase === 'exam') { setStatus('Espera a que termine para probar tu color'); return; }
    const c = hexRgb(hex);
    setLeg('exam'); code.probe(c); warnEl.textContent = ''; setShow(null);
    const it: Item = { kind: 'probe', c, y: -1, i: 0, d: EXAMD, stage: 'in', t: 0, ps: [], win: 0, dead: false, ref: DREF1 };
    if (reduced) {
      arriveF(it); probeSay(it);
      firstView().showSample(c, 99);
      neuronLoop.redraw(); return;
    }
    items.push(it);
    firstView().showSample(c, 1.6);
    setStatus('Probando tu color…');
  }
  bindColorPicker({ btn: $('npickc'), pop: $('nppop'), quick: document.createElement('div') }, probe);
  /* las muestras rápidas se rehacen al crecer la red: un solo oyente para todas */
  quickEl.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && b.dataset.hex) probe(b.dataset.hex); });

  /** Un «repaso»: se entrena de verdad y el pulso de vuelta lleva el cambio real de cada neurona. */
  function pulse(): void {
    const deltas = nv.observed.poll();
    items.push({ kind: 'rev', c: [], y: 0, i: 0, stage: 'back', t: 0, d: { back: 0.35 }, deltas, ref: DREFC, ps: [], win: 0, dead: false });
    outViews().forEach((v) => { v.flash = Math.max(v.flash, 0.4); });
    refreshRings();
  }
  function tick(dt: number): void {
    if (st.phase === 'feed') {
      st.sp -= dt;
      if (st.idx < fullN && st.sp <= 0 && !items.length) { launch('train', set[st.idx], st.idx, FULL); st.idx++; st.sp = 0; }
      if (st.idx >= fullN && !items.length) {
        const ds = dotEls();
        for (let i = fullN; i < set.length; i++) { st.net.train(set[i].c, target(set[i].y, N), LR); ds[i]?.classList.add('seen'); }
        st.seen = set.length; st.pass = 1; st.rt = 0.3; st.phase = 'review'; pulse();
        setStatus('repasando… 1/' + EPOCHS);
      }
    } else if (st.phase === 'review') {
      st.rt -= dt;
      if (st.rt <= 0) {
        const n = Math.min(reviewChunk, EPOCHS - st.pass);
        for (let e = 0; e < n; e++) trainPass(st.net, set, N);
        st.pass += n; pulse();
        setStatus('repasando… ' + st.pass + '/' + EPOCHS);
        st.rt = reviewDt;
        if (st.pass >= EPOCHS) st.phase = 'settle';
      }
    } else if (st.phase === 'settle') {
      if (!items.length) beginExam();
    } else if (st.phase === 'exam') {
      st.et -= dt;
      if (st.eidx < examAnim) {
        if (st.et <= 0) { launch('exam', exam[st.eidx], st.eidx, EXAMD); st.eidx++; st.et = 0.85; }
      } else {
        /* el resto del examen se ve pasar también: salen cada vez más deprisa y varios viajan a la vez */
        if (st.eidx === examAnim && !items.length && fastK === 0 && fastT === 0) fastT = 1e-6;
        if (fastT > 0) {
          fastT += dt;
          while (fastK < fastPlan.length && fastPlan[fastK] <= fastT) {
            const i = examAnim + fastK; launch('exam', exam[i], i, FASTD); fastK++; st.eidx++;
          }
        }
        if (st.eidx >= exam.length && !items.length) finish();
      }
    }
    items.forEach((it) => advance(it, dt));
    items = items.filter((it) => !it.dead);
    if (show) { show.t += dt; if (show.t > show.hold) setShow(null); }
  }

  // ---------- dibujo ----------
  function drawTravel(ctx: CanvasRenderingContext2D, it: Item): void {
    if (it.stage === 'in') nv.layers[0].forEach((v) => v.drawInput(ctx, it.c, it.t));
    else if (it.stage === 'out') outViews().forEach((v, o) => v.drawOutput(ctx, it.ps[o], o === it.win ? 1 : 0, it.t));
    else if (it.deltas) {
      /* la corrección vuelve por el axón y por las tres ramas de cada neurona, cada tramo con el cambio REAL de su neurona */
      const d = it.deltas, ref = it.ref, u = it.t;
      outViews().forEach((v, o) => v.drawCorrection(ctx, u, d[0][o], { axon: [0, 0.3], dendrites: [0.3, 1], ref }));
    }
  }
  /**
   * El bulbo de cada neurona de nombre, con su color de muestra: brilla según su valor real y la ganadora destaca.
   * Nivel completo: bulbo y nombre. Compacto: bulbo pequeño y nombre corto. Puntos: la propia neurona se tiñe; el nombre, al pasar o tocar.
   */
  function drawBulbs(ctx: CanvasRenderingContext2D): void {
    const outs = outViews();
    outs.forEach((v, o) => {
      const F = v.full, C = v.comp, S = v.geom.body, val = show ? show.vals[o] ?? 0 : 0, win = !!show && show.win === o;
      const al = show ? Math.min(1, show.t * 6, (show.hold - show.t) * 3) : 0, e = show ? val * al : 0;
      const c = hexRgb(NAME_COLOR[o]), b = born.get(v), a0 = b === undefined ? 1 : ease(b);
      const [tx, ty] = v.geom.terminal, r = v.bodyR();
      /* el punto (y el cuerpo pequeño) se tiñe del color del nombre al encenderse */
      if (e > 0.05 && F < 1) {
        ctx.globalAlpha = a0 * (1 - F);
        const g = ctx.createRadialGradient(S.x, S.y, 1, S.x, S.y, r * (2.2 + 2.5 * e));
        g.addColorStop(0, css(c, 0.75 * e)); g.addColorStop(1, css(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S.x, S.y, r * (2.2 + 2.5 * e), 0, 6.2832); ctx.fill();
      }
      if (F < 1) {
        ctx.globalAlpha = a0 * (1 - F);
        ctx.fillStyle = css(c, 0.25 + 0.75 * e); ctx.beginPath(); ctx.arc(S.x, S.y, r * 0.55, 0, 6.2832); ctx.fill();
      }
      /* el bulbo del axón: compacto y completo */
      const br = Math.max(3, (v.geom.body.r * 0.5 + (win ? 3 * al : 0) + v.termFlash * 2) * (0.55 + 0.45 * F)), bAl = a0 * C;
      if (C > 0.02) {
        ctx.globalAlpha = bAl;
        if (e > 0.05) {
          const g = ctx.createRadialGradient(tx, ty, 1, tx, ty, br * (2 + 2.5 * e));
          g.addColorStop(0, css(c, 0.75 * e)); g.addColorStop(1, css(c, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tx, ty, br * (2 + 2.5 * e), 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = css(c, 0.2 + 0.8 * e); ctx.beginPath(); ctx.arc(tx, ty, br, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = win && al > 0 ? 'rgba(255,255,255,' + 0.9 * al + ')' : 'rgba(255,255,255,.22)'; ctx.lineWidth = win ? 1.8 : 1; ctx.stroke();
      }
      /* el nombre: completo, corto o (en puntos) solo al pasar o tocar */
      const hov = hoverOut === o;
      if (C > 0.02 || hov) {
        const wide = F > 0.5, text = wide ? NAMES[o] : shortName(NAMES[o]);
        ctx.globalAlpha = a0 * (hov ? 1 : C);
        const f = v.fs(win && al > 0 ? (wide ? 15 : 12) : wide ? 13 : 11);
        ctx.font = font(f); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lx = C > 0.02 ? tx + br + 8 : S.x + r + 6;
        if (hov && C <= 0.02) { ctx.fillStyle = 'rgba(9,9,10,.8)'; ctx.fillRect(lx - 3, ty - f * 0.8, ctx.measureText(NAMES[o]).width + 6, f * 1.6); }
        ctx.fillStyle = hov || (win && al > 0) ? '#fff' : 'rgba(200,195,180,' + (0.45 + 0.5 * e) + ')';
        ctx.fillText(hov ? NAMES[o] : text, lx, C > 0.02 ? ty : S.y);
        if (wide && show && show.era === o && al > 0) { ctx.font = font(v.fs(11)); ctx.fillStyle = 'rgba(150,195,255,' + al + ')'; ctx.fillText('← era este', lx + ctx.measureText(NAMES[o]).width * 1.15 + 6, ty); }
      }
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';
  }
  const neuronLoop = createLoop(cv, {
    draw(ctx, w, h, dt, t) {
      if (!reduced) tick(dt);
      nv.update(dt);
      born.forEach((b, v) => { if (b + dt / BORN_T >= 1) born.delete(v); else born.set(v, b + dt / BORN_T); });
      nv.fit(w, h);
      const tr = nv.transform, alphaOf = (v: NeuronView): number => { const b = born.get(v); return b === undefined ? 1 : ease(b); };
      ctx.save(); ctx.translate(tr.ox, tr.oy); ctx.scale(tr.s, tr.s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      nv.neurons.forEach((v) => { ctx.globalAlpha = alphaOf(v); v.drawWires(ctx); });
      sec.dataset.lod = nv.lodOfLayer(0);
      ctx.globalAlpha = 1;
      items.forEach((it) => drawTravel(ctx, it));
      /* el cuerpo de cada neurona y su anillo de tonos (de su activación real), si cabe sin pisar a la vecina */
      const half = nv.layerPitch(0) / 2 - 0.5;
      outViews().forEach((v, o) => {
        const S = v.geom.body, R = v.bodyR(), out = R + 3 + Math.max(3.5, R * 0.25);
        ctx.globalAlpha = alphaOf(v);
        v.drawBody(ctx, t);
        if (rings[o] && v.comp > 0.5 && out <= half) drawRing(ctx, S.x, S.y, R + 3, out, rings[o]);
        ctx.globalAlpha = 1;
      });
      nv.neurons.forEach((v) => { ctx.globalAlpha = alphaOf(v); v.drawFront(ctx); });
      ctx.globalAlpha = 1;
      drawBulbs(ctx);
      ctx.restore();
    },
  });
  const flaskLoop = createLoop(fcv, {
    draw(ctx, w, h, dt, t) {
      flask.ease(target01, dt, reduced);
      flask.draw(ctx, w, h, t, labelShown);
    },
  });

  // ---------- nombre al pasar o tocar (nivel de puntos) ----------
  function hoverAt(e: PointerEvent): void {
    const r = cv.getBoundingClientRect(), hit = nv.pick(e.clientX - r.left, e.clientY - r.top, 16);
    const o = hit ? hit.neuron : -1;
    if (e.type === 'pointerdown' && o >= 0) focus = o;
    if (o !== hoverOut || e.type === 'pointerdown') { hoverOut = o; paintZone(); neuronLoop.redraw(); }
  }
  cv.addEventListener('pointermove', hoverAt);
  cv.addEventListener('pointerdown', hoverAt);
  cv.addEventListener('pointerleave', () => { if (hoverOut !== -1) { hoverOut = -1; paintZone(); neuronLoop.redraw(); } });

  // ---------- controles ----------
  infoBtn.addEventListener('click', () => {
    const open = legEl.hidden;
    legEl.hidden = !open; infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  goBtn.addEventListener('click', () => start(true));
  b0.addEventListener('click', () => { if (canReexam()) { if (st.phase === 'done') reexam(); } else start(false); });
  /** «+ nombre»: la misma función para el botón y para «Míralo solo». */
  function addName(): void { grow({ outputs: 1 }, 'Un nombre más: ahora tiene palabra para «' + (NAMES[N] ?? '') + '»'); }
  /** «volver a empezar»; `toDefault` también vuelve a los 13 ejemplos por nombre (el modo automático lo pide). */
  function resetAll(toDefault = false): void {
    focus = -1; if (toDefault) per = PER_DEFAULT;
    fresh(N0); setStatus('Red nueva: ' + countText(N0) + ' · pulsa «Enséñale»'); say('Vuelves a empezar.');
  }
  nameBtn.addEventListener('click', addName);
  resetBtn.addEventListener('click', () => resetAll());
  PER.forEach((p) => setBtns[p].addEventListener('click', () => setPer(p)));
  // ---------- «Míralo solo»: el guion (src/data/coloresAuto.ts) llama a las MISMAS funciones que los botones ----------
  function autoApi(h: AutoHandle): AutoApi {
    return {
      reset: () => resetAll(true),
      addName: () => { addName(); return N; },
      teach: async (quick) => { turbo = quick; start(true); await h.until(() => st.phase === 'exam' || st.phase === 'done'); },
      exam: async () => { await h.until(() => st.phase === 'done' && !items.length); return { ok: st.correct, total: exam.length }; },
      probe: async (_c, hex) => { lastVerdict = null; probe(hex); await h.until(() => lastVerdict !== null); return lastVerdict as NonNullable<typeof lastVerdict>; },
      caption: h.caption,
      sleep: h.sleep,
      cancelled: h.dead,
    };
  }
  auto.onPress((h) => runAuto(buildScript(), autoApi(h), { reduced }));

  fresh(N0);
  setStatus('Red nueva: ' + countText(N0) + ' · pulsa «Enséñale»');

  /* esta pantalla puede ser más alta que la ventana (móvil): la marcamos como activa al cruzar el centro */
  pager.followCenter(sec);
}
