/**
 * Datos y física deterministas de «¿Dónde caerá?» (Paleta). La verificación previa vive en experiments/paleta.
 *
 * Una bola baja desde arriba. Lo que la neurona VE al empezar a bajar es dónde está («x»), cuánto se inclina («inclinación»:
 * cuánto se desplaza de lado por cada unidad que baja) y a qué altura empieza («altura»: 1 = el techo; menos si empieza a
 * bajar al rebotar en el bloque). Lo que PREDICE es la x donde cruzará la línea de la paleta. La paleta solo va a ese punto y
 * se para: eso es código normal, no aprende.
 *
 * Nadie etiqueta nada: cuando la bola llega abajo la x real ya se conoce, así que el par (lo que vio → dónde cayó)
 * se guarda, y la neurona REPASA todas las caídas guardadas.
 *
 *  - sin paredes ni bloque: `NetworkN([3, 1])` lineal, Adam. x_final = x + inclinación (la altura vale siempre 1), justo lo
 *    que una neurona sabe hacer.
 *  - con paredes (la bola rebota, con ±5° de error en cada rebote): la neurona sola no puede (la línea se pliega a
 *    cada rebote); un equipo `NetworkN([3, 8, 1])` (tanh y salida sigmoide) sí, con muchas caídas.
 *  - con bloque: la altura deja de valer siempre 1 (x_final = x + altura·inclinación lleva un producto): el equipo lo aprende,
 *    la neurona sola se queda corta. La red es la MISMA en todos los modos (siempre tres entradas).
 */
import { Adam, NetworkN, linear, seededRandom, setRandom, sigmoid, tanh } from '@dniskav/neuron';
import { mulberry32 } from '../viz/core/rng';

/** Mitad del ancho de la paleta (campo de 0 a 1): la bola se atrapa si cae a menos de esto del centro de la paleta. */
export const HW = 0.1;
/** Ángulo máximo respecto a la vertical, en grados, y error (±) de cada rebote en una pared. */
export const THETA_MAX = 50;
export const BOUNCE_ERR = 5;
export const INIT_SEED = 7;
export const DROP_SEED = 31;
export const TEST_SEED = 90001;
export const REBOUND_SEED = 4177;

export type Kind = 'solo' | 'equipo';
export const KINDS: Kind[] = ['solo', 'equipo'];

/** Entradas con nombre (las etiquetas del dibujo y del código). */
export const INPUT_NAMES = ['dónde está', 'inclinación', 'altura'];
export const IN_N = INPUT_NAMES.length;
export const LR: Record<Kind, number> = { solo: 0.01, equipo: 0.003 };
/** Pasadas por «repaso». */
export const PASSES: Record<Kind, number> = { solo: 20, equipo: 100 };
/**
 * Con cuánto cambio acumulado se llena la sección de una neurona al 63 % (`fillOf`): la suma, paso a paso, de Σ|Δw| + |Δb|
 * (`ObservedModel.travel`). Medido con las redes reales (`playDrops`, tandas de 10); cambio de la neurona y % de aciertos:
 *  - sola sin paredes: 1 caída 0,8; 10 → 1,7 (28 %); 30 → 4,8 (100 %); 100 → 7,9 (100 %). Escala 2,5: 30 caídas llenan 85 %.
 *  - sola con paredes: 10 → 2,0 (24 %); 30 → 7,9 (27 %); 100 → 75 (27 %). Se llena del todo y se queda en ~27 %: cambia mucho y no puede.
 *  - equipo con paredes: 10 → 1–5 (38 %); 30 → 10–25 (58 %); 100 → 105–248 (96 %); 300 → 835–2140 (97 %). Escala 40: 100 caídas llenan 93–100 %.
 * Mide cuánto se ha movido cada neurona, no lo bien que acierta la red.
 */
export const BRAIN_SCALE: Record<Kind, number> = { solo: 2.5, equipo: 40 };
export const HIDDEN = 8;
/** Cuántas caídas hacen falta, más o menos, para cada modo (lo que dice la guía y los textos). */
export const ENOUGH: Record<Kind, number> = { solo: 30, equipo: 300 };

