import { describe, expect, it } from 'vitest';
import { linear, sigmoid, tanh } from '@dniskav/neuron';
import {
  BLOCK_H, BLOCK_LABEL, BLOCK_W, BOUNCE_ERR, DEFAULT_CONFIG, HW, RULES, THETA_MAX, blockAt, blockBox, blockExplain, caught, dropAt, drops, evaluate, examples, feats, finalDrop, looks, makeDrop, newBlockState, newModel, nextJourney, paddleAt, passesFor,
  playDrops, predictX, refill, restart, returned, review, reviewChunk, testDrop, testExample, trainOne,
  contExplain, rulesOf, wallsExplain, CONT_LABEL, WALLS_LABEL,
  type Block, type Drop, type Kind, type Prev, type Rules,
} from '../src/data/paleta';
import { WINDOW, buildScript, runAuto, type AutoApi, type AutoCtx } from '../src/data/paletaAuto';
import { TEAM, boundExplain, curveExplain, teamActNames, type Team } from '../src/data/paleta';
import { brainText, newPaletaCodeState, rawText, verdictOf } from '../src/data/paletaCode';
import { mulberry32 } from '../src/viz/core/rng';

const trained = (kind: Kind, walls: boolean, n: number, batch: number): { net: ReturnType<typeof newModel>; saved: Drop[]; pct: number } => {
  const net = newModel(kind), saved: Drop[] = [];
  playDrops(net, kind, walls, saved, n, batch);
  return { net, saved, pct: evaluate(net, walls) };
};

describe('Paleta: la física es determinista y coherente', () => {
  it('la caída número k es siempre la misma, y distinta de la k+1', () => {
    expect(dropAt(3, false)).toEqual(dropAt(3, false));
    expect(dropAt(3, true)).toEqual(dropAt(3, true));
    expect(dropAt(3, false)).not.toEqual(dropAt(4, false));
    expect(testDrop(0, true)).not.toEqual(dropAt(0, true));
  });
  it('sin paredes la bola no toca los lados y cae en x + inclinación (lo que una neurona puede aprender)', () => {
    for (let k = 0; k < 300; k++) {
      const d = dropAt(k, false);
      expect(d.bounces).toBe(0);
      expect(d.path).toHaveLength(2);
      expect(d.land).toBeGreaterThanOrEqual(0); expect(d.land).toBeLessThanOrEqual(1);
      expect(d.land).toBeCloseTo(d.x + d.slope, 12);
      expect(Math.abs(Math.atan(d.slope)) * 180 / Math.PI).toBeLessThanOrEqual(THETA_MAX + 1e-9);
    }
  });
  it('con paredes hay rebotes; el camino empieza arriba, acaba en la línea y cada rebote toca una pared', () => {
    let rebotes = 0;
    for (let k = 0; k < 300; k++) {
      const d = dropAt(k, true);
      rebotes += d.bounces > 0 ? 1 : 0;
      expect(d.path[0]).toEqual([d.x, 1]);
      expect(d.path[d.path.length - 1][1]).toBe(0);
      expect(d.path[d.path.length - 1][0]).toBe(d.land);
      expect(d.path).toHaveLength(d.bounces + 2);
      d.path.slice(1, -1).forEach((p) => { expect([0, 1]).toContain(p[0]); expect(p[1]).toBeGreaterThan(0); expect(p[1]).toBeLessThan(1); });
      for (let i = 1; i < d.path.length; i++) expect(d.path[i][1]).toBeLessThanOrEqual(d.path[i - 1][1]);
      expect(d.land).toBeGreaterThanOrEqual(0); expect(d.land).toBeLessThanOrEqual(1);
    }
    expect(rebotes).toBeGreaterThan(60);
  });
  it('sin error de rebote, la caída es el «espejo» exacto de x + inclinación', () => {
    const r = mulberry32(5);
    const save = BOUNCE_ERR; void save;
    for (let k = 0; k < 200; k++) {
      const d = makeDrop(r, true);
      if (d.bounces === 0) { expect(d.land).toBeCloseTo(d.x + d.slope, 12); continue; }
      // con error de ±5° por rebote, el espejo ideal se desvía poco: a lo sumo 2·tan(BOUNCE_ERR) por rebote (≈0,175; medido ≈0,15)
      const u = d.x + d.slope, m = ((u % 2) + 2) % 2, ideal = m <= 1 ? m : 2 - m;
      expect(Math.abs(d.land - ideal)).toBeLessThan(2 * Math.tan(BOUNCE_ERR * D2R) * d.bounces + 1e-9);
    }
  });
  it('la paleta va a la predicción y se para; atrapa si cae a menos de medio ancho', () => {
    expect(paddleAt(0.5)).toBe(0.5);
    expect(paddleAt(-3)).toBe(HW); expect(paddleAt(7)).toBe(1 - HW);
    expect(caught(0.5, 0.5 + HW - 1e-9)).toBe(true);
    expect(caught(0.5, 0.5 + HW + 1e-3)).toBe(false);
    expect(caught(0.01, 0.15)).toBe(true);   // la paleta no se sale del campo, así que cubre hasta 0.2
  });
});

