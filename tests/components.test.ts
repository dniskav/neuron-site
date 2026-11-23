import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runScript, readMs, type ScriptStep } from '../src/viz/script';
import { AutoMode } from '../src/components/ui/AutoMode';
import { PauseControl } from '../src/components/ui/PauseControl';
import { Toggle } from '../src/components/ui/Toggle';
import { Jars } from '../src/components/ui/Jars';
import { Narrator } from '../src/components/ui/Narrator';
import { ExamChips, ProgressDots, ResultStrip, stripHtml } from '../src/components/ui/Strips';
import { dockEls } from '../src/components/ui/dock';
import { brainAria, brainName } from '../src/components/ui/mountMeter';
import { BrainMeter } from '../src/viz/BrainMeter';
import { FakeEl, FakeRoot, fakeChip, installDom } from './helpers/fakeDom';

type El = HTMLElement;
const as = (e: FakeEl): El => e as unknown as El;
const g = globalThis as Record<string, unknown>;

describe('runScript: el ejecutor genérico de «Míralo solo»', () => {
  interface Ctx { n: number }
  interface Step extends ScriptStep<Ctx> { add: number }
  const mk = (cancelAt = -1) => {
    const ctx: Ctx = { n: 0 }, log: string[] = [];
    let calls = 0;
    return {
      ctx, log,
      api: { ctx: () => ctx, caption: (t: string, link?: boolean) => { log.push('cap:' + t + (link ? '+link' : '')); }, sleep: async (ms: number) => { log.push('sleep:' + ms); }, cancelled: () => calls++ === cancelAt },
    };
  };
  const script: Step[] = [
    { add: 1, before: (c) => 'antes ' + c.n, after: (c) => 'después ' + c.n, hold: 100 },
    { add: 2, after: (c) => 'total ' + c.n, hold: 50, link: true },
  ];
  it('rotula antes y después con lo que PASÓ, hace cada paso y espera (menos tras el enlace)', async () => {
    const { api, log, ctx } = mk();
    const run = await runScript(script, api, (s, c) => { c.n += s.add; });
    expect(run.finished).toBe(true); expect(run.steps).toBe(2); expect(run.ctx).toBe(ctx);
    expect(log).toEqual(['cap:antes 0', 'cap:después 1', 'sleep:100', 'cap:total 3+link']);
  });
  it('se para entre pasos en cuanto lo cancelan, sin hacer el siguiente', async () => {
    const { api, ctx } = mk(2);   // la 3.ª consulta (al empezar el segundo paso) ya está cancelada
    const run = await runScript(script, api, (s, c) => { c.n += s.add; });
    expect(run.finished).toBe(false); expect(run.steps).toBe(1); expect(ctx.n).toBe(1);
  });
  it('con «menos movimiento» alarga la pausa lo que haga falta para leer', async () => {
    const { api, log } = mk();
    await runScript([{ add: 0, after: () => 'x'.repeat(100), hold: 10 } as Step], api, () => {}, { reduced: true });
    expect(log).toContain('sleep:' + readMs('x'.repeat(100)));
  });
  it('log recibe cada paso con su contexto', async () => {
    const { api } = mk(), seen: number[] = [];
    await runScript(script, api, (s, c) => { c.n += s.add; }, { log: (_s, c) => seen.push(c.n) });
    expect(seen).toEqual([1, 3]);
  });
});