/** Una caída: lo que la neurona vio al empezar a bajar, y dónde cayó de verdad. */
export interface Drop {
  /** Dónde estaba (0..1). */
  x: number;
  /** A qué altura empezó a bajar (1 = el techo; menos si empezó a bajar al rebotar en el bloque). */
  y: number;
  /** Cuánto se desplaza de lado por unidad que baja (tan del ángulo). */
  slope: number;
  /** Dónde cruzó la línea de la paleta (0..1): lo que se conoce al llegar. Si `cut`, es donde chocó (no es un ejemplo). */
  land: number;
  /** El camino: [x, y] de cada vértice (el inicio, cada rebote y el final). y=1 es arriba y y=0 la línea de la paleta. */
  path: [number, number][];
  bounces: number;
  /** La bajada se cortó contra el bloque antes de llegar abajo: NO es un ejemplo (la red no ve el bloque). */
  cut: boolean;
}

const D2R = Math.PI / 180;
const U = (r: () => number, a: number, b: number): number => a + (b - a) * r();
const clampTh = (th: number): number => Math.max(-80 * D2R, Math.min(80 * D2R, th));

/**
 * El bloque: una barra horizontal ancha y baja en la mitad de arriba del campo (siempre entre y = 0,51 y 0,96). La red NO lo ve. Si la bola lo toca, rebota
 * (con el mismo error de ±5° que en las paredes) y el bloque desaparece; luego aparece otro en otro sitio.
 */
export interface Block { x: number; y: number }
export const BLOCK_W = 0.25;
export const BLOCK_H = 0.04;
export const BLOCK_SEED = 9151;
export const blockFrom = (r: () => number): Block => ({ x: U(r, 0.2, 0.8), y: U(r, 0.650, 0.820) });
/** El bloque número `m` de una partida: siempre el mismo. */
export const blockAt = (m: number): Block => blockFrom(mulberry32(BLOCK_SEED * 100003 + m * 7919));
/** Los lados del bloque (x0, x1, y0, y1). */
export const blockBox = (b: Block): [number, number, number, number] => [b.x - BLOCK_W / 2, b.x + BLOCK_W / 2, b.y - BLOCK_H / 2, b.y + BLOCK_H / 2];
/** El bloque que hay ahora y cuántos han salido (para que el siguiente sea siempre el mismo). */
export interface BlockState { on: boolean; block: Block | null; n: number }
export const newBlockState = (on = false): BlockState => { const s: BlockState = { on, block: null, n: 0 }; return refill(s); };
/** Si el bloque está activado y no hay ninguno, aparece el siguiente. Devuelve el mismo estado. */
export function refill(s: BlockState): BlockState {
  if (!s.on) s.block = null;
  else if (!s.block) s.block = blockAt(s.n++);
  return s;
}

/** Un trozo del viaje de la bola: una bajada (`fall`, un ejemplo si no se cortó) o un vuelo (`fly`, subida o salida). */
export type Part =
  | { kind: 'fall'; d: Drop; hit?: number }
  | { kind: 'fly'; path: [number, number][]; exit: 'top' | 'side' | null; hit?: number };
/**
 * Todo lo que hace la bola desde que entra en juego hasta que llega a la línea de la paleta: trozos en orden. `hit` es
 * donde tocó el bloque (si lo tocó). La última bajada (sin cortar) es el ejemplo de esta bola: lo que la red vio al
 * empezarla y dónde cayó. Las bajadas cortadas por el bloque no cuentan.
 */
export interface Journey { parts: Part[]; hit: [number, number] | null }
/** El ejemplo de un viaje: su última bajada (siempre acaba en una que llega abajo). */
export function finalDrop(j: Journey): Drop {
  for (let i = j.parts.length - 1; i >= 0; i--) { const p = j.parts[i]; if (p.kind === 'fall') return p.d; }
  throw new Error('viaje sin bajada');
}
/** Lo que la red ve y dice en un viaje: una mirada por cada vez que la bola EMPIEZA A BAJAR (la última es la que cuenta). */
export const looks = (net: NetworkN, j: Journey): { d: Drop; pred: number }[] => drops(j).map((d) => ({ d, pred: predictX(net, d) }));
/** Las bajadas de un viaje, en orden: cada una es un momento en que la red mira y predice de nuevo. */
export const drops = (j: Journey): Drop[] => j.parts.flatMap((p) => (p.kind === 'fall' ? [p.d] : []));
/** ¿El viaje empieza con la bola que devuelve la paleta, y sigue sin perderse hasta bajar? */
export const returned = (j: Journey): boolean => j.parts[0].kind === 'fly' && !j.parts.some((p) => p.kind === 'fly' && p.exit !== null);
/** Los ejemplos de un viaje: las bajadas que llegan abajo sin chocar con nada (solo la última). */
export const examples = (j: Journey): Drop[] => drops(j).filter((d) => !d.cut);

