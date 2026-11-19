import type { NetworkN } from '@dniskav/neuron';
import { brainText, verdictOf } from '../../data/equipoCode';
import { TAGFULL, flatOf, fracText, snapNet, computeTeamCmp, type SpecTag, type TeamCmp } from '../../data/equipo';
import { TEAM_HUE } from '../../viz/geometry';
import { highlight } from '../../viz/highlight';
import { Panel, bindCopy } from './Panel';

/** Lo que el panel necesita saber de la pantalla, en vivo. */
export interface TeamBrainState {
  net: NetworkN | null;
  k: number;
  trained: boolean;
  tags: SpecTag[] | null;
  /** % del examen por tamaño ya probado (con enseñanza). */
  results: Record<number, number>;
}

const WM = 20, LINEC = '255,224,138', CHAN = ['255,96,84', '96,214,112', '104,152,255'], CHN = ['rojo', 'verde', 'azul'];
const sq = (v: number): number => Math.sqrt(Math.min(1, Math.abs(v) / WM));
const rowHTML = (label: string, c: string): string => '<div class="brow" style="--c:' + c + '"><span class="bl">' + label + '</span><div class="bt"><i class="bz"></i><i class="bb"></i></div><span class="bv">–</span></div>';

/** Las barritas de «Compáralos»: un pesos por columna, hacia arriba si suma y hacia abajo si resta. */
export function miniBars(flat: number[]): string {
  const n = flat.length, w = 100 / n;
  return flat.map((v, i) => {
    const hgt = Math.max(1, sq(v) * 10), top = v >= 0 ? 11 - hgt : 11;
    return '<i style="left:' + (i * w).toFixed(2) + '%;width:' + (w - 1.4).toFixed(2) + '%;top:' + top.toFixed(1) + 'px;height:' + hgt.toFixed(1) + 'px;background:' + (v >= 0 ? 'rgba(255,224,138,.9)' : 'rgba(106,167,255,.9)') + '"></i>';
  }).join('');
}

export function cmpRowInner(k: number, c: TeamCmp): string {
  return '<span class="cl">' + k + (k === 1 ? ' neurona' : ' neuronas') + '</span><span class="cm2" aria-hidden="true">' + miniBars(c.flat) + '</span><span class="cp">' + c.pct + ' %</span>';
}

export function cmpPhrase(cmp: Record<number, TeamCmp>): string {
  const t1 = cmp[1], t2 = cmp[2];
  let txt = 'Con 1 neurona: ' + t1.pct + ' %' + (t1.yes === 0 ? ', y solo porque dice «no» a todo' : '') + '. Con 2 neuronas: ' + t2.pct + ' %';
  const names = t2.tags.map((t) => TAGFULL[t.tag].replace('se enciende con ', ''));
  if (t2.pct >= 90) txt += ' (una se enciende con ' + names[0] + ' y otra con ' + names[1] + ')';
  return txt + '. Con 3: ' + cmp[3].pct + ' %.';
}

interface Group { node: number; tag: number | null; rows: HTMLElement[]; tagEl: HTMLElement | null }

/**
 * Panel del cerebro del equipo: los pesos y el sesgo REALES de cada neurona en vivo, la especialidad
 * que se midió en el examen y «Compáralos» con 1, 2 y 3 neuronas (con su código).
 */
export class TeamBrainPanel {
  readonly panel: Panel;
  private pre: HTMLElement;
  private headEl: HTMLElement;
  private groupsEl: HTMLElement;
  private noteEl: HTMLElement;
  private phraseEl: HTMLElement;
  private crows: Record<number, HTMLElement> = {};
  private groups: Group[] = [];
  private builtK = 0;
  private view: number | null = null;
  private lastText = '';
  private timer = 0;
  private cmp: Record<number, TeamCmp> | null = null;

