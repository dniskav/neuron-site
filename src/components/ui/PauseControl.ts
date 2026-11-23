import type { Pager } from '../../viz/Pager';

/**
 * Pausa de una pantalla animada: el botón y la barra espaciadora (cuando la pantalla está a la vista y no hay un control
 * enfocado) congelan lo que la pantalla decida. El bucle consulta `paused` o pasa su `dt` por `scale`, que da 0 en pausa.
 */
export class PauseControl {
  paused = false;
  private here = false;
  constructor(private o: {
    button: HTMLElement;
    /** El icono dentro del botón (▶ / ❚❚). */
    icon: HTMLElement;
    section: HTMLElement;
    say: (t: string) => void;
    /** Se llama al cambiar (la pantalla vuelve a dibujar). */
    onChange?: (paused: boolean) => void;
    pager: Pager;
  }) {
    o.button.addEventListener('click', () => this.set(!this.paused));
    o.pager.onChange((_i, el) => { this.here = el === o.section; });
    document.addEventListener('keydown', (e) => {
      if (!this.here || e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof Element && (t.closest('button, a, input, select, textarea, [contenteditable]') || (t as HTMLElement).isContentEditable)) return;
      e.preventDefault(); this.set(!this.paused);
    });
  }
  /** La pantalla está en la franja central de la ventana (lo dice `Pager.followCenter`). */
  setHere(v: boolean): void { this.here = v; }
  set(on: boolean): void {
    if (this.paused === on) return;
    const { button, icon, section } = this.o;
    this.paused = on; section.dataset.paused = on ? '1' : '0';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? 'Reanudar el juego' : 'Pausar el juego');
    button.title = on ? 'Reanudar (barra espaciadora)' : 'Pausar (barra espaciadora)';
    icon.textContent = on ? '▶' : '❚❚';
    this.o.say(on ? 'Juego en pausa.' : 'Juego reanudado.');
    this.o.onChange?.(on);
  }
  /** El tiempo que pasa: `dt`, o 0 en pausa. */
  scale(dt: number): number { return this.paused ? 0 : dt; }
}
