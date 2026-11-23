import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Session, newNet, epsilonAt, type Vision } from '../src/data/snake';
import { RESULTS_KEEP, SNAKE_KIND, SNAKE_VERSION, checkSave, loadSnake, restoreSession, snakeText, toSave, type Counters } from '../src/data/snakeSave';
import { MAX_SLOTS, SaveList, SavedStore, decode, encode, sizeKB, stringify, type StorageLike } from '../src/viz/savedModel';
import { ObservedModel } from '../src/viz/observe';
import { SavedModel, type SavedEls } from '../src/components/ui/SavedModel';
import { FakeEl, installDom } from './helpers/fakeDom';

/** Una serpiente que ha jugado `n` partidas, con su cerebro observado (como en la pantalla). */
function played(n: number, seed = 3, vision: Vision = 'ojos'): { s: Session; obs: ObservedModel; counters: () => Counters } {
  const s = new Session(seed, undefined, vision), obs = new ObservedModel(s.net);
  s.playGames(n);
  return { s, obs, counters: () => ({ steps: obs.steps, travel: obs.travel }) };
}
class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}
const Throwing: StorageLike = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); }, removeItem() { throw new Error('bloqueado'); } };

describe('Snake: marcador y récord', () => {
  it('el récord es lo más que comió en UNA partida desde que nació la red, y avisa solo cuando se supera', () => {
    const s = new Session(5);
    expect(s.best).toBe(0);
    let best = 0, flags = 0;
    while (s.games < 80) {
      const info = s.stepOnce();
      if (info.gameOver) {
        const food = s.results[s.results.length - 1].food;
        expect(info.record).toBe(food > best);
        if (info.record) { flags++; best = food; }
        expect(s.best).toBe(best);
      } else expect(info.record).toBe(false);
    }
    expect(flags).toBeGreaterThan(0);
    expect(s.best).toBe(Math.max(...s.results.map((r) => r.food)));
  });
  it('la comida de «esta partida» sube en vivo con cada comida y vuelve a 0 en la siguiente', () => {
    const s = new Session(2);
    let seen = 0;
    for (let i = 0; i < 4000 && s.games < 40; i++) {
      const before = s.game.eaten, info = s.stepOnce();
      if (info.ate) { seen++; expect(info.gameOver ? true : s.game.eaten).toBe(info.gameOver ? true : before + 1); }
    }
    expect(seen).toBeGreaterThan(0);
    expect(s.game.eaten).toBeLessThanOrEqual(s.best + 100);
  });
  it('una red nueva empieza con récord 0', () => { expect(new Session(1).best).toBe(0); });
});

describe('ObservedModel.restore', () => {
  it('recupera ajustes y cambio acumulado, y el primer paso nuevo NO cuenta el salto de los pesos puestos', () => {
    const a = played(8), saved = a.counters();
    const net = newNet(); net.setWeights(a.s.net.getWeights());
    const obs = new ObservedModel(net);
    obs.restore({ steps: saved.steps, travel: saved.travel });
    expect(obs.steps).toBe(a.obs.steps); expect(obs.travel).toEqual(a.obs.travel);
    const before = obs.travel[0].slice();
    net.train([0, 0, 0, 1, 0, 0, 0], [0.1, 0.2, 0.3], 0.003);
    obs.travel[0].forEach((v, i) => { expect(v).toBeGreaterThan(before[i]); expect(v - before[i]).toBeLessThan(0.05); });
    expect(obs.steps).toBe(a.obs.steps + 1);
  });
  it('rechaza lo que no encaja sin tocar nada', () => {
    const obs = new ObservedModel(newNet());
    for (const bad of [{ steps: -1, travel: [[0, 0, 0]] }, { steps: 1.5, travel: [[0, 0, 0]] }, { steps: 1, travel: [[0, 0]] }, { steps: 1, travel: [[0, 0, 0], [0]] }, { steps: 1, travel: [[0, NaN, 0]] }, { steps: 1, travel: [[0, -1, 0]] }, { steps: 1, travel: 'x' as never }]) {
      expect(() => obs.restore(bad)).toThrow('ObservedModel.restore');
    }
    expect(obs.steps).toBe(0); expect(obs.travel).toEqual([[0, 0, 0]]);
  });
});

