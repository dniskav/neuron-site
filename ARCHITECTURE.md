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
  components/screens/         Hero, Neurona, Ensenale, Paleta, Equipo, Snake, Juegos, Historia (.astro: HTML semántico + <script>); Colores.astro y sus archivos quedan aparcados (fuera de la navegación)
  components/ui/              componentes reutilizables (ver «Componentes reutilizables»): .astro para el marcado + TS para la lógica; también los paneles CodePanel, BrainPanel…
  viz/                        TS puro, sin Astro ni DOM global; se puede extraer como @dniskav/neuron-viz
    core/                     canvas helpers (glow, bezier, ptAt, rrect, seeded rng, colores)
    NeuronView.ts             UNA neurona dibujada, enlazada a una neurona real del modelo; todos sus comportamientos visuales
    NetworkView.ts            crea una NeuronView por neurona a partir de la estructura real de un NetworkN/NeuronN
    observe.ts                envuelve train/predict y calcula Δw y Δb por neurona (sin tocar la librería)
    BrainMeter.ts, brainShape.ts   el cerebro (silueta + llenado por neurona; ver más abajo)
    script.ts                 ejecutor genérico de guiones («Míralo solo»)
    Celebration.ts, Flask.ts (solo lo usa la pantalla aparcada Colores), Guide.ts (halo dorado y botón «?»), HeaderFit.ts (menú compacto medido), Pager.ts, highlight.ts (resaltado TS)
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
- **Principio: toda neurona es una neurona.** Mientras quepan, TODAS se dibujan completas (cuerpo, ramas de entrada, bulbo de salida), también las de salida; en la pantalla 04 cada nombre es una `NeuronView` completa, la neurona de Enséñale copiada. Solo cuando son demasiadas para el espacio se simplifican, y nunca se oculta una conexión.
- **Una sola salida que se ramifica** (para redes con capas, como `columnsLayout`; la capa de nombres no la usa). Cada neurona tiene UN tronco de salida (su axón) que se divide, cerca de quienes la escuchan, en una rama por neurona de la capa siguiente. La rama es la dendrita de quien escucha: su grosor y su trazo cortado («resta») son el peso de quien escucha. `trunkWires` (`geometry.ts`) lo construye y `NetworkView.trunk(capa, neurona)` lo expone; con un solo oyente no hay tronco (es el caso de Equipo, visualmente igual que antes). El relevo y la corrección viajan por `Dendrite.travel` (tronco + rama).
- **Nivel de detalle (LOD)**, definido en un único sitio (`src/viz/lod.ts`) según los píxeles de alto que le tocan a cada neurona de la capa (`NetworkView.fit`): **completo** ≥ 32 px; **compacto** ≥ 14 px (cuerpo pequeño sin detalles, ramas finas, etiqueta corta); **puntos** por debajo (un punto que brilla; el nombre, al pasar o tocar, o en la leyenda). Histéresis de 2 px. El cambio es suave: `NeuronView.detail` (0 puntos, 1 compacto, 2 completo) se acerca al nivel pedido, y una red nueva hereda el detalle de la anterior.
- **Las conexiones no se ocultan en ningún nivel**: siempre todas: en la capa de nombres, las 3·N de las entradas a las neuronas. En los niveles bajos son más finas, con grosor proporcional a |w|, opacidad proporcional a |w| con un mínimo visible, y las de peso negativo van cortadas y en azul frío.
- Consecuencia: es imposible que una neurona «aprenda en silencio» si sus pesos cambian. Corrige el bug del prototipo, donde en «Equipo» solo la neurona final celebraba.

