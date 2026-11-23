import { describe, expect, it } from 'vitest';
import {
  BATCH, BRAIN_SCALE, EPS_END, EPS_GAMES, GAMMA, INPUT_NAMES, IN_HELP, IN_N, INPUT_NAMES_HELP, LEVELS, MAX_IDLE, MEMORY, MOVES, OUT_N, REWARD, SIZE, START_LEN, SYNC, WARM,
  Game, Session, epsilonAt, evaluate, fateOf, goalOf, inCount, meanFood, newNet, randomScore, refScore, ruleHelpMove, ruleHelpScore, ruleMove, ruleScore, trappedShare, type GameResult, type Memory, type Vision,
} from '../src/data/snake';
import { WINDOW, buildScript, num, runAuto, type AutoApi, type AutoCtx } from '../src/data/snakeAuto';
import { brainText, newSnakeCodeState, rawText, sampleOf, verdictOf } from '../src/data/snakeCode';
import { BrainMeter, fillOf } from '../src/viz/BrainMeter';
import { ObservedModel } from '../src/viz/observe';
import { inputsOutputsLayout } from '../src/viz/geometry';
import { mulberry32 } from '../src/viz/core/rng';

/** Un juego con la comida donde se quiera (para escenas exactas). */
const scene = (food: [number, number], seed = 3): Game => { const g = new Game(mulberry32(seed)); g.food = food; return g; };

describe('Snake: las reglas del juego', () => {
  it('empieza con 3 trozos en la fila del medio, mirando a la derecha, y la comida fuera de la serpiente', () => {
    for (let s = 1; s < 30; s++) {
      const g = new Game(mulberry32(s));
      expect(g.n).toBe(SIZE); expect(SIZE).toBe(10);
      expect(g.body).toHaveLength(START_LEN);
      expect(g.body[0]).toEqual([5, 5]); expect(g.body[2]).toEqual([3, 5]); expect(g.dir).toBe(1);
      expect(g.body.some(([x, y]) => x === g.food[0] && y === g.food[1])).toBe(false);
      expect(g.done).toBe(false); expect(g.eaten).toBe(0);
    }
  });
  it('los premios son +1 comer, −1 chocar, −0,01 por paso y −0,5 por dar vueltas', () => {
    expect(REWARD).toEqual({ eat: 1, die: -1, step: -0.01, loop: -0.5 });
    expect(MAX_IDLE).toBe(100);
  });
  it('un paso normal da −0,01, mueve la cabeza y mantiene el largo', () => {
    const g = scene([0, 0]), r = g.step(1);
    expect(r).toEqual({ reward: -0.01, ate: false, done: false, death: 'none' });
    expect(g.body[0]).toEqual([6, 5]); expect(g.body).toHaveLength(3); expect(g.steps).toBe(1);
  });
  it('comer da +1, hace crecer a la serpiente, pone otra comida fuera de ella y reinicia el contador de vueltas', () => {
    const h = scene([6, 5]), r = h.step(1);
    expect(r).toMatchObject({ reward: 1, ate: true, done: false });
    expect(h.body).toHaveLength(4); expect(h.eaten).toBe(1); expect(h.idle).toBe(0);
    expect(h.body.some(([x, y]) => x === h.food[0] && y === h.food[1])).toBe(false);
  });
  it('salirse del tablero es morir: −1 y fin, «pared»', () => {
    const g = scene([0, 0]);
    for (let i = 0; i < 4; i++) expect(g.step(1).done).toBe(false);   // (6..9, 5)
    const r = g.step(1);
    expect(r).toEqual({ reward: -1, ate: false, done: true, death: 'pared' });
    expect(g.done).toBe(true);
    expect(() => g.step(1)).toThrow('Game.step');
  });
  it('chocar con su propio cuerpo es morir: −1 y fin, «cuerpo»', () => {
    const g = scene([6, 5]);
    [[6, 5], [7, 5], [8, 5]].forEach((f) => { g.food = f as [number, number]; expect(g.step(1).ate).toBe(true); });   // largo 6
    g.food = [0, 0];
    expect(g.step(2).done).toBe(false); expect(g.step(2).done).toBe(false);   // gira a la derecha: baja y vuelve
    const r = g.step(2);
    expect(r).toEqual({ reward: -1, ate: false, done: true, death: 'cuerpo' });
  });
  it('la cola se aparta: seguir su propia cola en un cuadrado pequeño NO es chocar', () => {
    const g = scene([0, 0]);
    for (let i = 0; i < 12; i++) expect(g.step(2).done).toBe(false);
  });
  it('dar vueltas más de 100 pasos sin comer acaba la partida con −0,5, «vueltas»', () => {
    const g = scene([0, 0]);
    let r = g.step(2);
    for (let i = 1; i < MAX_IDLE; i++) { expect(r.done).toBe(false); r = g.step(2); }
    expect(g.idle).toBe(MAX_IDLE); expect(r.done).toBe(false);
    r = g.step(2);
    expect(r).toEqual({ reward: -0.5, ate: false, done: true, death: 'vueltas' });
  });
  it('lo que ve son 7 números de 0 o 1: peligro izquierda/delante/derecha y comida delante/detrás/izquierda/derecha', () => {
    expect(INPUT_NAMES).toHaveLength(7); expect(IN_N).toBe(7);
    expect(scene([8, 5]).vision()).toEqual([0, 0, 0, 1, 0, 0, 0]);   // delante
    expect(scene([2, 5]).vision()).toEqual([0, 0, 0, 0, 1, 0, 0]);   // detrás
    expect(scene([5, 2]).vision()).toEqual([0, 0, 0, 0, 0, 1, 0]);   // arriba = a su izquierda (mira a la derecha)
    expect(scene([5, 8]).vision()).toEqual([0, 0, 0, 0, 0, 0, 1]);   // abajo = a su derecha
    expect(scene([8, 8]).vision()).toEqual([0, 0, 0, 1, 0, 0, 1]);   // delante y a la derecha
    const g = scene([0, 0]);
    for (let i = 0; i < 4; i++) g.step(1);                           // pegada a la pared de la derecha
    expect(g.vision().slice(0, 3)).toEqual([0, 1, 0]);               // peligro delante
    const h = scene([0, 0]); h.step(2);                              // baja: ahora mira abajo, su derecha es el oeste
    expect(h.vision().slice(0, 3)).toEqual([0, 0, 0]);
  });
  it('el peligro incluye el propio cuerpo, no solo la pared', () => {
    const g = scene([6, 5]);
    [[6, 5], [7, 5], [8, 5]].forEach((f) => { g.food = f as [number, number]; g.step(1); });
    g.food = [0, 0]; g.step(2); g.step(2);   // ahora mira a la izquierda, con su cuerpo justo arriba
    expect(g.vision()[2]).toBe(1);           // a su derecha (arriba) está su propio cuerpo
  });
  it('las referencias: al azar casi no come; la regla escrita a mano come mucho (y es determinista)', () => {
    expect(randomScore(200, 5)).toBeLessThan(1);
    expect(ruleScore(100, 5)).toBeGreaterThan(12);
    expect(ruleScore(60, 7)).toBe(ruleScore(60, 7));
    const g = scene([8, 5]); expect(ruleMove(g)).toBe(1);   // comida delante: sigue recto
    const h = scene([5, 2]); expect(ruleMove(h)).toBe(0);   // comida arriba: gira a la izquierda
    expect(meanFood(() => 1, 20, 1)).toBe(meanFood(() => 1, 20, 1));
  });
});

