import type { Pager } from '../../viz/Pager';

/** Lo que el guion recibe para esperar y rotular. `dead` es verdadero en cuanto la persona lo para o se lanza otro. */
export interface AutoHandle {
  dead(): boolean;
  /** Espera (sondeando) a que `cond()` sea verdadero o se pare el modo. */
  until(cond: () => boolean): Promise<void>;
  /** Espera `ms`; con `paused` la cuenta se congela mientras la pantalla esté en pausa. */
  sleep(ms: number): Promise<void>;
  caption(text: string, link?: boolean): void;
}

export interface AutoModeOptions {
  section: HTMLElement;
  /** El botón «▶ Míralo solo» / «❚❚ Parar». */
  button: HTMLElement;
  /** El rótulo de cada paso, junto al dibujo. */
  caption: HTMLElement;
  /** Con `link`, el último rótulo trae este paso a otra pantalla (`id` de la sección y su texto). */
  link: { id: string; text: string };
  pager: Pager;
  /** Con «menos movimiento» las pausas se alargan para leer. */
  reduced?: boolean;
  /** Para anunciar cada rótulo a los lectores de pantalla. */
  say?: (t: string) => void;
  /** Controles que NO paran el modo cuando se tocan (además del botón y del enlace). */
  keep?: HTMLElement[];
  /** Si la pantalla está en pausa, el guion también espera. */
  paused?: () => boolean;
  /** Antes de empezar (la pantalla corta lo que estuviera haciendo). */
  beforeStart?: () => void;
  /** Cuando cambia de estado (empieza o acaba): la pantalla repinta sus botones. */
  onChange?: (running: boolean) => void;
  /** Tras parar por mano (o por cambiar de pantalla o de pestaña): la pantalla se recoge. */
  onStop?: () => void;
  label?: string;
}

/**
 * «Míralo solo»: el modo en el que una pantalla se enseña sola, paso a paso. Se ocupa de todo lo que NO es el guion: el
 * botón, el rótulo (con su enlace), parar al tocar cualquier otro control, al irse de la pantalla o de la pestaña, y de
 * esperar con la pausa. El guion en sí lo ejecuta `runScript` (`src/viz/script.ts`) con las MISMAS funciones que los botones.
 */
export class AutoMode {
  running = false;
  private runId = 0;
  private label: string;
  constructor(private o: AutoModeOptions) {
    this.label = o.label ?? '▶ Míralo solo';
    o.button.addEventListener('click', () => { if (this.running) this.stop(); else this.pending?.(); });
    /* cualquier otro control que toque la persona (o cambiar de pantalla, o de pestaña) detiene el modo automático */
    o.section.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button, a');
      if (!b || b === o.button || b.classList.contains('nautolink') || (o.keep ?? []).includes(b as HTMLElement)) return;
      if (this.running) this.stop(); else if (!o.caption.hidden) this.setCaption('');   /* el rótulo final se va al tocar otro control */
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    o.pager.onChange((_i, el) => { if (el !== o.section) this.stop(); });
    new IntersectionObserver((en) => { if (!en[0].isIntersecting) this.stop(); }, { root: o.pager.main, threshold: 0 }).observe(o.section);
  }
  private pending: (() => void) | null = null;
  /** Qué hace el botón al pulsarlo cuando no está en marcha: lanza `run`. */
  onPress(run: (h: AutoHandle) => Promise<unknown>): void { this.pending = () => this.start(run); }

  /** El rótulo grande junto al dibujo; con `link`, trae el paso a la pantalla siguiente. */
  setCaption(text: string, link = false): void {
    const { caption: cap, section: sec, pager, link: lk } = this.o;
    cap.hidden = !text; cap.textContent = text;
    if (text) sec.dataset.cap = '1'; else delete sec.dataset.cap;
    if (link && text) {
      const a = document.createElement('a');
      a.href = '#' + lk.id; a.className = 'nautolink'; a.textContent = lk.text;
      a.addEventListener('click', (e) => { e.preventDefault(); pager.go(pager.sections.findIndex((x) => x.id === lk.id)); });
      cap.append(' ', a);
    }
  }
  private end(): void {
    const { section: sec, button: btn } = this.o;
    this.running = false; delete sec.dataset.auto;
    btn.textContent = this.label; btn.setAttribute('aria-pressed', 'false');
    this.o.onChange?.(false);
  }
  /** Para en seco: sin pasos nuevos y el rótulo se va. */
  stop(): void {
    if (!this.running) return;
    this.runId++; this.end(); this.setCaption(''); this.o.onStop?.();
  }
  private handle(id: number): AutoHandle {
    const dead = (): boolean => id !== this.runId || !this.running;
    return {
      dead,
      until: (cond) => new Promise((res) => {
        if (cond() || dead()) { res(); return; }
        const t = setInterval(() => { if (cond() || dead()) { clearInterval(t); res(); } }, 40);
      }),
      sleep: (ms) => new Promise((res) => {
        let el = 0, last = performance.now();
        const t = setInterval(() => {
          const now = performance.now();
          if (!this.o.paused?.()) el += now - last;
          last = now;
          if (dead() || el >= ms) { clearInterval(t); res(); }
        }, 50);
      }),
      caption: (text, link) => { this.setCaption(text, link); this.o.say?.(text); },
    };
  }
  /** Empieza: `run` recibe el asa y ejecuta el guion; al acabar sin que lo paren, vuelve al estado de reposo. */
  start(run: (h: AutoHandle) => Promise<unknown>): void {
    if (this.running) return;
    this.o.beforeStart?.();
    const id = ++this.runId;
    this.running = true; this.o.section.dataset.auto = '1';
    this.o.button.textContent = '❚❚ Parar'; this.o.button.setAttribute('aria-pressed', 'true');
    this.o.onChange?.(true);
    void run(this.handle(id)).then(() => { if (id === this.runId && this.running) this.end(); });
  }
}