describe('Snake: el nivel (lo que ve) se guarda', () => {
  it('versión 2 y el nivel va en el archivo: «ojos» o «ayuda»', () => {
    expect(SNAKE_VERSION).toBe(2);
    for (const v of ['ojos', 'ayuda'] as Vision[]) {
      const a = played(8, 3, v), j = JSON.parse(snakeText(a.s, 5, a.counters()));
      expect(j.version).toBe(2); expect(j.state.vision).toBe(v);
      expect(j.state.net.structure).toEqual(v === 'ayuda' ? [10, 3] : [7, 3]);
      expect(j.state.net.weights).toHaveLength(v === 'ayuda' ? 33 : 24);
    }
    expect(snakeText(played(2, 3, 'ayuda').s, 1, { steps: 0, travel: [[0, 0, 0]] })).toContain('"vision": "ayuda"');
  });
  it('ida y vuelta con ayuda: nivel, pesos de 10 entradas, copia, contadores y «encerrada» iguales; sigue jugando con ayuda', () => {
    const a = played(40, 7, 'ayuda'), r = loadSnake(snakeText(a.s, 12, a.counters()));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.session.vision).toBe('ayuda'); expect(r.session.net.structure).toEqual([10, 3]);
    expect(r.session.net.getWeights()).toEqual(a.s.net.getWeights()); expect(r.session.target.getWeights()).toEqual(a.s.target.getWeights());
    expect(r.session.results).toEqual(a.s.results);
    expect(r.session.results.some((x) => typeof x.trapped === 'boolean')).toBe(true);
    const ve = [0, 1, 0, 0, 0, 0, 1, 1, 0, 1];
    expect(r.session.net.predict(ve)).toEqual(a.s.net.predict(ve));
    r.session.playGames(3);
    expect(r.session.look().ve).toHaveLength(10); expect(r.session.games).toBe(43);
  });
  it('lo guardado con la versión 1 (solo el nivel 1, sin «vision» ni «trapped») se carga como «sus ojos»', () => {
    const a = played(15), j = JSON.parse(snakeText(a.s, 4, a.counters()));
    j.version = 1; delete j.state.vision; j.state.results.forEach((x: { trapped?: boolean }) => { delete x.trapped; });
    const r = loadSnake(JSON.stringify(j));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.session.vision).toBe('ojos'); expect(r.session.net.structure).toEqual([7, 3]);
    expect(r.session.net.getWeights()).toEqual(a.s.net.getWeights());
    expect(r.session.games).toBe(15); expect(r.session.results.every((x) => x.trapped === undefined)).toBe(true);
    expect(r.session.look().ve).toHaveLength(7);
    // un archivo viejo que dijera «ayuda» no vale: la versión 1 no tenía ese campo
    j.state.vision = 'ayuda';
    const r2 = loadSnake(JSON.stringify(j)); expect(r2.ok).toBe(true); if (r2.ok) expect(r2.session.vision).toBe('ojos');
  });
  it('rechaza un nivel desconocido, o pesos que no son de ese nivel (nada a medias)', () => {
    const ayuda = (): any => { const a = played(6, 3, 'ayuda'); return JSON.parse(snakeText(a.s, 2, a.counters())); };
    const ojos = (): any => { const a = played(6, 3, 'ojos'); return JSON.parse(snakeText(a.s, 2, a.counters())); };
    const cases: [string, any][] = [
      ['nivel desconocido', (() => { const j = ayuda(); j.state.vision = 'telepatía'; return j; })()],
      ['sin nivel (versión 2)', (() => { const j = ayuda(); delete j.state.vision; return j; })()],
      ['dice «ojos» pero trae la red de 10 entradas', (() => { const j = ayuda(); j.state.vision = 'ojos'; return j; })()],
      ['dice «ayuda» pero trae la red de 7 entradas', (() => { const j = ojos(); j.state.vision = 'ayuda'; return j; })()],
      ['«trapped» que no es sí/no', (() => { const j = ayuda(); j.state.results[0].trapped = 'sí'; return j; })()],
    ];
    for (const [name, j] of cases) { const r = loadSnake(JSON.stringify(j)); expect(r.ok, name).toBe(false); if (!r.ok) expect(r.reason.length, name).toBeGreaterThan(5); }
    expect(loadSnake(JSON.stringify({ ...ayuda(), version: 3 })).ok).toBe(false);
  });
});

