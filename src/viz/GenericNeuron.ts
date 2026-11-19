import { TAU, bez, glow, line, type Pt } from './core/canvas';
import { createLoop } from './core/loop';
import { lcg } from './core/rng';
import { reducedMotion } from './core/motion';

/**
 * La neurona genérica de la pantalla 02: un dibujo ilustrativo (no enlazado a ningún modelo)
 * con 6 dendritas, un cuerpo y un axón. Tocar una rama le envía una señal.
 * Sirve para explicar «escucha, decide, avisa»; las neuronas que aprenden de verdad son las
 * de NeuronView.
 */
interface Def { tip: Pt; c1: Pt; c2: Pt; a: number; w: number; pts: Pt[]; br: { p: Pt; c: Pt; e: Pt; t: Pt }[] }
interface Signal { d: Def; t: number; s: number }

export interface GenericNeuronApi {
  /** Punta de la dendrita principal en coordenadas de página (para la guía). */
  tip(): { x: number; y: number };
}

export function startGenericNeuron(cv: HTMLCanvasElement, stepEls: HTMLElement[]): GenericNeuronApi {
  const reduced = reducedMotion();
  const W = 640, H = 420, S = { x: 340, y: 210, r: 44 };
  const rnd = lcg(11);
  const raw = [
    { tip: [30, 50], c1: [120, 40], c2: [190, 120], a: -2.5, w: 0.9 },
    { tip: [18, 140], c1: [110, 150], c2: [200, 175], a: -2.95, w: 0.35 },
    { tip: [25, 228], c1: [110, 236], c2: [200, 215], a: 3.1, w: 0.6 },
    { tip: [40, 312], c1: [120, 292], c2: [200, 262], a: 2.75, w: 0.2 },
    { tip: [110, 396], c1: [170, 362], c2: [250, 300], a: 2.3, w: 0.75 },
    { tip: [160, 12], c1: [215, 60], c2: [275, 110], a: -2.05, w: 0.45 },
  ];
  const N = 40;
  const defs: Def[] = raw.map((r) => {
    const tip = r.tip as Pt, c1 = r.c1 as Pt, c2 = r.c2 as Pt;
    const end: Pt = [S.x + Math.cos(r.a) * S.r * 0.85, S.y + Math.sin(r.a) * S.r * 0.85];
    const pts: Pt[] = [];
    for (let i = 0; i < N; i++) pts.push(bez(tip, c1, c2, end, i / (N - 1)));
    const br = [9, 17, 25].map((k) => {
      const p = pts[k], q = pts[k + 2], ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const side = rnd() < 0.5 ? -1 : 1, a2 = ang + side * (0.7 + rnd() * 0.5), len = 28 + rnd() * 40;
      const e: Pt = [p[0] + Math.cos(a2) * len, p[1] + Math.sin(a2) * len];
      const c: Pt = [p[0] + Math.cos(a2 + side * 0.35) * len * 0.55, p[1] + Math.sin(a2 + side * 0.35) * len * 0.55];
      const a3 = a2 - side * 0.6, l3 = len * 0.5;
      return { p, c, e, t: [e[0] + Math.cos(a3) * l3, e[1] + Math.sin(a3) * l3] as Pt };
    });
    return { tip, c1, c2, a: r.a, w: r.w, pts, br };
  });
  const AX: Pt[] = [], AN = 60;
  for (let i = 0; i < AN; i++) {
    const f = i / (AN - 1), x = S.x + S.r * 0.9 + f * (600 - S.x - S.r * 0.9);
    AX.push([x, 210 + Math.sin(f * 9) * 9 * Math.min(1, f * 3)]);
  }
  const endP = AX[AN - 1];
  const terms: Pt[] = [[0, 42]].map((a) => [endP[0] + Math.cos(a[0]) * a[1] * 0.7, endP[1] + Math.sin(a[0]) * a[1]] as Pt);

  const signals: Signal[] = [], ripples: { x: number; y: number; t: number }[] = [];
  let axPulse = -1, charge = 0, shown = 0, flash = 0, termFlash = 0, auto = 0.8;
  let lastSig = -9, lastFire = -9, clock = 0, activeStep = 0;
  const view = { s: 1, ox: 0, oy: 0 };

  function addSignal(i: number): void { signals.push({ d: defs[i], t: 0, s: 0.55 + Math.random() * 0.1 }); lastSig = clock; }
  function setStep(n: number): void {
    if (n === activeStep) return;
    activeStep = n;
    stepEls.forEach((el, k) => el.classList.toggle('on', k === n - 1));
  }
  function fit(w: number, h: number): void { const s = Math.min(w / W, h / H); view.s = s; view.ox = (w - W * s) / 2; view.oy = (h - H * s) / 2; }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, t: number): void {
    clock += dt;
    fit(w, h);
    auto -= dt;
    if (auto <= 0 && !reduced) { addSignal((Math.random() * defs.length) | 0); auto = 0.7 + Math.random() * 0.8; }
    for (let i = signals.length - 1; i >= 0; i--) {
      const sg = signals[i];
      sg.t += dt * sg.s;
      if (sg.t >= 1) { charge += 0.12 + sg.d.w * 0.26; flash = Math.max(flash, 0.25); signals.splice(i, 1); }
    }
    charge = Math.max(0, charge - dt * 0.04);
    if (charge >= 1 && axPulse < 0) { axPulse = 0; flash = 1; charge = 0; lastFire = clock; }
    if (axPulse >= 0) { axPulse += dt * 0.9; if (axPulse >= 1) { axPulse = -1; termFlash = 1; } }
    shown += (Math.min(charge, 1) - shown) * Math.min(1, dt * 5);
    flash = Math.max(0, flash - dt * 1.6); termFlash = Math.max(0, termFlash - dt * 1.4);
    if (clock - lastFire < 1.8) setStep(3); else if (charge > 0.5) setStep(2); else if (clock - lastSig < 1.3) setStep(1); else setStep(0);

    ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lit = shown * 0.6 + flash * 0.4;

    defs.forEach((d) => {
      ctx.strokeStyle = 'rgba(201,162,39,' + (0.18 + d.w * 0.2) + ')'; ctx.lineWidth = 1.3;
      d.br.forEach((b) => {
        ctx.beginPath(); ctx.moveTo(b.p[0], b.p[1]); ctx.quadraticCurveTo(b.c[0], b.c[1], b.e[0], b.e[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.stroke();
      });
    });
    defs.forEach((d) => {
      const wd = 2 + d.w * 5;
      ctx.strokeStyle = 'rgba(201,162,39,.07)'; line(ctx, d.pts, wd * 3.2, true);
      ctx.strokeStyle = 'rgba(214,176,52,' + (0.4 + d.w * 0.45) + ')'; line(ctx, d.pts, wd, true);
      glow(ctx, d.tip[0], d.tip[1], 5 + d.w * 5, 'rgba(255,224,138,' + (0.35 + d.w * 0.4) + ')', 'rgba(201,162,39,0)');
    });
    ctx.strokeStyle = 'rgba(201,162,39,.08)'; line(ctx, AX, 14, false);
    ctx.strokeStyle = 'rgba(190,155,40,.75)'; line(ctx, AX, 4, false);
    ctx.strokeStyle = 'rgba(255,224,138,.12)'; ctx.lineWidth = 11;
    [0.2, 0.4, 0.6, 0.8].forEach((f) => {
      const k = Math.round(f * (AN - 1)), a = AX[k - 2], b = AX[k + 2];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(190,155,40,.7)'; ctx.lineWidth = 2;
    terms.forEach((p) => { ctx.beginPath(); ctx.moveTo(endP[0], endP[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
    terms.forEach((p) => { glow(ctx, p[0], p[1], 7 + termFlash * 9, 'rgba(180,215,255,' + (0.35 + termFlash * 0.6) + ')', 'rgba(106,167,255,0)'); });

    signals.forEach((sg) => {
      const n = sg.d.pts.length - 1, k = sg.t * n, i0 = Math.floor(k), f = k - i0, a = sg.d.pts[i0], b = sg.d.pts[Math.min(n, i0 + 1)];
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, r = 6 + sg.d.w * 9;
      glow(ctx, x, y, r * 2.2, 'rgba(255,240,190,' + (0.25 + sg.d.w * 0.3) + ')', 'rgba(255,200,80,0)');
      ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(x, y, 2 + sg.d.w * 3.2, 0, TAU); ctx.fill();
    });
    if (axPulse >= 0) {
      const kk = axPulse * (AN - 1), j = Math.floor(kk), pp = AX[Math.min(AN - 1, j)];
      glow(ctx, pp[0], pp[1], 34, 'rgba(210,230,255,.85)', 'rgba(106,167,255,0)');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pp[0], pp[1], 4.5, 0, TAU); ctx.fill();
    }

    glow(ctx, S.x, S.y, S.r * (2 + lit * 2.2), 'rgba(255,205,90,' + (0.1 + lit * 0.5) + ')', 'rgba(201,162,39,0)');
    if (flash > 0.3) glow(ctx, S.x, S.y, S.r * 4, 'rgba(180,215,255,' + flash * 0.35 + ')', 'rgba(106,167,255,0)');
    ctx.beginPath();
    for (let q = 0; q <= 64; q++) {
      const th = (q / 64) * TAU, rr = S.r * (1 + 0.05 * Math.sin(th * 3 + t * 0.8) + 0.035 * Math.sin(th * 5 - t * 0.6) + lit * 0.05);
      const px = S.x + Math.cos(th) * rr, py = S.y + Math.sin(th) * rr;
      if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    const bg = ctx.createRadialGradient(S.x - 8, S.y - 10, 2, S.x, S.y, S.r * 1.1);
    bg.addColorStop(0, 'rgba(255,' + ((215 + lit * 30) | 0) + ',' + ((130 + lit * 80) | 0) + ',' + (0.55 + lit * 0.45) + ')');
    bg.addColorStop(0.6, 'rgba(' + ((150 + lit * 90) | 0) + ',' + ((110 + lit * 70) | 0) + ',25,' + (0.5 + lit * 0.4) + ')');
    bg.addColorStop(1, 'rgba(60,42,8,.85)');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,138,' + (0.45 + lit * 0.5) + ')'; ctx.lineWidth = 2; ctx.stroke();
    glow(ctx, S.x + 4, S.y + 2, 12, 'rgba(255,250,230,' + (0.35 + lit * 0.6) + ')', 'rgba(255,224,138,0)');

    for (let r = ripples.length - 1; r >= 0; r--) {
      const rp = ripples[r];
      rp.t += dt;
      if (rp.t > 1) { ripples.splice(r, 1); continue; }
      ctx.strokeStyle = 'rgba(160,200,255,' + (1 - rp.t) * 0.7 + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + rp.t * 34, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  createLoop(cv, { draw });

  const api: GenericNeuronApi = {
    tip() {
      const r = cv.getBoundingClientRect(), t = defs[0].tip;
      return { x: r.left + view.ox + t[0] * view.s, y: r.top + view.oy + t[1] * view.s };
    },
  };
  (window as unknown as { __neuronTip?: () => { x: number; y: number } }).__neuronTip = api.tip;

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - view.ox) / view.s, y = (e.clientY - r.top - view.oy) / view.s;
    let best = 0, bd = 1e9;
    defs.forEach((d, i) => {
      for (let k = 0; k < d.pts.length; k += 3) {
        const dx = d.pts[k][0] - x, dy = d.pts[k][1] - y, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
    });
    ripples.push({ x, y, t: 0 });
    addSignal(best);
    signals[signals.length - 1].s = 0.8;
    auto = 1.2;
  });
  return api;
}
