/** Resaltado de TypeScript del prototipo: comentarios, cadenas, palabras clave, números, métodos y clases de la librería. */
export function escapeHtml(x: string): string {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const RX = /(\/\/.*$)|("[^"]*")|\b(import|from|const|for|let|of|true|false)\b|\b(\d+(?:\.\d+)?)\b|\b(train|predict|setWeights|setRandom|seededRandom|irA|push)\b|\b(NeuronN|NetworkN|Adam|linear|tanh|sigmoid)\b/g;

/** Resalta UNA línea de código y devuelve HTML con `<span class="k|s|c|n|f|t">`. */
export function highlight(line: string): string {
  return escapeHtml(line).replace(RX, (m, c, s, k, n, f) =>
    c ? '<span class="c">' + m + '</span>'
      : s ? '<span class="s">' + m + '</span>'
      : k ? '<span class="k">' + m + '</span>'
      : n ? '<span class="n">' + m + '</span>'
      : f ? '<span class="f">' + m + '</span>'
      : '<span class="t">' + m + '</span>');
}
