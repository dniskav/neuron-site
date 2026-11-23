/**
 * Guardar lo entrenado (pieza reutilizable, TS puro, sin DOM): el sobre del archivo y el almacén del navegador.
 *
 * El sobre lleva una versión: `{ app, kind, version, savedAt, state }`. `kind` dice de qué pantalla es («snake»); `state` lo pone
 * y lo comprueba cada pantalla (sus pesos —con `ModelSaver` de @dniskav/neuron—, contadores…). Un texto que no se puede leer,
 * de otra pantalla, de otra versión o con un `state` que no encaja NO se usa: `decode` dice por qué, en español, y quien lo
 * llama empieza con una red nueva y lo cuenta. `older`: versiones anteriores que `check` sabe leer (recibe la versión del texto). El almacén (`SavedStore`) envuelve `localStorage` con try/catch: si el navegador
 * no deja guardar, la página funciona igual y `write` solo devuelve `false`.
 */
export const SAVE_APP = 'neuron-site';

export interface Envelope<T> { app: typeof SAVE_APP; kind: string; version: number; savedAt: string; state: T }
export type Decoded<T> = { ok: true; state: T; savedAt: string } | { ok: false; reason: string };

export function encode<T>(kind: string, version: number, state: T, now: Date = new Date()): Envelope<T> {
  return { app: SAVE_APP, kind, version, savedAt: now.toISOString(), state };
}
/** El texto del archivo: `pretty` con sangría (descargar, «Ver en texto») o en una línea (el almacén del navegador). */
export function stringify(env: Envelope<unknown>, pretty = true): string {
  return pretty ? JSON.stringify(env, null, 2) : JSON.stringify(env);
}

/**
 * Lee un texto guardado. `check` comprueba y devuelve el `state` (o lanza un `Error` con el motivo en español). Nunca lanza:
 * devuelve `{ ok: false, reason }`.
 */
export function decode<T>(text: string, kind: string, version: number, check: (state: unknown, version: number) => T, older: readonly number[] = []): Decoded<T> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'no es un archivo guardado de este sitio (no se puede leer)' }; }
  const e = raw as Partial<Envelope<unknown>> | null;
  if (!e || typeof e !== 'object' || Array.isArray(e) || e.app !== SAVE_APP) return { ok: false, reason: 'no es un archivo guardado de este sitio' };
  if (e.kind !== kind) return { ok: false, reason: 'es de otra pantalla («' + String(e.kind) + '»), no de esta («' + kind + '»)' };
  if (e.version !== version && !older.includes(e.version as number)) return { ok: false, reason: 'es de otra versión (' + String(e.version) + '); esta entiende la ' + version };
  try { return { ok: true, state: check(e.state, e.version as number), savedAt: typeof e.savedAt === 'string' ? e.savedAt : '' }; }
  catch (err) { return { ok: false, reason: (err as Error).message }; }
}

/** Lo mínimo de `localStorage` que se usa (para poder probarlo con uno de mentira). */
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** `localStorage` si existe y se deja usar (acceder a él puede lanzar en ventanas privadas o con los datos bloqueados). */
export function browserStorage(): StorageLike | null {
  try { return (globalThis as { localStorage?: StorageLike }).localStorage ?? null; } catch { return null; }
}

/** Un hueco del almacén del navegador. Todo va con try/catch: sin almacén, `read` da `null` y `write`/`remove` dan `false`. */
export class SavedStore {
  constructor(readonly key: string, private storage: StorageLike | null | undefined = undefined) {}
  private get st(): StorageLike | null { return this.storage === undefined ? browserStorage() : this.storage; }
  readKey(k: string): string | null { try { return this.st?.getItem(k) ?? null; } catch { return null; } }
  writeKey(k: string, text: string): boolean { try { const s = this.st; if (!s) return false; s.setItem(k, text); return true; } catch { return false; } }
  read(): string | null { try { return this.st?.getItem(this.key) ?? null; } catch { return null; } }
  /** ¿Se puede escribir y borrar de verdad? (prueba con una clave suya) */
  available(): boolean {
    try { const s = this.st; if (!s) return false; const k = this.key + ':probe'; s.setItem(k, '1'); s.removeItem(k); return true; } catch { return false; }
  }
  write(text: string): boolean { try { const s = this.st; if (!s) return false; s.setItem(this.key, text); return true; } catch { return false; } }
  remove(): boolean { try { const s = this.st; if (!s) return false; s.removeItem(this.key); return true; } catch { return false; } }
}

/** Tamaño en texto: «3,4 KB» (un KB = 1024 bytes, contando UTF-8). */
export function sizeKB(text: string): string {
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
  return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
}

/** Un guardado con nombre: el texto completo del sobre (en una línea) y cuándo y cómo se llamó. */
export interface Slot { id: string; name: string; savedAt: string; text: string }
/** Cuántos guardados con nombre caben (cada uno ocupa unos KB). */
export const MAX_SLOTS = 5;

/**
 * Guardados con nombre en el navegador (algo así como «guardar y cargar un modelo»): una lista corta en UNA clave
 * (`{key}:slots`). Una entrada rota (sin nombre, sin texto, no objeto) se ignora al leer; si la lista entera no se puede leer,
 * se trata como vacía. Con el tope lleno, `add` NO borra nada por su cuenta: dice que no cabe. Todo con try/catch.
 */
export class SaveList {
  readonly max: number;
  constructor(private store: SavedStore, max = MAX_SLOTS) { this.max = max; }
  private get key(): string { return this.store.key + ':slots'; }
  list(): Slot[] {
    let raw: unknown;
    try { raw = JSON.parse(this.store.readKey(this.key) ?? '[]'); } catch { return []; }
    if (!Array.isArray(raw)) return [];
    const out: Slot[] = [];
    for (const s of raw) {
      if (s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.text === 'string' && typeof s.savedAt === 'string' && s.text.length <= 1_000_000) out.push({ id: s.id, name: s.name, savedAt: s.savedAt, text: s.text });
    }
    return out.slice(0, this.max);
  }
  private put(list: Slot[]): boolean { return this.store.writeKey(this.key, JSON.stringify(list)); }
  /** Añade un guardado. `full` si ya hay `max`; `error` si el navegador no deja guardar. */
  add(name: string, text: string, now: Date = new Date()): { ok: true; slot: Slot } | { ok: false; why: 'full' | 'error' } {
    const list = this.list();
    if (list.length >= this.max) return { ok: false, why: 'full' };
    const slot: Slot = { id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), name, savedAt: now.toISOString(), text };
    return this.put([...list, slot]) ? { ok: true, slot } : { ok: false, why: 'error' };
  }
  get(id: string): Slot | null { return this.list().find((s) => s.id === id) ?? null; }
  remove(id: string): boolean { const l = this.list(); return l.some((s) => s.id === id) ? this.put(l.filter((s) => s.id !== id)) : false; }
}