describe('Paleta: el par de entrenamiento es el correcto', () => {
  it('lo que ve es [dónde está, inclinación, altura] y lo que se aprende es dónde cayó de verdad', () => {
    const d = dropAt(0, true);
    expect(feats(d)).toEqual([d.x, d.slope, 1]);   // dónde está, inclinación y altura (1 = el techo)
    const net = newModel('solo'), before = Math.abs(predictX(net, d) - d.land);
    for (let i = 0; i < 400; i++) trainOne(net, d, 0.01);
    expect(Math.abs(predictX(net, d) - d.land)).toBeLessThan(before);
    expect(Math.abs(predictX(net, d) - d.land)).toBeLessThan(0.02);
  });
  it('playDrops guarda exactamente la caída lanzada, en orden, y no etiqueta nada a mano', () => {
    const net = newModel('solo'), saved: Drop[] = [];
    playDrops(net, 'solo', false, saved, 7, 1);
    expect(saved).toHaveLength(7);
    saved.forEach((d, k) => expect(d).toEqual(dropAt(k, false)));
  });
  it('el repaso es determinista y recorre TODAS las caídas guardadas', () => {
    const a = trained('solo', false, 15, 5), b = trained('solo', false, 15, 5);
    expect(a.net.getWeights()).toEqual(b.net.getWeights());
    const n = newModel('solo'); const w0 = n.getWeights().slice();
    expect(reviewChunk(n, a.saved, 'solo', 3, 0)).toBe(3 * 15);
    expect(n.getWeights()).not.toEqual(w0);
    expect(passesFor('equipo', 300)).toBe(100); expect(passesFor('equipo', 3000)).toBe(10); expect(passesFor('solo', 10)).toBe(20);
  });
  it('la red nace siempre con los mismos pesos', () => {
    expect(newModel('solo').getWeights()).toEqual(newModel('solo').getWeights());
    expect(newModel('equipo').getWeights()).toEqual(newModel('equipo').getWeights());
    expect(newModel('equipo').getWeights()).toHaveLength(8 * 4 + 9);
    expect(newModel('solo').getWeights()).toHaveLength(4);
  });
});

describe('Paleta: lo que aprende de verdad', () => {
  it('sin paredes, una neurona sola atrapa ≥ 90 % con pocas caídas y ve bolas que nunca vio', () => {
    expect(trained('solo', false, 20, 1).pct).toBeGreaterThanOrEqual(90);
    expect(trained('solo', false, 30, 10).pct).toBeGreaterThanOrEqual(90);
    expect(trained('solo', false, 50, 10).pct).toBeGreaterThanOrEqual(90);
  });
  it('sin saber nada atrapa poco', () => {
    expect(evaluate(newModel('solo'), false)).toBeLessThan(60);
  });
  it('descubre la regla: casi 1 para dónde está, casi 1 para la inclinación; la altura (siempre 1 aquí) y el ajuste suman casi 0', () => {
    const w = trained('solo', false, 50, 10).net.getWeights();
    expect(w[0]).toBeGreaterThan(0.9); expect(w[0]).toBeLessThan(1.1);
    expect(w[1]).toBeGreaterThan(0.9); expect(w[1]).toBeLessThan(1.1);
    expect(Math.abs(w[2] + w[3])).toBeLessThan(0.1);   // [x, inclinación, altura, ajuste]: sin bloque la altura vale siempre 1, así que cuenta junto al ajuste
  });
  it('con paredes la neurona sola falla, por muchas caídas que repase', () => {
    expect(trained('solo', true, 30, 1).pct).toBeLessThan(45);
    expect(trained('solo', true, 100, 10).pct).toBeLessThan(45);
  });
  it('con paredes un equipo [3, 8, 1] atrapa ≥ 85 % con 100 caídas, y con 300 todavía mejor', () => {
    expect(trained('equipo', true, 100, 10).pct).toBeGreaterThanOrEqual(85);
    expect(trained('equipo', true, 300, 100).pct).toBeGreaterThanOrEqual(85);
    expect(trained('equipo', true, 300, 10).pct).toBeGreaterThanOrEqual(90);
  });
  it('cerebro y paredes son independientes: las 4 combinaciones, siempre con red nueva y vacía', () => {
    expect(trained('equipo', false, 100, 10).pct).toBeGreaterThanOrEqual(85);   // equipo desde cero, sin paredes
    expect(trained('equipo', true, 100, 10).pct).toBeGreaterThanOrEqual(85);
    expect(trained('solo', false, 30, 10).pct).toBeGreaterThanOrEqual(90);
    expect(trained('solo', true, 100, 10).pct).toBeLessThan(45);
    // cambiar de cerebro = red nueva: nace con sus pesos de siempre, sin nada aprendido
    ['solo', 'equipo'].forEach((k) => {
      const fresh = newModel(k as Kind), again = newModel(k as Kind);
      expect(fresh.getWeights()).toEqual(again.getWeights());
      expect(evaluate(fresh, false)).toBeLessThan(85);
    });
  });
  it('es reproducible: dos ejecuciones dan el mismo porcentaje', () => {
    expect(trained('equipo', true, 100, 10).pct).toBe(trained('equipo', true, 100, 10).pct);
  });
  it('review() deja a la red igual que sus tandas por separado (misma semilla de orden)', () => {
    const { saved } = trained('solo', false, 12, 12);
    const a = newModel('solo'), b = newModel('solo');
    review(a, saved, 'solo'); reviewChunk(b, saved, 'solo', passesFor('solo', 12), 0);
    expect(a.getWeights()).toEqual(b.getWeights());
  });
});

