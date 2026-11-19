import { TAU, glow, rrect } from './core/canvas';
import { mulberry32 } from './core/rng';
import { mix } from './core/colors';

/** El frasco: se llena según los aciertos (0..1). Turbio con pocos, luminoso con muchos. */
export class Flask {
  private bubbles: { x: number; y: number; r: number; s: number; p: number }[] = [];
  private specks: { x: number; y: number; r: number; p: number; s: number }[] = [];
  private path: Path2D | null = null;
  /** Nivel mostrado (con inercia). */
  lv = 0;

  constructor() {
    const fr = mulberry32(3);
    for (let b = 0; b < 14; b++) this.bubbles.push({ x: 40 + fr() * 120, y: 246 - fr() * 150, r: 1.5 + fr() * 3, s: 14 + fr() * 22, p: fr() * 6 });
    for (let sp = 0; sp < 26; sp++) this.specks.push({ x: 34 + fr() * 132, y: 90 + fr() * 150, r: 0.8 + fr() * 1.8, p: fr() * 6, s: 3 + fr() * 6 });
  }

  private flaskPath(): Path2D {
    const p = new Path2D();
    p.moveTo(80, 10); p.lineTo(120, 10); p.lineTo(120, 62); p.bezierCurveTo(120, 90, 172, 100, 172, 150); p.lineTo(172, 196);
    p.quadraticCurveTo(172, 246, 122, 246); p.lineTo(78, 246); p.quadraticCurveTo(28, 246, 28, 196); p.lineTo(28, 150);
    p.bezierCurveTo(28, 100, 80, 90, 80, 62); p.closePath();
    return p;
  }

  /** Acerca el nivel mostrado a `target`. */
  ease(target: number, dt: number, reduced: boolean): void {
    this.lv += (target - this.lv) * (reduced ? 1 : Math.min(1, dt * 2.6));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, labelShown: string): void {
    if (!this.path) this.path = this.flaskPath();
    const fpath = this.path, lv = this.lv;
    const s = Math.min(w / 200, h / 260), ox = (w - 200 * s) / 2, oy = (h - 260 * s) / 2, q = lv;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    glow(ctx, 100, 170, 140, 'rgba(255,210,100,' + (0.04 + q * 0.3).toFixed(3) + ')', 'rgba(255,210,100,0)');
    if (q > 0.6) glow(ctx, 100, 150, 120, 'rgba(120,175,255,' + ((q - 0.6) * 0.35).toFixed(3) + ')', 'rgba(106,167,255,0)');
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill(fpath);
    ctx.save(); ctx.clip(fpath);
    const top = 246 - 176 * lv, a = 3 + (1 - Math.abs(lv - 0.5)) * 2;
    if (lv > 0.004) {
      ctx.beginPath(); ctx.moveTo(0, 260);
      for (let x = 0; x <= 200; x += 5) ctx.lineTo(x, top + Math.sin(x * 0.07 + t * 2.2) * a + Math.sin(x * 0.13 - t * 1.4) * a * 0.5);
      ctx.lineTo(200, 260); ctx.closePath();
      const g = ctx.createLinearGradient(0, top - 6, 0, 246);
      g.addColorStop(0, 'rgba(' + mix(130, 190, q) + ',' + mix(125, 225, q) + ',' + mix(105, 255, q) + ',' + (0.62 + q * 0.33).toFixed(2) + ')');
      g.addColorStop(0.55, 'rgba(' + mix(95, 255, q) + ',' + mix(88, 214, q) + ',' + mix(70, 100, q) + ',' + (0.72 + q * 0.26).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(' + mix(52, 201, q) + ',' + mix(48, 162, q) + ',' + mix(40, 39, q) + ',.95)');
      ctx.fillStyle = g; ctx.fill();
      // turbio: motitas flotando, se aclaran al subir el %
      ctx.fillStyle = 'rgba(40,36,28,' + ((1 - q) * 0.5).toFixed(2) + ')';
      this.specks.forEach((sk) => {
        const yy = sk.y + Math.sin(t * 0.6 + sk.p) * sk.s;
        if (yy > top + 6) { ctx.beginPath(); ctx.arc(sk.x + Math.cos(t * 0.5 + sk.p) * 5, yy, sk.r * (1.4 - q * 0.6), 0, TAU); ctx.fill(); }
      });
      // luminoso: burbujas
      if (q > 0.3) {
        this.bubbles.forEach((bb) => {
          const yy = 246 - ((246 - bb.y + t * bb.s) % 176);
          if (yy > top + 4) { ctx.fillStyle = 'rgba(255,255,255,' + ((q - 0.3) * 0.6).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(bb.x + Math.sin(t * 1.3 + bb.p) * 4, yy, bb.r, 0, TAU); ctx.fill(); }
        });
        glow(ctx, 100, top + 14, 70, 'rgba(255,245,200,' + (q * 0.35).toFixed(2) + ')', 'rgba(255,230,150,0)');
      }
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + q * 0.45).toFixed(2) + ')'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let x2 = 0; x2 <= 200; x2 += 5) { const yy2 = top + Math.sin(x2 * 0.07 + t * 2.2) * a + Math.sin(x2 * 0.13 - t * 1.4) * a * 0.5; if (x2) ctx.lineTo(x2, yy2); else ctx.moveTo(x2, yy2); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2.2; ctx.stroke(fpath);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(44, 150); ctx.lineTo(44, 200); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, 76, 4, 48, 9, 4); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 40px "Inter Tight",system-ui,sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
    ctx.fillStyle = labelShown === '?' ? 'rgba(242,239,230,.4)' : '#fff';
    ctx.fillText(labelShown, 100, 176);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
