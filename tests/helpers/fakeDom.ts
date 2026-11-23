/**
 * Un DOM de mentira, lo mínimo para probar los componentes de `src/components/ui` sin navegador (los tests corren en node):
 * clases, atributos, dataset, texto, hijos, eventos y los `querySelector` que usan los componentes.
 */
type Handler = (e: Record<string, unknown>) => void;

export class FakeEl {
  className = '';
  hidden = false;
  disabled = false;
  title = '';
  textContent = '';
  innerHTML = '';
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  handlers: Record<string, Handler[]> = {};
  /** Lo que devuelve `querySelector(sel)`. */
  sub: Record<string, FakeEl> = {};
  styleProps: Record<string, string> = {};
  style = { setProperty: (k: string, v: string): void => { this.styleProps[k] = v; }, background: '' };
  constructor(public tag = 'div', cls = '') { this.className = cls; }

  classList = {
    add: (...c: string[]): void => { const s = new Set(this.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); this.className = [...s].join(' '); },
    remove: (...c: string[]): void => { const s = new Set(this.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.delete(x)); this.className = [...s].join(' '); },
    contains: (c: string): boolean => this.className.split(/\s+/).includes(c),
    toggle: (c: string, on?: boolean): void => { const has = this.classList.contains(c); if (on === undefined ? !has : on) this.classList.add(c); else this.classList.remove(c); },
  };
  get lastChild(): FakeEl | null { return this.children[this.children.length - 1] ?? null; }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  getAttribute(k: string): string | null { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k: string): void { delete this.attrs[k]; }
  addEventListener(t: string, h: Handler): void { (this.handlers[t] ||= []).push(h); }
  fire(t: string, e: Record<string, unknown> = {}): void { (this.handlers[t] || []).forEach((h) => h({ target: this, ...e })); }
  click(): void { this.fire('click'); }
  querySelector(sel: string): FakeEl | null { return this.sub[sel] ?? null; }
  closest(sel: string): FakeEl | null { return sel.split(',').map((x) => x.trim()).includes(this.tag) ? this : null; }
  append(...n: (FakeEl | string)[]): void { n.forEach((x) => { if (typeof x !== 'string') this.children.push(x); else this.textContent += x; }); }
  replaceChildren(...n: (FakeEl | string)[]): void { this.children = []; this.textContent = ''; this.append(...n); }
  focus(): void { /* nada */ }
}

/** Un contenedor cuyo `querySelectorAll(sel)` devuelve lo dado. */
export class FakeRoot {
  constructor(public items: FakeEl[]) {}
  querySelectorAll(): FakeEl[] { return this.items; }
}

/** Un elemento `.ex` del examen: una muestra y una marca (`lastChild`). */
export function fakeChip(): FakeEl {
  const c = new FakeEl('div', 'ex'); c.children = [new FakeEl('i'), new FakeEl('span')]; return c;
}

/** Instala `document`, `IntersectionObserver` y `performance` mínimos; devuelve cómo deshacerlo. */
export function installDom(): { doc: { listeners: Record<string, Handler[]>; hidden: boolean }; restore: () => void } {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, IntersectionObserver: g.IntersectionObserver, Element: g.Element };
  const doc = { listeners: {} as Record<string, Handler[]>, hidden: false };
  g.document = {
    get hidden() { return doc.hidden; },
    addEventListener: (t: string, h: Handler) => { (doc.listeners[t] ||= []).push(h); },
    createElement: (tag: string) => new FakeEl(tag),
  };
  g.IntersectionObserver = class { observe(): void { /* nada */ } };
  g.Element = FakeEl;
  return { doc, restore: () => { g.document = saved.document; g.IntersectionObserver = saved.IntersectionObserver; g.Element = saved.Element; } };
}
