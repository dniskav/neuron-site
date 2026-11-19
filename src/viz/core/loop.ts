import { reducedMotion } from './motion';

export interface LoopOptions {
  init?: (w: number, h: number) => void;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, t: number) => void;
}

export interface Loop {
  ctx: CanvasRenderingContext2D;
  redraw: () => void;
}

/**
 * Bucle de dibujo de un canvas: se pausa fuera de pantalla y con la pestaña oculta,
 * ajusta la densidad de píxeles y dibuja una vez si hay «menos movimiento».
 */
export function createLoop(canvas: HTMLCanvasElement, o: LoopOptions): Loop {
  const reduced = reducedMotion();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let w = 0, hh = 0, dpr = 1, visible = false, raf = 0, last = 0, t = 0, running = false;

  function frame(now: number, once?: boolean): void {
    const dt = once ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    o.draw(ctx, w, hh, dt, t);
    if (!once && running) raf = requestAnimationFrame(frame);
  }
  function size(): void {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    hh = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (o.init) o.init(w, hh);
    if (!running) frame(0, true);
  }
  function update(): void {
    const want = visible && !document.hidden && !reduced;
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; update(); }, { root: null, threshold: 0 }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  new ResizeObserver(size).observe(canvas);
  size();
  return { ctx, redraw: () => { if (w) frame(performance.now(), true); } };
}
