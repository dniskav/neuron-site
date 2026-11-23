/**
 * Un interruptor con su explicación debajo: el botón (`aria-pressed`) dice qué está puesto y el párrafo dice, en palabras
 * sencillas, qué cambia. Con `fn`, el nombre REAL de lo que se usa (p. ej. `tanh`) va al lado, en mono discreto.
 * Trabaja sobre el marcado del componente Astro `Toggle`.
 */
export interface TogglePaint {
  label: string;
  on: boolean;
  explain: string;
  /** El nombre real de la función en uso. */
  fn?: string;
  /** Poner también la clase `on` (para los interruptores que se tiñen). */
  tint?: boolean;
  disabled?: boolean;
}
export class Toggle {
  constructor(readonly button: HTMLElement, readonly explanation: HTMLElement) {}
  paint(p: TogglePaint): void {
    const { button: b } = this;
    if (p.fn !== undefined) {
      const m = document.createElement('span'); m.className = 'pmono'; m.textContent = '· ' + p.fn;
      b.replaceChildren(p.label + ' ', m);
    } else b.textContent = p.label;
    b.setAttribute('aria-pressed', p.on ? 'true' : 'false');
    if (p.tint) b.classList.toggle('on', p.on);
    if (p.disabled !== undefined) (b as HTMLButtonElement).disabled = p.disabled;
    this.explanation.textContent = p.explain;
  }
}