describe('Paleta: los dos interruptores del equipo', () => {
  const combos: Team[] = [{ curve: true, bounded: true }, { curve: true, bounded: false }, { curve: false, bounded: true }, { curve: false, bounded: false }];
  it('cada combinación crea la red [2, 8, 1] con las activaciones correctas', () => {
    combos.forEach((t) => {
      const net = newModel('equipo', t), names = teamActNames(t);
      expect(net.structure).toEqual([3, 8, 1]);
      expect(names).toEqual([t.curve ? 'tanh' : 'linear', t.bounded ? 'sigmoid' : 'linear']);
      const act = (i: number): unknown => net.layers[i].neurons[0].activation;
      expect(act(0)).toBe(t.curve ? tanh : linear);
      expect(act(1)).toBe(t.bounded ? sigmoid : linear);
      expect(net.getWeights()).toEqual(newModel('equipo', t).getWeights());   // red nueva, siempre los mismos pesos de inicio
    });
    expect(newModel('equipo').layers[0].neurons[0].activation).toBe(tanh);      // por defecto: como antes
  });
  it('el código y el panel muestran las activaciones reales en uso', () => {
    combos.forEach((t) => {
      const cs = newPaletaCodeState(); cs.kind = 'equipo'; cs.team = t;
      const code = rawText(cs), [a, b] = teamActNames(t);
      expect(code).toContain('activations: [' + a + ', ' + b + ']');
      expect(code).toContain('import { NetworkN, Adam, ' + (a === b ? a : a + ', ' + b));
      const fl = newModel('equipo', t).getWeights();
      expect(brainText('equipo', fl, verdictOf('equipo', fl, t), false, t)).toContain('activations: [' + a + ', ' + b + ']');
    });
  });
  it('sin curva y con paredes acierta claramente menos que con curva (y sin paredes una recta basta)', () => {
    const run = (t: Team, walls: boolean): number => { const net = newModel('equipo', t), s: Drop[] = []; playDrops(net, 'equipo', walls, s, 300, 10); return evaluate(net, walls); };
    const withCurve = run({ curve: true, bounded: true }, true), noCurve = run({ curve: false, bounded: true }, true), noCurveLin = run({ curve: false, bounded: false }, true);
    expect(withCurve).toBeGreaterThanOrEqual(90);
    expect(noCurve).toBeLessThan(45); expect(noCurveLin).toBeLessThan(45);
    expect(withCurve - noCurve).toBeGreaterThan(40);
    expect(run({ curve: false, bounded: true }, false)).toBeGreaterThanOrEqual(90);
    expect(run({ curve: true, bounded: false }, true)).toBeGreaterThanOrEqual(90);   // salida sin límite: casi igual
  });
  it('las explicaciones cambian con el estado', () => {
    expect(curveExplain(true, true)).not.toBe(curveExplain(false, true));
    expect(curveExplain(false, true)).not.toBe(curveExplain(false, false));
    expect(boundExplain(true)).not.toBe(boundExplain(false));
    expect(curveExplain(false, true)).toContain('con paredes falla');
  });
});

const ALL_RULES: Rules[] = [];
for (const walls of [false, true]) for (const ceiling of [true, false]) for (const rebound of [false, true]) ALL_RULES.push({ walls, ceiling, rebound });
const prevAt = (land: number, paddleX: number, ok = true): Prev => ({ d: { x: 0.5, y: 1, slope: 0, land, path: [[0.5, 1], [land, 0]], bounces: 0, cut: false }, paddleX, ok });
/** El viaje de siempre (sin bloque) visto como antes: la bajada que cuenta y el vuelo desde la paleta (si lo hay). */
const nextDrop = (k: number, prev: Prev | null, r: Rules): { d: Drop; flight: { path: [number, number][]; joins: boolean; exit: 'top' | 'side' | null } | null } => {
  const j = nextJourney(k, prev, r), f = j.parts[0];
  return { d: finalDrop(j), flight: f.kind === 'fly' ? { path: f.path, joins: j.parts.length > 1 && f.exit === null, exit: f.exit } : null };
};
const D2R = Math.PI / 180;

