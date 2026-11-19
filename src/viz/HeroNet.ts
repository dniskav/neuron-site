import { TAU } from './core/canvas';
import { createLoop } from './core/loop';

interface Node { x: number; y: number; vx: number; vy: number; g: number }
interface Pulse { a: Node; b: Node; t: number; s: number }

/** Red de fondo de la portada: nodos a la deriva, hilos dorados y pulsos que saltan de uno a otro. Decorativa. */
export function startHeroNet(canvas: HTMLCanvasElement): void {
  let nodes: Node[] = [], pulses: Pulse[] = [], maxD = 150, spawn = 0;
  function init(w: number, h: number): void {
    const n = Math.max(28, Math.min(80, Math.round((w * h) / 15000)));
    maxD = Math.max(110, Math.min(170, w / 7));
    nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, g: 0 });
    pulses = [];
  }
  function neighbors(a: Node): Node[] {
    const r: Node[] = [];
    for (const b of nodes) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy < maxD * maxD) r.push(b);
    }
    return r;
  }
  function emit(a: Node): void {
    const nb = neighbors(a);
    if (!nb.length || pulses.length > 40) return;
    pulses.push({ a, b: nb[(Math.random() * nb.length) | 0], t: 0, s: 0.6 + Math.random() * 0.5 });
  }
  createLoop(canvas, {
    init,
    draw(ctx, w, h, dt) {
      let i: number, j: number, a: Node, b: Node;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
        a.g = Math.max(0, a.g - dt * 1.6);
      }
      spawn -= dt;
      if (spawn <= 0) { emit(nodes[(Math.random() * nodes.length) | 0]); spawn = 0.25 + Math.random() * 0.35; }
      ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            ctx.strokeStyle = 'rgba(201,162,39,' + (0.2 * (1 - Math.sqrt(d2) / maxD)).toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt * p.s;
        if (p.t >= 1) {
          p.b.g = 1; pulses.splice(i, 1);
          if (Math.random() < 0.65) emit(p.b);
          continue;
        }
        const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 14);
        gr.addColorStop(0, 'rgba(255,230,150,.95)'); gr.addColorStop(0.3, 'rgba(201,162,39,.4)'); gr.addColorStop(1, 'rgba(201,162,39,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
      }
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        if (a.g > 0) {
          const g2 = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 22);
          g2.addColorStop(0, 'rgba(160,200,255,' + (a.g * 0.7).toFixed(2) + ')'); g2.addColorStop(1, 'rgba(106,167,255,0)');
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(a.x, a.y, 22, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(235,225,190,' + (0.35 + a.g * 0.6).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.8 + a.g * 1.5, 0, TAU); ctx.fill();
      }
    },
  });
}
