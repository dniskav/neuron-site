import { MAX_SLOTS, SaveList, SavedStore, encode, sizeKB, stringify } from '../../viz/savedModel';
import { Panel, bindCopy } from './Panel';

export interface SavedEls { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; stat: HTMLElement; save: HTMLElement; down: HTMLElement; load: HTMLElement; file: HTMLInputElement; view: HTMLElement; text: HTMLElement; pre: HTMLElement; list: HTMLElement }
/** Lo que una pantalla contesta al cargar un texto (de un archivo, del navegador o de un guardado): lo adopta y dice qué hizo, o dice por qué no. */
export type LoadResult = { ok: true; message: string } | { ok: false; reason: string };
export interface SavedModelOptions {
  els: SavedEls;
  store: SavedStore;
  kind: string;
  version: number;
  /** Lo que se guarda (el `state` del sobre): se pide en el momento, así que siempre es lo de ahora. */
  getState: () => unknown;
  /** La pantalla adopta un texto guardado (comprueba todo antes de tocar nada). */
  load: (text: string) => LoadResult;
  /** Nombre del archivo que se descarga. */
  fileName: () => string;
  /** Nombre automático de un guardado («Partida 120 · récord 31 · 23/11 10:42»). */
  slotName: (now: Date) => string;
  /** Si es `true`, no se guarda solo (p. ej. mientras corre «Míralo solo», para no pisar lo que la persona entrenó). */
  held?: () => boolean;
  /** Para pedir confirmación al borrar (por defecto, `window.confirm`). */
  confirm?: (text: string) => boolean;
}
export const els = (p: string): SavedEls => {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(p + id) as T;
  return { btn: $('sbtn'), panel: $('spanel'), wrap: $('code'), copy: $('scopy'), stat: $('sstat'), save: $('ssave'), down: $('sdown'), load: $('sload'), file: $<HTMLInputElement>('sfile'), view: $('sview'), text: $('stext'), pre: $('spre'), list: $('slist') };
};

const NO_STORAGE = 'Este navegador no deja guardar: todo funciona igual, pero al recargar se empieza de cero. «Descargar» sí funciona.';
/** Un archivo más grande que esto no es de esta pantalla (lo guardado pesa unos KB). */
export const MAX_FILE = 1_000_000;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/**
 * «Guardado»: algo así como guardar y cargar un modelo. Guarda solo lo entrenado en el navegador (`SavedStore`, con try/catch: si
 * no se puede, lo dice y todo sigue funcionando); guarda momentos con nombre (hasta `MAX_SLOTS`, cada uno con «Cargar», «Ver en
 * texto» y «Borrar» con confirmación); descarga el archivo con sangría; lo enseña en texto con copiar; y carga un archivo
 * descargado. La pantalla pone `getState` y `load` (que valida todo antes de tocar nada).
 */
