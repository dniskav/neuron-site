/**
 * Pantalla «Enséñale»: una neurona NUEVA (NeuronN real de @dniskav/neuron) aprende claro u oscuro.
 *
 * Esta pantalla es solo el DIRECTOR: decide qué color viaja cuándo, entrena y examina con el modelo
 * real y pasa a la vista lo que ocurre. Todo lo que se dibuja de la neurona (brillo, celebración,
 * pulso de corrección, grosor de ramas, recipiente, bulbo) vive en NeuronView.
 *
 * Cada color es un «ejemplo» con etapas: in (se descompone y viaja por las 3 dendritas), out (la
 * respuesta sale por el único axón) y, solo al aprender, back (llega la corrección y el pulso vuelve
 * hacia atrás; ahí se llama a train y se leen los pesos reales).
 */
import type { NeuronN } from '@dniskav/neuron';
import { ALL, BRAIN_SCALE, EPOCHS, EXAM, FULLN, LR, PLATEAU, SIZES, labelOf, newNeuron, passError } from '../../data/ensenale';
import { computeCmp } from '../../data/ensenaleCompare';
import { hexRgb } from '../../viz/core/colors';
import { createLoop } from '../../viz/core/loop';
import { reducedMotion } from '../../viz/core/motion';
import { BrainMeter } from '../../viz/BrainMeter';
import { CurveHistory, plateau } from '../../viz/learningCurve';
import { FLAT_MESSAGE, mountLearningCurve } from '../ui/LearningCurve';
import { threeInputGeometry } from '../../viz/geometry';
import { NetworkView } from '../../viz/NetworkView';
import { NeuronView } from '../../viz/NeuronView';
import type { NeuronDelta } from '../../viz/observe';
import { getPager } from '../../viz/Pager';
import { BrainPanel } from '../ui/BrainPanel';
import { bindColorPicker } from '../ui/ColorPicker';
import { CodePanel } from '../ui/CodePanel';
import { dockEls, linkPanels } from '../ui/dock';
import { ExamChips } from '../ui/Strips';
import { Jars } from '../ui/Jars';
import { Narrator } from '../ui/Narrator';
import { brainAria, mountBrainMeter, pctCaption } from '../ui/mountMeter';
import { newCodeState, rawText, renderCodeHtml, type CodeState } from '../../data/ensenaleCode';

type Phase = 'idle' | 'feed' | 'review' | 'settle' | 'exam' | 'done';
interface Dur { in?: number; out?: number; back: number }
interface Item {
  kind: 'train' | 'exam' | 'probe' | 'rev';
  c: number[]; i: number; d: Dur;
  stage: 'in' | 'out' | 'back';
  t: number; p: number; a: number; ok: boolean; z: number; dead: boolean;
  delta?: NeuronDelta; snapped?: boolean;
}
interface State {
  phase: Phase; k: number | null; net: NeuronN | null; set: number[][];
  idx: number; sp: number; seen: number; pass: number; rt: number; eidx: number; et: number; done: number; correct: number;
}

const FULL: Dur = { in: 1.0, out: 0.6, back: 0.85 };
const FAST: Dur = { in: 0.42, out: 0.22, back: 0.32 };
const EXAMD: Dur = { in: 0.75, out: 0.42, back: 0 };