## El cerebro (BrainMeter) en lugar del frasco
`src/viz/BrainMeter.ts` (dibujo, estado) y `src/viz/brainShape.ts` (geometría: silueta, surcos, fronteras) sustituyen al frasco en Enséñale (`emeter`), Equipo (`qmeter`) y Paleta (`pameter`, más pequeño, junto a la tira de bolas; 84×63 px en móvil). `Flask.ts` se queda solo porque la pantalla aparcada Colores lo usa.
- **Silueta:** un cerebro de lado (frontal a la izquierda, occipital a la derecha, lóbulo temporal con su polo, cerebelo con pliegues y tronco solo en contorno) con surcos finos. Todo en una caja de 200×150 unidades.
- **Secciones = neuronas reales.** Se cuentan en la estructura del modelo (`neuronCount` sobre `NeuronN`/`NetworkN`, vía `observe.neuronsOf`): Enséñale 1; Equipo 1 (k=1, `[3,1]`) o k+1 (`[3,k,1]`); Paleta 1 con la neurona sola y 8+1 con el equipo. Las fronteras entre secciones (`cutX`) son líneas inclinadas y onduladas, como surcos, repartidas a anchos iguales; con muchas neuronas aplica el LOD (`lod.ts`): las divisiones se afinan pero están TODAS (n − 1).
- **Llenado = lo que ha aprendido SU neurona.** Cada sección sube, como un líquido, hasta `fillOf(cambio, escala) = 1 − exp(−cambio / escala)`, donde `cambio` es el cambio acumulado REAL de esa neurona desde que se creó la red: la suma, paso a paso, de Σ|Δw| + |Δb| (`ObservedModel.travel` en `observe.ts`; envuelve el `train` del modelo, sin tocar la librería, así que cuenta también los repasos hechos directamente). Red nueva = `meter.setModel(net)` + `meter.track(nv.observed, escala)`: se vacía. Sin enseñar nada, vacío.
- **Escala por modelo** (`BRAIN_SCALE` en `data/ensenale.ts`, `equipo.ts`, `paleta.ts`; medida con los modelos reales y anotada junto a cada constante): Enséñale 25 (34 ejemplos → 98 %, 13 → 80 %, 3 → 36 %); Equipo 50 (con 2 o 3 neuronas, 86–98 %; la neurona sola k=1 también ~98 %); Paleta 2,5 la neurona sola (30 caídas sin paredes → 85 %) y 40 el equipo (100 caídas con paredes → 93–100 %). Un modelo bien entrenado queda casi lleno. Tests: `tests/brainmeter.test.ts` comprueba la escala de cada modelo y el caso de abajo.
- **El número del centro son los AJUSTES**: cuántas veces ha aprendido la red desde que se creó (`ObservedModel.steps`, un `train` real cada uno, que mueve todos sus pesos un poco; con punto de miles, `fmtCount`, y la palabra «ajustes» debajo a ≥ 12 px reales). No se satura: sigue subiendo aunque la red ya acierte el 100 %, que es justo lo que el % y el llenado no enseñaban. Vuelve a 0 con cada red nueva.
- **El % de la red entera va fuera, en texto**: bajo el cerebro (`{id}cap`, «acierta el 87 %» / «aún sin examen», `pctCaption`) en Enséñale y Equipo; en Paleta, en la línea de la tira («12/20 atrapadas (60 %) · 300 guardadas»; cabe en una línea a 375 px hasta 9.999 guardadas), para no añadir altura en móvil. NO llena el cerebro: un cerebro lleno con un % bajo es correcto. Medido: la neurona sola de Paleta con paredes acumula 2,0 de cambio a las 10 caídas, 7,9 a las 30 y 75 a las 100 (sin paredes, 4,8 y 7,9) y se queda en ~27 %: cambia mucho y no puede. Por eso Paleta enseña, bajo la tira, «Ha cambiado mucho, pero una sola neurona no puede con los rebotes» (solo con la neurona sola, paredes, ≥ 10 bolas, < 50 % y cerebro ≥ 60 % lleno); y Equipo con 1 neurona añade a su frase «Su cerebro se llena porque ha cambiado mucho, pero cambiar no es acertar». El llenado mide cuánto se ha movido cada neurona, no lo bien que acierta.
- **Destello = Δ real de SU neurona.** Cuando una neurona cambia sus pesos, su sección destella con la intensidad que devuelve `NeuronView.learn`; las demás no. Con «menos movimiento» no hay destello ni inercia (el llenado salta a su valor).
- El `aria-label` del lienzo dice lo aprendido (cuánto lleno) y, aparte, el % de la red (`brainAria`).
- Tests: `tests/brainmeter.test.ts`.

