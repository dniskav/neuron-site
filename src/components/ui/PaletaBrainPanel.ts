import type { NetworkN } from '@dniskav/neuron';
import { brainText, verdictOf } from '../../data/paletaCode';
import { HIDDEN, IN_N, INPUT_NAMES, paramCount, TEAM, type Kind, type Team } from '../../data/paleta';
import { highlight } from '../../viz/highlight';
import { Panel, bindCopy } from './Panel';

export interface PaletaBrainState { net: NetworkN | null; kind: Kind; trained: boolean; team?: Team }

const f2 = (v: number): string => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
const WM = 1.5;
const bar = (v: number, label: string, text: string, rgb: string): string => {
  const wd = Math.min(1, Math.abs(v) / WM) * 50;
  return '<div class="brow' + (v < 0 ? ' neg' : '') + '" style="--c:' + rgb + '"><span class="bl">' + label + '</span><span class="bt"><i class="bz"></i><i class="bb" style="left:' + (v >= 0 ? 50 : 50 - wd) + '%;width:' + wd + '%"></i></span><span class="bv">' + text + '</span></div>';
};

/**
 * Panel del cerebro de «¿Dónde caerá?»: los números REALES de la red en vivo (los de la neurona sola o los del equipo),
 * una frase sacada de ellos y el código para copiarlos.
 */
export class PaletaBrainPanel {
  readonly panel: Panel;
  private body: HTMLElement;
  private pre: HTMLElement;
  private lastKey = '';
  private lastText = '';
  private timer = 0;

  constructor(els: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement }, private getState: () => PaletaBrainState) {
    this.body = els.root.querySelector('#pabbody') as HTMLElement;
    this.pre = els.root.querySelector('#pabcode') as HTMLElement;
    this.panel = new Panel({
      btn: els.btn, panel: els.panel, wrap: els.wrap,
      onOpen: () => { this.lastKey = ''; this.refresh(); this.timer = window.setInterval(() => this.refresh(), 200); },
      onClose: () => clearInterval(this.timer),
    });
    bindCopy(els.copy, () => this.lastText);
  }

  refresh(): void {
    const { net, kind, trained, team = TEAM } = this.getState();
    if (!net) return;
    const fl = net.getWeights(), key = kind + '|' + team.curve + team.bounded + '|' + trained + '|' + fl.join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const n = paramCount(kind);
    let html = '<p class="bhead">Todo lo que sabe cabe en ' + n + ' números</p>';
    if (kind === 'solo') {
      const [wx, wi, wy, b] = fl;
      html += '<p class="bnote">' + (trained
        ? 'Cuánto cuenta lo que ve y un ajuste. Si x y la inclinación cuentan casi 1 cada una, ha descubierto la regla: dónde cae = dónde está + lo que se inclina. La altura vale 1 si la bola cae del techo, y entonces cuenta junto con el ajuste.'
        : 'Aún no ha aprendido: estos números son al azar.') + '</p><div class="bars">';
      html += bar(wx, INPUT_NAMES[0], f2(wx), '110,214,196') + bar(wi, INPUT_NAMES[1], f2(wi), '200,150,255') + bar(wy, INPUT_NAMES[2], f2(wy), '255,200,130') + bar(b, 'ajuste', f2(b), '255,224,138') + '</div>';
    } else {
      html += '<p class="bnote">' + (trained ? 'Cada una de las ' + HIDDEN + ' ayudantes guarda ' + (IN_N + 1) + ' números (lo que cuenta dónde está, la inclinación, la altura y un ajuste); la que decide, ' + (HIDDEN + 1) + '.' : 'Aún no ha aprendido: estos números son al azar.') + '</p><div class="bars">';
      for (let j = 0; j < HIDDEN; j++) html += bar(fl[j * (IN_N + 1)], 'ayudante ' + (j + 1), 'x ' + f2(fl[j * (IN_N + 1)]) + ' · incl ' + f2(fl[j * (IN_N + 1) + 1]) + ' · alt ' + f2(fl[j * (IN_N + 1) + 2]), '110,214,196');
      html += '</div>';
    }
    this.body.innerHTML = html;
    const txt = brainText(kind, fl, verdictOf(kind, fl, team), trained, team);
    this.lastText = txt;
    this.pre.innerHTML = txt.split('\n').map((l) => '<span class="ln">' + (highlight(l) || ' ') + '</span>').join('');
  }
}