export function startEnsenale(): void {
  const reduced = reducedMotion();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const cv = $<HTMLCanvasElement>('eneuron'), fcv = $<HTMLCanvasElement>('emeter'), sec = $('ensenale');
  const e0 = $('e0'), legEl = $('eleg'), pdot = $('pdot');
  const nar = new Narrator({ status: $('estatus'), live: $('elive'), phrase: $('ephrase') });
  const cards: Record<number, HTMLElement> = {};
  document.querySelectorAll<HTMLElement>('#slist .set').forEach((b) => { cards[+(b.dataset.k as string)] = b; });
  const jars = new Jars($('jars')), chips = new ExamChips($('exam'));
  const results: Record<number, number> = {};

  let st: State = { phase: 'idle', k: null, net: null, set: [], idx: 0, sp: 0, seen: 0, pass: 1, rt: 0, eidx: 0, et: 0, done: 0, correct: 0 };
  let items: Item[] = [], nv: NetworkView | null = null, pctShown: number | null = null;
  const idle = new NeuronView({ layer: 0, neuron: 0 }, threeInputGeometry());
  let view = idle;
  const meter = new BrainMeter(1);
  /* la curva: cuánto se equivoca la neurona en los ejemplos que ve, tras cada repaso (de `predict`, no de mentira) */
  const curve = new CurveHistory(), capEl = $('ecap');
  const flatNow = (): boolean => !!plateau(curve.recent, 0, PLATEAU)?.flat;
  const capText = (): string => (flatNow() ? FLAT_MESSAGE + ' Sigue ajustándose, pero el error ya no baja.' : curve.total ? 'Cuánto se equivoca en los ' + st.set.length + ' ejemplos, repaso a repaso: ' + num2(curve.recent[curve.recent.length - 1]) : '');
  const num2 = (x: number): string => x.toFixed(3).replace('.', ',');
  const paintCurve = (): void => { capEl.textContent = capText(); curveLoop.redraw(); };
  const passDone = (): void => { curve.add(passError(st.net as NeuronN, st.set)); paintCurve(); };
  const T = { s: 1, ox: 0, oy: 0 };

  // ---------- paneles ----------
  const dock = dockEls('', 'ecode');
  const code = new CodePanel<CodeState>(dock.code, { newState: newCodeState, renderHtml: renderCodeHtml, rawText });
  const brain = new BrainPanel(dock.brain, () => ({ net: st.net, k: st.k || 0, results }), computeCmp());
  linkPanels(code, brain);

  // ---------- interfaz ----------
  const setStatus = (t: string): void => nar.status(t), say = (t: string): void => nar.say(t);
  function setLeg(m: 'learn' | 'exam'): void { legEl.className = 'eleg m-' + m; code.mode(m); }
  function markActive(k: number): void {
    SIZES.forEach((s) => { cards[s].classList.toggle('on', s === k); cards[s].setAttribute('aria-pressed', s === k ? 'true' : 'false'); });
    e0.classList.toggle('on', k === 0); e0.setAttribute('aria-pressed', k === 0 ? 'true' : 'false');
    jars.highlight(k);
  }
  function setJar(k: number, pct: number): void {
    jars.set(k, pct, (k ? k + ' ejemplos' : 'Sin enseñarle') + ': ' + pct + ' % de aciertos');
    if (cards[k]) (cards[k].querySelector('.res') as HTMLElement).textContent = pct + ' %';
  }
  function phrase(k: number, pct: number): { m: string; extra: string } {
    const l = k ? ALL.slice(0, k).filter(labelOf).length : 0;
    const extra = k ? 'Vio ' + l + (l === 1 ? ' claro y ' : ' claros y ') + (k - l) + (k - l === 1 ? ' oscuro.' : ' oscuros.') : 'No vio ningún ejemplo.';
    let m: string;
    if (k === 0) m = 'Sin enseñarle nada, responde casi al azar.';
    else if (pct >= 85) m = 'Cuantos más ejemplos, mejor responde.';
    else if (k <= 5) m = 'Con tan pocos ejemplos, adivina más que aprende.';
    else m = 'Va pillando la idea, pero todavía se equivoca.';
    return { m, extra };
  }
  // ---------- director ----------
  function observed(): NetworkView { return nv as NetworkView; }
  function bindNet(net: NeuronN): void {
    st.net = net;
    nv = new NetworkView(net);
    view = nv.single;
    meter.setModel(net); meter.track(nv.observed, BRAIN_SCALE);
  }

  function start(k: number): void {
    st = { phase: 'idle', k, net: null, set: ALL.slice(0, k), idx: 0, sp: 0, seen: 0, pass: 1, rt: 0, eidx: 0, et: 0, done: 0, correct: 0 };
    items = []; curve.reset();
    const net = newNeuron();
    bindNet(net); paintCurve();
    code.reset({ k, w0: net.weights.slice() });
    chips.reset();
    pctShown = null; nar.phrase();
    markActive(k); setLeg(k ? 'learn' : 'exam');
    view.ripple(false);
    say(k ? 'Neurona nueva. Le enseñas ' + k + ' colores.' : 'Neurona nueva, sin enseñarle nada.');
    if (reduced) { instant(); return; }
    if (k === 0) { setStatus('Neurona nueva, sin enseñarle nada'); beginExam(); }
    else { st.phase = 'feed'; setStatus('Neurona nueva · aprendiendo… 0/' + k); }
  }
  function trainPass(): void { st.set.forEach((c) => (st.net as NeuronN).train(c, labelOf(c), LR)); }
  function beginExam(): void {
    view.sync(false); code.cur(null);
    st.phase = 'exam'; st.eidx = 0; st.et = 0.6; st.done = 0; st.correct = 0; setLeg('exam');
    if (st.k) setStatus('Examen · ¿claro u oscuro? Solo responde, no cambia'); else setStatus('Examen sin haberle enseñado · ¿claro u oscuro?');
  }
  function launch(kind: Item['kind'], col: number[], i: number, d: Dur): void {
    code.cur(kind === 'train' ? 'ej' : 'ex', i);
    items.push({ kind, c: col, i, d, stage: 'in', t: 0, p: 0, a: 0, ok: false, z: 0, dead: false });
    view.showSample(col, 1.6);
  }
  function finish(): void {
    const k = st.k as number, pct = Math.round((st.correct / 12) * 100);
    code.cur(null);
    st.phase = 'done'; results[k] = pct; pctShown = pct;
    setJar(k, pct);
    const p = phrase(k, pct);
    nar.phrase(p.m, p.extra);
    setStatus('Examen terminado · ' + st.correct + ' de 12');
    say('Acertó ' + st.correct + ' de 12, un ' + pct + ' por ciento. ' + p.m);
  }
  function instant(): void {
    const net = st.net as NeuronN;
    for (let i = 0; i < EPOCHS && st.k; i++) { trainPass(); curve.add(passError(net, st.set)); }
    paintCurve();
    view.sync(true); observed().observed.resync();
    st.correct = 0;
    EXAM.forEach((c, n) => { const a = net.predict(c) > 0.5 ? 1 : 0, ok = a === labelOf(c); if (ok) st.correct++; chips.mark(n, ok); });
    finish(); meter.ease(0, true); view.shown = 0;
    meterLoop.redraw(); neuronLoop.redraw();
  }
  /** El color ya recorrió las 3 dendritas: el cuerpo suma y responde con el predict real. */
  function arrive(it: Item): void {
    it.p = (st.net as NeuronN).predict(it.c); it.a = it.p > 0.5 ? 1 : 0; it.ok = it.a === labelOf(it.c);
    it.z = view.respond(it.c, it.p);
  }
  /** La respuesta llega al terminal. */
  function emerge(it: Item): void {
    if (it.kind === 'probe') {
      view.answer({ a: it.a, p: it.p, ok: it.ok, era: null, hold: 2.2 });
      it.dead = true; probeSay(it); return;
    }
    const hold = it.kind === 'exam' ? 1.3 : (it.d === FULL ? 2.6 : 0.8);
    if (it.kind === 'exam') {
      view.answer({ a: it.a, p: it.p, ok: it.ok, era: null, hold });
      chips.mark(it.i, it.ok); st.done++; if (it.ok) st.correct++;
      pctShown = Math.round((st.correct / 12) * 100);
      it.dead = true;
      if (st.done >= 12) finish();
    } else {
      /* llega la corrección: la neurona ajusta cuánto cuenta cada entrada (pesos y sesgo) */
      view.answer({ a: it.a, p: it.p, ok: it.ok, era: labelOf(it.c), hold });
      it.delta = observed().observed.train(it.c, labelOf(it.c), LR)[0][0];
      st.seen++;
      setStatus('Neurona nueva · aprendiendo… ' + st.seen + '/' + st.k);
      it.stage = 'back'; it.t = 0;
    }
  }
  function advance(it: Item, dt: number): void {
    if (it.stage === 'in') {
      it.t += dt / (it.d.in as number);
      if (it.t >= 1) { arrive(it); it.stage = 'out'; it.t = 0; }
    } else if (it.stage === 'out') {
      it.t += dt / (it.d.out as number);
      if (it.t >= 1) emerge(it);
    } else {
      it.t += dt / it.d.back;
      /* a mitad de la vuelta llegan los pesos nuevos y la neurona celebra según SU cambio */
      if (!it.snapped && it.t >= 0.4) { it.snapped = true; meter.learned(0, view.learn(it.delta as NeuronDelta)); }
      if (it.t >= 1) it.dead = true;
    }
  }

  // ---------- probar un color ----------
  function probeSay(it: { c: number[]; a: number; ok: boolean }): void {
    const rule = labelOf(it.c) ? 'claro' : 'oscuro', she = it.a ? 'claro' : 'oscuro';
    const t = 'Tú dirías: ' + rule + ' · Ella dice: ' + she + (it.ok ? ' ✓' : ' ✗');
    setStatus(t); say(t + (it.ok ? '. Acertó.' : '. Se equivocó.'));
  }
  function probe(hex: string): void {
    pdot.style.background = hex;
    if (st.phase === 'feed' || st.phase === 'review' || st.phase === 'settle' || st.phase === 'exam') { setStatus('Espera a que termine el examen para probar tu color'); return; }
    if (!st.net) {
      const fresh = newNeuron();
      bindNet(fresh);
      setStatus('Neurona nueva, sin enseñarle nada'); code.reset({ k: 0, w0: fresh.weights.slice() });
    }
    const net = st.net as NeuronN, c = hexRgb(hex);
    setLeg('exam'); code.probe(c);
    if (reduced) {
      const pr = net.predict(c), a = pr > 0.5 ? 1 : 0, ok = a === labelOf(c);
      view.showSample(c, 99); view.setLevel(c[0] * net.weights[0] + c[1] * net.weights[1] + c[2] * net.weights[2], 99);
      view.answer({ a, p: pr, ok, era: null, hold: 99 }); view.termFlash = 0; probeSay({ c, a, ok });
      neuronLoop.redraw(); return;
    }
    items.push({ kind: 'probe', c, i: 0, d: EXAMD, stage: 'in', t: 0, p: 0, a: 0, ok: false, z: 0, dead: false });
    view.showSample(c, 1.6);
    setStatus('Probando tu color…');
  }
  bindColorPicker({ btn: $('pickc'), pop: $('ppop'), quick: $('pq') }, probe);

  function tick(dt: number): void {
    if (st.phase === 'feed') {
      st.sp -= dt;
      /* mismo orden de entrenamiento que el código: ninguno adelanta a otro */
      if (st.idx < (st.k as number) && st.sp <= 0 && (st.idx < FULLN ? !items.length : items.every((it) => it.d !== FULL || it.stage === 'back'))) {
        launch('train', st.set[st.idx], st.idx, st.idx < FULLN ? FULL : FAST); st.idx++; st.sp = st.idx < FULLN ? 0 : 0.17;
      }
      if (st.idx >= (st.k as number) && !items.length) { st.phase = 'review'; st.pass = 1; st.rt = 0.5; passDone(); }
    } else if (st.phase === 'review') {
      st.rt -= dt;
      if (st.rt <= 0) {
        st.pass++; trainPass(); passDone(); view.flash = Math.max(view.flash, 0.5);
        const delta = observed().observed.poll()[0][0];
        items.push({ kind: 'rev', c: [], i: 0, stage: 'back', t: 0, d: { back: 0.3 }, delta, p: 0, a: 0, ok: false, z: 0, dead: false });
        setStatus('repasando… ' + st.pass + '/' + EPOCHS);
        st.rt = 0.07;
        if (st.pass >= EPOCHS) st.phase = 'settle';
      }
    } else if (st.phase === 'settle') {
      if (!items.length) beginExam();
    } else if (st.phase === 'exam') {
      st.et -= dt;
      if (st.eidx < 12 && st.et <= 0) {
        chips.now(st.eidx);
        launch('exam', EXAM[st.eidx], st.eidx, EXAMD); st.eidx++; st.et = 0.85;
      }
    }
    items.forEach((it) => advance(it, dt));
    items = items.filter((it) => !it.dead);
  }

  // ---------- dibujo ----------
  const neuronLoop = createLoop(cv, {
    draw(ctx, w, h, dt, t) {
      if (!reduced) tick(dt);
      view.update(dt);
      const g = view.geom.size, s = Math.min(w / g.w, h / g.h);
      T.s = s; T.ox = (w - g.w * s) / 2; T.oy = (h - g.h * s) / 2; view.scale = s;
      ctx.save(); ctx.translate(T.ox, T.oy); ctx.scale(s, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      view.drawWires(ctx);
      items.forEach((it) => {
        if (it.stage === 'in') view.drawInput(ctx, it.c, it.t);
        else if (it.stage === 'out') view.drawOutput(ctx, it.p, it.a, it.t);
        else if (it.delta) view.drawCorrection(ctx, it.t, it.delta);
      });
      view.drawBody(ctx, t);
      view.drawFront(ctx);
      ctx.restore();
    },
  });
  const meterLoop = mountBrainMeter({
    canvas: fcv, meter, reduced, caption: { el: $('emetercap'), text: () => pctCaption(pctShown) },
    aria: () => brainAria(meter, st.phase === 'done' ? Math.round((st.correct / 12) * 100) : null, 'de aciertos en el examen'),
  });

  const curveLoop = mountLearningCurve($('ecurve'), {
    history: () => curve, plateau: () => plateau(curve.recent, 0, PLATEAU), window: 3, minX: EPOCHS, empty: 'aquí se verá cómo se equivoca menos',
    yLabel: () => 'error ' + num2(Math.max(0.01, ...curve.recent)),
    yMax: () => Math.max(0.01, ...curve.recent) * 1.08,
    aria: () => 'Curva de aprendizaje: cuánto se equivoca en los ejemplos, repaso a repaso (' + curve.total + ' repasos)' + (flatNow() ? '. ' + FLAT_MESSAGE : '') + '.',
  });

  // ---------- controles ----------
  Object.keys(cards).forEach((k) => cards[+k].addEventListener('click', () => start(+k)));
  e0.addEventListener('click', () => start(0));

  /* esta pantalla puede ser más alta que la ventana (móvil): la marcamos como activa al cruzar el centro */
  getPager().followCenter(sec);
}