/** Cuándo (en distancia vertical recorrida) y por qué cara entra la bola en el bloque, o null si no lo toca. */
function enterBlock(b: Block, x: number, y: number, slope: number, dir: 1 | -1): { t: number; face: 'side' | 'cap' } | null {
  const [x0, x1, y0, y1] = blockBox(b);
  const tyIn = dir > 0 ? y0 - y : y - y1, tyOut = dir > 0 ? y1 - y : y - y0;
  let txIn = -Infinity, txOut = Infinity;
  if (slope === 0) { if (x <= x0 || x >= x1) return null; }
  else { const a = (x0 - x) / slope, c = (x1 - x) / slope; txIn = Math.min(a, c); txOut = Math.max(a, c); }
  const tIn = Math.max(tyIn, txIn), tOut = Math.min(tyOut, txOut);
  if (!(tIn < tOut) || tIn < 1e-12) return null;
  return { t: tIn, face: txIn > tyIn ? 'side' : 'cap' };
}

interface FlyOpts { walls: boolean; ceiling: boolean; block: Block | null }
/**
 * Vuelo de la bola desde (x, y) con el ángulo `th` (sentido horizontal = signo de `th`) y la dirección vertical `dir`
 * (1 sube, -1 baja), con paredes (si hay), techo (si hay) y bloque (si hay). Cada rebote en una pared y en el bloque lleva el
 * pequeño error de ángulo. Acaba al llegar a la línea de la paleta (`lost` = false) o cuando la bola se pierde por un lado
 * (sin paredes) o por arriba (sin techo): `lost` = true.
 */
function fly(r: () => number, x0: number, y0: number, th0: number, dir0: 1 | -1, o: FlyOpts): { parts: Part[]; hit: [number, number] | null; lost: boolean } {
  const err = (): number => U(r, -BOUNCE_ERR * D2R, BOUNCE_ERR * D2R);
  const parts: Part[] = [];
  let x = x0, y = y0, th = th0, dir = dir0, blk = o.block, hit: [number, number] | null = null;
  let path: [number, number][] = [[x, y]], bounces = 0, start = { x, y, th }, hitIdx: number | undefined;
  /** Cierra el trozo actual: una bajada (si bajaba y no se salió por un lado) o un vuelo. */
  const close = (down: boolean, cut: boolean, exit: 'top' | 'side' | null): void => {
    const hi = hitIdx; hitIdx = undefined;
    if (down && exit !== 'side') parts.push({ kind: 'fall', d: { x: start.x, y: start.y, slope: Math.tan(start.th), land: path[path.length - 1][0], path, bounces, cut }, ...(hi !== undefined ? { hit: hi } : {}) });
    else parts.push({ kind: 'fly', path, exit, ...(hi !== undefined ? { hit: hi } : {}) });
  };
  const begin = (): void => { path = [[x, y]]; bounces = 0; start = { x, y, th }; };
  for (let guard = 0; guard < 400; guard++) {
    const slope = Math.tan(th), yEnd = dir > 0 ? 1 : 0, tEnd = Math.abs(yEnd - y);
    const wall = slope > 0 ? 1 : 0, tWall = slope !== 0 ? (wall - x) / slope : Infinity;
    const e = blk ? enterBlock(blk, x, y, slope, dir) : null, tb = e ? e.t : Infinity;
    if (tEnd <= tWall && tEnd <= tb) {
      x += slope * tEnd; y = yEnd; path.push([x, y]);
      if (dir < 0) { close(true, false, null); return { parts, hit, lost: false }; }
      if (!o.ceiling) { close(false, false, 'top'); return { parts, hit, lost: true }; }
      close(false, false, null);
      th = clampTh(th + err()); dir = -1; begin();
    } else if (e && tb < tWall) {
      x += slope * tb; y += dir * tb; path.push([x, y]); hit = [x, y]; blk = null;
      const down = dir < 0;
      if (e.face === 'side') {
        th = clampTh(-th + err());
        if (down) { hitIdx = path.length - 1; close(true, true, null); begin(); } else hitIdx = path.length - 1;   // sube: sigue el mismo vuelo
      } else {
        hitIdx = path.length - 1; close(down, down, null);
        th = clampTh(th + err()); dir = down ? 1 : -1; begin();
      }
    } else {
      y += dir * tWall; x = wall; path.push([x, y]);
      if (!o.walls) { close(dir < 0, false, 'side'); return { parts, hit, lost: true }; }
      bounces++; th = clampTh(-th + err());
    }
  }
  throw new Error('la bola no acaba nunca');
}

