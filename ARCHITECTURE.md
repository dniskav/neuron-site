# neuron-site: arquitectura

La web de `@dniskav/neuron` se publica en **neuron.dniskav.com**. Este repo es independiente de la librería y la consume desde npm.

## Principios (no negociables)
1. **Lo que está en el código se ve tal cual en el dibujo.** Cada visualización lee un modelo REAL de `@dniskav/neuron`: estructura, pesos, sesgo, entradas y salidas. Ningún dibujo inventa estructura ni proceso.
   - **Aprender** = responder y que te corrijan. La corrección vuelve hacia atrás en proporción al cambio real de pesos (Δw).
   - **Examinar o probar** = solo responder.
2. **El público no es técnico.** En pantalla no aparecen fórmulas ni jerga. El código real está a un clic (icono `</>`) y lo aprendido en otro (icono del cerebro).
3. **Amigable para agentes de IA:** HTML estático y semántico; el contenido se lee sin JS; hay `llms.txt`, JSON-LD y sitemap.
4. **El diseño aprobado está congelado** en `reference/prototype-v3.html`. Es la especificación visual y de comportamiento: colores, tipografía, animaciones, textos, porcentajes y snippets. Cualquier diferencia con él es un bug, salvo que figure en «Cambios respecto al prototipo».

## Stack
- **Astro** (salida `static`) con TypeScript `strict`, sin framework de UI: las islas son `<script>` de Astro en TS (vanilla), empaquetadas por Vite. Si un panel lo pide más adelante, se puede añadir React.
- **Estilos:** CSS propio con tokens en `:root`, portados del prototipo. Tema oscuro fijo. Sin Tailwind.
- **Fuentes:** las mismas del prototipo (Inter Tight y JetBrains Mono), por Google Fonts.
- **Librería:** `@dniskav/neuron` como dependencia de npm, importada en el bundle (no por CDN).
- **Gestor de paquetes:** bun (`bun install`, `bun run build`). npm también funciona.
- **Tests:** vitest para la capa `viz` y para la paridad de modelos (porcentajes, pesos y snippets frente a los valores del prototipo).

## Estructura
```
src/
  layouts/Base.astro          head (meta, JSON-LD, fuentes), cabecera (menú en píldora, botón «?»), puntos laterales, ruido
  pages/index.astro           SPA de pantallas completas: compone las pantallas en orden
  components/screens/         Hero, Neurona, Ensenale, Equipo, Snake, Juegos, Historia (.astro: HTML semántico + <script>)
  components/ui/              CodePanel, BrainPanel, ColorPicker, Flask, IconButton… (.astro + lógica en src/viz)
  viz/                        TS puro, sin Astro ni DOM global; se puede extraer como @dniskav/neuron-viz
    core/                     canvas helpers (glow, bezier, ptAt, rrect, seeded rng, colores)
    NeuronView.ts             UNA neurona dibujada, enlazada a una neurona real del modelo; todos sus comportamientos visuales
    NetworkView.ts            crea una NeuronView por neurona a partir de la estructura real de un NetworkN/NeuronN
    observe.ts                envuelve train/predict y calcula Δw y Δb por neurona (sin tocar la librería)
    Celebration.ts, Flask.ts, Guide.ts (halo dorado y botón «?»), HeaderFit.ts (menú compacto medido), Pager.ts, highlight.ts (resaltado TS)
  data/                       conjuntos de colores, examen y semillas (deterministas, idénticos al prototipo)
  i18n/                       es (por defecto, sin prefijo) y en (/en/, preparado para traducir)
public/llms.txt, robots.txt
public/__ref/prototype.html   copia del prototipo SOLO para comparar en desarrollo (/__ref/prototype.html); la integración `strip-ref` de astro.config.mjs la borra de dist/ al construir
reference/prototype-v3.html   diseño congelado (no se despliega)
tests/                        vitest
```

## NeuronView / NetworkView (el núcleo)
- `NeuronView` recibe `{ getWeights(): number[], getBias(): number, ... }`, un adaptador a UNA neurona real (una `NeuronN`, o la neurona `j` de la capa `i` de un `NetworkN`), y su geometría. Implementa UNA sola vez, para todas las neuronas:
  - el brillo suave al responder;
  - la celebración al aprender (pop, anillo, chispas y «+»), proporcional a SU |Δw|+|Δb|;
  - el pulso de corrección hacia atrás por sus dendritas, proporcional al |Δw_i| de cada una;
  - el grosor de cada dendrita según |w_i|, con trazo cortado y «resta» si w_i < 0;
  - el cuerpo como recipiente, con la línea del sesgo;
  - el bulbo de salida.
- `NetworkView` lee la estructura real (por ejemplo `[3,2,1]`), instancia las `NeuronView` y las conexiones, y orquesta el flujo hacia delante y hacia atrás.
- Consecuencia: es imposible que una neurona «aprenda en silencio» si sus pesos cambian. Corrige el bug del prototipo, donde en «Equipo» solo la neurona final celebraba.

## Cambios respecto al prototipo
- En «Equipo», cada neurona celebra según su propio Δ (antes solo celebraba la final).
- La librería se carga desde el bundle, no desde el CDN; el respaldo inline desaparece.
- **Menú:** el prototipo usaba un punto de corte fijo (640 px) para pasar a la versión compacta (solo números) y entre ~640 y ~1000 px la píldora se desbordaba y se cortaba. Ahora `HeaderFit` (`src/viz/HeaderFit.ts`) mide con JS si el menú completo cabe en la cabecera (con el botón «?» presente, para que no cambie de forma al cambiar de pantalla) y pone `header.compact` cuando NO cabe. Con la fuente real el corte cae hacia los 875 px; en cualquier ancho nada se corta ni desborda. El punto de 640 px queda en el CSS solo como respaldo sin JS.
- En «Equipo», el pulso de corrección de cada tramo y la celebración de cada neurona salen de SU propio cambio de pesos (antes, las del medio solo hacían un «pop» y la celebración era global).

## Despliegue
`bun run build` genera `dist/` estático. Se sirve en el VPS bajo `neuron.dniskav.com` (Caddy o nginx). Ver README.

## Pantallas
| # | id | Estado |
|---|----|--------|
| 01 | inicio | portada, migrar |
| 02 | neurona | neurona genérica con clic en ramas, migrar |
| 03 | ensenale | claro/oscuro, NeuronN(3), migrar |
| 04 | equipo | hecho: NetworkN([3,k,1]) con NetworkView; cada neurona celebra y pulsa según su Δ |
| 05 | snake | marcador (más adelante: aprendizaje real) |
| 06 | juegos | marcador |
| 07 | historia | marcador |
