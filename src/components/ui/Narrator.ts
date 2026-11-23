/**
 * El texto vivo de una pantalla: la línea de estado visible, el anuncio para lectores de pantalla (`aria-live`) y la frase
 * grande con su letra pequeña. Las tres pantallas escriben en los mismos tres sitios.
 */
export class Narrator {
  constructor(private els: { status?: HTMLElement | null; live?: HTMLElement | null; phrase?: HTMLElement | null }) {}
  /** La línea de estado (debajo del dibujo). */
  status(t: string): void { if (this.els.status) this.els.status.textContent = t; }
  /** Lo que se anuncia a los lectores de pantalla. */
  say(t: string): void { if (this.els.live) this.els.live.textContent = t; }
  /** La frase de debajo del cerebro: la idea (`m`) y, en letra pequeña, el detalle (`extra`). Sin argumentos, la borra. */
  phrase(m = '', extra?: string): void { if (this.els.phrase) this.els.phrase.innerHTML = extra === undefined ? m : m + '<small>' + extra + '</small>'; }
}
