/**
 * «Cuánto vale cada opción»: las barras de la red cuando cada salida es el valor de una jugada. Trabaja sobre el marcado del
 * componente Astro `ValueBars`. No sabe nada de ninguna pantalla: recibe los números y quién eligió.
 */

/** Dónde empieza y cuánto mide una barra que sale del centro: `v` entre −max y +max (más allá se recorta). Porcentajes del ancho. */
export function barSpan(v: number, max: number): { left: number; width: number } {
  const w = Math.min(1, Math.abs(v) / (max || 1)) * 50;
  return { left: v >= 0 ? 50 : 50 - w, width: w };
}

export interface ValueBarsPaint {
  /** El valor de cada opción; `null` = todavía no hay nada que enseñar (barras vacías). */
  values: number[] | null;
  /** La opción elegida. */
  chosen?: number | null;
  /** La que más valía (se marca aunque el dado haya elegido otra). */
  best?: number | null;
  /** La opción la eligió el dado, no la red. */
  random?: boolean;
  /** El texto de debajo. */
  note?: string;
}

export class ValueBars {
  private rows: HTMLElement[];
  private noteEl: HTMLElement | null;
  /** `max`: el valor que llena media barra (a partir de ahí se recorta). */
  constructor(root: HTMLElement, private max = 2) {
    this.rows = Array.from(root.querySelectorAll<HTMLElement>('.vbrow'));
    this.noteEl = root.querySelector<HTMLElement>('.vbnote');
  }
  get length(): number { return this.rows.length; }
  paint(p: ValueBarsPaint): void {
    this.rows.forEach((row, i) => {
      const v = p.values ? p.values[i] : null, bar = row.querySelector('.vbb') as HTMLElement, val = row.querySelector('.vbv') as HTMLElement;
      if (v === null || v === undefined) {
        bar.style.setProperty('left', '50%'); bar.style.setProperty('width', '0%'); val.textContent = '·';
        row.classList.remove('neg', 'chosen', 'rnd', 'best');
        return;
      }
      const s = barSpan(v, this.max);
      bar.style.setProperty('left', s.left + '%'); bar.style.setProperty('width', s.width + '%');
      val.textContent = (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
      row.classList.toggle('neg', v < 0);
      row.classList.toggle('chosen', p.chosen === i);
      row.classList.toggle('rnd', p.chosen === i && !!p.random);
      row.classList.toggle('best', p.best === i);
    });
    if (this.noteEl) this.noteEl.textContent = p.note ?? '';
  }
}