describe('Snake: la red y cómo aprende', () => {
  it('la red es real: NetworkN([7, 3]) lineal, sin capa oculta; nace siempre igual', () => {
    const n = newNet();
    expect(n.structure).toEqual([7, 3]);
    expect(n.layers).toHaveLength(1); expect(n.layers[0].neurons).toHaveLength(3);
    expect(n.getWeights()).toHaveLength(24);
    expect(n.getWeights()).toEqual(newNet().getWeights());
    expect(n.predict([0, 0, 0, 0, 0, 0, 0])).toHaveLength(OUT_N);
    expect(MOVES).toEqual(['a la izquierda', 'recto', 'a la derecha']);
  });
  it('la meta de un recuerdo es su premio más 0,9 por lo mejor que viene (con la copia congelada), y solo el premio si acabó', () => {
    const t = newNet(), m: Memory = { ve: [0, 0, 0, 1, 0, 0, 0], jugada: 1, premio: -0.01, siguiente: [0, 1, 0, 0, 0, 1, 0], fin: false };
    expect(goalOf(m, t)).toBeCloseTo(-0.01 + GAMMA * Math.max(...t.predict(m.siguiente)), 12);
    expect(goalOf({ ...m, fin: true, premio: -1 }, t)).toBe(-1);
  });
  it('es reproducible: la misma semilla da exactamente la misma historia', () => {
    const a = new Session(4), b = new Session(4);
    a.playGames(15); b.playGames(15);
    expect(a.results).toEqual(b.results);
    expect(a.net.getWeights()).toEqual(b.net.getWeights());
    const c = new Session(5); c.playGames(15);
    expect(c.results).not.toEqual(a.results);
  });
  it('los premios que se guardan son solo los cuatro del juego', () => {
    const s = new Session(2); s.playGames(30);
    const set = new Set(s.memory.map((m) => m.premio));
    for (const p of set) expect([1, -1, -0.01, -0.5]).toContain(p);
    expect(set.has(-1)).toBe(true); expect(set.has(-0.01)).toBe(true);
    s.memory.forEach((m) => { expect(m.ve).toHaveLength(7); expect([0, 1, 2]).toContain(m.jugada); expect(m.siguiente).toHaveLength(7); });
    expect(s.memory.filter((m) => m.fin).length).toBe(s.games);
  });
  it('con una semilla fija, tras 150 partidas come muchísimo más que al azar (y sin saber nada, casi nada)', () => {
    const blank = newNet(), base = evaluate(blank, 60, 5);
    expect(base).toBeLessThan(2);
    for (const seed of [1, 2, 3]) {
      const s = new Session(seed);
      s.playGames(200);
      const played = s.meanLast(WINDOW) as number, greedy = evaluate(s.net, 60, 5);
      expect(played).toBeGreaterThan(8);        // jugando de verdad (con su poco de azar): ~15 medido
      expect(greedy).toBeGreaterThan(12);       // sin azar: ~17 medido
      expect(played).toBeGreaterThan(20 * randomScore(200, 5));
    }
  });
  it('mejora con las partidas: las primeras 10 comen mucho menos que las últimas 20 tras 200', () => {
    const s = new Session(11);
    s.playGames(10);
    const early = s.meanLast(10) as number;
    s.playGames(190);
    expect(early).toBeLessThan(2);
    expect(s.meanLast(WINDOW) as number).toBeGreaterThan(early + 6);
  });
  it('lo aprendido se puede medir sin tocar la red: evaluate no la cambia', () => {
    const s = new Session(1); s.playGames(60);
    const w = s.net.getWeights().slice(); evaluate(s.net, 20); expect(s.net.getWeights()).toEqual(w);
  });
});

