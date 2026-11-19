import { TAU } from './core/canvas';
import { createLoop } from './core/loop';

/** Adelanto de Snake: una serpiente sencilla (no aprende todavía) moviéndose por una cuadrícula. Decorativo. */
export function startSnakePreview(canvas: HTMLCanvasElement): void {
  const COLS = 24, ROWS = 12, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let snake: { x: number; y: number }[] = [], food = { x: 0, y: 0 }, acc = 0;
  function reset(): void {
    snake = [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
    place();
  }
  function place(): void {
    for (let n = 0; n < 200; n++) {
      const f = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
      if (!snake.some((s) => s.x === f.x && s.y === f.y)) { food = f; return; }
    }
    reset();
  }
  function step(): void {
    const hd = snake[0], opts: { x: number; y: number; c: number }[] = [];
    dirs.forEach((d) => {
      const nx = hd.x + d[0], ny = hd.y + d[1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
      if (snake.slice(0, -1).some((s) => s.x === nx && s.y === ny)) return;
      opts.push({ x: nx, y: ny, c: Math.abs(nx - food.x) + Math.abs(ny - food.y) + Math.random() * 0.5 });
    });
    if (!opts.length) { reset(); return; }
    opts.sort((a, b) => a.c - b.c);
    const nx = opts[0];
    snake.unshift({ x: nx.x, y: nx.y });
    if (nx.x === food.x && nx.y === food.y) { if (snake.length > 28) reset(); else place(); }
    else snake.pop();
  }
  reset();
  createLoop(canvas, {
    draw(ctx, w, h, dt) {
      acc += dt;
      while (acc > 0.11) { acc -= 0.11; step(); }
      const c = Math.min(w / COLS, h / ROWS), ox = (w - c * COLS) / 2, oy = (h - c * ROWS) / 2;
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
        ctx.beginPath(); ctx.arc(ox + (x + 0.5) * c, oy + (y + 0.5) * c, 1, 0, TAU); ctx.fill();
      }
      const fx = ox + (food.x + 0.5) * c, fy = oy + (food.y + 0.5) * c, pulse = 1 + Math.sin(performance.now() / 180) * 0.15;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, c * 1.6 * pulse);
      g.addColorStop(0, 'rgba(160,200,255,.9)'); g.addColorStop(1, 'rgba(106,167,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, c * 1.6 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#cfe2ff'; ctx.beginPath(); ctx.arc(fx, fy, c * 0.28, 0, TAU); ctx.fill();
      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i], a = 1 - (i / (snake.length + 6)) * 0.75, sz = c * (i ? 0.78 : 0.9), r = c * 0.26;
        const px = ox + s.x * c + (c - sz) / 2, py = oy + s.y * c + (c - sz) / 2;
        ctx.fillStyle = i ? 'rgba(201,162,39,' + a.toFixed(2) + ')' : '#ffe08a';
        if (!i) { ctx.shadowColor = '#c9a227'; ctx.shadowBlur = 16; }
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, sz, sz, r); else ctx.rect(px, py, sz, sz);
        ctx.fill(); ctx.shadowBlur = 0;
      }
    },
  });
}