describe('ExamChips, ResultStrip y ProgressDots', () => {
  it('ExamChips: marca ✓/✗, un solo «ahora» y reset', () => {
    const els = [fakeChip(), fakeChip(), fakeChip()], ex = new ExamChips(new FakeRoot(els) as unknown as ParentNode);
    expect(ex.length).toBe(3);
    ex.now(1); expect(els[1].classList.contains('now')).toBe(true);
    ex.now(2); expect(els[1].classList.contains('now')).toBe(false); expect(els[2].classList.contains('now')).toBe(true);
    ex.mark(2, true); ex.mark(0, false);
    expect(els[2].classList.contains('ok')).toBe(true); expect(els[2].classList.contains('now')).toBe(false);
    expect(els[2].lastChild?.textContent).toBe('✓'); expect(els[0].lastChild?.textContent).toBe('✗');
    expect(els[2].attrs['aria-label']).toBe('Color 3 del examen: acertó'); expect(els[0].attrs['aria-label']).toBe('Color 1 del examen: falló');
    ex.clearNow(); ex.reset();
    els.forEach((e, i) => { expect(e.className).toBe('ex'); expect(e.lastChild?.textContent).toBe(''); expect(e.attrs['aria-label']).toBe('Color ' + (i + 1) + ' del examen'); });
  });
  it('stripHtml: una bolita por resultado y la última marcada', () => {
    expect(stripHtml([])).toBe('');
    expect(stripHtml([true, false])).toBe('<i class="ok"></i><i class="bad now"></i>');
  });
  it('ResultStrip: pinta la tira, el contador y la descripción (con y sin resultados)', () => {
    const strip = new FakeEl(), count = new FakeEl();
    const r = new ResultStrip(as(strip), as(count), {
      count: (ok, n, extra) => 'Atrapadas: ' + ok + ' de ' + n + extra, empty: 'Ninguna', aria: (ok, n) => ok + '/' + n, emptyAria: 'vacía',
    });
    r.paint([], ' · 0'); expect(count.textContent).toBe('Ninguna'); expect(strip.attrs['aria-label']).toBe('vacía'); expect(strip.innerHTML).toBe('');
    r.paint([true, true, false], ' · 3 guardadas');
    expect(count.textContent).toBe('Atrapadas: 2 de 3 · 3 guardadas'); expect(strip.attrs['aria-label']).toBe('2/3'); expect(strip.innerHTML).toBe(stripHtml([true, true, false]));
  });
  it('ProgressDots: en curso, visto y reset', () => {
    const d = [new FakeEl('i'), new FakeEl('i')], p = new ProgressDots(d.map(as));
    p.now(0); expect(d[0].classList.contains('now')).toBe(true);
    p.seen(0); expect(d[0].classList.contains('now')).toBe(false); expect(d[0].classList.contains('seen')).toBe(true);
    p.reset(); expect(d[0].className).toBe('');
  });
});

describe('Jars, Toggle y Narrator', () => {
  let dom: ReturnType<typeof installDom>;
  beforeEach(() => { dom = installDom(); });
  afterEach(() => dom.restore());

  it('Jars: llena el frasco de k con su % y marca el activo', () => {
    const mkJar = (k: number): FakeEl => { const j = new FakeEl('div', 'jar empty'); j.dataset.k = String(k); j.sub['.liq'] = new FakeEl(); j.sub['.jp'] = new FakeEl(); return j; };
    const a = mkJar(0), b = mkJar(3), jars = new Jars(new FakeRoot([a, b]) as unknown as ParentNode);
    jars.set(3, 92, '3 ejemplos: 92 % de aciertos');
    expect(b.classList.contains('empty')).toBe(false); expect(b.sub['.liq'].styleProps['--h']).toBe('92%'); expect(b.sub['.liq'].styleProps['--q']).toBe('0.92');
    expect(b.sub['.jp'].textContent).toBe('92%'); expect(b.title).toBe('3 ejemplos: 92 % de aciertos'); expect(a.classList.contains('empty')).toBe(true);
    jars.highlight(3); expect(b.classList.contains('on')).toBe(true); expect(a.classList.contains('on')).toBe(false);
    jars.highlight(0); expect(a.classList.contains('on')).toBe(true); expect(b.classList.contains('on')).toBe(false);
  });
  it('Toggle: rótulo, aria-pressed, explicación y, con nombre real, el nombre en mono', () => {
    const btn = new FakeEl('button'), exp = new FakeEl('p'), t = new Toggle(as(btn), as(exp));
    t.paint({ label: 'Paredes: sí', on: true, explain: 'La bola rebota.' });
    expect(btn.textContent).toBe('Paredes: sí'); expect(btn.attrs['aria-pressed']).toBe('true'); expect(exp.textContent).toBe('La bola rebota.');
    t.paint({ label: 'Las del medio se doblan: no', fn: 'linear', on: false, tint: true, explain: 'Sin curva.', disabled: true });
    expect(btn.attrs['aria-pressed']).toBe('false'); expect(btn.disabled).toBe(true); expect(btn.classList.contains('on')).toBe(false);
    expect(btn.children).toHaveLength(1); expect(btn.children[0].className).toBe('pmono'); expect(btn.children[0].textContent).toBe('· linear');
    expect(btn.textContent).toBe('Las del medio se doblan: no ');
    t.paint({ label: 'x', fn: 'tanh', on: true, tint: true, explain: '' }); expect(btn.classList.contains('on')).toBe(true);
  });
  it('Narrator: estado, anuncio y frase con su letra pequeña', () => {
    const st = new FakeEl(), lv = new FakeEl(), ph = new FakeEl(), n = new Narrator({ status: as(st), live: as(lv), phrase: as(ph) });
    n.status('Examen'); n.say('Acertó 3'); n.phrase('Idea', 'detalle');
    expect(st.textContent).toBe('Examen'); expect(lv.textContent).toBe('Acertó 3'); expect(ph.innerHTML).toBe('Idea<small>detalle</small>');
    n.phrase(); expect(ph.innerHTML).toBe('');
    expect(() => new Narrator({}).status('x')).not.toThrow();
  });
});