## Componentes reutilizables
Las pantallas (`Ensenale`, `Equipo`, `Paleta`; `Colores` solo el modo automático) NO repiten marcado ni lógica: componen estas piezas. Marcado en `.astro` (`src/components/ui/`); lógica en TS puro (`src/components/ui/*.ts` si toca el DOM, `src/viz/` si no). Todas se prueban con `tests/components.test.ts` (DOM de mentira en `tests/helpers/fakeDom.ts`) y `tests/brainmeter.test.ts`.

| Pieza | Marcado (Astro) | Lógica (TS) | Dónde se usa |
|---|---|---|---|
| **BrainMeter** (cerebro) | `BrainMeter.astro` `{id, label, bare?, class?}` (sin `bare`, con su `<p id="{id}cap">` para el %) | `viz/BrainMeter.ts` (`setModel`, `track(obs, escala)`, `learned(lobe, fuerza)`, `ease`, `tick`, `draw`) + `mountBrainMeter({canvas, meter, reduced, caption?: {el, text}, labelSize?, dt?, aria?})` (`ui/mountMeter.ts`: bucle con ajustes en el centro, llenado, destello, el texto del % y `aria`; `brainAria`, `pctCaption`) | las tres |
| **ExamStrip** (tira de examen ✓/✗) | `ExamStrip.astro` `{id, colors}` | `ExamChips` (`ui/Strips.ts`): `now(i)`, `mark(i, ok)`, `reset()`, `clearNow()` | Enséñale, Equipo |
| **ResultStrip** (bolitas ✓/✗ con contador) | (el `.pstrip` y el `.pcount`, en `Paleta.astro`) | `ResultStrip(strip, contador, textos)` `.paint(resultados, extra)`; `stripHtml` | Paleta |
| **ColorDots** / `ProgressDots` (ejemplos con los que aprende) | `ColorDots.astro` `{id, colors, label}` | `ProgressDots`: `now(i)`, `seen(i)`, `reset()` | Equipo |
| **Toggle** (interruptor + explicación + nombre real en mono) | `Toggle.astro` `{id, explainId, label, title, pressed?, wrap?}` | `Toggle(boton, explicación).paint({label, on, explain, fn?, tint?, disabled?})` (`ui/Toggle.ts`) | Paleta (5) |
| **ActionRow / ActionButton** (fila de botones de acción) | `ActionRow.astro` `{class, label}` + `ActionButton.astro` `{variant: go|step|ghost|link|auto, …}` | — | las tres |
| **CodeBrainDock** (paneles `</>` y cerebro) | `CodeBrainDock.astro` `{prefix, wrapId?, codeHtml, brainLabel}` (slot por defecto = cuerpo del panel del cerebro; slot `before`) | `dockEls(prefijo, wrapId?)` + `linkPanels(code, brain)` (`ui/dock.ts`), con `CodePanel` y el panel del cerebro de cada pantalla | las tres |
| **PauseButton / PauseControl** (pausa) | `PauseButton.astro` `{prefix}` | `PauseControl({button, icon, section, say, onChange?, pager})`: `paused`, `set`, `scale(dt)`, barra espaciadora | Paleta |
| **AutoMode** («Míralo solo») | `AutoPanel.astro` `{prefix, part: button|caption}` | `AutoMode` (`ui/AutoMode.ts`: botón, rótulo con enlace, parar al tocar otro control / salir de pantalla / pestaña, espera con pausa) + **`runScript`** (`viz/script.ts`: ejecutor genérico del guion; `data/paletaAuto.ts` y `data/coloresAuto.ts` solo ponen su guion y su `perform`) | Paleta, Colores |
| **Jars** (frascos de «Comparar») | `Jars.astro` `{id, keys, titles}` | `Jars(raíz).set(k, pct, título)`, `.highlight(k)` | Enséñale, Equipo |
| **ColorPicker** (selector + rápidos) | `ColorPicker.astro` `{prefix?}` | `bindColorPicker` | Enséñale, Equipo |
| **Narrator** (estado, `aria-live`, frase) | — | `Narrator({status, live, phrase})`: `status`, `say`, `phrase(idea, detalle?)` | las tres |
| Bucle de animación con pausa | — | `createLoop` (`viz/core/loop.ts`: pausa fuera de pantalla/pestaña oculta, «menos movimiento») + `PauseControl.scale(dt)` | las tres |
| Pantalla alta en móvil | — | `Pager.followCenter(sec, onHere?)` | las tres |
| Iconos | — | `ui/icons.ts` (`icoCopy`, `brainSvg`, `codeSvg`) | los docks |

