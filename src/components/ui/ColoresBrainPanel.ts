import type { NetworkN } from '@dniskav/neuron';
import { brainText, verdictOf } from '../../data/coloresCode';
import { HAS_LIGHT_BAND, NAMES, NAME_COLOR, PER, dullPhrase, lightActs, namePhrase, paramCount, ringActs, cmpKnown, setCmp, flatOf, snapNet } from '../../data/colores';
import { highlight } from '../../viz/highlight';
import { ringSvg } from '../../viz/Ring';
import { Panel, bindCopy } from './Panel';

export interface ColoresBrainState { net: NetworkN | null; n: number; per: number; trained: boolean }

/** El color de un nombre como «r,g,b» (0..255), para el borde de su tarjeta. */
export const nameRgb = (o: number): string => [1, 3, 5].map((k) => parseInt(NAME_COLOR[o].slice(k, k + 2), 16)).join(',');

/** La frase de la neurona de un nombre, sacada de su activación real (anillo, banda de luz y, si hace falta, grises y tonos apagados). */
export function zonePhrase(net: NetworkN, o: number): string {
  return namePhrase(NAMES[o], ringActs(net, o), HAS_LIGHT_BAND ? lightActs(net, o) : undefined, dullPhrase(net, o));
}

/** HTML de la tarjeta de una neurona de nombre: su anillo (con la banda de luz) y su frase, de su activación real. */
export function neuronCardInner(net: NetworkN, o: number, withWeights = false): string {
  return ringSvg(ringActs(net, o), HAS_LIGHT_BAND ? lightActs(net, o) : undefined, 44) + '<span class="nphr">' + zonePhrase(net, o) + (withWeights ? '<span class="nw">' + weightsText(net, o) + '</span>' : '') + '</span>';
}

/** Los pesos de una neurona, con su nombre de entrada y su signo: «rojo +3.2 · verde −1.0 · azul +0.4 · línea −0.7». */
export function weightsText(net: NetworkN, o: number): string {
  const nr = net.layers[0].neurons[o], f = (v: number): string => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  return ['rojo', 'verde', 'azul'].map((c, i) => c + ' ' + f(nr.weights[i])).join(' · ') + ' · línea ' + f(nr.bias);
}

/**
 * Panel del cerebro de «¿Qué color es?»: cuántos números aprendió (4 por neurona), por cada nombre sus 3 pesos,
 * su sesgo y su anillo, la comparativa por conjunto y el código para copiar.
 */
export class ColoresBrainPanel {
  readonly panel: Panel;
  private body: HTMLElement;
  private pre: HTMLElement;
  private lastKey = '';
  private lastText = '';
  private timer = 0;
  private waiting = false;

  constructor(els: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement }, private getState: () => ColoresBrainState) {
    this.body = els.root.querySelector('#nbbody') as HTMLElement;
    this.pre = els.root.querySelector('#nbcode') as HTMLElement;
    this.panel = new Panel({
      btn: els.btn, panel: els.panel, wrap: els.wrap,
      onOpen: () => { this.lastKey = ''; this.refresh(); this.timer = window.setInterval(() => this.refresh(), 200); },
      onClose: () => clearInterval(this.timer),
    });
    bindCopy(els.copy, () => this.lastText);
  }

  refresh(): void {
    const { net, n, per, trained } = this.getState();
    if (!net) return;
    const fl = flatOf(snapNet(net)), cmpReady = cmpKnown(n);
    const key = n + '|' + per + '|' + trained + '|' + cmpReady + '|' + fl.join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    let html = '<p class="bhead">Todo lo que sabe cabe en ' + paramCount(n) + ' números</p>';
    html += '<p class="bnote">' + (trained ? 'Cada neurona guarda 4: lo que cuenta el rojo, el verde y el azul, y su línea.' : 'Aún no ha aprendido: estos números son al azar.') + '</p>';
    html += '<p class="bsec">Cada nombre, una neurona</p><div class="ncards">';
    for (let o = 0; o < n; o++) html += '<div class="ncard" style="--c:' + nameRgb(o) + '"><b>' + (o + 1) + '</b>' + neuronCardInner(net, o, true) + '</div>';
    html += '</div>';
    html += '<p class="bsec">Compáralos · acierto según los ejemplos</p><div class="ncmp">';
    if (cmpReady) {
      const c = setCmp(n);
      PER.forEach((p, i) => { html += '<div class="nrow' + (p === per ? ' cur' : '') + '"><span class="cl">' + p * n + ' ejemplos</span><span class="nbar"><i style="width:' + c[i] + '%"></i></span><span class="cp">' + c[i] + ' %</span></div>'; });
    } else html += '<p class="bnote">Calculando…</p>';
    html += '</div>';
    this.body.innerHTML = html;
    const txt = brainText(n, fl, verdictOf(n, fl), trained);
    this.lastText = txt;
    this.pre.innerHTML = txt.split('\n').map((l) => '<span class="ln">' + (highlight(l) || ' ') + '</span>').join('');
    if (!cmpReady && !this.waiting) {
      this.waiting = true;
      setTimeout(() => { setCmp(n); this.waiting = false; this.lastKey = ''; if (this.panel.open) this.refresh(); }, 30);
    }
  }
}
