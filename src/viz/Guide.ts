import { reducedMotion } from './core/motion';

/**
 * Guía visual: un halo dorado intermitente sobre lo que toca pulsar en la pantalla visible, con una
 * burbuja de texto. Aparece tras 2,5 s de inactividad, recuerda el progreso (localStorage, con
 * respaldo en memoria) y el botón «?» de la cabecera la repite. Con `prefers-reduced-motion` el halo
 * queda fijo (el CSS quita la animación) y la burbuja aparece sin retraso.
 *
 * Todo el dibujo vive en una capa fija propia (`.guide-layer`): los halos abrazan cada elemento con su
 * propio `border-radius`, y el de la rama de la neurona es un círculo en la punta real de la rama.
 */

interface Box { l: number; t: number; w: number; h: number; rad: string }
interface Step {
  el: string;
  text: string;
  /** Evento que completa el paso (por defecto `click`). */
  ev?: 'click' | 'pointerdown';
  done(e: Event): boolean;
  skip?(): boolean;
  rect?(r: DOMRect): Box;
  side?: 'above' | 'below';
}

const KEY = 'neuron-guide-v1', IDLE = 2500, PAUSE = 900, HDR = 56;
const $ = (s: string): HTMLElement | null => document.querySelector(s);
const hit = (sel: string, when?: (e: Event) => boolean) => (e: Event): boolean => {
  const t = (e.target as Element | null)?.closest?.(sel);
  return !!t && (!when || when(e));
};
const teamSize = (): number => { const m = /^(\d+)/.exec($('#qcount')?.textContent || ''); return m ? +m[1] : 0; };

/** Círculo centrado en la punta real de una dendrita (coordenadas del dibujo → página). */
function branchRect(): Box {
  const tip = (window as unknown as { __neuronTip?: () => { x: number; y: number } | null }).__neuronTip;
  const p = tip ? tip() : null;
  if (!p) return { l: 0, t: 0, w: 0, h: 0, rad: '50%' };
  const d = 40;
  return { l: p.x - d / 2, t: p.y - d / 2, w: d, h: d, rad: '50%' };
}

/** Secuencias por pantalla, en el orden en que se enseñan. */
export const SEQ: Record<string, Step[]> = {
  neurona: [
    { el: '#neuron', ev: 'pointerdown', rect: branchRect, side: 'below', text: 'Toca una rama y mira qué pasa', done: hit('#neuron') },
  ],
  ensenale: [
    { el: '#e0', text: 'Pruébala sin enseñarle nada', done: hit('#e0') },
    { el: '#slist .set:first-child', text: 'Ahora enséñale con pocos ejemplos', done: hit('#slist .set:first-child') },
    { el: '#slist .set:last-child', text: 'Y ahora con muchos más', done: hit('#slist .set:last-child') },
    { el: '#bbtn', side: 'above', text: 'Mira lo que aprendió', done: hit('#bbtn') },
    { el: '#cbtn', side: 'above', text: 'Este es el código de verdad', done: hit('#cbtn') },
    { el: '#pickc', text: 'Prueba un color tuyo', done: hit('#pickc, #pq button, #ppop button') },
  ],
  equipo: [
    { el: '#qgo', text: 'Una sola neurona se atasca: míralo', skip: () => teamSize() !== 1, done: hit('#qgo', () => teamSize() === 1) },
    { el: '#qplus', side: 'above', text: 'Súmale otra neurona', done: hit('#qplus') },
    { el: '#qgo', text: 'Enséñale otra vez', done: hit('#qgo', () => teamSize() > 1) },
    { el: '#qbbtn', side: 'above', text: 'Mira en qué se especializó cada una', done: hit('#qbbtn') },
    { el: '#qpickc', text: 'Prueba un color tuyo', done: hit('#qpickc, #qpq button, #qppop button') },
  ],
};

export interface GuideApi {
  steps: typeof SEQ;
  restart(): void;
  state(): { section: string | null; next: number; shown: number; idle: number; force: boolean; store: Record<string, number[]> };
}

