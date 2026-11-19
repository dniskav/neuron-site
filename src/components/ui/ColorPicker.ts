/**
 * Selector de color propio: rejilla 8×5 (tonos por luminosidad, y grises) en un popover,
 * con navegación por teclado, más los colores rápidos. Llama a `onPick(hex)` al elegir.
 */
export function bindColorPicker(root: { btn: HTMLElement; pop: HTMLElement; quick: HTMLElement }, onPick: (hex: string) => void): void {
  const { btn, pop, quick } = root;
  const cells = Array.from(pop.querySelectorAll<HTMLButtonElement>('button'));
  let isOpen = false, cur = 0;

  const focusCell = (i: number): void => {
    cur = Math.max(0, Math.min(cells.length - 1, i));
    cells.forEach((c, k) => { c.tabIndex = k === cur ? 0 : -1; });
    cells[cur].focus();
  };
  const setOpen = (v: boolean, back: boolean): void => {
    isOpen = v;
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v) { pop.hidden = false; void pop.offsetWidth; pop.classList.add('open'); focusCell(cur); }
    else { pop.classList.remove('open'); if (back) btn.focus({ preventScroll: true }); }
  };
  cells.forEach((b) => b.addEventListener('click', () => { setOpen(false, true); onPick(b.dataset.hex as string); }));
  quick.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.hex as string)));
  btn.addEventListener('click', () => setOpen(!isOpen, true));
  pop.addEventListener('keydown', (e) => {
    const k = e.key, d = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? 8 : k === 'ArrowUp' ? -8 : 0;
    if (d) { e.preventDefault(); e.stopPropagation(); focusCell(cur + d); }
    else if (k === 'Home') { e.preventDefault(); e.stopPropagation(); focusCell(0); }
    else if (k === 'End') { e.preventDefault(); e.stopPropagation(); focusCell(cells.length - 1); }
  });
  document.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') { e.stopPropagation(); setOpen(false, true); } }, true);
  document.addEventListener('pointerdown', (e) => { if (isOpen && !pop.contains(e.target as Node) && !btn.contains(e.target as Node)) setOpen(false, false); });
}
