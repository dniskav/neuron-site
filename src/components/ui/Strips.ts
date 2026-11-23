/**
 * Las tiras de marcas ✓/✗ de las pantallas:
 *  - `ExamChips`: los 12 colores del examen (cada uno con su muestra y su marca).
 *  - `ResultStrip`: las últimas bolitas (atrapada / no) con su contador.
 *  - `ProgressDots`: los puntos de los ejemplos con los que aprende (en curso / visto).
 * Cada una trabaja sobre el marcado que ponen los componentes Astro `ExamStrip`, `ResultStrip` y `ColorDots`.
 */

/** El examen: `.ex` con una muestra `<i>` y una marca `<span>`. */
export class ExamChips {
  private chips: HTMLElement[];
  constructor(root: ParentNode, selector = '.ex') { this.chips = Array.from(root.querySelectorAll<HTMLElement>(selector)); }
  get length(): number { return this.chips.length; }
  /** Todos sin marca. */
  reset(): void {
    this.chips.forEach((c, i) => { c.className = 'ex'; (c.lastChild as HTMLElement).textContent = ''; c.setAttribute('aria-label', 'Color ' + (i + 1) + ' del examen'); });
  }
  /** El color `i` es el que se examina ahora (los demás dejan de serlo). */
  now(i: number): void { this.chips.forEach((c) => c.classList.remove('now')); this.chips[i].classList.add('now'); }
  /** Ninguno en curso. */
  clearNow(): void { this.chips.forEach((c) => c.classList.remove('now')); }
  /** Acertó (✓) o falló (✗) en el color `i`. */
  mark(i: number, ok: boolean): void {
    const c = this.chips[i];
    c.classList.remove('now'); c.classList.add(ok ? 'ok' : 'bad');
    (c.lastChild as HTMLElement).textContent = ok ? '✓' : '✗';
    c.setAttribute('aria-label', 'Color ' + (i + 1) + ' del examen: ' + (ok ? 'acertó' : 'falló'));
  }
}

/** El HTML de la tira: una bolita por resultado y la última marcada como «ahora». */
export function stripHtml(results: boolean[]): string {
  return results.map((ok, i) => '<i class="' + (ok ? 'ok' : 'bad') + (i === results.length - 1 ? ' now' : '') + '"></i>').join('');
}

export interface ResultStripText {
  /** El contador: p. ej. «Atrapadas: 3 de 5». Con `extra` (lo que la pantalla quiera añadir: «· 5 guardadas»). */
  count(ok: number, total: number, extra?: string): string;
  /** El contador sin resultados. */
  empty: string;
  /** La descripción para lectores de pantalla. */
  aria(ok: number, total: number): string;
  emptyAria: string;
}
/** Las últimas bolitas ✓/✗ con su contador. */
export class ResultStrip {
  constructor(private strip: HTMLElement, private counter: HTMLElement, private text: ResultStripText) {}
  /** Pinta los resultados (`true` = bien). */
  paint(results: boolean[], extra = ''): void {
    const ok = results.filter(Boolean).length, n = results.length;
    this.strip.innerHTML = stripHtml(results);
    this.counter.textContent = n ? this.text.count(ok, n, extra) : this.text.empty;
    this.strip.setAttribute('aria-label', n ? this.text.aria(ok, n) : this.text.emptyAria);
  }
}

/** Los puntos de los ejemplos con los que aprende: el que se está enseñando (`now`) y los ya vistos (`seen`). */
export class ProgressDots {
  constructor(private dots: HTMLElement[]) {}
  reset(): void { this.dots.forEach((d) => { d.className = ''; }); }
  now(i: number): void { this.dots[i].classList.add('now'); }
  seen(i: number): void { this.dots[i].classList.remove('now'); this.dots[i].classList.add('seen'); }
}