  constructor(els: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement }, private getState: () => TeamBrainState) {
    const q = <T extends HTMLElement>(s: string): T => els.root.querySelector(s) as T;
    this.pre = q('#qbcode'); this.headEl = q('#qbhead'); this.groupsEl = q('#qbgroups'); this.noteEl = q('#qbnote'); this.phraseEl = q('#qbphrase');
    els.root.querySelectorAll<HTMLElement>('#qcrows .crow').forEach((el) => {
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

  private build(k: number): void {
    this.builtK = k; this.groups = [];
    let html = '';
    if (k === 1) {
      html += '<p class="bsec">La neurona</p><div class="bars" data-g="0">' + CHN.map((n, i) => rowHTML(n, CHAN[i])).join('') + rowHTML('la línea', LINEC) + '</div>';
      this.groups.push({ node: 0, tag: null, rows: [], tagEl: null });
    } else {
      for (let j = 0; j < k; j++) {
        html += '<p class="bsec" style="color:rgb(' + TEAM_HUE[j].join(',') + ')">Neurona ' + (j + 1) + '</p><p class="bnote btag" data-t="' + j + '"></p><div class="bars" data-g="' + j + '">' + CHN.map((n, i) => rowHTML(n, CHAN[i])).join('') + rowHTML('la línea', LINEC) + '</div>';
        this.groups.push({ node: j, tag: j, rows: [], tagEl: null });
      }
      html += '<p class="bsec">La que decide</p><div class="bars" data-g="' + k + '">';
      for (let q = 0; q < k; q++) html += rowHTML('neurona ' + (q + 1), TEAM_HUE[q].join(','));
      html += rowHTML('la línea', LINEC) + '</div>';
      this.groups.push({ node: k, tag: null, rows: [], tagEl: null });
    }
    this.groupsEl.innerHTML = html;
    this.groups.forEach((g) => {
      g.rows = Array.from(this.groupsEl.querySelectorAll<HTMLElement>('.bars[data-g="' + g.node + '"] .brow'));
      g.tagEl = g.tag === null ? null : this.groupsEl.querySelector<HTMLElement>('.btag[data-t="' + g.tag + '"]');
    });
    this.lastText = '';
  }

  private setRow(el: HTMLElement, v: number, isW: boolean): void {
    const bar = el.querySelector('.bb') as HTMLElement, wd = sq(v) * 50;
    bar.style.width = wd + '%'; bar.style.left = (v >= 0 ? 50 : 50 - wd) + '%';
    el.classList.toggle('neg', v < 0 && isW);
    (el.querySelector('.bv') as HTMLElement).textContent = (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + (v < 0 && isW ? ' · resta' : '');
  }

  private show(txt: string): void {
    if (txt === this.lastText) return;
    this.lastText = txt;
    this.pre.innerHTML = txt.split('\n').map((l) => '<span class="ln">' + (highlight(l) || ' ') + '</span>').join('');
  }

  /** Los tres estados (se calculan una vez, la primera vez que se abre el panel). */
  private ensureCmp(): Record<number, TeamCmp> {
    if (!this.cmp) { this.cmp = computeTeamCmp(); this.phraseEl.textContent = cmpPhrase(this.cmp); }
    return this.cmp;
  }

  refresh(): void {
    const { net, k, trained, tags, results } = this.getState();
    if (this.builtK !== k) this.build(k);
    const cmp = this.ensureCmp();
    Object.keys(this.crows).forEach((key) => {
      const ke = +key, el = this.crows[ke];
      el.classList.toggle('tried', results[ke] !== undefined);
      el.classList.toggle('cur', !!net && ke === k);
      el.classList.toggle('sel', this.view === ke);
      el.setAttribute('aria-pressed', this.view === ke ? 'true' : 'false');
    });
    this.headEl.textContent = 'Todo lo que sabe cabe en ' + (k === 1 ? 4 : k * 4 + k + 1) + ' números';
    let txt: string;
    if (net) {
      const sn = snapNet(net);
      this.groups.forEach((g) => {
        const nd = sn[g.node];
        nd.w.forEach((v, i) => this.setRow(g.rows[i], v, true));
        this.setRow(g.rows[nd.w.length], nd.b, false);
        if (g.tagEl) g.tagEl.textContent = tags && g.tag !== null && tags[g.tag] ? TAGFULL[tags[g.tag].tag] + ' (' + fracText(tags[g.tag].f) + ')' : 'Su especialidad se mide en el examen.';
      });
      this.noteEl.textContent = trained ? '' : 'Aún no ha aprendido: estos números son al azar.';
    }
    if (this.view !== null) txt = brainText(this.view, cmp[this.view].flat, verdictOf(this.view, cmp[this.view].flat), true);
    else if (net) { const fl = flatOf(snapNet(net)); txt = brainText(k, fl, verdictOf(k, fl), trained); }
    else txt = '// Pulsa «Enséñale» o examina sin enseñarle:\n// aquí verás los números que aprende.';
    this.show(txt);
  }
}