describe('Snake: el azar (probar cosas) es real', () => {
  it('empieza en 1 (todo al azar), baja en línea recta y se queda en el mínimo', () => {
    expect(epsilonAt(0)).toBe(1);
    expect(epsilonAt(EPS_GAMES)).toBeCloseTo(EPS_END, 12);
    expect(epsilonAt(EPS_GAMES * 10)).toBe(EPS_END);
    for (let g = 1; g < EPS_GAMES; g++) expect(epsilonAt(g)).toBeLessThan(epsilonAt(g - 1));
    expect(epsilonAt(EPS_GAMES / 2)).toBeCloseTo((1 + EPS_END) / 2, 12);
  });
  it('con ε cerca de 1 casi todas las jugadas son «dado»: se reparten entre las tres y muchas NO son la mejor', () => {
    const s = new Session(8), seen = [0, 0, 0]; let explored = 0, notBest = 0;
    for (let i = 0; i < 300; i++) {
      const d = s.look(); seen[d.move]++; if (d.explored) explored++; if (d.move !== d.best) notBest++;
      if (s.move(d).gameOver) s.next();
    }
    expect(s.epsilon).toBeGreaterThan(0.7);   // pocas partidas: sigue cerca de 1
    expect(explored).toBeGreaterThan(200);
    seen.forEach((n) => expect(n).toBeGreaterThan(50));
    expect(notBest).toBeGreaterThan(100);
  });
  it('con ε pequeño casi nunca tira el dado, y cuando no lo tira elige EXACTAMENTE la que más vale', () => {
    const s = new Session(3); s.playGames(EPS_GAMES + 5);
    expect(s.epsilon).toBe(EPS_END);
    let explored = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
      const d = s.look();
      if (d.explored) explored++; else expect(d.move).toBe(d.best);
      expect(d.best).toBe(d.values.indexOf(Math.max(...d.values)));
      n++;
      if (s.move(d).gameOver) s.next();
    }
    expect(explored / n).toBeGreaterThan(0.003); expect(explored / n).toBeLessThan(0.06);
  });
  it('peek enseña lo que haría la red sin gastar azar ni cambiar nada', () => {
    const s = new Session(6); s.playGames(5);
    const w = s.net.getWeights().slice(), p1 = s.peek(), p2 = s.peek();
    expect(p1).toEqual(p2); expect(p1.explored).toBe(false); expect(p1.move).toBe(p1.best);
    expect(s.net.getWeights()).toEqual(w);
  });
});

