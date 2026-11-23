/**
 * Los frascos de «Comparar»: uno por conjunto probado, con su % de aciertos. Trabaja sobre el marcado del componente
 * Astro `Jars` (`.jar` con `data-k`, un `.liq` y un `.jp`).
 */
export class Jars {
  private jars: Record<number, HTMLElement> = {};
  constructor(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('.jar').forEach((j) => { this.jars[+(j.dataset.k as string)] = j; });
  }
  /** El frasco de `k` se llena hasta `pct` %. `title`: lo que se lee al pasar el ratón. */
  set(k: number, pct: number, title: string): void {
    const j = this.jars[k];
    j.classList.remove('empty');
    const l = j.querySelector('.liq') as HTMLElement;
    l.style.setProperty('--h', pct + '%'); l.style.setProperty('--q', (pct / 100).toFixed(2));
    (j.querySelector('.jp') as HTMLElement).textContent = pct + '%';
    j.title = title;
  }
  /** Marca el frasco activo (el conjunto elegido ahora). */
  highlight(k: number): void { Object.keys(this.jars).forEach((s) => this.jars[+s].classList.toggle('on', +s === k)); }
}