describe('Paleta: techo y rebote en la paleta', () => {
  it('sin rebote, o si la paleta falla, la siguiente es siempre una bola nueva desde el techo (como antes)', () => {
    ALL_RULES.filter((r) => !r.rebound).forEach((r) => expect(nextDrop(5, prevAt(0.5, 0.5), r)).toEqual({ d: dropAt(5, r.walls), flight: null }));
    expect(nextDrop(5, prevAt(0.9, 0.5, false), { walls: false, ceiling: true, rebound: true })).toEqual({ d: dropAt(5, false), flight: null });
    expect(nextJourney(5, prevAt(0.9, 0.5, false), { walls: false, ceiling: true, rebound: true, block: false }, blockAt(0))).toEqual(nextJourney(5, null, RULES));   // sin la regla «bloque», un bloque dado no existe
    expect(nextDrop(0, null, { walls: true, ceiling: true, rebound: true })).toEqual({ d: dropAt(0, true), flight: null });
  });
  it('es determinista: la misma bola, paleta y reglas dan siempre la misma siguiente', () => {
    const r: Rules = { walls: true, ceiling: true, rebound: true };
    expect(nextDrop(9, prevAt(0.4, 0.45), r)).toEqual(nextDrop(9, prevAt(0.4, 0.45), r));
    expect(nextDrop(9, prevAt(0.4, 0.45), r)).not.toEqual(nextDrop(10, prevAt(0.4, 0.45), r));
  });
  it('el ángulo de salida depende de dónde pega en la paleta (estilo Arkanoid, con el error de ±5°)', () => {
    const r: Rules = { walls: true, ceiling: true, rebound: true }, tol = Math.tan(BOUNCE_ERR * D2R) + 1e-9;
    for (let k = 0; k < 50; k++) {
      const c = nextDrop(k, prevAt(0.5, 0.5), r).flight!.path, right = nextDrop(k, prevAt(0.5 + HW, 0.5), r).flight!.path, left = nextDrop(k, prevAt(0.5 - HW, 0.5), r).flight!.path;
      expect(Math.abs(c[1][0] - c[0][0]) / Math.abs(c[1][1] - c[0][1])).toBeLessThanOrEqual(tol);   // en el centro sube casi recta
      expect(right[1][0]).toBeGreaterThan(right[0][0]);   // pega a la derecha: sale hacia la derecha
      expect(left[1][0]).toBeLessThan(left[0][0]);
    }
  });
  it('con techo la bola rebota arriba y vuelve a bajar: la nueva bajada empieza a la altura del techo, donde acabó el vuelo', () => {
    let joined = 0;
    for (let k = 0; k < 200; k++) {
      const n = nextDrop(k, prevAt(0.3 + (k % 5) * 0.08, 0.3 + (k % 5) * 0.08 + (((k % 7) - 3) / 3) * HW), { walls: true, ceiling: true, rebound: true });
      expect(n.flight).not.toBeNull();
      if (!n.flight!.joins) continue;
      joined++;
      const end = n.flight!.path[n.flight!.path.length - 1];
      expect(end[1]).toBe(1); expect(n.d.path[0]).toEqual([end[0], 1]); expect(n.d.x).toBe(end[0]);
    }
    expect(joined).toBe(200);   // con paredes y techo nunca se pierde
  });
  it('sin techo la bola que sube sale por arriba y se lanza una bola nueva', () => {
    const n = nextDrop(7, prevAt(0.5, 0.5), { walls: true, ceiling: false, rebound: true });
    expect(n.flight!.exit).toBe('top'); expect(n.flight!.joins).toBe(false);
    expect(n.flight!.path[n.flight!.path.length - 1][1]).toBe(1);
    expect(n.d).toEqual(dropAt(7, true));
  });
  it('sin paredes la bola devuelta puede salirse por un lado: se pierde y se lanza una nueva', () => {
    const n = nextDrop(3, prevAt(0.1, 0.1 + HW), { walls: false, ceiling: true, rebound: true });   // pega en el borde izquierdo: sale a 50° hacia fuera
    expect(n.flight!.exit).toBe('side'); expect(n.flight!.joins).toBe(false);
    expect([0, 1]).toContain(n.flight!.path[n.flight!.path.length - 1][0]);
    expect(n.d).toEqual(dropAt(3, false));
  });
  it('en CUALQUIER combinación toda bajada es un par válido: empieza a la altura del techo y x + inclinación explica dónde cae', () => {
    ALL_RULES.forEach((r) => {
      const net = newModel('solo'), saved: Drop[] = [];
      const out = playDrops(net, 'solo', r, saved, 400, 10);
      expect(saved).toHaveLength(400);
      if (r.rebound && r.ceiling) expect(out.rebounded).toBeGreaterThan(40);
      saved.forEach((d) => {
        expect(d.path[0]).toEqual([d.x, 1]);   // empieza en el techo: la neurona la ve siempre en el mismo momento
        expect(d.path[d.path.length - 1]).toEqual([d.land, 0]);
        expect(d.land).toBeGreaterThanOrEqual(0); expect(d.land).toBeLessThanOrEqual(1);
        expect(Number.isFinite(d.slope)).toBe(true); expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.atan(d.slope)) / D2R).toBeLessThanOrEqual(80 + 1e-9);   // cada rebote en pared suma ±5° y el ángulo se limita a 80°
        if (!r.walls) { expect(d.bounces).toBe(0); expect(d.land).toBeCloseTo(d.x + d.slope, 12); }
        else { const u = d.x + d.slope, m = ((u % 2) + 2) % 2, ideal = m <= 1 ? m : 2 - m; expect(Math.abs(d.land - ideal)).toBeLessThan(2 * Math.tan(BOUNCE_ERR * D2R) * d.bounces + 1e-9); }
      });
    });
  });
  it('ninguna combinación rompe el aprendizaje: los % siguen siendo los de siempre', () => {
    const run = (kind: Kind, r: Rules, n: number): number => { const net = newModel(kind), s: Drop[] = []; playDrops(net, kind, r, s, n, 10); return evaluate(net, r.walls); };
    ALL_RULES.forEach((r) => {
      expect(run('solo', { ...r, walls: false }, 50)).toBeGreaterThanOrEqual(90);
      expect(run('solo', { ...r, walls: true }, 100)).toBeLessThan(45);
      if (r.rebound) expect(run('equipo', { ...r, walls: true }, 300)).toBeGreaterThanOrEqual(90);
    });
    // y la bola devuelta no estropea a la que está aprendiendo: con rebote, techo y paredes casi igual que sin rebote
    const base = run('equipo', { walls: true, ceiling: true, rebound: false }, 300), reb = run('equipo', { walls: true, ceiling: true, rebound: true }, 300);
    expect(Math.abs(base - reb)).toBeLessThanOrEqual(5);
  }, 120000);
  it('cada caída sigue contando: la tira y el contador salen de todas las bajadas, también las rebotadas', () => {
    const net = newModel('equipo'), saved: Drop[] = [];
    const a = playDrops(net, 'equipo', { walls: false, ceiling: true, rebound: true }, saved, 60, 10);
    expect(saved).toHaveLength(60); expect(a.ok).toBeLessThanOrEqual(60); expect(a.rebounded).toBeGreaterThan(0);
    const b = playDrops(net, 'equipo', { walls: false, ceiling: true, rebound: true }, saved, 40, 10, a.prev);   // sigue la partida
    expect(saved).toHaveLength(100); expect(b.ok).toBeLessThanOrEqual(40);
  });
  it('«Empezar de cero» conserva la configuración y solo crea pesos nuevos, sin caídas ni bola en juego', () => {
    const cfg = { kind: 'equipo' as Kind, rules: { walls: true, ceiling: false, rebound: true }, team: { curve: false, bounded: true } };
    const before = newModel(cfg.kind, cfg.team), saved: Drop[] = [];
    playDrops(before, cfg.kind, cfg.rules, saved, 40, 10);
    const w = before.getWeights().slice();
    const r = restart(cfg);
    expect(r.cfg).toEqual(cfg); expect(r.cfg.rules).not.toBe(cfg.rules); expect(r.cfg.team).not.toBe(cfg.team);
    expect(r.saved).toEqual([]); expect(r.prev).toBeNull();
    expect(r.net).not.toBe(before);
    expect(r.net.getWeights()).toEqual(newModel(cfg.kind, cfg.team).getWeights());   // pesos de inicio, sin lo aprendido
    expect(r.net.getWeights()).not.toEqual(w);
    expect(r.net.structure).toEqual([3, 8, 1]);
    expect(r.net.layers[0].neurons[0].activation).toBe(linear);   // sin curva: se conserva
    expect(restart(DEFAULT_CONFIG).cfg).toEqual({ kind: 'solo', rules: RULES, team: TEAM });
    expect(restart({ ...cfg, rules: { ...cfg.rules, block: true } }).cfg.rules.block).toBe(true);   // el bloque también se conserva
  });
  it('una partida continua sigue mientras la paleta atrapa y acaba en la primera que falla; cada bajada es un ejemplo válido', () => {
    const net = newModel('equipo'), warm: Drop[] = [];
    playDrops(net, 'equipo', { walls: true, ceiling: true, rebound: true }, warm, 200, 10);
    const rules = rulesOf(true, true), games: number[] = [];
    for (let g = 0; g < 20; g++) {
      let prev: Prev | null = null, k = 1000 + g * 150, n = 0;
      for (; n < 100; n++) {
        const { d, flight } = nextDrop(k + n, prev, rules);
        expect(d.path[0][1]).toBe(1);   // toda bajada empieza en el techo
        if (n > 0) expect(flight?.joins).toBe(true);   // la partida continúa sin lanzar bola nueva
        const pred = predictX(net, d), ok = caught(pred, d.land);
        prev = { d, paddleX: paddleAt(pred), ok };
        if (!ok) break;
      }
      games.push(n);
    }
    expect(Math.max(...games)).toBeGreaterThan(3);   // una red entrenada devuelve varias seguidas
  });
  it('un solo interruptor «Juego continuo»: mueve techo y rebote a la vez (nunca uno sin el otro)', () => {
    expect(rulesOf(true, true)).toEqual({ walls: true, ceiling: true, rebound: true, block: false });
    expect(rulesOf(false, false)).toEqual({ walls: false, ceiling: false, rebound: false, block: false });
    expect(RULES.ceiling).toBe(RULES.rebound);   // por defecto: apagado, como antes
    expect(RULES.rebound).toBe(false);
  });
  it('rótulos y explicaciones de los interruptores', () => {
    expect(WALLS_LABEL(true)).toBe('Paredes: sí'); expect(CONT_LABEL(false)).toBe('Juego continuo: no'); expect(CONT_LABEL(true)).toBe('Juego continuo: sí');
    expect(wallsExplain(true)).not.toBe(wallsExplain(false)); expect(contExplain(true)).not.toBe(contExplain(false));
    expect(contExplain(true)).toContain('rebota en el techo');
  });
});