describe('Snake: guardar y recuperar', () => {
  it('ida y vuelta: pesos, copia, contadores, récord y partidas iguales; mismas predicciones', () => {
    const a = played(30), text = snakeText(a.s, 42, a.counters());
    const r = loadSnake(text);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.session.net.getWeights()).toEqual(a.s.net.getWeights());
    expect(r.session.target.getWeights()).toEqual(a.s.target.getWeights());
    expect(r.session.games).toBe(a.s.games); expect(r.session.steps).toBe(a.s.steps); expect(r.session.best).toBe(a.s.best);
    expect(r.session.results).toEqual(a.s.results);
    expect(r.session.epsilon).toBe(epsilonAt(a.s.games));
    expect(r.seed).toBe(42);
    expect(r.brain.steps).toBe(a.obs.steps); expect(r.brain.travel).toEqual(a.obs.travel);
    for (const ve of [[0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 1, 0], [0, 1, 1, 0, 0, 0, 1]]) expect(r.session.net.predict(ve)).toEqual(a.s.net.predict(ve));
    expect(r.session.memory).toHaveLength(0);   // los recuerdos no se guardan
  });
  it('la serpiente recuperada sigue jugando y aprendiendo', () => {
    const a = played(20), r = loadSnake(snakeText(a.s, 9, a.counters()));
    if (!r.ok) throw new Error(r.reason);
    const g = r.session.games; r.session.playGames(5);
    expect(r.session.games).toBe(g + 5); expect(r.session.best).toBeGreaterThanOrEqual(a.s.best);
  });
  it('solo guarda las últimas partidas de la curva, pero cuenta todas', () => {
    const a = played(RESULTS_KEEP + 15), save = toSave(a.s, 1, a.counters());
    expect(save.results).toHaveLength(RESULTS_KEEP); expect(save.games).toBe(RESULTS_KEEP + 15);
    const r = loadSnake(snakeText(a.s, 1, a.counters()));
    if (!r.ok) throw new Error(r.reason);
    expect(r.session.games).toBe(RESULTS_KEEP + 15); expect(r.session.results).toHaveLength(RESULTS_KEEP); expect(r.session.best).toBe(a.s.best);
  });
  it('lleva versión y tipo, y con sangría es legible (la copia del navegador va en una línea)', () => {
    const a = played(3), pretty = snakeText(a.s, 1, a.counters()), one = snakeText(a.s, 1, a.counters(), false);
    const j = JSON.parse(pretty);
    expect(j.app).toBe('neuron-site'); expect(j.kind).toBe(SNAKE_KIND); expect(j.version).toBe(SNAKE_VERSION); expect(typeof j.savedAt).toBe('string');
    expect(pretty).toContain('\n  '); expect(one).not.toContain('\n');
    expect(sizeKB(one)).toMatch(/^\d+,\d KB$/);
  });
  const goodEnv = () => { const a = played(12); return JSON.parse(snakeText(a.s, 4, a.counters())); };
  it('rechaza lo roto o que no encaja, y dice por qué (nada a medias)', () => {
    const cases: [string, (j: any) => unknown][] = [
      ['basura', () => 'esto no es json {'],
      ['no es de este sitio', (j) => ({ ...j, app: 'otra' })],
      ['otra pantalla', (j) => ({ ...j, kind: 'paleta' })],
      ['otra versión', (j) => ({ ...j, version: 99 })],
      ['sin estado', (j) => ({ ...j, state: null })],
      ['partidas negativas', (j) => { j.state.games = -1; return j; }],
      ['récord menor que una partida', (j) => { j.state.best = 0; j.state.results[0].food = 3; return j; }],
      ['últimas partidas de otro largo', (j) => { j.state.results.pop(); return j; }],
      ['muerte desconocida', (j) => { j.state.results[0].death = 'x'; return j; }],
      ['cerebro con otra forma', (j) => { j.state.brain.travel = [[1, 2]]; return j; }],
      ['cambio acumulado NaN', (j) => { j.state.brain.travel = [[1, null, 2]]; return j; }],
      ['pesos de otra red', (j) => { j.state.net.structure = [7, 8, 3]; return j; }],
      ['faltan pesos', (j) => { j.state.net.weights.pop(); j.state.net.length = 23; return j; }],
      ['pesos NaN', (j) => { j.state.target.weights[0] = null; return j; }],
    ];
    for (const [name, mut] of cases) {
      const m = mut(goodEnv()), text = typeof m === 'string' ? m : JSON.stringify(m), r = loadSnake(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.reason.length, name).toBeGreaterThan(5);
    }
    expect(loadSnake('').ok).toBe(false); expect(loadSnake('null').ok).toBe(false); expect(loadSnake('[]').ok).toBe(false);
  });
  it('checkSave y decode no lanzan nada raro con entradas absurdas', () => {
    for (const x of [undefined, 1, 'a', [], {}, { seed: 1 }]) expect(() => checkSave(x)).toThrow();
    expect(decode('{"app":"neuron-site","kind":"k","version":1,"state":{}}', 'k', 1, () => { throw new Error('mal estado'); })).toEqual({ ok: false, reason: 'mal estado' });
    expect(decode(stringify(encode('k', 1, { a: 1 })), 'k', 1, (s) => s)).toMatchObject({ ok: true, state: { a: 1 } });
  });
  it('restoreSession no deja nada a medias: si falla, lanza', () => {
    const a = played(5), save = toSave(a.s, 1, a.counters());
    save.net = { ...save.net, weights: [1, 2, 3] };
    expect(() => restoreSession(save)).toThrow();
  });
  it('tamaño: a 100 partidas, lo guardado ocupa pocos KB', () => {
    const a = played(100), one = snakeText(a.s, 1, a.counters(), false), pretty = snakeText(a.s, 1, a.counters());
    const kb = (t: string): number => new TextEncoder().encode(t).length / 1024;
    expect(kb(one)).toBeLessThan(12); expect(kb(pretty)).toBeLessThan(25);
  });
});

