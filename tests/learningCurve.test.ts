import { describe, expect, it } from 'vitest';
import { CURVE_LIMITS, CurveHistory, checkCurve, curvePoints, plateau, type PlateauParams } from '../src/viz/learningCurve';
import { PLATEAU, Session } from '../src/data/snake';
import { axisStep } from '../src/components/ui/LearningCurve';
import { mulberry32 } from '../src/viz/core/rng';

const P: PlateauParams = { ...PLATEAU };
/** Una serie con ruido de ±n (determinista) alrededor de una función de la partida. */
const noisy = (n: number, f: (i: number) => number, amp = 4, seed = 3): number[] => { const r = mulberry32(seed); return Array.from({ length: n }, (_, i) => Math.max(0, f(i) + (r() - 0.5) * 2 * amp)); };

describe('meseta (regla única de todas las pantallas)', () => {
  it('subiendo todavía: no hay meseta', () => {
    const v = noisy(300, (i) => i * 0.1); // +5 cada 50 partidas, ruido ±4
    const p = plateau(v, 0, P);
    expect(p).not.toBeNull(); expect(p!.flat).toBe(false); expect(p!.gain).toBeGreaterThan(p!.threshold);
  });
  it('plana tras subir: hay meseta y la franja empieza donde se aplana', () => {
    const v = noisy(400, (i) => Math.min(i, 120) * 0.15);
    const p = plateau(v, 0, P)!;
    expect(p.flat).toBe(true); expect(Math.abs(p.gain)).toBeLessThan(p.threshold);
    expect(p.from).toBeGreaterThanOrEqual(100); expect(p.from).toBeLessThanOrEqual(400 - P.window + 1);
    expect(p.level).toBeGreaterThan(14); expect(p.level).toBeLessThan(22);
  });
  it('en la fase del dado ε y antes de 150 partidas no se dice nada (null: no se sabe)', () => {
    expect(plateau(noisy(149, () => 5), 0, P)).toBeNull();
    expect(plateau(noisy(60, () => 5), 0, P)).toBeNull();
    // 150 partidas, pero solo 80 cuentan (las 70 primeras son ε): no caben dos tramos de 50
    expect(plateau(noisy(150, () => 5), 0, P)).toBeNull();
    expect(plateau(noisy(170, () => 5), 0, P)).not.toBeNull();
    // `first`: si solo se tienen las sueltas, las de dentro del skip tampoco cuentan
    expect(plateau(noisy(100, () => 5), 100, { ...P, minGames: 150 })).not.toBeNull();
  });
  it('si la media baja también es «ya no mejora»; con better:down, bajar es mejorar', () => {
    const down = noisy(300, (i) => 30 - Math.min(i, 150) * 0.1);
    expect(plateau(down, 0, P)!.flat).toBe(true);
    const err = noisy(40, (i) => 1 - i * 0.02, 0.01);
    expect(plateau(err, 0, { window: 5, minGames: 15, skip: 0, minGain: 0.01, k: 0.4, better: 'down' })!.flat).toBe(false);
    const err2 = noisy(40, (i) => 0.1 + 0.9 / (1 + i * 3), 0.003);
    expect(plateau(err2, 0, { window: 5, minGames: 15, skip: 0, minGain: 0.01, k: 0.4, better: 'down' })!.flat).toBe(true);
  });
  it('la mejora tiene que superar el ruido: una serie muy ruidosa con una subida pequeña cuenta como plana', () => {
    const v = noisy(300, (i) => 10 + i * 0.004, 9);
    expect(plateau(v, 0, P)!.flat).toBe(true);
  });
  it('si vuelve a mejorar, la marca se va', () => {
    const v = noisy(500, (i) => i < 250 ? Math.min(i, 100) * 0.15 : 15 + (i - 250) * 0.15);
    expect(plateau(v.slice(0, 250), 0, P)!.flat).toBe(true);
    expect(plateau(v, 0, P)!.flat).toBe(false);
  });
  it('con una red de verdad (Snake, ojos): rápido no hay meseta en las primeras partidas y hay datos desde la 150', () => {
    const s = new Session(2); s.playGames(149);
    expect(plateau(s.curve.recent, s.curve.total - s.curve.recent.length, PLATEAU)).toBeNull();
    s.playGames(60);
    expect(plateau(s.curve.recent, s.curve.total - s.curve.recent.length, PLATEAU)).not.toBeNull();
  });
});

