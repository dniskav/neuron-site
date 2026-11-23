/** Los elementos de un `CodeBrainDock` según su prefijo (los mismos ids que pone el componente). */
export interface DockEls {
  wrap: HTMLElement;
  code: { pre: HTMLElement; btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement };
  brain: { btn: HTMLElement; panel: HTMLElement; wrap: HTMLElement; copy: HTMLElement; root: HTMLElement };
}
export function dockEls(prefix: string, wrapId = prefix + 'code'): DockEls {
  const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement, wrap = $(wrapId);
  return {
    wrap,
    code: { pre: $(prefix + 'ccode'), btn: $(prefix + 'cbtn'), panel: $(prefix + 'cpanel'), wrap, copy: $(prefix + 'ccopy') },
    brain: { btn: $(prefix + 'bbtn'), panel: $(prefix + 'bpanel'), wrap, copy: $(prefix + 'bcopy'), root: $(prefix + 'bpanel') },
  };
}
/** Abrir un panel cierra el otro. */
export function linkPanels(a: { panel: { exclusive(...o: never[]): void } }, b: { panel: { exclusive(...o: never[]): void } }): void {
  (a.panel as { exclusive(o: unknown): void }).exclusive(b.panel);
  (b.panel as { exclusive(o: unknown): void }).exclusive(a.panel);
}