/** Una bola nueva desde el techo con el generador `r`: el mismo (x, ángulo) que una caída sin bloque. Sin paredes, solo valen las que no tocan los lados. */
function launch(r: () => number, o: FlyOpts): { parts: Part[]; hit: [number, number] | null; lost: boolean } {
  for (;;) {
    const th = U(r, -THETA_MAX * D2R, THETA_MAX * D2R), x0 = U(r, 0.05, 0.95);
    const j = fly(r, x0, 1, th, -1, o);
    if (!o.walls && j.lost && j.parts.some((p) => p.kind === 'fly' && p.exit === 'side')) continue;
    return j;
  }
}

/** Una caída a partir de un generador (sin bloque, desde el techo). Sin paredes solo vale una trayectoria que no toque los lados. */
export function makeDrop(r: () => number, walls: boolean): Drop {
  return finalDrop(launch(r, { walls, ceiling: true, block: null }));
}

/** La caída número `k` de un modo: siempre la misma (cada una sale de su propia semilla). */
export function dropAt(k: number, walls: boolean): Drop {
  return makeDrop(mulberry32(DROP_SEED * 100003 + k * 7919 + (walls ? 1 : 0)), walls);
}
/** Caídas de examen sin bloque: nunca coinciden con las que se lanzan. */
export function testDrop(k: number, walls: boolean): Drop {
  return makeDrop(mulberry32(TEST_SEED * 100003 + k * 7919 + (walls ? 1 : 0)), walls);
}
/**
 * El ejemplo del examen número `k`: una bola nueva desde el techo y, con bloque, un bloque al azar en su camino. Cuenta lo
 * mismo que en el juego: la ÚLTIMA bajada (la que llega abajo sin chocar con nada).
 */
export function testExample(k: number, rules: Pick<Rules, 'walls' | 'ceiling'> & { block?: boolean }): Drop {
  const r = mulberry32(TEST_SEED * 100003 + k * 7919 + (rules.walls ? 1 : 0)), block = rules.block ? blockFrom(mulberry32(TEST_SEED * 131 + k * 17)) : null;
  return finalDrop(settle(launch(r, { walls: rules.walls, ceiling: rules.ceiling, block }), k, rules.walls, rules.ceiling, block));
}

/**
 * Las reglas del juego (no cambian lo que la neurona ve ni lo que aprende, solo qué bolas llegan).
 *  - `walls`: la bola rebota en los lados (con ±5° de error). Esto SÍ cambia el resultado de una bajada.
 *  - `rebound`: si la paleta atrapa la bola, la devuelve hacia arriba (ángulo según dónde pegue, estilo Arkanoid,
 *    con el mismo pequeño error) y el juego sigue. Si no, se lanza una bola nueva.
 *  - `ceiling`: la bola que sube rebota en el techo y vuelve a bajar. Si no, sale por arriba y se lanza una nueva.
 *  - `block`: hay un bloque que la red no ve (ver `Block`). Cuando la bola rebota en él, la red vuelve a mirar y a predecir.
 *
 * Cada vez que la bola EMPIEZA A BAJAR (desde el techo o tras rebotar en el bloque) la red mira y predice de nuevo, así
 * que ve tres cosas: dónde está, cuánto se inclina y a qué altura empieza. Cada bajada que llega a la línea de la paleta sin
 * chocar con nada es un par válido (lo que vio → dónde cayó), igual que los de entrenamiento. Una bajada cortada por el
 * bloque NO es un par (no es lo que la red vio): no se guarda, y la bajada que sigue es otro ejemplo.
 */