describe('SavedStore: el navegador sin almacén', () => {
  it('con almacén: lee, escribe y borra', () => {
    const st = new SavedStore('k', new MemStorage());
    expect(st.available()).toBe(true); expect(st.read()).toBeNull();
    expect(st.write('x')).toBe(true); expect(st.read()).toBe('x'); expect(st.remove()).toBe(true); expect(st.read()).toBeNull();
  });
  it('sin almacén (null) o con uno que lanza, NO lanza: read da null y write/remove dan false', () => {
    for (const storage of [null, Throwing]) {
      const st = new SavedStore('k', storage);
      expect(st.read()).toBeNull(); expect(st.write('x')).toBe(false); expect(st.remove()).toBe(false); expect(st.available()).toBe(false);
      const l = new SaveList(st);
      expect(l.list()).toEqual([]); expect(l.add('a', 'b')).toEqual({ ok: false, why: 'error' }); expect(l.remove('z')).toBe(false);
    }
  });
});

describe('SaveList: guardados con nombre', () => {
  const mk = () => { const mem = new MemStorage(); return { mem, st: new SavedStore('k', mem) }; };
  it('guarda, lista y borra; cada uno trae su nombre y su texto', () => {
    const { st } = mk(), l = new SaveList(st);
    const r = l.add('Partida 1', 'texto-1', new Date(1000)), r2 = l.add('Partida 2', 'texto-2', new Date(2000));
    expect(r.ok && r2.ok).toBe(true);
    expect(l.list().map((s) => s.name)).toEqual(['Partida 1', 'Partida 2']);
    if (r.ok) { expect(l.get(r.slot.id)?.text).toBe('texto-1'); expect(l.remove(r.slot.id)).toBe(true); expect(l.get(r.slot.id)).toBeNull(); }
    expect(l.list().map((s) => s.name)).toEqual(['Partida 2']);
    expect(l.remove('no-existe')).toBe(false);
  });
  it(`tope de ${MAX_SLOTS}: con la lista llena NO borra nada solo, dice que no cabe; al borrar uno, cabe otro`, () => {
    const { st } = mk(), l = new SaveList(st);
    for (let i = 0; i < MAX_SLOTS; i++) expect(l.add('n' + i, 't' + i).ok).toBe(true);
    expect(l.add('extra', 'x')).toEqual({ ok: false, why: 'full' });
    expect(l.list()).toHaveLength(MAX_SLOTS);
    expect(l.list().map((s) => s.name)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
    expect(l.remove(l.list()[0].id)).toBe(true);
    expect(l.add('extra', 'x').ok).toBe(true);
  });
  it('una entrada rota se ignora y las buenas se conservan; una lista rota es una lista vacía', () => {
    const { mem, st } = mk(), l = new SaveList(st);
    l.add('bueno', 't');
    const good = JSON.parse(mem.getItem('k:slots') as string);
    mem.setItem('k:slots', JSON.stringify([null, 5, { id: 1 }, { id: 'a', name: 'x' }, ...good, 'texto']));
    expect(l.list().map((s) => s.name)).toEqual(['bueno']);
    for (const junk of ['{no json', '{"a":1}', '"hola"', '']) { mem.setItem('k:slots', junk); expect(l.list()).toEqual([]); }
    expect(l.add('otro', 't').ok).toBe(true);
  });
  it('ida y vuelta de un guardado con nombre: cargarlo deja la serpiente como estaba', () => {
    const { st } = mk(), l = new SaveList(st), a = played(25, 6);
    const add = l.add('Partida ' + a.s.games, snakeText(a.s, 6, a.counters(), false));
    if (!add.ok) throw new Error('no cupo');
    a.s.playGames(10);   // lo de ahora cambia; el guardado, no
    const r = loadSnake(l.get(add.slot.id)?.text as string);
    if (!r.ok) throw new Error(r.reason);
    expect(r.session.games).toBe(25); expect(r.session.games).not.toBe(a.s.games);
    expect(r.session.net.getWeights()).not.toEqual(a.s.net.getWeights());
  });
});

describe('SavedModel (la parte con botones, con DOM de mentira)', () => {
  let dom: ReturnType<typeof installDom>;
  beforeEach(() => { dom = installDom(); });
  afterEach(() => dom.restore());
  const els = (): SavedEls => ({ btn: new FakeEl('button'), panel: new FakeEl(), wrap: new FakeEl(), copy: new FakeEl('button'), stat: new FakeEl('p'), save: new FakeEl('button'), down: new FakeEl('button'), load: new FakeEl('button'), file: new FakeEl('input') as never, view: new FakeEl('button'), text: new FakeEl(), pre: new FakeEl('pre'), list: new FakeEl('ul') }) as unknown as SavedEls;
  function make(storage: StorageLike | null, over: Partial<{ confirm: boolean; held: boolean }> = {}) {
    const a = played(15), e = els();
    let session = a.s, loads = 0;
    const m = new SavedModel({
      els: e, store: new SavedStore('neuron-site:snake', storage), kind: SNAKE_KIND, version: SNAKE_VERSION,
      getState: () => toSave(session, 1, a.counters()),
      load: (text) => { const r = loadSnake(text); if (!r.ok) return r; session = r.session; loads++; return { ok: true, message: r.session.games + ' partidas' }; },
      fileName: () => 'x.json', slotName: () => 'Partida ' + session.games,
      held: () => !!over.held, confirm: () => over.confirm ?? true,
    });
    return { m, e, a, get session() { return session; }, get loads() { return loads; } };
  }
  it('guarda solo y lo recupera al abrir (restore)', () => {
    const mem = new MemStorage(), t = make(mem);
    expect(t.m.restore()).toBe('none');
    expect(t.m.save()).toBe(true);
    expect(t.e.stat.textContent).toMatch(/Guardado en este navegador · \d+,\d KB/);
    const t2 = make(mem), r = t2.m.restore();
    expect(r).toMatchObject({ ok: true }); expect(t2.loads).toBe(1);
    expect(t2.e.stat.textContent).toContain('Recuperado');
  });
  it('si lo guardado está roto, no lo usa y lo dice', () => {
    const mem = new MemStorage(); mem.setItem('neuron-site:snake', '{"roto":');
    const t = make(mem), r = t.m.restore();
    expect(r).toMatchObject({ ok: false }); expect(t.loads).toBe(0);
    expect(t.e.stat.textContent).toContain('se empieza con una red nueva');
  });
  it('sin almacén: guardar devuelve false, lo dice, y nada lanza', () => {
    for (const st of [null, Throwing]) {
      const t = make(st);
      expect(t.m.restore()).toBe('none'); expect(t.e.stat.textContent).toContain('no deja guardar');
      expect(t.m.save()).toBe(false); expect(t.m.saveSlot()).toBe(false); expect(t.m.deleteSlot('x')).toBe(false);
      expect(() => t.m.clear()).not.toThrow();
      expect(t.m.text()).toContain('neuron-site');   // descargar y «Ver en texto» siguen valiendo
    }
  });
  it('guardados con nombre: guardar, cargar, ver, borrar con confirmación y tope', () => {
    const mem = new MemStorage(), t = make(mem);
    expect(t.m.saveSlot()).toBe(true);
    const [slot] = t.m.slots.list();
    expect(slot.name).toBe('Partida 15'); expect(t.e.list.innerHTML).toContain('Partida 15'); expect(t.e.list.innerHTML).toContain('Borrar');
    expect(t.m.loadSlot(slot.id)).toMatchObject({ ok: true }); expect(t.loads).toBe(1); expect(t.e.stat.textContent).toContain('Cargado «Partida 15»');
    expect(t.m.loadSlot('nada')).toMatchObject({ ok: false });
    t.m.viewSlot(slot.id); expect(t.e.pre.textContent).toContain('"kind": "snake"'); expect(t.e.text.hidden).toBe(false);
    for (let i = 1; i < MAX_SLOTS; i++) t.m.saveSlot();
    expect(t.m.saveSlot()).toBe(false); expect(t.e.stat.textContent).toContain('máximo');
    expect(t.m.slots.list()).toHaveLength(MAX_SLOTS);
    const no = make(mem, { confirm: false }); expect(no.m.deleteSlot(slot.id)).toBe(false); expect(no.m.slots.list()).toHaveLength(MAX_SLOTS);
    expect(t.m.deleteSlot(slot.id)).toBe(true); expect(t.m.slots.list()).toHaveLength(MAX_SLOTS - 1);
  });
  it('un guardado con nombre roto no se puede cargar y la serpiente sigue como estaba', () => {
    const mem = new MemStorage(), t = make(mem);
    const l = t.m.slots, add = l.add('roto', '{"app":"neuron-site","kind":"snake","version":1,"state":{"games":-3}}');
    if (!add.ok) throw new Error('no cupo');
    expect(t.m.loadSlot(add.slot.id)).toMatchObject({ ok: false }); expect(t.loads).toBe(0); expect(t.e.stat.textContent).toContain('Todo sigue como estaba');
  });
  it('cargar archivo: valida; un archivo roto, grande o de otra pantalla no cambia nada', async () => {
    const t = make(new MemStorage()), good = t.m.text();
    expect(await t.m.importFile({ size: good.length, name: 'a.json', text: async () => good })).toMatchObject({ ok: true }); expect(t.loads).toBe(1);
    for (const body of ['{', '{"app":"neuron-site","kind":"paleta","version":1,"state":{}}']) expect(await t.m.importFile({ size: 10, name: 'b.json', text: async () => body })).toMatchObject({ ok: false });
    expect(await t.m.importFile({ size: 5_000_000, name: 'c.json', text: async () => good })).toMatchObject({ ok: false });
    expect(await t.m.importFile({ size: 10, name: 'd.json', text: async () => { throw new Error('x'); } })).toMatchObject({ ok: false });
    expect(t.loads).toBe(1); expect(t.e.stat.textContent).toContain('Todo sigue como estaba');
  });
  it('«Empezar de cero» borra lo guardado de ahora pero no los guardados con nombre; «Míralo solo» no pisa lo guardado', () => {
    const mem = new MemStorage(), t = make(mem);
    t.m.save(); t.m.saveSlot();
    t.m.clear(); expect(mem.getItem('neuron-site:snake')).toBeNull(); expect(t.m.slots.list()).toHaveLength(1);
    const h = make(mem, { held: true }); expect(h.m.save()).toBe(false); expect(mem.getItem('neuron-site:snake')).toBeNull();
    expect(h.e.stat.textContent).toContain('Míralo solo');
  });
  it('el guardado automático se espacia con throttle', () => {
    const t = make(new MemStorage());
    expect(t.m.save(5000)).toBe(true); expect(t.m.save(5000)).toBe(false); expect(t.m.save()).toBe(true);
  });
});
