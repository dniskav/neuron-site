import type { NeuronN } from '@dniskav/neuron';
import { brainText, verdictOf } from '../../data/ensenaleCode';
import { WM } from '../../data/ensenaleCompare';
import type { CmpRow } from '../../data/ensenaleCompare';
import { highlight } from '../../viz/highlight';
import { Panel, bindCopy } from './Panel';

/** Lo que el panel necesita saber de la pantalla, en vivo. */
export interface BrainState {
  net: NeuronN | null;
  /** Conjunto con el que se entrenó (0 = sin enseñarle). */
  k: number;
  /** % del examen por conjunto ya probado. */
  results: Record<number, number>;
}

/**
 * Panel del cerebro: los 4 números REALES de la neurona (3 pesos y el sesgo) en vivo,
 * una frase sobre lo que más pesa y «Compáralos» con los otros conjuntos.
 */
export class BrainPanel {
  readonly panel: Panel;
  private rows: HTMLElement[];
  private pre: HTMLElement;
  private noteEl: HTMLElement;
  private curEl: HTMLElement;
  private crows: Record<number, HTMLElement> = {};
  private view: number | null = null;
  private lastText = '';
  private timer = 0;

  constructor(els: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement }, private getState: () => BrainState, private cmp: Record<number, CmpRow>) {
    const q = <T extends HTMLElement>(s: string): T => els.root.querySelector(s) as T;
    this.rows = Array.from(els.root.querySelectorAll<HTMLElement>('#bars .brow'));
    this.pre = q('#bcode'); this.noteEl = q('#bnote'); this.curEl = q('#bcur');
    els.root.querySelectorAll<HTMLElement>('#crows .crow').forEach((el) => {
      const k = +(el.dataset.k as string);
      this.crows[k] = el;
      el.addEventListener('click', () => { this.view = this.view === k ? null : k; this.lastText = ''; this.refresh(); });
    });
    this.panel = new Panel({
      btn: els.btn, panel: els.panel, wrap: els.wrap,
      onOpen: () => { this.refresh(); this.timer = window.setInterval(() => this.refresh(), 100); },
      onClose: () => clearInterval(this.timer),
    });
    bindCopy(els.copy, () => this.lastText);
  }

  private setRow(i: number, v: number): void {
    const el = this.rows[i], bar = el.querySelector('.bb') as HTMLElement, wd = Math.min(1, Math.abs(v) / WM) * 50;
    bar.style.width = wd + '%'; bar.style.left = (v >= 0 ? 50 : 50 - wd) + '%';
    el.classList.toggle('neg', v < 0);
    (el.querySelector('.bv') as HTMLElement).textContent = (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + (v < 0 && i < 3 ? ' · resta' : '');
  }
  private show(txt: string): void {
    if (txt === this.lastText) return;
    this.lastText = txt;
    this.pre.innerHTML = txt.split('\n').map((l) => '<span class="ln">' + (highlight(l) || ' ') + '</span>').join('');
  }

  refresh(): void {
    const { net, k, results } = this.getState();
    Object.keys(this.crows).forEach((key) => {
      const ke = +key, el = this.crows[ke];
      el.classList.toggle('tried', results[ke] !== undefined);
      el.classList.toggle('cur', !!net && ke === (k || 0));
      el.classList.toggle('sel', this.view === ke);
      el.setAttribute('aria-pressed', this.view === ke ? 'true' : 'false');
    });
    if (this.view !== null) {
      const dv = this.cmp[this.view];
      if (net) { for (let i = 0; i < 3; i++) this.setRow(i, net.weights[i]); this.setRow(3, net.bias); }
      this.show(brainText(this.view, dv.w, dv.b, verdictOf(dv.w, dv.b)));
      return;
    }
    if (!net) {
      this.rows.forEach((el) => { (el.querySelector('.bb') as HTMLElement).style.width = '0%'; (el.querySelector('.bv') as HTMLElement).textContent = '–'; el.classList.remove('neg'); });
      this.noteEl.textContent = 'Todavía no hay neurona: elige un conjunto o prueba un color.';
      this.curEl.textContent = '';
      this.show('// Elige un conjunto de ejemplos o prueba un color:\n// aquí verás los números que aprende.');
      return;
    }
    const w = net.weights, b = net.bias, trained = k > 0;
    for (let i = 0; i < 3; i++) this.setRow(i, w[i]);
    this.setRow(3, b);
    this.noteEl.textContent = trained ? '' : 'Aún no ha aprendido: estos números son al azar.';
    this.curEl.textContent = '';
    if (trained) {
      const ord = [0, 1, 2].sort((a, c) => Math.abs(w[c]) - Math.abs(w[a])), top = ord[0], nm = ['el rojo', 'el verde', 'el azul'];
      if (Math.abs(w[top]) > 0.15 && Math.abs(w[ord[1]]) < 0.85 * Math.abs(w[top])) this.curEl.textContent = 'Lo que más pesa en su decisión: ' + nm[top] + (w[top] < 0 ? ', pero para restar.' : '.');
    }
    this.show(brainText(trained ? k : 0, w, b, verdictOf(w, b)));
  }
}
