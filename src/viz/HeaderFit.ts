/**
 * El menú en píldora pasa a la versión compacta (solo números) cuando NO cabe en la cabecera.
 * Se mide con JS, no con un punto de corte fijo: lo que cabe depende de la fuente, del botón «?» y
 * del ancho real. Para decidirlo se quita la clase, se mide la cabecera completa y se vuelve a poner si
 * desborda; todo en el mismo ciclo de dibujo, así que no parpadea y no hay histéresis.
 */
export function fitHeader(): void {
  const header = document.querySelector('header') as HTMLElement | null;
  const menu = header?.querySelector('.menu') as HTMLElement | null;
  if (!header || !menu) return;
  const gut = parseFloat(getComputedStyle(header).paddingRight) || 0;
  let raf = 0;
  const guide = header.querySelector('.guide-btn') as HTMLElement | null;
  const measure = (): void => {
    /* se mide siempre con el botón «?» presente: así el menú no cambia de forma al cambiar de pantalla */
    const hid = guide ? guide.hidden : false;
    if (guide) guide.hidden = false;
    header.classList.remove('compact');
    const over = header.scrollWidth > header.clientWidth + 0.5 || menu.getBoundingClientRect().right > header.clientWidth - gut + 0.5;
    header.classList.toggle('compact', over);
    if (guide) guide.hidden = hid;
  };
  const schedule = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
  measure();
  new ResizeObserver(() => measure()).observe(header);
  window.addEventListener('resize', schedule);
  /* la fuente web cambia los anchos al cargar */
  try { document.fonts.ready.then(measure); document.fonts.addEventListener('loadingdone', measure); } catch (e) { /* sin API de fuentes */ }
}