**Cómo montar un ejemplo nuevo** (p. ej. `Ejemplo.astro` + `ejemploScreen.ts`):
1. Datos en `src/data/ejemplo.ts` (modelo real de `@dniskav/neuron`, semillas, `BRAIN_SCALE` medida con el modelo real: cambio acumulado de una red bien entrenada ≈ 2,3 × escala) y, si quieres «Míralo solo», `ejemploAuto.ts` (lista de pasos `ScriptStep` + `runAuto` = `runScript(guion, api, perform)`).
2. `Ejemplo.astro`: `<ActionButton variant="go" id="xgo">`, `<ActionRow>` para más botones, `<Toggle …>` por cada interruptor, `<ExamStrip>` o la tira que toque, `<CodeBrainDock prefix="x" …>` con el cuerpo de su panel del cerebro dentro, `<BrainMeter id="xmeter" …>`, `<Jars>`, `<AutoPanel prefix="x" part="button|caption">`. Los ids salen de los props: el TS solo los pide con `$()`/`dockEls('x')`.
3. `ejemploScreen.ts` (el DIRECTOR; no pinta neuronas): `new NetworkView(net, opciones, layout)`, `const meter = new BrainMeter(); meter.setModel(net); meter.track(nv.observed, BRAIN_SCALE)` (al crear CADA red nueva: se vacía), `mountBrainMeter({ canvas, meter, reduced, caption: { el: $('xmetercap'), text: () => pctCaption(pct) } })`, donde la red aprende `meter.learned(meter.lobeOf(net, capa, n), nv.layers[capa][n].learn(delta))` con los Δ de `nv.observed.train/poll`; `dockEls` + `new CodePanel(dock.code, …)` + el panel del cerebro + `linkPanels`; `new Narrator`, `new Toggle(...)`.paint, `new AutoMode({...}).onPress((h) => runAuto(guion, api(h), { reduced }))` y `getPager().followCenter(sec)`.
4. Un test del guion (con `runScript` y una API de mentira, como `tests/paleta.test.ts`) y del cerebro (la escala llena y vacía como en `tests/brainmeter.test.ts`).