const RB = (walls: boolean, ceiling = true, rebound = false): Rules => ({ walls, ceiling, rebound, block: true });
const onBlock = (b: Block, p: [number, number], tol = 1e-9): boolean => { const [x0, x1, y0, y1] = blockBox(b); return p[0] >= x0 - tol && p[0] <= x1 + tol && p[1] >= y0 - tol && p[1] <= y1 + tol; };
const edge = (b: Block, p: [number, number], tol = 1e-9): boolean => { const [x0, x1, y0, y1] = blockBox(b); return onBlock(b, p, tol) && (Math.abs(p[0] - x0) < tol || Math.abs(p[0] - x1) < tol || Math.abs(p[1] - y0) < tol || Math.abs(p[1] - y1) < tol); };

describe('Paleta: el bloque (la red no lo ve)', () => {
  it('los bloques son deterministas, siempre en la mitad de arriba y dentro del campo', () => {
    expect(blockAt(3)).toEqual(blockAt(3)); expect(blockAt(3)).not.toEqual(blockAt(4));
    for (let m = 0; m < 300; m++) {
      const [x0, x1, y0, y1] = blockBox(blockAt(m));
      expect(y0).toBeGreaterThanOrEqual(0.5); expect(y1).toBeLessThanOrEqual(0.96); expect(x0).toBeGreaterThan(0); expect(x1).toBeLessThan(1);
      expect(x1 - x0).toBeCloseTo(BLOCK_W, 12); expect(y1 - y0).toBeCloseTo(BLOCK_H, 12);
    }
  });
  it('refill: solo hay bloque si está activado, y el siguiente es siempre el mismo de la serie', () => {
    const off = newBlockState(false); expect(off.block).toBeNull(); expect(refill(off).block).toBeNull();
    const on = newBlockState(true); expect(on.block).toEqual(blockAt(0));
    const first = on.block; expect(refill(on).block).toBe(first);   // mientras no lo toquen, es el mismo
    on.block = null; expect(refill(on).block).toEqual(blockAt(1));
    expect(newBlockState(true).block).toEqual(blockAt(0));   // «Empezar de cero»: vuelve a empezar la serie
  });
  it('la física con bloque es determinista; sin la regla o sin bloque dado, no cambia nada', () => {
    for (let k = 0; k < 50; k++) {
      const b = blockAt(k);
      expect(nextJourney(k, null, RB(true), b)).toEqual(nextJourney(k, null, RB(true), b));
      expect(nextJourney(k, null, RB(true), null)).toEqual(nextJourney(k, null, { ...RULES, walls: true }));
      expect(nextJourney(k, null, { ...RB(true), block: false }, b)).toEqual(nextJourney(k, null, { ...RULES, walls: true }));
    }
  });
  it('la bola que toca el bloque rebota en su cara (con el error de ±5°) y el bloque desaparece: no vuelve a tocarlo', () => {
    let hits = 0, lados = 0, tapas = 0;
    for (let k = 0; k < 600; k++) {
      const b = blockAt(k), j = nextJourney(k, null, RB(true), b);
      if (!j.hit) { expect(j.parts).toHaveLength(1); continue; }
      hits++;
      expect(edge(b, j.hit, 1e-9)).toBe(true);   // el golpe está en el borde del bloque
      const cut = j.parts.filter((p) => p.kind === 'fall' && p.d.cut);
      expect(cut).toHaveLength(1);   // solo una bajada se corta: tras el golpe no hay bloque
      const c = cut[0] as Extract<(typeof j.parts)[number], { kind: 'fall' }>, i = j.parts.indexOf(c), nxt = j.parts[i + 1];
      expect(c.d.path[c.d.path.length - 1]).toEqual(j.hit);
      const pa = c.d.path[c.d.path.length - 2], pb = c.d.path[c.d.path.length - 1], sIn = (pb[0] - pa[0]) / (pa[1] - pb[1]);   // inclinación con la que llegó al bloque (puede haber rebotado antes en una pared)
      if (nxt.kind === 'fall') {   // cara lateral: sigue bajando, con el ángulo reflejado ±5°
        lados++;
        expect(nxt.d.path[0]).toEqual(j.hit); expect(nxt.d.y).toBeCloseTo(j.hit[1], 12);
        if (Math.abs(Math.atan(sIn)) > 4 * D2R) expect(Math.sign(nxt.d.slope)).toBe(-Math.sign(sIn));
        expect(Math.abs(Math.atan(nxt.d.slope) + Math.atan(sIn)) / D2R).toBeLessThanOrEqual(BOUNCE_ERR + 1e-9);
        expect(nxt.d.y).toBeLessThan(1);
      } else {   // tapa: rebota hacia arriba, con el mismo sentido horizontal
        tapas++;
        expect(nxt.path[0]).toEqual(j.hit); expect(nxt.path[1][1]).toBeGreaterThan(j.hit[1]);
        if (Math.abs(Math.atan(sIn)) > 4 * D2R) expect(Math.sign(nxt.path[1][0] - nxt.path[0][0])).toBe(Math.sign(sIn));   // (casi recta: el error de ±5° puede cambiarle el sentido)
      }
      const fin = finalDrop(j);
      expect(fin.cut).toBe(false); expect(fin.path[fin.path.length - 1][1]).toBe(0);
      j.parts.forEach((p) => { if (p.kind === 'fall' && !p.d.cut && p !== j.parts[j.parts.length - 1]) throw new Error('una bajada que llega abajo solo puede ser la última'); });
    }
    expect(hits).toBeGreaterThan(80); expect(lados).toBeGreaterThan(5); expect(tapas).toBeGreaterThan(5);   // la barra horizontal casi solo se toca por arriba o por abajo: pocas caras laterales (medido: 7 de 173 golpes)
  });
  it('sin paredes, tras el golpe la bola sigue una recta: la altura multiplica la inclinación (x + altura·inclinación)', () => {
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const j = nextJourney(k, null, RB(false), blockAt(k));
      drops(j).filter((d) => !d.cut).forEach((d) => { n++; expect(d.land).toBeCloseTo(d.x + d.y * d.slope, 12); expect(d.bounces).toBe(0); });
    }
    expect(n).toBe(400);
  });
  it('cada vez que la bola EMPIEZA a bajar la red vuelve a mirar y predice de nuevo, con lo que ve entonces', () => {
    const net = newModel('equipo'), seen: number[] = [];
    let found = 0;
    for (let k = 0; k < 200; k++) {
      const j = nextJourney(k, null, RB(true), blockAt(k)), l = looks(net, j), d = drops(j);
      expect(l.map((q) => q.d)).toEqual(d);   // una mirada por bajada, en orden
      l.forEach((q) => expect(q.pred).toBe(predictX(net, q.d)));
      if (d.length >= 2) { found++; expect(feats(d[1])).not.toEqual(feats(d[0])); seen.push(Math.abs(l[1].pred - l[0].pred)); expect(d[1].y).toBeLessThanOrEqual(1); }
    }
    expect(found).toBeGreaterThan(15);
    expect(seen.some((v) => v > 1e-3)).toBe(true);   // la predicción cambia (la «marca» se mueve)
  });
  it('REGLA: solo cuentan como ejemplos las bajadas que llegan a la línea de la paleta sin chocar; la cortada no se guarda', () => {
    const net = newModel('equipo'), saved: Drop[] = [];
    const out = playDrops(net, 'equipo', RB(true, true, true), saved, 300, 10);
    expect(saved).toHaveLength(300);   // un ejemplo por bola
    expect(out.reLooks).toBeGreaterThan(20);   // y hubo rebotes en el bloque que obligaron a volver a mirar
    saved.forEach((d) => { expect(d.cut).toBe(false); expect(d.path[d.path.length - 1]).toEqual([d.land, 0]); expect(d.path[0]).toEqual([d.x, d.y]); expect(d.y).toBeGreaterThanOrEqual(0.5); expect(d.y).toBeLessThanOrEqual(1); });
    expect(saved.some((d) => d.y < 1)).toBe(true);   // bajadas que empezaron más abajo, tras rebotar
    // un viaje con golpe: de sus bajadas solo la última es ejemplo
    const j = [...Array(300).keys()].map((k) => nextJourney(k, null, RB(false), blockAt(k))).find((q) => drops(q).length > 1)!;
    expect(drops(j).length).toBeGreaterThan(examples(j).length);
    expect(examples(j)).toEqual([finalDrop(j)]);
  });
  it('el examen usa la misma lógica: la última bajada de cada bola, con un bloque al azar', () => {
    for (let k = 0; k < 200; k++) {
      const d = testExample(k, { walls: true, ceiling: true, block: true });
      expect(d.cut).toBe(false); expect(d.path[d.path.length - 1][1]).toBe(0);
      expect(testExample(k, { walls: true, ceiling: true, block: true })).toEqual(d);
      expect(testExample(k, { walls: true, ceiling: true, block: false })).toEqual(testDrop(k, true));   // sin bloque, el examen de siempre
    }
    expect([...Array(400).keys()].some((k) => testExample(k, { walls: false, ceiling: true, block: true }).y < 1)).toBe(true);
  });
  it('en cualquier combinación de reglas el viaje es válido: acaba en una bajada que llega abajo, sin cortar', () => {
    for (const walls of [false, true]) for (const ceiling of [false, true]) for (const rebound of [false, true]) {
      const net = newModel('solo'), saved: Drop[] = [], rl: Rules = { walls, ceiling, rebound, block: true };
      const out = playDrops(net, 'solo', rl, saved, 250, 10);
      expect(saved).toHaveLength(250);
      saved.forEach((d) => {
        expect(d.cut).toBe(false); expect(d.path[d.path.length - 1]).toEqual([d.land, 0]); expect(d.land).toBeGreaterThanOrEqual(0); expect(d.land).toBeLessThanOrEqual(1);
        expect(Number.isFinite(d.slope)).toBe(true); expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x).toBeLessThanOrEqual(1);
        if (!walls) expect(d.land).toBeCloseTo(d.x + d.y * d.slope, 10);
      });
      expect(out.ok).toBeLessThanOrEqual(250);
    }
  });
  it('la altura como entrada NO estropea los casos sin bloque (la red es la misma en todos los modos)', () => {
    expect(trained('solo', false, 30, 10).pct).toBeGreaterThanOrEqual(90);
    expect(trained('equipo', true, 300, 10).pct).toBeGreaterThanOrEqual(90);
    expect(trained('solo', true, 100, 10).pct).toBeLessThan(45);
  });
  it('con bloque un equipo acierta casi siempre, también las bolas que bajan desde menos altura; una neurona sola se queda corta en ellas', () => {
    const rl = RB(true, false), low = (net: ReturnType<typeof newModel>, r: Rules): number => {
      let n = 0, ok = 0;
      for (let k = 1000; k < 7000 && n < 300; k++) { const d = testExample(k, r); if (d.y < 1) { n++; if (caught(predictX(net, d), d.land)) ok++; } }
      return ok / n;
    };
    const team = newModel('equipo'), sTeam: Drop[] = []; playDrops(team, 'equipo', rl, sTeam, 300, 10);
    expect(evaluate(team, rl)).toBeGreaterThanOrEqual(90);
    expect(low(team, rl)).toBeGreaterThanOrEqual(0.5);   // con la barra casi no hay bajadas desde menos altura en el modo normal (medido ≈0,55 con ~120 bolas); antes el umbral era 0,8 con el poste
    const r0: Rules = RB(false, false), one = newModel('solo'), sOne: Drop[] = []; playDrops(one, 'solo', r0, sOne, 300, 10);
    const tm0 = newModel('equipo'), s0: Drop[] = []; playDrops(tm0, 'equipo', r0, s0, 300, 10);
    expect(low(one, r0)).toBeLessThan(0.93);   // la regla lleva un producto: una neurona lineal no lo sigue del todo
    expect(low(tm0, r0)).toBeGreaterThan(low(one, r0) + 0.05);
  }, 120000);
  it('rótulos y explicaciones del interruptor, y los tres datos en el código', () => {
    expect(BLOCK_LABEL(true)).toBe('Bloque: sí'); expect(BLOCK_LABEL(false)).toBe('Bloque: no');
    expect(blockExplain(true)).toContain('no ve el bloque'); expect(blockExplain(true)).toContain('vuelve a mirar y corrige'); expect(blockExplain(true)).not.toBe(blockExplain(false));
    expect(rulesOf(true, true, true)).toEqual({ walls: true, ceiling: true, rebound: true, block: true });
    expect(rulesOf(true, false)).toMatchObject({ block: false });
    const cs = newPaletaCodeState(); cs.block = true;
    expect(rawText(cs)).toContain('NO ve'); expect(rawText(cs)).toContain('vuelve a mirar');
    expect(rawText(newPaletaCodeState())).not.toContain('NO ve');
    expect(returned(nextJourney(7, prevAt(0.5, 0.5), { walls: true, ceiling: true, rebound: true }))).toBe(true);
    expect(BLOCK_H).toBeLessThan(0.5);
  });
});