describe('Snake: aprender (ajustes) y los recuerdos', () => {
  it('no repasa hasta tener unos cuantos recuerdos; después, BATCH `train` reales por paso', () => {
    const s = new Session(9), obs = new ObservedModel(s.net);
    let total = 0;
    for (let i = 0; i < WARM + 40; i++) {
      const before = obs.steps, info = s.move(s.look());
      total += info.trains;
      expect(obs.steps - before).toBe(info.trains);
      expect(info.trains).toBe(s.memory.length >= WARM ? BATCH : 0);
      if (info.gameOver) s.next();
    }
    expect(obs.steps).toBe(total); expect(total).toBeGreaterThan(0); expect(total % BATCH).toBe(0);
  });
  it('el contador de ajustes del cerebro sube con cada train y no se pierde con el azar ni con la copia', () => {
    const s = new Session(10), obs = new ObservedModel(s.net), meter = new BrainMeter(3);
    meter.setModel(s.net); meter.track(obs, BRAIN_SCALE);
    expect(meter.adjustments()).toBe(0);
    s.playGames(5);
    expect(meter.adjustments()).toBe(obs.steps); expect(obs.steps).toBeGreaterThan(0);
    const a = meter.adjustments(); s.look();   // mirar no es aprender
    expect(meter.adjustments()).toBe(a);
    s.stepOnce(); expect(meter.adjustments()).toBeGreaterThan(a);
  });
  it('cada recuerdo cambia SOLO la jugada que se hizo: las otras salidas se piden tal como la red ya las daba', () => {
    const s = new Session(12); s.playGames(3);
    const calls: { ve: number[]; t: number[]; was: number[] }[] = [], net = s.net, real = net.train.bind(net);
    net.train = ((ve: number[], t: number[], lr: number) => { calls.push({ ve: ve.slice(), t: t.slice(), was: net.predict(ve).slice() }); return real(ve, t, lr); }) as typeof net.train;
    s.stepOnce();
    expect(calls).toHaveLength(BATCH);
    calls.forEach((c) => {
      const diff = c.t.map((v, j) => Math.abs(v - c.was[j]) > 1e-12 ? j : -1).filter((j) => j >= 0);
      expect(diff.length).toBeLessThanOrEqual(1);
    });
    expect(calls.some((c) => c.t.some((v, j) => Math.abs(v - c.was[j]) > 1e-12))).toBe(true);
  });
  it('la copia congelada se pone al día cada SYNC pasos, y no antes', () => {
    const s = new Session(13);
    let guard = 0;
    while (s.steps < SYNC - 1 && guard++ < 1e6) s.stepOnce();
    expect(s.steps).toBe(SYNC - 1);
    expect(s.target.getWeights()).not.toEqual(s.net.getWeights());
    while (s.steps < SYNC) s.stepOnce();
    expect(s.steps).toBe(SYNC);
    expect(s.target.getWeights()).toEqual(s.net.getWeights());
  });
  it('la memoria tiene tope y guarda lo último', () => {
    expect(MEMORY).toBe(20000);
    const s = new Session(14); s.playGames(20);
    expect(s.memory.length).toBeLessThanOrEqual(MEMORY);
    expect(s.memory.length).toBe(s.steps);
  });
  it('el cerebro se llena con lo que cambia cada neurona: vacío al nacer, casi lleno tras ~200 partidas (BRAIN_SCALE medida)', () => {
    const s = new Session(11), obs = new ObservedModel(s.net);
    expect(fillOf(obs.travelFlat()[0], BRAIN_SCALE)).toBe(0);
    s.playGames(50);
    const f50 = obs.travelFlat().map((t) => fillOf(t, BRAIN_SCALE));
    s.playGames(150);
    const f200 = obs.travelFlat().map((t) => fillOf(t, BRAIN_SCALE));
    expect(Math.min(...f50)).toBeLessThan(0.5);
    expect(Math.min(...f200)).toBeGreaterThan(0.85);
  });
});

describe('Snake: el código y el panel del cerebro', () => {
  it('el código en vivo es el de verdad: la red [7, 3], el azar actual, los premios y los recuerdos guardados', () => {
    const s = new Session(15); s.playGames(3);
    const cs = { ...newSnakeCodeState(), games: s.games, steps: s.steps, epsilon: s.epsilon, memCount: s.memory.length, recent: s.memory.slice(-4) };
    const t = rawText(cs);
    expect(t).toContain('new NetworkN([7, 3], { activations: [linear], optimizer: () => new Adam() })');
    expect(t).toContain('Math.random() < ' + s.epsilon.toFixed(2));
    expect(t).toContain('red.train(r.ve, pedido, 0.003)');
    expect(t).toContain('0.9 * Math.max(...copia.predict(r.siguiente))');
    expect(t).toContain('% 500 === 0');
    expect(t).toContain('premio: ' + s.memory[s.memory.length - 1].premio.toFixed(2));
    expect(t).not.toContain('… y');   // las líneas «… y N más» no se copian
    expect(rawText(newSnakeCodeState())).toContain('todavía no ha jugado nada');
  });
  it('el veredicto sale de los números redondeados que se muestran y nombra la jugada', () => {
    const s = new Session(16); s.playGames(120);
    const fl = s.net.getWeights(), txt = brainText(fl, verdictOf(fl), true);
    expect(txt).toContain('Lo que aprendió: 24 números');
    expect(txt).toContain('const aprendido = [');
    const v = verdictOf(fl);
    expect(v).toMatch(/^\[[-+\d., ]+\] (a la izquierda|recto|a la derecha)$/);
    expect(brainText(fl, v, false)).toContain('Sin enseñarle nada');
    // una red que ha aprendido a esquivar la pared con comida a la derecha dice «a la derecha» en la situación de muestra
    expect(verdictOf(fl)).toContain('a la derecha');
  });
});

