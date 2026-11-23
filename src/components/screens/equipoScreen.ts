/**
 * Pantalla «Ni claro ni oscuro» (Equipo): un equipo REAL (`NetworkN([3, k, 1])` de @dniskav/neuron)
 * aprende «¿es un color intermedio?».
 *
 * Esta pantalla es solo el DIRECTOR: decide qué color viaja cuándo, entrena y examina con el modelo
 * real y pasa a la vista lo que ocurre. Todo lo que se dibuja de cada neurona vive en NeuronView, y
 * NetworkView crea una por neurona real: cada una celebra y recibe su pulso según SU propio Δ.
 *
 * Cada color es un «ejemplo» con etapas: in (se descompone y viaja por las tres entradas hasta las
 * neuronas), mid (las del medio avisan a la que decide), out (la respuesta sale por el único axón) y,
 * solo al aprender, back (llega la corrección y vuelve hacia atrás; ahí se llama a train).
 */
import type { NetworkN } from '@dniskav/neuron';
import {
  BRAIN_SCALE, CHUNK, EPOCHS, EXAM, FULLN, KS, LR, NTRAIN, TAGFULL, TAGSHORT, TRAIN,
  kName, labelOf, newTeam, specTags, trainPass, type SpecTag,
} from '../../data/equipo';
import { newTeamCodeState, rawText, renderCodeHtml, type TeamCodeState } from '../../data/equipoCode';
import { font, rrect } from '../../viz/core/canvas';
import { hexRgb } from '../../viz/core/colors';
import { createLoop } from '../../viz/core/loop';
import { reducedMotion } from '../../viz/core/motion';
import { BrainMeter } from '../../viz/BrainMeter';
import { TEAM_HUE, teamLayout } from '../../viz/geometry';
import { NetworkView } from '../../viz/NetworkView';
import type { NeuronViewOptions } from '../../viz/NeuronView';
import type { NeuronDelta } from '../../viz/observe';
import { getPager } from '../../viz/Pager';
import { bindColorPicker } from '../ui/ColorPicker';
import { CodePanel } from '../ui/CodePanel';
import { dockEls, linkPanels } from '../ui/dock';
import { Jars } from '../ui/Jars';
import { Narrator } from '../ui/Narrator';
import { brainAria, mountBrainMeter } from '../ui/mountMeter';
import { ExamChips, ProgressDots } from '../ui/Strips';
import { TeamBrainPanel } from '../ui/TeamBrainPanel';

type Phase = 'idle' | 'feed' | 'review' | 'settle' | 'exam' | 'done';
interface Dur { in?: number; mid?: number; out?: number; back?: number }
interface Item {
  kind: 'train' | 'exam' | 'probe' | 'rev';
  c: number[]; i: number; d: Dur;
  stage: 'in' | 'mid' | 'out' | 'back';
  t: number; p: number; a: number; ok: boolean; dead: boolean;
  hs?: number[]; deltas?: NeuronDelta[][]; ref: number; snapped?: boolean;
}
interface State {
  phase: Phase; k: number; net: NetworkN; trained: boolean;
  idx: number; sp: number; seen: number; pass: number; rt: number; eidx: number; et: number; done: number; correct: number; yes: number;
  tags: SpecTag[] | null;
}

const FULL: Dur = { in: 0.95, mid: 0.55, out: 0.5, back: 1.0 };
const EXAMD: Dur = { in: 0.7, mid: 0.4, out: 0.4 };
/** Lo máximo que un paso (Adam) o un repaso de 10 vueltas puede mover un peso: da la escala del brillo. */
const DREF1 = LR, DREFC = 2;
const WMAX = 16;
const hue = (j: number, a: number): string => 'rgba(' + TEAM_HUE[j].join(',') + ',' + a + ')';