describe('Paleta: el código y el guion', () => {
  it('el código en vivo lista las caídas guardadas y es copiable', () => {
    const cs = newPaletaCodeState(), net = newModel('solo'), saved: Drop[] = [];
    expect(rawText(cs)).toContain('const caidas = [];');
    playDrops(net, 'solo', false, saved, 3, 1);
    cs.saved = saved;
    const t = rawText(cs);
    expect(t).toContain('3 caídas guardadas');
    expect(t).toContain('cayo: ' + saved[0].land.toFixed(2));
    expect(t).toContain('new NetworkN([3, 1]');
    expect(t).toContain('neurona.train([c.x, c.inclinacion, c.altura], [c.cayo], 0.01);');
    expect(t).toContain('altura: 1.00');
    cs.kind = 'equipo'; cs.walls = true;
    expect(rawText(cs)).toContain('new NetworkN([3, 8, 1]');
    expect(rawText(cs)).toContain('red.train([c.x, c.inclinacion, c.altura], [c.cayo], 0.003);');
  });
  it('el panel del cerebro: el veredicto sale de los números redondeados que se muestran', () => {
    const { net } = trained('solo', false, 50, 10), fl = net.getWeights();
    const v = verdictOf('solo', fl);
    expect(parseFloat(v)).toBeCloseTo(0.8, 1);   // x 0.3 + inclinación 0.5
    expect(brainText('solo', fl, v, true)).toContain('neurona.setWeights(aprendido);');
  });
});