describe('Snake: el dibujo de la red', () => {
  it('una capa que mira 7 entradas con 3 neuronas: 7 conexiones a CADA una, entradas compartidas y sitio para los nombres', () => {
    const { layout, inputs } = inputsOutputsLayout(7, 3);
    expect(layout.neurons).toHaveLength(1); expect(layout.neurons[0]).toHaveLength(3); expect(inputs).toHaveLength(7);
    layout.neurons[0].forEach((g) => {
      expect(g.dendrites).toHaveLength(7);
      g.dendrites.forEach((d, i) => expect(d.tip).toEqual(inputs[i]));
      expect(g.terminal[0]).toBeLessThan(layout.size.w - 60);   // cabe el nombre de la jugada a la derecha
    });
    expect(inputs[0][0]).toBeGreaterThanOrEqual(150);            // cabe el nombre de la entrada a la izquierda
    const ys = layout.neurons[0].map((g) => g.body.y);
    expect(ys[0]).toBeLessThan(ys[1]); expect(ys[1]).toBeLessThan(ys[2]);
  });
});

describe('Snake: «Míralo solo»', () => {
  function headless(): { api: AutoApi; texts: string[]; ctx: () => AutoCtx; session: () => Session } {
    let s = new Session(21); const texts: string[] = [], rule = ruleScore(60, 5), random = randomScore(60, 5);
    let eyes: number | null = null, eyesSk: number | null = null;
    const ruleHelp = ruleHelpScore(60, 5);
    const ctx = (): AutoCtx => {
      const l = s.results[s.results.length - 1];
      return { games: s.games, mean10: s.meanLast(10), mean20: s.meanLast(WINDOW), last: l ? { food: l.food, death: l.death, trapped: l.trapped } : null, rule, random, vision: s.vision, ruleHelp, eyesMean: eyes, trapped: trappedShare(s.results, WINDOW), eyesSkill: eyesSk, skill: s.games >= 50 ? evaluate(s.net, 30, 5, s.vision) : null };
    };
    const api: AutoApi = {
      reset: () => { eyes = null; eyesSk = null; s = new Session(22); },
      setVision: (v) => { eyes = v === 'ayuda' ? s.meanLast(WINDOW) : null; eyesSk = v === 'ayuda' ? evaluate(s.net, 30, 5, 'ojos') : null; s = new Session(23, undefined, v); },
      watch: async () => { s.playGames(1); },
      train: async (n) => { s.playGames(n); },
      ctx, caption: (t, link) => { texts.push(t + (link ? ' [enlace]' : '')); }, sleep: async () => {}, cancelled: () => false,
    };
    return { api, texts, ctx, session: () => s };
  }
  it('cuenta la historia con números reales: nivel 1 con sus ojos, luego el nivel 2 con ayuda y lo compara; acaba con el enlace', async () => {
    const h = headless(), steps: { act: string; ctx: AutoCtx }[] = [];
    const run = await runAuto(buildScript(), h.api, { log: (st, c) => steps.push({ act: st.act, ctx: c }) });
    expect(run.finished).toBe(true);
    expect(steps).toHaveLength(buildScript().length);
    expect(steps.map((x) => x.act)).toEqual(['reset', 'watch', 'train', 'vision', 'train']);
    expect(steps[0].ctx.games).toBe(0); expect(steps[0].ctx.vision).toBe('ojos');
    expect(steps[1].ctx.games).toBe(1);
    const eyes = steps[2].ctx;
    expect(eyes.games).toBe(101); expect(eyes.vision).toBe('ojos');
    expect(eyes.mean20 as number).toBeGreaterThan(6);
    expect(steps[3].ctx.vision).toBe('ayuda'); expect(steps[3].ctx.games).toBe(0);          // red nueva y vacía
    expect(steps[3].ctx.eyesMean).toBe(eyes.mean20);                                        // recuerda lo que comía con sus ojos
    const fin = h.ctx();
    expect(fin.games).toBe(100); expect(fin.vision).toBe('ayuda');
    expect(fin.mean20 as number).toBeGreaterThan(8);
    expect(h.texts[h.texts.length - 1]).toContain('[enlace]');
    expect(h.texts[h.texts.length - 1]).toContain('come de media ' + num(fin.mean20));
    expect(h.texts[h.texts.length - 1]).toContain('con solo sus ojos: ' + num(eyes.mean20));
    expect(fin.skill as number).toBeGreaterThan((steps[3].ctx.eyesSkill as number) + 5);                  // sin dado, con ayuda come mucho más
    expect(h.texts[h.texts.length - 1]).toContain('sin tirar el dado ' + num(fin.skill, 0));
    expect(h.texts[h.texts.length - 1]).toContain('regla escrita a mano con la misma ayuda');
    expect(h.texts.some((t) => t.includes('una persona'))).toBe(true);                     // dice que lo escribió una persona
  });
  it('se puede parar entre pasos', async () => {
    const h = headless(); let n = 0;
    h.api.cancelled = () => n++ >= 3;
    const run = await runAuto(buildScript(), h.api);
    expect(run.finished).toBe(false);
  });
  it('los números se escriben con coma decimal', () => {
    expect(num(12.34)).toBe('12,3'); expect(num(null)).toBe('–'); expect(num(17.8, 0)).toBe('18');
  });
});