export interface Rules { walls: boolean; ceiling: boolean; rebound: boolean; block?: boolean }
export const RULES: Rules = { walls: false, ceiling: false, rebound: false, block: false };

/** Lo que pasó en la caída anterior: la caída, dónde estaba la paleta y si atrapó. */
export interface Prev { d: Drop; paddleX: number; ok: boolean }

/** Si el viaje se perdió (por un lado o por arriba), se lanza una bola nueva desde el techo, sin bloque si ya lo tocó. */
function settle(j: { parts: Part[]; hit: [number, number] | null; lost: boolean }, k: number, walls: boolean, ceiling: boolean, block: Block | null): Journey {
  let parts = j.parts, hit = j.hit, lost = j.lost, blk = j.hit ? null : block, n = 0;
  while (lost) {
    const nj = launch(mulberry32(DROP_SEED * 100003 + k * 7919 + (walls ? 1 : 0) + 17 * n), { walls, ceiling, block: n > 3 ? null : blk });
    parts = parts.concat(nj.parts); hit = hit ?? nj.hit; lost = nj.lost; if (nj.hit) blk = null; n++;
  }
  return { parts, hit };
}

/**
 * El viaje número `k`: si la paleta atrapó la anterior y hay rebote, la bola que sale rebotada (con el ángulo que da dónde
 * pegó: en el centro, recta; en el borde, `THETA_MAX`; más el pequeño error); si no, una bola nueva desde el techo. Con
 * `block`, el bloque (si lo toca) desvía la bola y vuelve a bajar desde otra altura. Siempre acaba en una bajada que llega
 * a la línea de la paleta; si la bola se pierde por el camino, entra una nueva desde el techo.
 */
export function nextJourney(k: number, prev: Prev | null, rules: Rules, block: Block | null = null): Journey {
  const blk = rules.block ? block : null;
  if (prev && prev.ok && rules.rebound) {
    const r = mulberry32(REBOUND_SEED * 100003 + k * 7919 + (rules.walls ? 1 : 0) + (rules.ceiling ? 2 : 0));
    const err = (): number => U(r, -BOUNCE_ERR * D2R, BOUNCE_ERR * D2R);
    const off = Math.max(-1, Math.min(1, (prev.d.land - prev.paddleX) / HW));
    const th = clampTh(off * THETA_MAX * D2R + err());
    return settle(fly(r, prev.d.land, 0, th, 1, { walls: rules.walls, ceiling: rules.ceiling, block: blk }), k, rules.walls, rules.ceiling, blk);
  }
  const r = mulberry32(DROP_SEED * 100003 + k * 7919 + (rules.walls ? 1 : 0));
  return settle(launch(r, { walls: rules.walls, ceiling: rules.ceiling, block: blk }), k, rules.walls, rules.ceiling, blk);
}

/** Lo que ve la red al empezar a bajar: dónde está, cuánto se inclina y a qué altura empieza (1 = el techo). */
export const feats = (d: { x: number; slope: number; y: number }): number[] => [d.x, d.slope, d.y];

/**
 * Los dos interruptores del equipo. `curve`: las neuronas del medio doblan su respuesta (tanh; si no, linear).
 * `bounded`: la final se queda entre 0 y 1, dentro del campo (sigmoid; si no, linear).
 */
export interface Team { curve: boolean; bounded: boolean }
export const TEAM: Team = { curve: true, bounded: true };
/** Las funciones de activación (por nombre, tal como aparecen en el código) de cada capa del equipo. */
export const teamActNames = (t: Team): [string, string] => [t.curve ? 'tanh' : 'linear', t.bounded ? 'sigmoid' : 'linear'];

/** Rótulos de los dos interruptores (sin jerga) y su texto corto de estado, con lo medido en experiments/paleta/RESULTADOS.md. */
export const CURVE_LABEL = (on: boolean): string => 'Las del medio se doblan: ' + (on ? 'sí' : 'no');
export const BOUND_LABEL = (on: boolean): string => 'Final dentro del campo: ' + (on ? 'sí' : 'no');
export const WALLS_LABEL = (on: boolean): string => 'Paredes: ' + (on ? 'sí' : 'no');
export const wallsExplain = (on: boolean): string => on
  ? 'Sí: la bola rebota en los lados, con un pequeño error de ángulo en cada rebote.'
  : 'No: la bola solo baja en línea recta; solo valen las caídas que no tocan los lados.';
