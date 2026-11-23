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
const numIn = (sel: string): number => { const m = /^(\d+)/.exec($(sel)?.textContent || ''); return m ? +m[1] : 0; };
const teamSize = (): number => numIn('#qcount');
const canGrowName = (): boolean => !(($('#nname') as HTMLButtonElement | null)?.disabled);

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
  paleta: [
    { el: '#pago', text: 'Lanza una bola y mira dónde cree la neurona que caerá', done: hit('#pago') },
    { el: '#pa10', text: 'Lanza varias: cada caída le enseña algo', done: hit('#pa10, #pa100') },
    { el: '#pawalls', text: 'Ahora ponle paredes: la bola rebota', done: hit('#pawalls') },
    { el: '#pateam', text: 'Como en Equipo, una sola no puede con los rebotes: pruébalo con un equipo', skip: () => $('#paleta')?.dataset.kind === 'equipo', done: hit('#pateam') },
    { el: '#pa100', text: 'Y ahora lanza muchas bolas', done: hit('#pa100') },
    { el: '#pacurve', text: 'Apaga la curva del equipo: con paredes ya no puede con los rebotes', skip: () => { const p = $('#paleta'); return p?.dataset.kind !== 'equipo' || $('#pacurve')?.getAttribute('aria-pressed') !== 'true'; }, done: hit('#pacurve') },
    { el: '#pacurve', text: 'Y vuelve a encenderla', skip: () => $('#paleta')?.dataset.kind !== 'equipo' || $('#pacurve')?.getAttribute('aria-pressed') === 'true', done: hit('#pacurve') },
    { el: '#pacont', text: 'Prueba el juego continuo: la paleta devuelve la bola y no se para', done: hit('#pacont') },
    { el: '#pablock', text: 'Pon un bloque: la red no lo ve, pero vuelve a mirar cuando la bola rebota', done: hit('#pablock') },
    { el: '#pabbtn', side: 'above', text: 'Mira lo que aprendió', done: hit('#pabbtn') },
  ],
  colores: [
    { el: '#ngo', text: 'Enséñale: ahora solo conoce tres nombres', skip: () => numIn('#nncount') !== 3, done: hit('#ngo', () => numIn('#nncount') === 3) },
    { el: '#nname', side: 'above', text: 'Le ha llegado un color sin nombre: dale una palabra', skip: () => !canGrowName() || $('#colores')?.dataset.arrived !== '1', done: hit('#nname') },
    { el: '#ngo', text: 'Enséñale otra vez, con el nombre nuevo', skip: () => numIn('#nncount') <= 3, done: hit('#ngo', () => numIn('#nncount') > 3) },
    { el: '#nbbtn', side: 'above', text: 'Mira con qué colores se enciende cada neurona', done: hit('#nbbtn') },
    { el: '#npickc', text: 'Prueba un color tuyo', done: hit('#npickc, #npq button, #nppop button') },
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
  function place(b: Box, step: Step, withBubble: boolean, target: HTMLElement | null = null): void {
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
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const key = [b.l, b.t, b.w, b.h, bw, bh, window.innerWidth, window.innerHeight, step.side, step.text].join('|');
    if (key !== placedKey) {
      placedKey = key;
      const at = bubbleSpot(b, bw, bh, pad, step, target);
      bubble.style.left = Math.round(at[0]) + 'px'; bubble.style.top = Math.round(at[1]) + 'px';
    }
  }
  let placedKey = '';

  /**
   * Dónde poner el bocadillo: la posición (encima, debajo, a la derecha o a la izquierda del objetivo, o corrida
   * hacia un lado) que NO tape otros botones, enlaces ni campos, y que quepa en la ventana. Si todas tapan algo,
   * la que menos tapa. Sirve igual en todas las pantallas.
   */
  function bubbleSpot(b: Box, bw: number, bh: number, pad: number, step: Step, target: HTMLElement | null): [number, number] {
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10;
    const others: DOMRect[] = [];
    document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="button"]').forEach((e) => {
      if (e === target || (target && (target.contains(e) || e.contains(target))) || layer.contains(e)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
      const cv = (e as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility;
      if (cv && !cv.call(e, { checkVisibilityCSS: true, visibilityProperty: true })) return;
      others.push(r);
    });
    /* tampoco debe tapar los títulos y subtítulos si hay otro sitio (pesa menos que tapar un botón) */
    const texts: DOMRect[] = [];
    document.querySelectorAll<HTMLElement>('section h2, section .sub').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < vh) texts.push(r);
    });
    /* ni el centro de un lienzo: ahí está lo que se mira (las neuronas), salvo que el lienzo sea el propio objetivo; pesa más que tapar un botón secundario */
    const centers: DOMRect[] = [];
    document.querySelectorAll<HTMLCanvasElement>('main canvas').forEach((e) => {
      if (target && (e === target || target.contains(e) || e.contains(target))) return;
      const r = e.getBoundingClientRect();
      if (r.width < 80 || r.height < 60 || r.bottom < 0 || r.top > vh) return;
      centers.push(new DOMRect(r.left, r.top, r.width, r.height));
    });
    const cx = b.l + b.w / 2, cy = b.t + b.h / 2;
    const above = b.t - pad - gap - bh, below = b.t + b.h + pad + gap, left = b.l - pad - gap - bw, right = b.l + b.w + pad + gap;
    const xc = cx - bw / 2, yc = cy - bh / 2;
    const cands: [number, number][] = (step.side || 'below') === 'above'
      ? [[xc, above], [xc, below], [right, yc], [left, yc], [b.l, above], [b.l + b.w - bw, above], [b.l, below], [b.l + b.w - bw, below]]
      : [[xc, below], [xc, above], [right, yc], [left, yc], [b.l, below], [b.l + b.w - bw, below], [b.l, above], [b.l + b.w - bw, above]];
    let best: [number, number] = [0, 0], bs = Infinity;
    for (const c of cands) {
      const x = Math.max(8, Math.min(vw - bw - 8, c[0])), y = c[1];
      let sc = 0;
      if (y < HDR + 2) sc += (HDR + 2 - y) * 40;
      if (y + bh > vh - 8) sc += (y + bh - (vh - 8)) * 40;
      /* tampoco debe tapar el propio objetivo */
      const hit = (r: { left: number; top: number; right: number; bottom: number }): number =>
        Math.max(0, Math.min(x + bw, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + bh, r.bottom) - Math.max(y, r.top));
      sc += hit({ left: b.l, top: b.t, right: b.l + b.w, bottom: b.t + b.h }) * 2;
      others.forEach((r) => { sc += hit(r); });
      texts.forEach((r) => { sc += hit(r) * 0.3; });
      centers.forEach((r) => { sc += hit(r) * 3; });
      if (sc < bs) { bs = sc; best = [x, y]; if (sc === 0) break; }
    }
    return best;
  }

  function update(now: number): void {
    const id = st.id;
    if (!id) { hide(); return; }
    /* «Míralo solo» (Paleta, Colores) enseña la pantalla por su cuenta: la guía espera */
    if ($('#' + id)?.dataset.auto === '1') { hide(); return; }
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
    place(b, step, true, el);
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
