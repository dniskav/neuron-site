import { reducedMotion } from './core/motion';

/**
 * Navegación de pantallas completas: scroll con imán, menú, puntos laterales, teclado,
 * marca `.in` en la pantalla visible (para las transiciones) y `aria-current` en el menú.
 */
export class Pager {
  readonly main: HTMLElement;
  readonly sections: HTMLElement[];
  private links: HTMLAnchorElement[];
  private reduced = reducedMotion();
  current = 0;
  private listeners: ((i: number, el: HTMLElement) => void)[] = [];

  constructor() {
    this.main = document.querySelector('main') as HTMLElement;
    this.sections = Array.from(document.querySelectorAll<HTMLElement>('main > section'));
    this.links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.menu a, .dots a'));

    this.links.concat(Array.from(document.querySelectorAll<HTMLAnchorElement>('.brand, .scroll'))).forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = (a.getAttribute('href') || '').slice(1);
        const i = this.sections.findIndex((s) => s.id === id);
        if (i >= 0) { e.preventDefault(); this.go(i); }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowRight') { e.preventDefault(); this.go(this.current + 1); }
      else if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft') { e.preventDefault(); this.go(this.current - 1); }
      else if (k === 'Home') { e.preventDefault(); this.go(0); }
      else if (k === 'End') { e.preventDefault(); this.go(this.sections.length - 1); }
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const i = this.sections.indexOf(en.target as HTMLElement);
        if (en.intersectionRatio >= 0.5) { en.target.classList.add('in'); this.setActive(i); }
        else if (en.intersectionRatio < 0.05) en.target.classList.remove('in');
      });
    }, { root: this.main, threshold: [0, 0.05, 0.5, 0.75] });
    this.sections.forEach((s) => io.observe(s));
    if (this.reduced) this.sections.forEach((s) => s.classList.add('in'));

    const h = (location.hash || '').slice(1);
    const hi = this.sections.findIndex((s) => s.id === h);
    if (hi > 0) this.jumpOnLoad(hi);
    else {
      this.sections[0].classList.add('in');
      this.setActive(0);
    }
  }

  /**
   * Enlace directo (`/#colores`): se salta a la pantalla pedida y se vuelve a hacer cuando la página termina
   * de cargar (fuentes, imágenes, canvas y pantallas que rellenan su contenido), porque el imán del scroll y
   * los cambios de altura pueden dejar la página en otra pantalla. Si la persona ya ha movido la página, se respeta.
   */
  private jumpOnLoad(i: number): void {
    try { history.scrollRestoration = 'manual'; } catch (e) { /* sin historial */ }
    let touched = false;
    const stop = (): void => { touched = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((n) => window.addEventListener(n, stop, { once: true, passive: true }));
    const jump = (): void => {
      if (touched) return;
      const el = this.sections[i];
      if (Math.abs(this.main.scrollTop - el.offsetTop) < 2) return;
      this.main.style.scrollBehavior = 'auto';
      el.scrollIntoView({ block: 'start' });
      this.main.style.scrollBehavior = '';
    };
    jump();
    if (document.readyState !== 'complete') window.addEventListener('load', () => { jump(); setTimeout(jump, 300); }, { once: true });
    else setTimeout(jump, 300);
    try { void document.fonts.ready.then(jump); } catch (e) { /* sin fuentes */ }
  }

  /** Lleva a la pantalla `i` con transición. */
  go(i: number): void {
    i = Math.max(0, Math.min(this.sections.length - 1, i));
    this.sections[i].scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
  }

  setActive(i: number): void {
    this.current = i;
    this.links.forEach((a) => {
      if (a.getAttribute('href') === '#' + this.sections[i].id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    try { history.replaceState(null, '', '#' + this.sections[i].id); } catch (e) { /* sin historial */ }
    this.listeners.forEach((f) => f(i, this.sections[i]));
  }

  /** Marca una pantalla como activa (las que son más altas que la ventana, en móvil, al cruzar el centro). */
  activate(sec: HTMLElement): void {
    sec.classList.add('in');
    this.setActive(this.sections.indexOf(sec));
  }

  /**
   * Las pantallas más altas que la ventana (móvil): se marcan como activas al cruzar el centro. `onHere(true|false)` avisa de
   * cuándo la pantalla está en la franja central (p. ej. para la barra espaciadora).
   */
  followCenter(sec: HTMLElement, onHere?: (here: boolean) => void): void {
    new IntersectionObserver((en) => { onHere?.(en[0].isIntersecting); if (en[0].isIntersecting) this.activate(sec); }, { root: this.main, rootMargin: '-45% 0px -45% 0px', threshold: 0 }).observe(sec);
  }

  /** Avisa cuando cambia la pantalla activa (la guía lo usará). */
  onChange(f: (i: number, el: HTMLElement) => void): void { this.listeners.push(f); }
}

let instance: Pager | null = null;
/** El paginador único de la página (se crea la primera vez que se pide). */
export function getPager(): Pager {
  if (!instance) instance = new Pager();
  return instance;
}