// ---------- Nivel 2: no encerrarse ----------
/** Un tablero hecho a mano: la serpiente (cabeza primero), su rumbo y la comida; todo lo demás, libre. */
function board(body: [number, number][], dir = 1, food: [number, number] = [0, 9]): Game {
  const g = new Game(mulberry32(1));
  const priv = g as unknown as { grid: Uint8Array };
  priv.grid.fill(0);
  g.body = body.map(([x, y]) => [x, y] as [number, number]);
  for (const [x, y] of body) priv.grid[y * g.n + x] = 1;
  g.dir = dir; g.food = food;
  return g;
}
/** Una bolsa de 2 casillas ((5,4) y (5,3)) a la izquierda de la cabeza (5,5), mirando a la derecha; delante y a la derecha, todo abierto. */
const pocket = (): Game => board([[5, 5], [4, 4], [4, 3], [6, 4], [6, 3], [5, 2]]);

describe('Nivel 2: «¿cabe?» (lo calcula una persona con un relleno)', () => {
  it('tablero abierto: tras cualquier jugada cabe entera (1), y el sitio contado es todo lo libre', () => {
    const g = board([[5, 5], [4, 5], [3, 5]]);
    for (const m of [0, 1, 2]) { expect(g.room(m)).toBe(100 - 3); expect(g.fits(m)).toBe(1); }
  });
  it('pared delante: esa jugada vale 0 (no hay sitio, choca); las de los lados caben', () => {
    const g = board([[9, 5], [8, 5], [7, 5]]);
    expect([g.room(0), g.room(1), g.room(2)]).toEqual([97, 0, 97]);
    expect([g.fits(0), g.fits(1), g.fits(2)]).toEqual([1, 0, 1]);
    const c = board([[5, 5], [5, 6], [5, 7]], 0);                   // mirando arriba, su cola detrás: el cuerpo no cuenta como sitio
    expect(c.room(1)).toBe(97);
  });
  it('una bolsa pequeña: cabe solo 2 de 6 casillas (2 ÷ 6), y las otras jugadas caben', () => {
    const g = pocket();
    expect(g.room(0)).toBe(2); expect(g.fits(0)).toBeCloseTo(2 / 6, 12);
    expect(g.fits(1)).toBe(1); expect(g.fits(2)).toBe(1);
  });
  it('«cabe» nunca pasa de 1 ni baja de 0', () => {
    for (const g of [board([[5, 5], [4, 5], [3, 5]]), pocket(), board([[9, 9], [8, 9], [7, 9]])]) for (const m of [0, 1, 2]) {
      expect(g.fits(m)).toBeGreaterThanOrEqual(0); expect(g.fits(m)).toBeLessThanOrEqual(1);
    }
  });
  it('lo que ve: 7 números con sus ojos; 10 con ayuda (los mismos 7 y después izquierda, recto, derecha)', () => {
    expect(IN_N).toBe(7); expect(IN_HELP).toBe(10); expect(INPUT_NAMES).toHaveLength(7); expect(INPUT_NAMES_HELP).toHaveLength(10);
    expect(inCount('ojos')).toBe(7); expect(inCount('ayuda')).toBe(10);
    const g = pocket();
    const eyes = g.visionFor('ojos'), help = g.visionFor('ayuda');
    expect(eyes).toHaveLength(7); expect(help).toHaveLength(10);
    expect(help.slice(0, 7)).toEqual(eyes);
    expect(help[7]).toBeCloseTo(2 / 6, 12); expect(help.slice(8)).toEqual([1, 1]);
  });
  it('la red de cada nivel: NetworkN([7, 3]) con 24 números o NetworkN([10, 3]) con 33 (30 pesos y 3 ajustes); nacen siempre igual', () => {
    expect(newNet('ojos').structure).toEqual([7, 3]); expect(newNet('ojos').getWeights()).toHaveLength(24);
    expect(newNet('ayuda').structure).toEqual([10, 3]); expect(newNet('ayuda').getWeights()).toHaveLength(33);
    expect(newNet('ayuda').getWeights()).toEqual(newNet('ayuda').getWeights());
    const s = new Session(1, undefined, 'ayuda');
    expect(s.vision).toBe('ayuda'); expect(s.net.structure).toEqual([10, 3]); expect(s.target.structure).toEqual([10, 3]);
    expect(s.look().ve).toHaveLength(10); expect(new Session(1).look().ve).toHaveLength(7);
    s.playGames(2);
    expect(s.memory[0].ve).toHaveLength(10); expect(s.memory[0].siguiente).toHaveLength(10);
    expect(LEVELS.ayuda.title).toBe('Nivel 2: no encerrarse'); expect(LEVELS.ojos.title).toBe('Nivel 1: aprender con premios');
  });
  it('los premios y el juego son los mismos en los dos niveles (la misma semilla da las mismas comidas con la misma jugada)', () => {
    expect(meanFood((g) => ruleMove(g), 5, 9)).toBe(meanFood((g) => ruleMove(g), 5, 9));
    const a = new Session(4, undefined, 'ojos'), b = new Session(4, undefined, 'ayuda');
    expect(a.game.food).toEqual(b.game.food); expect(a.game.body).toEqual(b.game.body);
  });
});