/** «Bloque»: un obstáculo que la red no ve. Lo que se dice aquí es lo medido en experiments/paleta/RESULTADOS.md (sección 7). */
export const BLOCK_LABEL = (on: boolean): string => 'Bloque: ' + (on ? 'sí' : 'no');
export const blockExplain = (on: boolean): string => on
  ? 'Sí: la red no ve el bloque; cuando la bola rebota en él, vuelve a mirar y corrige.'
  : 'No: nada desvía la bola; cada bajada empieza en el techo.';
/** «Juego continuo»: devolver la bola con la paleta y rebotar en el techo van juntos (el uno sin el otro no tiene sentido). */
export const CONT_LABEL = (on: boolean): string => 'Juego continuo: ' + (on ? 'sí' : 'no');
export const contExplain = (on: boolean): string => on
  ? 'Sí: la paleta devuelve la bola, rebota en el techo y vuelve a bajar, sin parar. Solo se acaba cuando la paleta falla.'
  : 'No: cada bola cae desde el techo; después se lanza una nueva.';
/** El interruptor único mueve a la vez techo y rebote en la paleta. */
export const rulesOf = (walls: boolean, continuous: boolean, block = false): Rules => ({ walls, ceiling: continuous, rebound: continuous, block });
export function curveExplain(on: boolean, walls: boolean): string {
  if (on) return 'Sí: cada una dobla su respuesta en curva; juntas pueden seguir el zigzag del rebote.';
  return walls
    ? 'No: sin doblarse, ocho neuronas juntas valen lo mismo que una recta: con paredes falla como la neurona sola.'
    : 'No: sin doblarse, ocho juntas valen una recta. Sin paredes basta y acierta; con paredes fallaría.';
}
export function boundExplain(on: boolean): string {
  return on
    ? 'Sí: su respuesta queda entre 0 y 1, el ancho del campo; nunca dice que cae fuera. Aprende algo más lento al empezar.'
    : 'No: puede decir que cae un poco fuera del campo; aprende algo antes y acierta casi igual.';
}

/** Red nueva (nace siempre con los mismos pesos). */
export function newModel(kind: Kind, team: Team = TEAM): NetworkN {
  setRandom(seededRandom(INIT_SEED));
  try {
    return kind === 'solo'
      ? new NetworkN([IN_N, 1], { activations: [linear], optimizer: () => new Adam() })
      : new NetworkN([IN_N, HIDDEN, 1], { activations: [team.curve ? tanh : linear, team.bounded ? sigmoid : linear], optimizer: () => new Adam() });
  } finally { setRandom(null); }
}

/** Todo lo que la persona elige: el cerebro, las reglas del juego y las activaciones del equipo. */
export interface Config { kind: Kind; rules: Rules; team: Team }
export const DEFAULT_CONFIG: Config = { kind: 'solo', rules: RULES, team: TEAM };
/**
 * «Empezar de cero»: CONSERVA toda la configuración y solo crea una red nueva (los mismos pesos de inicio de siempre) y
 * vacía las caídas guardadas y la bola en juego (el bloque vuelve a ser el primero de la serie). Si se conservaran las caídas, la red nueva reaprendería al instante de
 * la memoria y no se vería empezar de cero.
 */
export function restart(cfg: Config): { cfg: Config; net: NetworkN; saved: Drop[]; prev: Prev | null; bs: BlockState } {
  return { cfg: { kind: cfg.kind, rules: { ...cfg.rules }, team: { ...cfg.team } }, net: newModel(cfg.kind, cfg.team), saved: [], prev: null, bs: newBlockState(!!cfg.rules.block) };
}

/** Dónde cree la red que caerá la bola. */
export const predictX = (net: NetworkN, d: { x: number; slope: number; y: number }): number => net.predict(feats(d))[0];

/** Dónde se pone la paleta para una predicción: va allí y se para (sin salirse del campo). */
export const paddleAt = (pred: number): number => Math.max(HW, Math.min(1 - HW, pred));
/** ¿La paleta (puesta en `pred`) atrapa una bola que cae en `land`? */
export const caught = (pred: number, land: number): boolean => Math.abs(paddleAt(pred) - land) <= HW;