/** Cómo se ve cada neurona del equipo (las del medio y la que decide). */
function viewOptions(k: number): (layer: number, neuron: number, last: boolean) => NeuronViewOptions {
  const thick = (big: boolean) => (w: number | null): number => (w === null ? 4 : (big ? 1.6 : 1.3) + (big ? 9 : 7) * Math.sqrt(Math.min(1, Math.abs(w) / WMAX)));
  return (_l, n, last) => ({
    thick: thick(last && k === 1),
    phase: last ? 0 : 1.7 * (n + 1),
    levelMin: last ? (k === 1 ? -1.5 : -30) : -26,
    levelMax: last ? (k === 1 ? 7 : 14) : 14,
    chargeGain: last ? 0.3 : 0.5,
    tint: !(last && k > 1),
    lineLabel: last,
    bulb: last,
    labelGap: 10,
    vocab: { origin: 'color', neg: '', threshold: 'a partir de aquí: sí', high: 'intermedio', low: 'no', was: 'era', idle: '¿intermedio?', wasHigh: 'era intermedio', wasLow: 'no era intermedio' },
  });
}

export function startEquipo(): void {
  const reduced = reducedMotion();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const cv = $<HTMLCanvasElement>('qneuron'), fcv = $<HTMLCanvasElement>('qmeter'), sec = $('equipo');
  const goBtn = $('qgo'), b0 = $('q0'), minus = $<HTMLButtonElement>('qminus'), plus = $<HTMLButtonElement>('qplus'), countEl = $('qcount');
  const legEl = $('qeleg'), pdot = $('qpdot');
  const nar = new Narrator({ status: $('qstatus'), live: $('qlive'), phrase: $('qphrase') });
  const jars = new Jars($('qjars')), chips = new ExamChips($('qexam')), dots = new ProgressDots(Array.from(document.querySelectorAll<HTMLElement>('#qdots i')));
  const results: Record<number, number> = {};

  let K = 1;
  let st: State = { phase: 'idle', k: 1, net: newTeam(1), trained: false, idx: 0, sp: 0, seen: 0, pass: 0, rt: 0, eidx: 0, et: 0, done: 0, correct: 0, yes: 0, tags: null };
  let nv: NetworkView = new NetworkView(st.net, viewOptions(1), teamLayout(1));
  let items: Item[] = [], labelShown = '?', tagT = 0;
  const meter = new BrainMeter(1);
  meter.setModel(st.net); meter.track(nv.observed, BRAIN_SCALE);

  // ---------- paneles ----------
  const dock = dockEls('q');
  const code = new CodePanel<TeamCodeState>(dock.code, { newState: newTeamCodeState, renderHtml: renderCodeHtml, rawText });
  const brain = new TeamBrainPanel(dock.brain, () => ({ net: st.net, k: K, trained: st.trained, tags: st.tags, results }));
  linkPanels(code, brain);

  // ---------- interfaz ----------
  const setStatus = (t: string): void => nar.status(t), say = (t: string): void => nar.say(t);
  function setLeg(m: 'learn' | 'exam'): void { legEl.className = 'eleg m-' + m; code.mode(m); }
  function setJar(k: number, pct: number): void { jars.set(k, pct, kName(k) + ': ' + pct + ' % de aciertos'); }
  function setUI(): void {
    countEl.textContent = kName(K);
    cv.setAttribute('aria-label', 'Una red real: tres entradas, rojo, verde y azul' + (K === 1 ? ', una sola neurona' : ', ' + K + ' neuronas en el medio y una neurona que decide') + ' y una sola salida, intermedio o no. Al aprender, después de responder llega la corrección y las conexiones cambian de grosor; en el examen solo responde.');
    minus.disabled = K <= KS[0]; plus.disabled = K >= KS[KS.length - 1];
    jars.highlight(K);
  }
  function resetMarks(): void { chips.reset(); dots.reset(); }

  const lastView = (): NetworkView['neurons'][number] => nv.layers[nv.layers.length - 1][0];
  const firstView = (): NetworkView['neurons'][number] => nv.layers[0][0];

  // ---------- director ----------
  function fresh(k: number): void {
    K = k;
    const net = newTeam(k);
    nv = new NetworkView(net, viewOptions(k), teamLayout(k));
    meter.setModel(net); meter.track(nv.observed, BRAIN_SCALE);
    st = { phase: 'idle', k, net, trained: false, idx: 0, sp: 0, seen: 0, pass: 0, rt: 0, eidx: 0, et: 0, done: 0, correct: 0, yes: 0, tags: null };
    items = []; labelShown = '?'; tagT = 0;
    nar.phrase(); resetMarks(); setUI();
    code.reset({ k, trained: false });
    setLeg('exam');
    neuronLoop.redraw(); meterLoop.redraw();
  }
  function setK(k: number): void {
    k = Math.max(KS[0], Math.min(KS[KS.length - 1], k));
    fresh(k);
    setStatus('Equipo nuevo: ' + kName(k) + ' · pulsa «Enséñale»');
    say('Ahora hay ' + kName(k) + '.');
  }
  function start(trainIt: boolean): void {
    fresh(K);
    const k = K;
    st.trained = trainIt;
    code.reset({ k, trained: trainIt });
    setLeg(trainIt ? 'learn' : 'exam');
    lastView().ripple(false);
    say(trainIt ? 'Equipo nuevo, ' + kName(k) + '. Le enseñas ' + NTRAIN + ' colores.' : 'Equipo nuevo, sin enseñarle nada.');
    if (reduced) { instant(); return; }
    if (!trainIt) { setStatus('Equipo nuevo, sin enseñarle nada'); beginExam(); }
    else { st.phase = 'feed'; setStatus('Equipo nuevo · aprendiendo… 0/' + NTRAIN); }
  }
  function beginExam(): void {
    nv.neurons.forEach((v) => v.sync(false));
    code.cur(null);
    st.phase = 'exam'; st.eidx = 0; st.et = 0.6; st.done = 0; st.correct = 0; st.yes = 0; setLeg('exam');
    setStatus(st.trained ? 'Examen · ¿intermedio? Solo responde, no cambia' : 'Examen sin haberle enseñado · ¿intermedio?');
  }
  function launch(kind: Item['kind'], col: number[], i: number, d: Dur): void {
    code.cur(kind === 'train' ? 'ej' : 'ex', i);
    if (kind === 'train') dots.now(i);
    items.push({ kind, c: col, i, d, stage: 'in', t: 0, p: 0, a: 0, ok: false, dead: false, ref: DREF1 });
    firstView().showSample(col, 1.6);
  }

  function phraseFor(k: number, pct: number, tags: SpecTag[], sc: { ok: number; yes: number }): { m: string; extra: string } {
    let m = '', extra = '';
    if (!st.trained) {
      m = sc.yes === 0 ? 'Sin enseñarle nada, ' + (k === 1 ? 'dice «no» a todos los colores.' : 'el equipo dice «no» a todos los colores.') : 'Sin enseñarle nada, responde sin criterio: dice «intermedio» a ' + sc.yes + ' de 12.';
      extra = 'No vio ningún ejemplo. Decir «no» a todo ya acierta 8 de 12.';
    } else if (k === 1) {
      m = sc.yes === 0 ? 'Una sola neurona solo traza una línea: no puede aislar el medio. Lo mejor que encuentra es decir «no» a todo y acertar ' + st.correct + ' de 12.' : 'Una sola neurona solo traza una línea: se atasca en un ' + pct + ' %.';
      extra = 'Vio ' + NTRAIN + ' colores, ' + EPOCHS + ' veces cada uno. Decir «no» a todo ya acierta 8 de 12. Su cerebro se llena porque ha cambiado mucho, pero cambiar no es acertar.';
    } else {
      let io = -1, ic = -1;
      const fw = st.net.layers[1].neurons[0].weights;
      tags.forEach((t, j) => { if (t.tag === 'osc' && io < 0) io = j; if (t.tag === 'cla' && ic < 0) ic = j; });
      if (pct >= 90 && io >= 0 && ic >= 0 && fw[io] < 0 && fw[ic] < 0) {
        m = 'Una neurona vigila lo oscuro y otra lo claro. La que decide dice «intermedio» cuando ninguna de las dos se enciende.';
        tags.forEach((t, j) => { if (j !== io && j !== ic) m += ' ' + (t.tag === 'none' ? 'La neurona ' + (j + 1) + ' no tiene especialidad clara.' : 'La neurona ' + (j + 1) + ' ayuda: ' + TAGFULL[t.tag] + '.'); });
      } else if (pct >= 90) m = 'Las neuronas se reparten el trabajo y juntas aciertan lo que una sola no podía.';
      else m = 'Con este equipo aún se equivoca: llega a ' + pct + ' %.';
      extra = tags.map((t, j) => 'Neurona ' + (j + 1) + ': ' + TAGFULL[t.tag]).join(' · ');
    }
    return { m, extra };
  }
  function finish(): void {
    const pct = Math.round((st.correct / 12) * 100), k = st.k;
    code.cur(null);
    st.phase = 'done'; labelShown = pct + '%';
    const sc = { ok: st.correct, yes: st.yes }, tags = specTags(st.net);
    st.tags = tags; tagT = reduced ? 1 : 0;
    if (st.trained) { results[k] = pct; setJar(k, pct); }
    const p = phraseFor(k, pct, tags, sc);
    nar.phrase(p.m, p.extra);
    setStatus('Examen terminado · ' + st.correct + ' de 12');
    say('Acertó ' + st.correct + ' de 12, un ' + pct + ' por ciento. ' + p.m + ' ' + (tags.length ? p.extra : ''));
  }
  function instant(): void {
    if (st.trained) for (let i = 0; i < EPOCHS; i++) trainPass(st.net);
    nv.neurons.forEach((v) => v.sync(true)); nv.observed.resync();
    st.correct = 0; st.yes = 0;
    EXAM.forEach((c, n) => { const a = st.net.predict(c)[0] > 0.5 ? 1 : 0, ok = a === labelOf(c); st.yes += a; if (ok) st.correct++; chips.mark(n, ok); });
    finish(); meter.ease(0, true);
    meterLoop.redraw(); neuronLoop.redraw();
  }

  /** El color llegó a las neuronas del medio: cada una suma lo que le llega por su peso y se enciende o no. */
  function arrive1(it: Item): void {
    it.hs = nv.layers[0].map((v, j) => {
      const h = st.net.layers[0].neurons[j].predict(it.c);
      v.respond(it.c, h);
      return h;
    });
  }
  /** Llega a la que decide: suma sus entradas y responde con el predict real. */
  function arriveF(it: Item): void {
    const x = K === 1 ? it.c : (it.hs as number[]);
    it.p = st.net.predict(it.c)[0]; it.a = it.p > 0.5 ? 1 : 0; it.ok = it.a === labelOf(it.c);
    lastView().respond(x, it.p);
  }
  function emerge(it: Item): void {
    const F = lastView();
    F.flash = Math.max(F.flash, 0.1);
    if (it.kind === 'probe') { F.answer({ a: it.a, p: it.p, ok: it.ok, era: null, hold: 2.2 }); it.dead = true; probeSay(it); return; }
    if (it.kind === 'exam') {
      F.answer({ a: it.a, p: it.p, ok: it.ok, era: null, hold: 1.3 });
      chips.mark(it.i, it.ok); st.done++; if (it.ok) st.correct++; st.yes += it.a;
      labelShown = Math.round((st.correct / 12) * 100) + '%';
      it.dead = true;
      if (st.done >= 12) finish();
    } else {
      F.answer({ a: it.a, p: it.p, ok: it.ok, era: labelOf(it.c), hold: 2.2 });
      /* llega la corrección: cada neurona ajusta cuánto cuenta cada entrada (pesos y sesgo) */
      it.deltas = nv.observed.train(it.c, [labelOf(it.c)], LR);
      st.seen++;
      setStatus('Equipo nuevo · aprendiendo… ' + st.seen + '/' + NTRAIN);
      it.stage = 'back'; it.t = 0;
    }
  }
  function advance(it: Item, dt: number): void {
    if (it.stage === 'in') {
      it.t += dt / (it.d.in as number);
      if (it.t >= 1) { it.t = 0; if (K > 1) { arrive1(it); it.stage = 'mid'; } else { arriveF(it); it.stage = 'out'; } }
    } else if (it.stage === 'mid') {
      it.t += dt / (it.d.mid as number);
      if (it.t >= 1) { arriveF(it); it.stage = 'out'; it.t = 0; }
    } else if (it.stage === 'out') {
      it.t += dt / (it.d.out as number);
      if (it.t >= 1) emerge(it);
    } else {
      it.t += dt / (it.d.back || (FULL.back as number));
      /* a las 4 décimas de la vuelta llegan los pesos nuevos y CADA neurona celebra según SU propio cambio */
      if (!it.snapped && it.t >= 0.4) {
        it.snapped = true;
        (it.deltas as NeuronDelta[][]).forEach((layer, li) => layer.forEach((d, ni) => meter.learned(meter.lobeOf(st.net, li, ni), nv.layers[li][ni].learn(d, { ref: it.ref }))));
      }
      if (it.t >= 1) {
        it.dead = true;
        if (it.kind === 'train') dots.seen(it.i);
      }
    }
  }

  // ---------- probar un color ----------
  function probeSay(it: { c: number[]; a: number; ok: boolean }): void {
    const rule = labelOf(it.c) ? 'intermedio' : 'no intermedio', she = it.a ? 'intermedio' : 'no intermedio';
    const t = 'Tú dirías: ' + rule + ' · ' + (K === 1 ? 'Ella dice: ' : 'El equipo dice: ') + she + (it.ok ? ' ✓' : ' ✗');
    setStatus(t); say(t + (it.ok ? '. Acertó.' : '. Se equivocó.'));
  }
  function probe(hex: string): void {
    pdot.style.background = hex;
    if (st.phase === 'feed' || st.phase === 'review' || st.phase === 'settle' || st.phase === 'exam') { setStatus('Espera a que termine para probar tu color'); return; }
    const c = hexRgb(hex);
    setLeg('exam'); code.probe(c);
    if (reduced) {
      const pr = st.net.predict(c)[0], a = pr > 0.5 ? 1 : 0, ok = a === labelOf(c), F = lastView();
      firstView().showSample(c, 99);
      F.answer({ a, p: pr, ok, era: null, hold: 99 }); F.termFlash = 0; probeSay({ c, a, ok });
      neuronLoop.redraw(); return;
    }
    items.push({ kind: 'probe', c, i: 0, d: EXAMD, stage: 'in', t: 0, p: 0, a: 0, ok: false, dead: false, ref: DREF1 });
    firstView().showSample(c, 1.6);
    setStatus('Probando tu color…');
  }
  bindColorPicker({ btn: $('qpickc'), pop: $('qppop'), quick: $('qpq') }, probe);

  /** Un «repaso»: se entrena de verdad y el pulso de vuelta lleva el cambio real de cada neurona. */
  function pulse(): void {
    const deltas = nv.observed.poll();
    items.push({ kind: 'rev', c: [], i: 0, stage: 'back', t: 0, d: { back: 0.35 }, deltas, ref: DREFC, p: 0, a: 0, ok: false, dead: false });
    lastView().flash = Math.max(lastView().flash, 0.4);
  }
  function tick(dt: number): void {
    if (st.phase === 'feed') {
      st.sp -= dt;
      if (st.idx < FULLN && st.sp <= 0 && !items.length) { launch('train', TRAIN[st.idx], st.idx, FULL); st.idx++; st.sp = 0; }
      if (st.idx >= FULLN && !items.length) {
        for (let i = FULLN; i < NTRAIN; i++) { st.net.train(TRAIN[i], [labelOf(TRAIN[i])], LR); dots.seen(i); }
        st.seen = NTRAIN; st.pass = 1; st.rt = 0.3; st.phase = 'review'; pulse();
        setStatus('repasando… 1/' + EPOCHS);
      }
    } else if (st.phase === 'review') {
      st.rt -= dt;
      if (st.rt <= 0) {
        const n = Math.min(CHUNK, EPOCHS - st.pass);
        for (let e = 0; e < n; e++) trainPass(st.net);
        st.pass += n; pulse();
        setStatus('repasando… ' + st.pass + '/' + EPOCHS);
        st.rt = 0.13;
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
    if (st.tags && tagT < 1) tagT = Math.min(1, tagT + dt * 1.2);
  }

  // ---------- dibujo ----------
  function drawTravel(ctx: CanvasRenderingContext2D, it: Item): void {
    if (it.stage === 'in') nv.layers[0].forEach((v) => v.drawInput(ctx, it.c, it.t));
    else if (it.stage === 'mid') lastView().drawRelay(ctx, it.hs || [], it.t);
    else if (it.stage === 'out') lastView().drawOutput(ctx, it.p, it.a, it.t);
    else if (it.deltas) {
      /* la corrección vuelve por el axón, la que decide y las entradas, cada tramo con el cambio REAL de su neurona */
      const d = it.deltas, ref = it.ref, u = it.t;
      if (K === 1) lastView().drawCorrection(ctx, u, d[0][0], { axon: [0, 0.4], dendrites: [0.4, 1], ref });
      else {
        lastView().drawCorrection(ctx, u, d[1][0], { axon: [0, 0.25], dendrites: [0.25, 0.6], ref });
        nv.layers[0].forEach((v, j) => v.drawCorrection(ctx, u, d[0][j], { dendrites: [0.6, 1], ref }));
      }
    }
  }
  const neuronLoop = createLoop(cv, {
    draw(ctx, w, h, dt, t) {
      if (!reduced) tick(dt);
      nv.update(dt);
      nv.fit(w, h);
      const tr = nv.transform, F = lastView();
      ctx.save(); ctx.translate(tr.ox, tr.oy); ctx.scale(tr.s, tr.s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      nv.neurons.forEach((v) => v.drawWires(ctx));
      items.forEach((it) => drawTravel(ctx, it));
      // cuerpos
      if (K > 1) {
        nv.layers[0].forEach((v, j) => {
          const S = v.geom.body;
          v.drawBody(ctx, t);
          ctx.font = font(v.fs(11)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = hue(j, 0.95);
          ctx.fillText(String(j + 1), S.x - S.r * 0.95, S.y - S.r * 0.95);
          if (st.tags && tagT > 0 && st.tags[j]) {
            const tag = st.tags[j], tt = TAGSHORT[tag.tag], f1 = v.fs(10), ty0 = S.y + S.r + f1 * 1.25;
            ctx.font = font(f1);
            const bw = Math.max(ctx.measureText(tt[0]).width, ctx.measureText(tt[1]).width) + 12;
            ctx.globalAlpha = tagT; ctx.fillStyle = 'rgba(9,9,10,.82)'; rrect(ctx, S.x - bw / 2, ty0 - f1 * 0.8, bw, f1 * 2.5, 6); ctx.fill();
            ctx.fillStyle = 'rgba(141,137,125,.95)'; ctx.fillText(tt[0], S.x, ty0 + f1 * 0.05);
            ctx.fillStyle = tag.tag === 'none' ? 'rgba(141,137,125,.95)' : hue(j, 1); ctx.fillText(tt[1], S.x, ty0 + f1 * 1.25);
            ctx.globalAlpha = 1;
          }
        });
      }
      F.drawBody(ctx, t);
      if (K > 1) {
        const S = F.geom.body;
        ctx.font = font(F.fs(10.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(141,137,125,.95)';
        ctx.fillText('la que decide', S.x, S.y + S.r + F.fs(10.5) * 1.3);
      }
      nv.neurons.forEach((v) => v.drawFront(ctx));
      ctx.restore();
    },
  });
  const meterLoop = mountBrainMeter({
    canvas: fcv, meter, reduced, label: () => labelShown,
    aria: () => brainAria(meter, st.phase === 'done' ? Math.round((st.correct / 12) * 100) : null, 'de aciertos en el examen'),
  });

  // ---------- controles ----------
  goBtn.addEventListener('click', () => start(true));
  b0.addEventListener('click', () => start(false));
  minus.addEventListener('click', () => setK(K - 1));
  plus.addEventListener('click', () => setK(K + 1));
  fresh(1);
  setStatus('Equipo nuevo: ' + kName(1) + ' · pulsa «Enséñale»');

  /* esta pantalla puede ser más alta que la ventana (móvil): la marcamos como activa al cruzar el centro */
  getPager().followCenter(sec);
}