describe('historial acotado: plegar no cambia el total ni la media', () => {
  it('con más de 620 intentos se pliegan en cubos de 20 y el total, la suma y la media son exactos', () => {
    const h = new CurveHistory(), v = noisy(2000, (i) => (i % 37) * 0.5, 6, 8).map((x) => Math.round(x));
    v.forEach((x) => h.add(x));
    expect(h.total).toBe(2000);
    expect(h.recent.length).toBeLessThanOrEqual(CURVE_LIMITS.keep + CURVE_LIMITS.bucket - 1);
    expect(h.old.length).toBeGreaterThan(0); expect(h.folded + h.recent.length).toBe(2000);
    expect(h.sum).toBe(v.reduce((s, x) => s + x, 0)); expect(h.mean).toBeCloseTo(v.reduce((s, x) => s + x, 0) / 2000, 12);
    // cada cubo: su mínimo y su máximo son los de verdad
    let at = 0; for (const b of h.old) { const seg = v.slice(at, at + b.n); expect(b.min).toBe(Math.min(...seg)); expect(b.max).toBe(Math.max(...seg)); expect(b.sum).toBe(seg.reduce((s, x) => s + x, 0)); at += b.n; }
    expect(h.recent).toEqual(v.slice(at));
  });
  it('pasado el máximo de cubos se funden los más antiguos y sigue sin perder nada', () => {
    const h = new CurveHistory({ keep: 40, bucket: 10, maxBuckets: 6 }), v = noisy(500, (i) => i % 11, 3, 5).map((x) => Math.round(x));
    v.forEach((x) => h.add(x));
    expect(h.old.length).toBeLessThanOrEqual(6); expect(h.total).toBe(500);
    expect(h.sum).toBe(v.reduce((s, x) => s + x, 0));
    expect(Math.min(...h.old.map((b) => b.min))).toBe(Math.min(...v.slice(0, h.folded)));
    expect(Math.max(...h.old.map((b) => b.max))).toBe(Math.max(...v.slice(0, h.folded)));
    expect(h.old[0].n).toBeGreaterThan(10); // el más viejo cubre más
  });
  it('la curva dibujada es honesta tras plegar: la media móvil de los cubos es la media de sus partidas', () => {
    const h = new CurveHistory(), v = Array.from({ length: 1000 }, (_, i) => (i < 400 ? 5 : 20));
    v.forEach((x) => h.add(x));
    const pts = curvePoints(h, 20);
    expect(pts.buckets.every((b) => b.min <= b.mean && b.mean <= b.max)).toBe(true);
    expect(pts.buckets[0].mean).toBe(5); expect(pts.line[0].y).toBe(5);
    expect(pts.line[pts.line.length - 1].y).toBe(20); expect(pts.line[pts.line.length - 1].x).toBe(1000);
    expect(pts.raw.length).toBe(h.recent.length); expect(pts.raw[0].x).toBe(h.folded + 1);
  });
  it('JSON de ida y vuelta (el mismo estado) y comprobaciones', () => {
    const h = new CurveHistory(); for (let i = 0; i < 900; i++) h.add(i % 9);
    const j = JSON.parse(JSON.stringify(h.toJSON())), g = new CurveHistory(); g.load(j);
    expect(g.toJSON()).toEqual(h.toJSON()); expect(g.mean).toBe(h.mean);
    for (const bad of [null, { total: 5, old: [], recent: [1, 2] }, { total: 2, old: [], recent: [1, 'a'] }, { total: 2, old: [[1, 5, 4, 3]], recent: [1] }, { total: 1, old: 3, recent: [1] }]) {
      expect(() => checkCurve(bad)).toThrow(/no es válido/);
      expect(() => g.load(bad)).toThrow();
    }
    expect(g.toJSON()).toEqual(h.toJSON()); // un archivo roto no deja nada a medias
  });
  it('seed: arranca de unos valores y sigue desde ahí', () => {
    const h = new CurveHistory(); h.seed([1, 2, 3]); expect(h.total).toBe(3); h.add(4); expect(h.recent).toEqual([1, 2, 3, 4]);
  });
});

describe('eje x', () => {
  it('marcas redondas con aire entre ellas', () => {
    expect(axisStep(60, 259)).toBe(10); expect(axisStep(250, 259)).toBe(50); expect(axisStep(500, 259)).toBe(100); expect(axisStep(1000, 259)).toBe(200);
  });
});

// ---------- cada pantalla: los datos salen del modelo real y la meseta se detecta con SU regla ----------
import { ALL, EPOCHS as E_ENS, LR as LR_ENS, PLATEAU as PL_ENS, labelOf as lab_ens, newNeuron, passError as passErr_ens } from '../src/data/ensenale';
import { EPOCHS as E_EQ, PLATEAU as PL_EQ, TRAIN, labelOf as lab_eq, newTeam, passError as passErr_eq, trainPass } from '../src/data/equipo';
import { PLATEAU as PL_PAL, RULES, caught, finalDrop, newBlockState, newModel, nextJourney, predictX, review, type Drop, type Prev } from '../src/data/paleta';

