/**
 * Panel desplegable con botón (el icono </> y el del cerebro): se abre con transición,
 * se cierra con Escape o al pulsar fuera, y solo hay uno abierto a la vez dentro de un grupo.
 */
export interface PanelOptions {
  btn: HTMLElement;
  panel: HTMLElement;
  /** Contenedor: un clic dentro no cierra el panel. */
  wrap: HTMLElement;
  onOpen?: () => void;
  onClose?: () => void;
}

export class Panel {
  open = false;
  private peers: Panel[] = [];
  constructor(private o: PanelOptions) {
    o.btn.addEventListener('click', () => this.set(!this.open, true));
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') { e.stopPropagation(); this.set(false, true); }
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !o.wrap.contains(e.target as Node)) this.set(false, false);
    });
  }
  /** Hace que abrir este panel cierre a los otros. */
  exclusive(...others: Panel[]): void { this.peers = others; }
  close(): void { if (this.open) this.set(false, false); }
  set(v: boolean, back: boolean): void {
    const { btn, panel } = this.o;
    this.open = v;
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v) {
      this.peers.forEach((p) => p.close());
      panel.hidden = false;
      this.o.onOpen?.();
      void panel.offsetWidth;
      panel.classList.add('open');
      panel.focus({ preventScroll: true });
    } else {
      panel.classList.remove('open');
      this.o.onClose?.();
      if (back) btn.focus({ preventScroll: true });
    }
  }
}

/** Botón «copiar»: copia el texto devuelto por `get` y marca el icono de hecho un momento. */
export function bindCopy(btn: HTMLElement, get: () => string): void {
  btn.addEventListener('click', () => {
    const done = (): void => { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1400); };
    try { navigator.clipboard.writeText(get()).then(done, () => {}); } catch (e) { /* sin portapapeles */ }
  });
}
