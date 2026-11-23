import type { CodeMode } from '../../data/ensenaleCode';
import { Panel, bindCopy } from './Panel';

/** Lo que el panel necesita de cualquier pantalla: su estado de código y cómo pintarlo y copiarlo. */
export interface CodeState {
  probe: number[] | null;
  open: { ej: boolean; ex: boolean };
  mode: CodeMode;
  cur: { g: string; i: number } | null;
}
export interface CodeSource<S extends CodeState> {
  newState(): S;
  renderHtml(cs: S): string;
  rawText(cs: S): string;
}

/**
 * Panel </>: el código real que hace esta pantalla, con los ejemplos reales del conjunto activo.
 * Resalta la línea que se está ejecutando (aprender, examen, tu color) y el ejemplo en curso.
 * Sirve a cualquier pantalla: ella pone el estado y el texto (`CodeSource`).
 */
export class CodePanel<S extends CodeState> {
  readonly panel: Panel;
  private cs: S;
  private pre: HTMLElement;

  constructor(els: { pre: HTMLElement; btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement }, private src: CodeSource<S>) {
    this.cs = src.newState();
    this.pre = els.pre;
    this.panel = new Panel({ btn: els.btn, panel: els.panel, wrap: els.wrap });
    this.pre.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tog]');
      if (!b) return;
      const g = b.getAttribute('data-tog') as 'ej' | 'ex';
      this.cs.open[g] = !this.cs.open[g];
      this.render();
      (this.pre.querySelector('[data-tog="' + g + '"]') as HTMLElement | null)?.focus({ preventScroll: true });
    });
    bindCopy(els.copy, () => src.rawText(this.cs));
    this.render();
  }

  /** Neurona o equipo nuevo: pone `patch` (k, pesos de nacimiento…) y borra la muestra, el ejemplo en curso y los desplegables. */
  reset(patch: Partial<S>): void {
    Object.assign(this.cs, patch, { probe: null, cur: null, open: { ej: false, ex: false } });
    this.render();
  }
  /** Cambia partes del estado SIN borrar la muestra, el ejemplo en curso ni los desplegables abiertos, y vuelve a pintar. */
  patch(p: Partial<S>): void { Object.assign(this.cs, p); this.render(); }
  probe(c: number[]): void { this.cs.probe = c.slice(); this.cs.mode = 'probe'; this.render(); }
  mode(m: CodeMode): void { this.cs.mode = m; this.applyHL(); }
  /** Ejemplo en curso: 'ej' (aprender) o 'ex' (examen), con su índice; null para ninguno. */
  cur(g: 'ej' | 'ex' | null, i = 0): void { this.cs.cur = g ? { g, i } : null; this.applyHL(); }
  /** El texto copiable ahora mismo. */
  raw(): string { return this.src.rawText(this.cs); }

  private render(): void { this.pre.innerHTML = this.src.renderHtml(this.cs); this.applyHL(); }
  private applyHL(): void {
    this.pre.querySelectorAll('.ln').forEach((el) => {
      el.classList.toggle('hl', el.getAttribute('data-m') === this.cs.mode);
      el.classList.remove('cur');
    });
    if (this.cs.cur) {
      const el = this.pre.querySelector('.ln[data-g="' + this.cs.cur.g + '"][data-i="' + this.cs.cur.i + '"]') || this.pre.querySelector('.more[data-tog="' + this.cs.cur.g + '"]');
      if (el) el.classList.add('cur');
    }
  }
}