describe('Enséñale: error por repaso de la neurona real', () => {
  it('el error es el cuadrático medio de predict() frente a la etiqueta, y baja con los repasos', () => {
    const n = newNeuron(), set = ALL.slice(0, 13), errs: number[] = [];
    const e0 = passErr_ens(n, set);
    expect(e0).toBeCloseTo(set.reduce((s, c) => s + (n.predict(c) - lab_ens(c)) ** 2, 0) / 13, 12);
    for (let e = 0; e < E_ENS; e++) { set.forEach((c) => n.train(c, lab_ens(c), LR_ENS)); errs.push(passErr_ens(n, set)); }
    expect(errs[errs.length - 1]).toBeLessThan(e0); expect(errs[39]).toBeLessThan(errs[4]);
  });
  it('con 2 ejemplos se aplana (meseta); con 13 sigue bajando a los 40 repasos (no se dice que no mejora)', () => {
    const run = (k: number): number[] => { const n = newNeuron(), set = ALL.slice(0, k), o: number[] = []; for (let e = 0; e < E_ENS; e++) { set.forEach((c) => n.train(c, lab_ens(c), LR_ENS)); o.push(passErr_ens(n, set)); } return o; };
    expect(plateau(run(2), 0, PL_ENS)!.flat).toBe(true);
    expect(plateau(run(13), 0, PL_ENS)!.flat).toBe(false);
    expect(plateau(run(13).slice(0, 14), 0, PL_ENS)).toBeNull();   // antes del repaso 15 no se dice nada
  });
});

describe('Equipo: error por repaso del equipo real', () => {
  const run = (k: number, passes = E_EQ): number[] => { const net = newTeam(k), o: number[] = []; for (let e = 0; e < passes; e++) { trainPass(net); o.push(passErr_eq(net)); } return o; };
  it('el error es el cuadrático medio de predict() en los 60 colores', () => {
    const net = newTeam(2); trainPass(net);
    expect(passErr_eq(net)).toBeCloseTo(TRAIN.reduce((s, c) => s + (net.predict(c)[0] - lab_eq(c)) ** 2, 0) / TRAIN.length, 12);
  });
  it('la neurona sola se queda en ~0,22 y se aplana enseguida; con 2 neuronas sigue bajando a los 60 repasos y se aplana hacia los 200', () => {
    const e1 = run(1), e2 = run(2);
    expect(e1[199]).toBeGreaterThan(0.2); expect(plateau(e1, 0, PL_EQ)!.flat).toBe(true); expect(plateau(e1.slice(0, 39), 0, PL_EQ)).toBeNull();
    expect(e2[199]).toBeLessThan(0.01);
    expect(plateau(e2.slice(0, 60), 0, PL_EQ)!.flat).toBe(false);
    expect(plateau(e2, 0, PL_EQ)!.flat).toBe(true);
  });
});

describe('Paleta: bolas atrapadas con la neurona real (mismo bucle que la pantalla)', () => {
  /** Lanza `n` bolas como la pantalla (repaso cada 10) y devuelve 1/0 de cada una. */
  function balls(walls: boolean, n: number): number[] {
    const net = newModel('solo'), saved: Drop[] = [], out: number[] = [], rules = { ...RULES, walls };
    let carry: Prev | null = null, since = 0; const bs = newBlockState(false);
    for (let i = 0; i < n; i++) {
      const j = nextJourney(saved.length, carry, rules, bs.block), d = finalDrop(j), pred = predictX(net, d), ok = caught(pred, d.land);
      saved.push(d); out.push(ok ? 1 : 0); since++;
      if (since >= 10) { since = 0; review(net, saved, 'solo'); }
    }
    return out;
  }
  it('sin paredes aprende y se queda arriba: meseta; el % es el de las bolas de verdad', () => {
    const v = balls(false, 250), p = plateau(v, 0, PL_PAL)!;
    expect(p.flat).toBe(true); expect(p.level).toBeGreaterThan(0.85);
    expect(v.slice(0, 20).reduce((s, x) => s + x, 0)).toBeLessThan(v.slice(-20).reduce((s, x) => s + x, 0));
  });
  it('antes de 100 bolas no se dice nada; con paredes la neurona sola se queda baja (meseta baja)', () => {
    const v = balls(true, 250);
    expect(plateau(v.slice(0, 99), 0, PL_PAL)).toBeNull();
    const p = plateau(v, 0, PL_PAL)!; expect(p.level).toBeLessThan(0.6);
  });
});
