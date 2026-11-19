import { TAU, glow, font } from './core/canvas';
import { reducedMotion } from './core/motion';

interface Spark { a: number; v: number; r: number }
interface Burst { t: number; s: number; sp: Spark[] }

/**
 * «Vida extra» al aprender: pop del cuerpo, anillo dorado, chispas y un «+».
 * Más fuerte cuanto mayor es la intensidad `s` (0..1), que sale del cambio REAL de la neurona.
 */
export class Celebration {
  private list: Burst[] = [];
  private cool = 0;
  constructor(private rng: () => number = Math.random) {}

  /** Lanza una celebración de intensidad `s`. Devuelve false si no hace falta (muy suave, enfriándose o con menos movimiento). */
  fire(s: number): boolean {
    if (reducedMotion() || s < 0.03 || this.list.length >= 3 || this.cool > 0) return false;
    this.cool = 0.22;
    const n = 3 + Math.round(5 * s), sp: Spark[] = [];
    for (let k = 0; k < n; k++) sp.push({ a: -1.5708 + (this.rng() - 0.5) * 2, v: 36 + this.rng() * 56, r: 1.6 + this.rng() * 1.8 });
    this.list.push({ t: 0, s, sp });
    return true;
  }

  /** Número de celebraciones vivas. */
  get active(): number { return this.list.length; }
  /** Intensidades vivas (para tests). */
  get strengths(): number[] { return this.list.map((b) => b.s); }

  /** Olvida todo (neurona nueva). */
  reset(): void { this.list = []; this.cool = 0; }

  update(dt: number): void {
    this.cool = Math.max(0, this.cool - dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].t += dt;
      if (this.list[i].t > 1.1) this.list.splice(i, 1);
    }
  }

  /** Factor de escala elástica del cuerpo (1 sin celebración). */
  pop(): number {
    let pop = 1;
    for (const c of this.list) {
      const cu = Math.min(1, c.t / 0.7);
      pop = Math.max(pop, 1 + 0.15 * c.s * Math.sin(cu * Math.PI));
    }
    return pop;
  }

  /** Dibuja el anillo, las chispas y el «+» alrededor del cuerpo (cx, cy, r). `fs` ajusta el tamaño de letra a la escala. */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fs: (n: number) => number): void {
    for (const c of this.list) {
      const u = c.t, fade = Math.max(0, 1 - u / 1.05);
      ctx.strokeStyle = 'rgba(255,214,100,' + fade * (0.35 + 0.6 * c.s) + ')';
      ctx.lineWidth = 1 + 3 * fade * c.s;
      ctx.beginPath();
      ctx.arc(cx, cy, r + u * (50 + 40 * c.s), 0, TAU);
      ctx.stroke();
      for (const sk of c.sp) {
        const d = r + sk.v * u, px = cx + Math.cos(sk.a) * d, py = cy + Math.sin(sk.a) * d;
        glow(ctx, px, py, sk.r * 4, 'rgba(255,214,100,' + fade * 0.6 + ')', 'rgba(255,214,100,0)');
        ctx.fillStyle = 'rgba(255,244,190,' + fade + ')';
        ctx.beginPath();
        ctx.arc(px, py, sk.r * (1 - u * 0.4), 0, TAU);
        ctx.fill();
      }
      if (c.s > 0.12) {
        ctx.font = font(fs(12 + 10 * c.s));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#c9a227';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(255,230,140,' + fade + ')';
        ctx.fillText('+', cx, cy - r - 8 - u * 34);
        ctx.shadowBlur = 0;
      }
    }
  }
}