## Cambios respecto al prototipo
- En «Equipo», cada neurona celebra según su propio Δ (antes solo celebraba la final).
- La librería se carga desde el bundle, no desde el CDN; el respaldo inline desaparece.
- **Menú:** el prototipo usaba un punto de corte fijo (640 px) para pasar a la versión compacta (solo números) y entre ~640 y ~1000 px la píldora se desbordaba y se cortaba. Ahora `HeaderFit` (`src/viz/HeaderFit.ts`) mide con JS si el menú completo cabe en la cabecera (con el botón «?» presente, para que no cambie de forma al cambiar de pantalla) y pone `header.compact` cuando NO cabe. Con la fuente real el corte cae hacia los 875 px; en cualquier ancho nada se corta ni desborda. El punto de 640 px queda en el CSS solo como respaldo sin JS.
- «Colores» es una CAPA: `NetworkN([3, N])`, sin capa oculta. Cada nombre es una neurona completa (cuerpo, 3 ramas desde las entradas, axón y bulbo con su color y su nombre), la de Enséñale copiada; hay un contador («3 neuronas, una por nombre») y el dibujo pasa a compacto y a puntos cuando N crece. Un experimento con la librería real demostró que con una capa oculta de 1 o 2 neuronas acierta menos (cuello de botella) y sin ella acierta 99–100 % de 3 a 16 nombres. Cada neurona tiene su anillo de tonos y su frase («verde: se enciende con verdes»), de su activación real.
- «Paleta» (05, `id=paleta`, «¿Dónde caerá?») sustituye a «Colores» en la ruta (inicio, neurona, ensenale, equipo, paleta, snake, juegos, historia). Va DESPUÉS de Equipo: el visitante ya conoce el equipo y la paleta se lo recuerda («como en Equipo…»); Equipo enlaza con Enséñale (una neurona sola bastaba para claro/oscuro, no para «intermedio»). Un campo tipo Arkanoid: una bola baja desde el techo y una neurona REAL (`NetworkN` de @dniskav/neuron) PREDICE la x donde cruzará la línea de la paleta; la paleta solo va allí y se para (código normal, no aprende). Sin etiquetas humanas: al llegar la bola se conoce la x real, ese par (lo que vio → dónde cayó) se guarda y la neurona REPASA todas las caídas guardadas. Física, modelos y semillas en `src/data/paleta.ts` (verificación previa en `experiments/paleta/`); código en vivo en `paletaCode.ts`, guion de «Míralo solo» en `paletaAuto.ts`, director en `components/screens/paletaScreen.ts`.
  - **Entradas: `[x, inclinación]`** (dónde está la bola al empezar a bajar y su pendiente, tan del ángulo; la altura de inicio es fija, el techo). Sin paredes `NetworkN([2,1])` lineal, Adam lr 0.01, 20 pasadas por repaso: x_final = x + inclinación es exactamente lineal, y con ~20-30 caídas atrapa ≥ 90 %. Con paredes (rebote con ±3° de error) la neurona sola se queda en ~25 % (el equipo ya se conoce de la pantalla Equipo); `NetworkN([2,8,1])` (tanh y salida sigmoide, Adam lr 0.003, 100 pasadas por repaso) atrapa ≥ 90 % con 100-300 caídas.
  - Paleta de ancho 0.2 (se atrapa si cae a ≤ 0.1 de su centro). Cada caída número k de un modo sale de su propia semilla (`dropAt`), así que la pantalla es determinista.
  - «Lanzar bola» anima una a una (la entrada viaja, responde, la paleta va, la bola cae, ✓/✗, repaso en tandas con el Δ real de cada neurona); «Lanzar 10» va deprisa; «Lanzar 100» no anima cada bola (repaso cada 10). «Paredes» vacía las caídas guardadas (otro mundo) y conserva la red;  «Cerebro: neurona/equipo» (independiente de las paredes: 4 combinaciones) crea una red NUEVA y vacía (`[2,1]` o `[2,8,1]`) y reinicia caídas, tira y contador; el recorrido sugerido (guía y «Míralo solo») sigue siendo neurona sin paredes, paredes, falla, equipo; «Empezar de cero» vuelve a la neurona sola sin paredes.
  - La paleta no vuelve a predecir durante el vuelo: el modelo se entrenó con la bola empezando a bajar desde el techo, y a mitad de vuelo (o tras un rebote) la entrada estaría fuera de lo que vio.
- En «Equipo», el pulso de corrección de cada tramo y la celebración de cada neurona salen de SU propio cambio de pesos (antes, las del medio solo hacían un «pop» y la celebración era global).

## Despliegue
`bun run build` genera `dist/` estático. Se sirve en el VPS bajo `neuron.dniskav.com` (Caddy o nginx). Ver README.

## Pantallas
| # | id | Estado |
|---|----|--------|
| 01 | inicio | portada, migrar |
| 02 | neurona | neurona genérica con clic en ramas, migrar |
| 03 | ensenale | claro/oscuro, NeuronN(3), migrar |
| 04 | equipo | hecho: NetworkN([3,k,1]) con NetworkView; cada neurona celebra y pulsa según su Δ; viene justo después de Enséñale |
| 05 | paleta | hecho: «¿Dónde caerá?», `NetworkN([3,1])` (x, inclinación, altura) que predice la x de caída (con paredes falla; `[3,8,1]` acierta); interruptor «Bloque» (la red no lo ve: al rebotar la bola, vuelve a mirar y corrige); `NetworkView`, repasos con Δ real, «Míralo solo», cerebro pequeño bajo el campo |
| 06 | snake | marcador (más adelante: aprendizaje real) |
| 07 | juegos | marcador |
| 08 | historia | marcador |
| – | colores | aparcada (archivos intactos, fuera de la navegación y de `Home.astro`): «¿Qué color es?», `NetworkN([3,N])` que crece |