describe('Nivel 2: cómo murió (misma definición que la investigación)', () => {
  it('encerrada = al morir, ninguna jugada libre dejaba sitio para su largo', () => {
    expect(pocket().isTrapped()).toBe(false);                                     // la derecha y recto tienen sitio de sobra
    expect(board([[5, 5], [4, 5], [3, 5]]).isTrapped()).toBe(false);
    /* en la esquina (0,0) mirando a la derecha: arriba es pared, a la derecha la cola, y delante solo quedan 2 casillas para un largo de 5 */
    const g = board([[0, 0], [0, 1], [1, 1], [2, 1], [3, 0]]);
    expect(g.room(1)).toBe(2); expect(g.body).toHaveLength(5);
    expect(g.isTrapped()).toBe(true);
  });
  it('chocar sin salida = «se encierra»; chocar teniendo salida = «chocó»; dar vueltas = «dio vueltas»', () => {
    const t = board([[0, 0], [0, 1], [1, 1], [2, 1], [3, 0]]);
    expect(t.step(0).death).toBe('pared');                                        // arriba: la pared
    expect(t.trapped).toBe(true);
    expect(fateOf({ death: 'pared', trapped: t.trapped })).toBe('encerró');
    const o = board([[9, 5], [8, 5], [7, 5]]);
    expect(o.step(1).death).toBe('pared'); expect(o.trapped).toBe(false);          // a los lados había sitio de sobra
    expect(fateOf({ death: 'pared', trapped: o.trapped })).toBe('chocó');
    expect(fateOf({ death: 'cuerpo', trapped: false })).toBe('chocó'); expect(fateOf({ death: 'cuerpo', trapped: true })).toBe('encerró');
    expect(fateOf({ death: 'vueltas' })).toBe('vueltas'); expect(fateOf({ death: 'none' })).toBe('ninguna');
    const v = scene([0, 0]); let r = v.step(2);
    for (let i = 0; i < MAX_IDLE; i++) r = v.step(2);
    expect(r.death).toBe('vueltas'); expect(v.trapped).toBe(false);
  });
  it('cada partida acabada guarda si murió encerrada, y la partida nueva lo borra', () => {
    const s = new Session(6, undefined, 'ayuda'); s.playGames(6);
    expect(s.results).toHaveLength(6);
    for (const r of s.results) expect(typeof r.trapped).toBe('boolean');
    expect(s.game.trapped).toBe(false);
  });
  it('el % encerrada son las últimas partidas que acabaron mal; sin datos, nada', () => {
    const r = (death: GameResult['death'], trapped?: boolean): GameResult => ({ food: 1, steps: 9, death, explored: 0, trapped });
    expect(trappedShare([])).toBeNull();
    expect(trappedShare([r('pared', true), r('cuerpo', true), r('pared', false), r('vueltas')])).toBe(0.5);
    expect(trappedShare([r('pared'), r('cuerpo')])).toBeNull();                    // lo guardado antes del nivel 2 no sabe si estaba encerrada
    expect(trappedShare([r('pared', true), r('pared', false), r('pared', false), r('pared', false)], 2)).toBe(0);
  });
});