describe('dockEls: los ids que pone CodeBrainDock por prefijo', () => {
  const ids = (p: string, wrap = p + 'code'): string[] => [wrap, p + 'ccode', p + 'cbtn', p + 'cpanel', p + 'ccopy', p + 'bbtn', p + 'bpanel', p + 'bcopy'];
  const run = (p: string, wrap?: string): void => {
    const asked: string[] = [];
    g.document = { getElementById: (id: string) => { asked.push(id); return new FakeEl(); } };
    dockEls(p, wrap);
    expect([...new Set(asked)].sort()).toEqual(ids(p, wrap).sort());
  };
  it('Enséñale («» con envoltorio ecode), Equipo («q») y Paleta («pa»): los ids de siempre', () => {
    const saved = g.document;
    try {
      run('', 'ecode');
      expect(ids('', 'ecode')).toEqual(['ecode', 'ccode', 'cbtn', 'cpanel', 'ccopy', 'bbtn', 'bpanel', 'bcopy']);
      run('q'); expect(ids('q')).toEqual(['qcode', 'qccode', 'qcbtn', 'qcpanel', 'qccopy', 'qbbtn', 'qbpanel', 'qbcopy']);
      run('pa'); expect(ids('pa')).toEqual(['pacode', 'paccode', 'pacbtn', 'pacpanel', 'paccopy', 'pabbtn', 'pabpanel', 'pabcopy']);
    } finally { g.document = saved; }
  });
});

describe('brainAria: el cerebro dice lo que aprendió y, aparte, el % de la red entera', () => {
  it('vacío, con aprendizaje y con %', () => {
    const m = new BrainMeter(3);
    expect(brainName(1)).toBe('Cerebro de 1 neurona'); expect(brainName(3)).toBe('Cerebro de 3 neuronas');
    expect(brainAria(m, null)).toBe('Cerebro de 3 neuronas, vacío: todavía no ha aprendido nada');
    m.setTravel([100, 100, 100], 10); m.ease(1, true);
    expect(brainAria(m, 92, 'de aciertos')).toBe('Cerebro de 3 neuronas, lleno al 100 por ciento con lo que ha aprendido; 92 por ciento de aciertos');
  });
});