export class SavedModel {
  readonly panel: Panel;
  readonly slots: SaveList;
  /** Qué enseña «Ver en texto»: lo de ahora (`null`) o un guardado con nombre. */
  private viewing: { id: string | null } | null = null;
  private lastSave = 0;
  /** Lo último que se escribió (para decir cuánto ocupa). */
  lastText = '';
  constructor(private o: SavedModelOptions) {
    const e = o.els;
    this.slots = new SaveList(o.store);
    this.panel = new Panel({ btn: e.btn, panel: e.panel, wrap: e.wrap, onOpen: () => { this.renderList(); this.refreshView(); } });
    e.save.addEventListener('click', () => this.saveSlot());
    e.down.addEventListener('click', () => this.download());
    e.load.addEventListener('click', () => e.file.click());
    e.file.addEventListener('change', () => { const f = e.file.files?.[0]; if (f) void this.importFile(f); e.file.value = ''; });
    e.view.addEventListener('click', () => { this.viewing = this.viewing && this.viewing.id === null ? null : { id: null }; this.refreshView(); });
    e.list.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b) return;
      const id = b.getAttribute('data-id') as string, act = b.getAttribute('data-act');
      if (act === 'load') this.loadSlot(id); else if (act === 'view') this.viewSlot(id); else if (act === 'del') this.deleteSlot(id);
    });
    bindCopy(e.copy, () => this.shown());
    this.renderList(); this.refreshView();
  }
  /** El texto de ahora, con sangría. */
  text(pretty = true): string { return stringify(encode(this.o.kind, this.o.version, this.o.getState()), pretty); }
  private say(t: string): void { this.o.els.stat.textContent = t; }
  /** Lo que enseña el panel de texto. */
  private shown(): string {
    if (this.viewing?.id) { const s = this.slots.get(this.viewing.id); if (s) { try { return JSON.stringify(JSON.parse(s.text), null, 2); } catch { return s.text; } } }
    return this.text();
  }
  private refreshView(): void {
    const e = this.o.els, v = this.viewing;
    e.view.setAttribute('aria-expanded', v && v.id === null ? 'true' : 'false');
    e.view.textContent = v && v.id === null ? 'Ocultar el texto' : 'Ver en texto';
    e.text.hidden = !v;
    if (v) e.pre.textContent = this.shown();
  }
  renderList(): void {
    const l = this.slots.list();
    this.o.els.list.innerHTML = l.length
      ? l.map((s) => '<li class="sslot"><span class="sname">' + esc(s.name) + '</span><span class="sbtns">'
        + '<button type="button" class="slink" data-act="load" data-id="' + esc(s.id) + '">Cargar</button>'
        + '<button type="button" class="slink" data-act="view" data-id="' + esc(s.id) + '">Ver en texto</button>'
        + '<button type="button" class="slink sdel" data-act="del" data-id="' + esc(s.id) + '">Borrar</button></span></li>').join('')
      : '<li class="sempty">Aún no hay guardados con nombre (caben ' + MAX_SLOTS + ').</li>';
  }
  /** Guarda en el navegador lo de ahora, en una línea. `throttleMs`: si hace menos que eso que guardó, no lo hace. Devuelve si escribió. */
  save(throttleMs = 0): boolean {
    if (this.o.held?.()) { this.say('Mientras ves «Míralo solo» no se guarda: lo que ya tenías guardado sigue intacto.'); return false; }
    const now = Date.now();
    if (throttleMs && now - this.lastSave < throttleMs) return false;
    this.lastSave = now;
    const text = this.text(false);
    const ok = this.o.store.write(text);
    if (ok) { this.lastText = text; this.say('Guardado en este navegador · ' + sizeKB(text)); }
    else this.say(NO_STORAGE);
    if (this.viewing && this.viewing.id === null && this.o.els.panel.classList.contains('open')) this.refreshView();
    return ok;
  }
  /** «Guardar este momento»: un guardado con nombre automático. */
  saveSlot(now: Date = new Date()): boolean {
    const name = this.o.slotName(now), r = this.slots.add(name, this.text(false), now);
    if (r.ok) this.say('Guardado «' + name + '»');
    else this.say(r.why === 'full' ? 'Ya hay ' + this.slots.max + ' guardados (el máximo): borra uno para guardar otro.' : NO_STORAGE);
    this.renderList();
    return r.ok;
  }
  loadSlot(id: string): LoadResult {
    const s = this.slots.get(id);
    const r: LoadResult = s ? this.o.load(s.text) : { ok: false, reason: 'ese guardado ya no está' };
    if (r.ok) { this.save(); this.say('Cargado «' + (s as { name: string }).name + '»: ' + r.message); }
    else this.say('No se pudo cargar (' + r.reason + '). Todo sigue como estaba.');
    return r;
  }
  viewSlot(id: string): void { this.viewing = { id }; this.refreshView(); }
  deleteSlot(id: string): boolean {
    const s = this.slots.get(id);
    if (!s) { this.renderList(); return false; }
    const ask = this.o.confirm ?? ((t: string) => (typeof window !== 'undefined' ? window.confirm(t) : false));
    if (!ask('¿Borrar «' + s.name + '»? No se puede deshacer.')) return false;
    const ok = this.slots.remove(id);
    if (this.viewing?.id === id) this.viewing = null;
    this.say(ok ? 'Borrado «' + s.name + '».' : NO_STORAGE);
    this.renderList(); this.refreshView();
    return ok;
  }
  /** Al abrir la página: recupera lo guardado. `'none'` si no había nada. */
  restore(): LoadResult | 'none' {
    const text = this.o.store.read();
    if (text === null) { this.say(this.o.store.available() ? 'Todavía no hay nada guardado: se guarda solo al aprender.' : NO_STORAGE); return 'none'; }
    const r = this.o.load(text);
    this.say(r.ok ? 'Recuperado de este navegador: ' + r.message : 'Lo que había guardado no se pudo usar (' + r.reason + '): se empieza con una red nueva.');
    return r;
  }
  /** «Empezar de cero»: borra lo guardado de ahora (los guardados con nombre se quedan: son tuyos). */
  clear(): void { const had = this.o.store.read() !== null; this.o.store.remove(); this.lastText = ''; this.say(had ? 'Borrado lo guardado de ahora. Tus guardados con nombre siguen ahí.' : 'Todavía no hay nada guardado: se guarda solo al aprender.'); if (this.viewing && this.viewing.id === null) this.refreshView(); }
  /** Descarga el archivo (un `Blob` y un enlace temporal). Devuelve la dirección del blob (para comprobarlo). */
  download(): string {
    const url = URL.createObjectURL(new Blob([this.text()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = this.o.fileName(); a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.say('Descargado: ' + this.o.fileName());
    return url;
  }
  /** Carga un archivo descargado: la pantalla lo valida; si no sirve, lo dice y no cambia nada. */
  async importFile(f: { size: number; name: string; text(): Promise<string> }): Promise<LoadResult> {
    let r: LoadResult;
    if (f.size > MAX_FILE) r = { ok: false, reason: 'el archivo es demasiado grande para ser de esta pantalla' };
    else { try { r = this.o.load(await f.text()); } catch { r = { ok: false, reason: 'no se pudo leer el archivo' }; } }
    if (r.ok) { this.save(); this.say('Cargado «' + f.name + '»: ' + r.message); }
    else this.say('No se pudo usar «' + f.name + '» (' + r.reason + '). Todo sigue como estaba.');
    return r;
  }
}
