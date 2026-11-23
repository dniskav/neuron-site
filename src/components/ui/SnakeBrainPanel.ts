import type { NetworkN } from '@dniskav/neuron';
import { brainText, verdictOf } from '../../data/snakeCode';
import { HELP_RGB, INPUT_NAMES_HELP, MOVES, OUT_N, inCount, type Vision } from '../../data/snake';
import { highlight } from '../../viz/highlight';
import { Panel, bindCopy } from './Panel';

export interface SnakeBrainState { net: NetworkN | null; trained: boolean; vision: Vision }

const f2 = (v: number): string => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
const WM = 2;
const HUE = ['255,138,120', '255,138,120', '255,138,120', '126,224,164', '126,224,164', '126,224,164', '126,224,164', HELP_RGB, HELP_RGB, HELP_RGB];
const bar = (v: number, label: string, rgb: string): string => {
  const wd = Math.min(1, Math.abs(v) / WM) * 50;
  return '<div class="brow' + (v < 0 ? ' neg' : '') + '" style="--c:' + rgb + '"><span class="bl">' + label + '</span><span class="bt"><i class="bz"></i><i class="bb" style="left:' + (v >= 0 ? 50 : 50 - wd) + '%;width:' + wd + '%"></i></span><span class="bv">' + f2(v) + (v < 0 ? ' · resta' : '') + '</span></div>';
};
/** Los nombres cortos de las entradas, para las barras. */
const SHORT = ['peligro izq.', 'peligro delante', 'peligro der.', 'comida delante', 'comida detrás', 'comida izq.', 'comida der.', '✍ ¿cabe izq.?', '✍ ¿cabe recto?', '✍ ¿cabe der.?'];

/**
 * Panel del cerebro de Snake: los 24 números REALES de la red en vivo (7 pesos y un ajuste para cada una de las 3 jugadas; 33 con ayuda: 10 pesos y un ajuste), una
 * frase y el código para copiarlos. Cada jugada es una neurona: sus barras dicen qué cosas suman y cuáles restan a su valor.
 */
export class SnakeBrainPanel {
  readonly panel: Panel;
  private body: HTMLElement;
  private pre: HTMLElement;
  private lastKey = '';
  private lastText = '';
  private timer = 0;

  constructor(els: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement }, private getState: () => SnakeBrainState) {
    this.body = els.root.querySelector('#snbbody') as HTMLElement;
    this.pre = els.root.querySelector('#snbcode') as HTMLElement;
    this.panel = new Panel({
      btn: els.btn, panel: els.panel, wrap: els.wrap,
      onOpen: () => { this.lastKey = ''; this.refresh(); this.timer = window.setInterval(() => this.refresh(), 250); },
      onClose: () => clearInterval(this.timer),
    });
    bindCopy(els.copy, () => this.lastText);
  }

  refresh(): void {
    const { net, trained, vision } = this.getState();
    if (!net) return;
    const IN_N = inCount(vision), fl = net.getWeights(), key = vision + '|' + trained + '|' + fl.join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    let html = '<p class="bhead">Todo lo que sabe cabe en ' + fl.length + ' números</p>';
    html += '<p class="bnote">' + (trained
      ? 'Cada jugada es una neurona con ' + (IN_N + 1) + ' números: qué cosas suman a su valor (a la derecha) y cuáles lo restan (a la izquierda y cortadas). Por ejemplo, «peligro delante» debería restar a «recto».'
      : 'Aún no ha aprendido: estos números son al azar.') + (vision === 'ayuda' ? ' Las barras azules con ✍ son las 3 entradas que calcula una persona; la red solo aprende cuánto fiarse de ellas.' : '') + '</p>';
    for (let k = 0; k < OUT_N; k++) {
      html += '<p class="bsec">Vale ir ' + MOVES[k] + '</p><div class="bars">';
      for (let i = 0; i < IN_N; i++) html += bar(fl[k * (IN_N + 1) + i], SHORT[i] ?? INPUT_NAMES_HELP[i], HUE[i]);
      html += bar(fl[k * (IN_N + 1) + IN_N], 'ajuste', '255,224,138') + '</div>';
    }
    this.body.innerHTML = html;
    const txt = brainText(fl, verdictOf(fl, vision), trained, vision);
    this.lastText = txt;
    this.pre.innerHTML = txt.split('\n').map((l) => '<span class="ln">' + (highlight(l) || ' ') + '</span>').join('');
  }
}