describe('Nivel 2: la regla escrita a mano con la ayuda, y que la red aprende a usarla', () => {
  it('la regla con ayuda evita la bolsa que la regla `if` pisa', () => {
    /* comida arriba, justo dentro de la bolsa: la regla `if` entra (está más cerca); la de ayuda no, porque no cabe */
    const g = board([[5, 5], [4, 4], [4, 3], [6, 4], [6, 3], [5, 2]], 1, [5, 3]);
    expect(ruleMove(g)).toBe(0);
    expect(ruleHelpMove(g)).not.toBe(0);
  });
  it('la regla con ayuda come el doble que la `if` (con el mismo juego); la referencia de cada nivel es la suya', () => {
    const a = ruleScore(60, 5), b = ruleHelpScore(60, 5);
    expect(b).toBeGreaterThan(a + 8);
    expect(refScore('ojos', 60, 5)).toBe(a); expect(refScore('ayuda', 60, 5)).toBe(b);
  });
  it('con una semilla fija, tras 100 partidas la red CON ayuda juega mucho mejor que la de solo sus ojos (misma red, mismos premios)', () => {
    const eyes: number[] = [], help: number[] = [];
    for (const seed of [1, 2, 3]) {
      for (const [v, list] of [['ojos', eyes], ['ayuda', help]] as [Vision, number[]][]) {
        const s = new Session(seed, undefined, v); s.playGames(100);
        list.push(evaluate(s.net, 60, 5, v));
      }
    }
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(help)).toBeGreaterThan(mean(eyes) + 8);
    help.forEach((h, i) => expect(h).toBeGreaterThan(eyes[i] + 3));
    expect(Math.min(...help)).toBeGreaterThan(24);
  }, 60000);
});

describe('Nivel 2: el código, el cerebro y el dibujo', () => {
  it('el código en vivo muestra la red [10, 3] y la ayuda marcada como escrita por una persona', () => {
    const t = rawText({ ...newSnakeCodeState(), vision: 'ayuda' });
    expect(t).toContain('new NetworkN([10, 3], { activations: [linear], optimizer: () => new Adam() })');
    expect(t).toContain('ESCRITO POR UNA PERSONA');
    expect(t).toContain('function sitioTras(jugada)');
    expect(t).toContain('Math.min(sitioTras(j) / serpiente.largo, 1)');
    expect(t).toContain('...cabe]');
    expect(rawText(newSnakeCodeState())).not.toContain('sitioTras');               // el nivel 1 no la lleva
    expect(rawText(newSnakeCodeState())).toContain('new NetworkN([7, 3]');
  });
  it('el cerebro con ayuda: 33 números, red [10, 3] y un veredicto sobre 10 entradas', () => {
    const s = new Session(16, undefined, 'ayuda'); s.playGames(100);
    const fl = s.net.getWeights(), txt = brainText(fl, verdictOf(fl, 'ayuda'), true, 'ayuda');
    expect(fl).toHaveLength(33);
    expect(txt).toContain('Lo que aprendió: 33 números (11 por cada jugada)');
    expect(txt).toContain('new NetworkN([10, 3]');
    expect(txt).toContain(JSON.stringify(sampleOf('ayuda')).replace(/,/g, ', '));
    expect(verdictOf(fl, 'ayuda')).toMatch(/^\[[-+\d., ]+\] (a la izquierda|recto|a la derecha)$/);
    expect(verdictOf(fl, 'ayuda')).not.toContain('recto');                          // la muestra tiene pared delante: aprendió a no ir recto
  });
  it('el dibujo de la red con 10 entradas: 10 conexiones a cada neurona y un hueco libre debajo para la leyenda', () => {
    const { layout, inputs } = inputsOutputsLayout(10, 3, { labelW: 185, extraRows: 1 });
    expect(inputs).toHaveLength(10); layout.neurons[0].forEach((g) => expect(g.dendrites).toHaveLength(10));
    const gap = inputs[1][1] - inputs[0][1];
    expect(layout.size.h - inputs[9][1]).toBeGreaterThan(gap * 1.5);               // cabe una fila más debajo
    expect(inputs[0][0]).toBe(185);
    expect(inputsOutputsLayout(7, 3).inputs[6][1]).toBe((250 * 7) / 8);             // sin hueco extra, igual que antes
  });
});