/** El guion de «Míralo solo» con las mismas reglas que la pantalla (sin dibujo): la red real. */
function headless(): { api: AutoApi; log: string[]; ctx: () => AutoCtx } {
  let kind: Kind = 'solo', walls = false, block = false, team: Team = { ...TEAM }, net = newModel(kind, team), saved: Drop[] = [], recent: boolean[] = [], last: AutoCtx['last'] = null;
  const log: string[] = [];
  const ctx = (): AutoCtx => ({ kind, walls, block, curve: team.curve, n: saved.length, recent: { ok: recent.filter(Boolean).length, total: recent.length }, last });
  const api: AutoApi = {
    reset: () => { kind = 'solo'; walls = false; block = false; team = { ...TEAM }; net = newModel(kind, team); saved = []; recent = []; last = null; },
    launch: async (count, slow) => {
      const batch = slow || count <= 30 ? 1 : 10;
      for (let i = 0; i < count; i++) {
        const j = nextJourney(saved.length, null, rulesOf(walls, false, block), block ? blockAt(saved.length) : null), d = finalDrop(j), pred = predictX(net, d), ok = caught(pred, d.land);
        saved.push(d); recent.push(ok); while (recent.length > WINDOW) recent.shift(); last = { ok, pred, land: d.land };
        if ((i + 1) % batch === 0 || i === count - 1) review(net, saved, kind);
      }
    },
    walls: (on) => { walls = on; saved = []; recent = []; },
    block: (on) => { block = on; },
    team: () => { kind = 'equipo'; net = newModel(kind, team); saved = []; recent = []; },
    curve: (on) => { team = { ...team, curve: on }; net = newModel('equipo', team); saved = []; recent = []; },
    ctx, caption: (t) => { log.push(t); }, sleep: async () => {}, cancelled: () => false,
  };
  return { api, log, ctx };
}