export function startGuide(): GuideApi {
  const reduced = reducedMotion();
  const btn = $('#guide-btn') as HTMLElement;

  // ---- progreso: localStorage si existe; si no, solo en memoria ----
  let store: Record<string, number[]> = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { store = {}; }
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
  const save = (): void => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* sin almacenamiento */ } };
  const isDone = (id: string, i: number): boolean => !!(store[id] && store[id][i]);
  const setDone = (id: string, i: number, v: boolean): void => { if (!Array.isArray(store[id])) store[id] = []; store[id][i] = v ? 1 : 0; save(); };
  const nextIdx = (id: string): number => {
    const s = SEQ[id];
    for (let i = 0; i < s.length; i++) if (!isDone(id, i) && !(s[i].skip && s[i].skip!())) return i;
    return -1;
  };

  // ---- elementos: una capa fija con el halo y la burbuja ----
  const halo = document.createElement('div');
  halo.className = 'guide-halo'; halo.setAttribute('aria-hidden', 'true');
  halo.innerHTML = '<i class="guide-ping"></i><i class="guide-ring"></i>';
  const bubble = document.createElement('div');
  bubble.className = 'guide-bubble'; bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite');
  const layer = document.createElement('div');
  layer.className = 'guide-layer';
  layer.appendChild(halo); layer.appendChild(bubble); document.body.appendChild(layer);

  const st = { id: null as string | null, last: performance.now(), force: false, shown: -1, okUntil: 0, okEl: null as HTMLElement | null, okStep: null as Step | null, secT: 0 };
  let bOn = false, bText = '';
  function bubbleShow(text: string): void {
    if (bOn && bText === text) return;
    const was = bOn;
    bOn = true; bText = text; bubble.classList.add('on');
    if (was || reduced) bubble.textContent = text;
    else { bubble.textContent = ''; setTimeout(() => { if (bOn && bText === text) bubble.textContent = text; }, 60); }
  }
  function bubbleHide(): void {
    if (!bOn) return;
    bOn = false; bText = ''; bubble.classList.remove('on');
    setTimeout(() => { if (!bOn) bubble.textContent = ''; }, 500);
  }
  function hide(): void { halo.classList.remove('on', 'ok'); st.shown = -1; bubbleHide(); }

  function boxOf(el: HTMLElement, step: Step): Box | null {
    const r = el.getBoundingClientRect();
    let b: Box;
    if (step.rect) b = step.rect(r);
    else {
      /* el halo copia el border-radius del elemento (o es un círculo si es una píldora) */
      let rad = getComputedStyle(el).borderTopLeftRadius;
      const px = parseFloat(rad);
      if (rad.indexOf('%') < 0 && px > Math.min(r.width, r.height) / 2) rad = Math.min(r.width, r.height) / 2 + 'px';
      b = { l: r.left, t: r.top, w: r.width, h: r.height, rad };
    }
    if (!(b.w > 0 && b.h > 0)) return null;
    if (b.t < HDR - 8 || b.t + b.h > window.innerHeight - 4 || b.l + b.w < 0 || b.l > window.innerWidth) return null;
    return b;
  }
  function place(b: Box, step: Step, withBubble: boolean): void {
    const pad = 5;
    halo.style.left = b.l - pad + 'px'; halo.style.top = b.t - pad + 'px';
    halo.style.width = b.w + 2 * pad + 'px'; halo.style.height = b.h + 2 * pad + 'px';
    halo.style.borderRadius = b.rad.indexOf('%') < 0 ? parseFloat(b.rad) + pad + 'px' : b.rad;
    const m = Math.min(b.w, b.h) + 2 * pad;
    halo.style.setProperty('--beat', (1 + Math.max(0.03, Math.min(0.12, 5 / m))).toFixed(3));
    halo.style.setProperty('--ping', (1 + Math.max(0.08, Math.min(0.5, 18 / m))).toFixed(3));
    halo.classList.add('on');
    if (!withBubble) { bubbleHide(); return; }
    bubbleShow(step.text);
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const x = Math.max(8, Math.min(vw - bw - 8, b.l + b.w / 2 - bw / 2));
    const below = b.t + b.h + pad + 10, above = b.t - pad - 10 - bh;
    let y: number;
    if ((step.side || 'below') === 'above') y = above >= HDR + 2 ? above : below;
    else y = below + bh <= vh - 8 ? below : above;
    bubble.style.left = Math.round(x) + 'px'; bubble.style.top = Math.round(y) + 'px';
  }

  function update(now: number): void {
    const id = st.id;
    if (!id) { hide(); return; }
    if (st.okUntil) {
      if (st.okUntil > now) {
        const bo = st.okEl && boxOf(st.okEl, st.okStep as Step);
        if (bo) { halo.classList.add('ok'); place(bo, st.okStep as Step, false); } else hide();
        return;
      }
      st.okUntil = 0; st.okEl = null; st.okStep = null; halo.classList.remove('ok'); hide();
    }
    const idx = nextIdx(id);
    if (idx < 0) { hide(); return; }
    if (!st.force && now - st.last < IDLE) { hide(); return; }
    const step = SEQ[id][idx], el = $(step.el);
    if (!el) { hide(); return; }
    /* con un panel abierto la guía espera, salvo que el paso sea justo abrir/cambiar de panel */
    if ($('#' + id + ' .cpanel.open, #' + id + ' .ppop.open') && !el.classList.contains('cbtn')) { hide(); return; }
    const b = boxOf(el, step);
    if (!b) { hide(); return; }
    st.shown = idx;
    place(b, step, true);
  }

  function detect(now: number): void {
    const mid = window.innerHeight / 2;
    let id: string | null = null;
    document.querySelectorAll<HTMLElement>('main > section').forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) id = SEQ[s.id] ? s.id : null;
    });
    if (id !== st.id) { st.id = id; st.last = now; st.force = false; st.okUntil = 0; hide(); }
    btn.hidden = !id;
  }

  function complete(id: string, i: number): void {
    const step = SEQ[id][i];
    const flash = id === st.id && st.shown === i;
    setDone(id, i, true);
    if (flash) { st.okUntil = performance.now() + PAUSE; st.okEl = $(step.el); st.okStep = step; }
  }
  function onEvent(e: Event): void {
    if ((e.target as Element | null)?.closest?.('#guide-btn')) return;
    Object.keys(SEQ).forEach((id) => {
      SEQ[id].forEach((s, i) => {
        if ((s.ev || 'click') !== e.type || isDone(id, i)) return;
        let ok = false;
        try { ok = s.done(e); } catch (x) { ok = false; }
        if (ok) complete(id, i);
      });
    });
  }
  document.addEventListener('click', onEvent, true);
  document.addEventListener('pointerdown', onEvent, true);
  const touch = (e: Event): void => {
    if ((e.target as Element | null)?.closest?.('#guide-btn')) return;
    st.last = performance.now(); st.force = false;
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((n) => document.addEventListener(n, touch, { capture: true, passive: true }));

  function restart(): void {
    const id = st.id;
    if (!id) return;
    store[id] = []; save();
    st.force = true; st.okUntil = 0;
  }
  btn.addEventListener('click', restart);

  let lastRun = -1;
  function run(): void {
    const now = performance.now();
    if (now - lastRun < 30) return;
    lastRun = now;
    if (now - st.secT > 150) { st.secT = now; detect(now); }
    update(now);
  }
  const frame = (): void => { run(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  setInterval(run, 120); /* respaldo por si el navegador frena requestAnimationFrame (pestaña en segundo plano) */

  const api: GuideApi = {
    steps: SEQ, restart,
    state: () => ({ section: st.id, next: st.id ? nextIdx(st.id) : -1, shown: st.shown, idle: Math.round(performance.now() - st.last), force: st.force, store }),
  };
  (window as unknown as { Guide?: GuideApi }).Guide = api;
  return api;
}