/** Un paso de aprendizaje con una caída guardada. */
export const trainOne = (net: NetworkN, d: Drop, lr: number): void => { net.train(feats(d), [d.land], lr); };

/**
 * Un tramo del repaso: `passes` pasadas por TODAS las caídas guardadas, en un orden que depende solo de cuántas hay
 * y de qué tramo es (determinista). Devuelve cuántos pasos de aprendizaje dio.
 */
export function reviewChunk(net: NetworkN, saved: Drop[], kind: Kind, passes: number, chunk = 0): number {
  const r = mulberry32(5003 + saved.length * 131 + chunk * 17), idx = saved.map((_, i) => i), lr = LR[kind];
  let steps = 0;
  for (let p = 0; p < passes; p++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (const i of idx) { trainOne(net, saved[i], lr); steps++; }
  }
  return steps;
}
/** Cuántas pasadas tiene un repaso con `n` caídas guardadas (con muchísimas, menos, para que siga siendo instantáneo). */
export const passesFor = (kind: Kind, n: number): number => Math.max(10, Math.min(PASSES[kind], Math.floor(30000 / Math.max(1, n))));
/** El repaso entero de un modo (todas sus pasadas). */
export function review(net: NetworkN, saved: Drop[], kind: Kind): void { reviewChunk(net, saved, kind, passesFor(kind, saved.length), 0); }

/**
 * % de bolas nuevas (de examen) que atrapa la paleta con esta red. `rules` puede ser solo `walls`. Con bloque, cada bola del
 * examen trae un bloque al azar y se cuenta como en el juego: la última bajada (la que llega abajo sin chocar con nada).
 */
export function evaluate(net: NetworkN, rules: boolean | Pick<Rules, 'walls' | 'ceiling' | 'block'>, n = 500): number {
  const rl = typeof rules === 'boolean' ? { walls: rules, ceiling: true, block: false } : rules;
  let ok = 0;
  for (let k = 0; k < n; k++) { const d = testExample(k, rl); if (caught(predictX(net, d), d.land)) ok++; }
  return Math.round((ok / n) * 100);
}

/**
 * Lo mismo que hace la pantalla con «Lanzar 10»/«Lanzar 100»: `count` viajes de la bola, cada tanda se repasa entera al
 * terminar. `rules` puede ser solo `walls` (sin techo ni rebote). Cada viaje guarda UN ejemplo: su última bajada (las cortadas
 * por el bloque no cuentan). Devuelve cuántas atrapó (antes de repasar cada tanda), cuántas fueron bolas devueltas por la
 * paleta y cuántas veces la red tuvo que volver a mirar por haber chocado la bola con el bloque. `prev` (opcional) es la
 * caída anterior y `bs` (opcional) el bloque que hay, para encadenar tandas.
 */
export function playDrops(net: NetworkN, kind: Kind, rules: boolean | Rules, saved: Drop[], count: number, batch: number, prev: Prev | null = null, bs?: BlockState): { ok: number; rebounded: number; reLooks: number; prev: Prev | null } {
  const rl: Rules = typeof rules === 'boolean' ? { ...RULES, walls: rules, rebound: false } : rules;
  const st = bs ?? newBlockState(!!rl.block);
  let ok = 0, rebounded = 0, reLooks = 0, p = prev;
  for (let i = 0; i < count; i++) {
    refill(st);
    const j = nextJourney(saved.length, p, rl, st.block), seen = looks(net, j), last = seen[seen.length - 1], d = last.d, pred = last.pred, hit = caught(pred, d.land);
    reLooks += seen.length - 1;
    if (j.hit) st.block = null;
    if (returned(j)) rebounded++;
    if (hit) ok++;
    p = { d, paddleX: paddleAt(pred), ok: hit };
    saved.push(d);
    refill(st);
    if ((i + 1) % batch === 0 || i === count - 1) review(net, saved, kind);
  }
  return { ok, rebounded, reLooks, prev: p };
}

/** Cuántos números aprende cada modelo. */
export const paramCount = (kind: Kind): number => (kind === 'solo' ? IN_N + 1 : (IN_N + 1) * HIDDEN + HIDDEN + 1);