describe('Paleta: «Míralo solo»', () => {
  it('cuenta la historia con números reales: sin paredes acierta, con paredes la sola falla, el equipo vuelve a acertar', async () => {
    const h = headless(), steps: { act: string; ctx: AutoCtx }[] = [];
    const run = await runAuto(buildScript(), h.api, { log: (s, c) => steps.push({ act: s.act, ctx: c }) });
    expect(run.finished).toBe(true);
    expect(steps).toHaveLength(buildScript().length);
    const at = (i: number): AutoCtx => steps[i].ctx;
    expect(at(4).recent.ok / at(4).recent.total).toBeGreaterThanOrEqual(0.9);            // 31 caídas, sin paredes
    expect(at(7).kind).toBe('solo'); expect(at(7).walls).toBe(true);
    expect(at(7).recent.ok / at(7).recent.total).toBeLessThan(0.6);                      // paredes: la sola falla
    expect(at(8).kind).toBe('equipo');
    const fin = h.ctx();
    expect(fin.kind).toBe('equipo');
    expect(fin.recent.ok / fin.recent.total).toBeGreaterThanOrEqual(0.85);               // el equipo acierta
    expect(fin.n).toBe(110);   // 100 con curva + 10 con el bloque (la red y las caídas siguen: el bloque no crea red nueva)
    expect(fin.block).toBe(true);
    expect(fin.curve).toBe(true);
    const off = steps.findIndex((x) => x.act === 'curve' && !x.ctx.curve);
    expect(off).toBeGreaterThan(8);
    const failing = steps[off + 1].ctx;   // equipo SIN curva, con paredes
    expect(failing.curve).toBe(false); expect(failing.walls).toBe(true);
    expect(failing.recent.ok / failing.recent.total).toBeLessThan(0.6);
    expect(h.log[h.log.length - 1]).toContain('atrapó ' + fin.recent.ok + ' de las últimas ' + fin.recent.total);
  });
  it('se puede parar entre pasos', async () => {
    const h = headless(); let n = 0;
    h.api.cancelled = () => n++ >= 3;
    const run = await runAuto(buildScript(), h.api);
    expect(run.finished).toBe(false);
  });
});