describe('PauseControl', () => {
  let dom: ReturnType<typeof installDom>;
  beforeEach(() => { dom = installDom(); });
  afterEach(() => dom.restore());
  const mk = () => {
    const btn = new FakeEl('button'), ico = new FakeEl('span'), sec = new FakeEl('section'), said: string[] = [], changes: boolean[] = [];
    let cb: ((i: number, el: HTMLElement) => void) | null = null;
    const pager = { onChange: (f: (i: number, el: HTMLElement) => void) => { cb = f; } };
    const pc = new PauseControl({ button: as(btn), icon: as(ico), section: as(sec), say: (t) => said.push(t), onChange: (p) => changes.push(p), pager: pager as never });
    return { pc, btn, ico, sec, said, changes, here: (el: FakeEl) => cb?.(0, as(el)) };
  };
  const key = (target: FakeEl | null, extra: Record<string, unknown> = {}): { prevented: boolean } => {
    const e = { code: 'Space', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    (dom.doc.listeners.keydown || []).forEach((h) => h(e as never));
    return { prevented: e.prevented };
  };
  it('el botón alterna: estado, aria, icono, anuncio y aviso; scale da 0 en pausa', () => {
    const { pc, btn, ico, sec, said, changes } = mk();
    expect(pc.scale(0.5)).toBe(0.5);
    btn.click();
    expect(pc.paused).toBe(true); expect(sec.dataset.paused).toBe('1'); expect(btn.attrs['aria-pressed']).toBe('true'); expect(btn.attrs['aria-label']).toBe('Reanudar el juego');
    expect(ico.textContent).toBe('▶'); expect(said).toEqual(['Juego en pausa.']); expect(changes).toEqual([true]); expect(pc.scale(0.5)).toBe(0);
    pc.set(true); expect(changes).toEqual([true]);   // sin cambio, sin aviso
    btn.click(); expect(pc.paused).toBe(false); expect(ico.textContent).toBe('❚❚'); expect(sec.dataset.paused).toBe('0');
  });
  it('la barra espaciadora solo pausa con la pantalla a la vista y sin un control enfocado', () => {
    const { pc, sec, here } = mk();
    key(null); expect(pc.paused).toBe(false);                 // la pantalla no está a la vista
    here(sec);
    expect(key(new FakeEl('button')).prevented).toBe(false); expect(pc.paused).toBe(false);   // un botón enfocado: la barra lo pulsa a él
    expect(key(new FakeEl('div'), { shiftKey: true }).prevented).toBe(false);
    expect(key(new FakeEl('div')).prevented).toBe(true); expect(pc.paused).toBe(true);
    here(new FakeEl('section')); key(new FakeEl('div')); expect(pc.paused).toBe(true);        // otra pantalla: no hace nada
  });
});

describe('AutoMode: «Míralo solo» (botón, rótulo, enlace, parar)', () => {
  let dom: ReturnType<typeof installDom>;
  beforeEach(() => { dom = installDom(); vi.useFakeTimers(); });
  afterEach(() => { dom.restore(); vi.useRealTimers(); });
  const mk = (extra: Record<string, unknown> = {}) => {
    const sec = new FakeEl('section'), btn = new FakeEl('button'), cap = new FakeEl('p'), other = new FakeEl('button'), said: string[] = [], events: string[] = [], went: number[] = [];
    cap.hidden = true;
    let change: ((i: number, el: HTMLElement) => void) | null = null;
    const pager = { main: {}, sections: [{ id: 'a' }, { id: 'snake' }], go: (i: number) => went.push(i), onChange: (f: (i: number, el: HTMLElement) => void) => { change = f; } };
    const auto = new AutoMode({
      section: as(sec), button: as(btn), caption: as(cap), link: { id: 'snake', text: '→ Snake' }, pager: pager as never, say: (t) => said.push(t),
      onChange: (r) => events.push('change:' + r), onStop: () => events.push('stop'), beforeStart: () => events.push('before'), ...extra,
    });
    return { auto, sec, btn, cap, other, said, events, went, leave: () => change?.(1, as(new FakeEl())) };
  };
  const never = (): Promise<void> => new Promise(() => {});
  it('pulsar el botón empieza (antes cortando lo anterior), cambia el rótulo del botón y marca la pantalla', () => {
    const { auto, btn, sec, events } = mk();
    auto.onPress(never);
    btn.click();
    expect(auto.running).toBe(true); expect(btn.textContent).toBe('❚❚ Parar'); expect(btn.attrs['aria-pressed']).toBe('true'); expect(sec.dataset.auto).toBe('1');
    expect(events).toEqual(['before', 'change:true']);
  });
  it('pulsarlo otra vez para: rótulo fuera, estado en reposo y la pantalla se recoge', () => {
    const { auto, btn, sec, cap, events } = mk();
    auto.onPress(never); btn.click();
    auto.setCaption('hola'); expect(cap.hidden).toBe(false); expect(sec.dataset.cap).toBe('1');
    btn.click();
    expect(auto.running).toBe(false); expect(btn.textContent).toBe('▶ Míralo solo'); expect(btn.attrs['aria-pressed']).toBe('false');
    expect(cap.hidden).toBe(true); expect(sec.dataset.cap).toBeUndefined(); expect(sec.dataset.auto).toBeUndefined();
    expect(events).toEqual(['before', 'change:true', 'change:false', 'stop']);
  });
  it('el rótulo con enlace trae un «→ Snake» que lleva a la pantalla siguiente', () => {
    const { auto, cap, went } = mk();
    auto.setCaption('fin', true);
    const a = cap.children[0];
    expect(a.className).toBe('nautolink'); expect(a.textContent).toBe('→ Snake');
    a.fire('click', { preventDefault: () => {} });
    expect(went).toEqual([1]);
  });
  it('tocar otro control (o cambiar de pantalla o de pestaña) para el modo; el botón de pausa y el enlace no', () => {
    const pause = new FakeEl('button'), a = mk({ keep: [as(pause)] });
    a.auto.onPress(never); a.btn.click();
    a.sec.fire('click', { target: pause }); expect(a.auto.running).toBe(true);
    const link = new FakeEl('a', 'nautolink'); a.sec.fire('click', { target: link }); expect(a.auto.running).toBe(true);
    a.sec.fire('click', { target: a.other }); expect(a.auto.running).toBe(false);
    a.btn.click(); expect(a.auto.running).toBe(true);
    a.leave(); expect(a.auto.running).toBe(false);
    a.btn.click(); dom.doc.hidden = true; (dom.doc.listeners.visibilitychange || []).forEach((h) => h({})); expect(a.auto.running).toBe(false);
  });
  it('tocar otro control con el rótulo final puesto (sin estar en marcha) lo quita', () => {
    const { auto, sec, cap, other } = mk();
    auto.setCaption('El final');
    sec.fire('click', { target: other });
    expect(cap.hidden).toBe(true); expect(auto.running).toBe(false);
  });
  it('el guion recibe un asa: caption rotula y anuncia, until espera y sleep respeta la pausa; al acabar vuelve al reposo', async () => {
    let paused = false;
    const { auto, btn, said, cap } = mk({ paused: () => paused });
    let handle!: Parameters<Parameters<typeof auto.start>[0]>[0];
    auto.onPress(async (h) => { handle = h; await h.sleep(1000); });
    btn.click();
    handle.caption('Paso 1'); expect(cap.textContent).toBe('Paso 1'); expect(said).toEqual(['Paso 1']);
    let flag = false; const waited = handle.until(() => flag);
    paused = true; await vi.advanceTimersByTimeAsync(2000);
    expect(auto.running).toBe(true);                               // el sleep del guion está congelado por la pausa
    paused = false; flag = true; await vi.advanceTimersByTimeAsync(100); await waited;
    await vi.advanceTimersByTimeAsync(1200);
    expect(auto.running).toBe(false);                              // acabó solo: vuelve al reposo
    expect(btn.textContent).toBe('▶ Míralo solo');
    expect(handle.dead()).toBe(true);
  });
  it('si lo paran, dead() es verdadero y un guion nuevo no hereda al viejo', () => {
    const { auto, btn } = mk();
    const hs: { dead(): boolean }[] = [];
    auto.onPress(async (h) => { hs.push(h); await never(); });
    btn.click(); btn.click(); btn.click();
    expect(hs[0].dead()).toBe(true); expect(hs[1].dead()).toBe(false);
  });
});
