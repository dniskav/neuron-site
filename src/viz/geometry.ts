import { bez, type Pt } from './core/canvas';
import { lcg } from './core/rng';

/** Una dendrita: la polilínea por la que llega una entrada, con su color y su etiqueta. */
export interface Dendrite {
  pts: Pt[];
  tip: Pt;
  /** Ramitas decorativas (no son entradas nuevas). */
  branches: { p: Pt; c: Pt; e: Pt }[];
  /** Color del canal (0..255). */
  rgb: [number, number, number];
  name: string;
  /** Etiqueta bajo la punta en vez de sobre ella. */
  labelBelow: boolean;
  /** Brillo en la punta (por defecto sí; no en las que salen de otra neurona). */
  tipGlow?: boolean;
}

export interface NeuronGeometry {
  body: { x: number; y: number; r: number };
  dendrites: Dendrite[];
  /** Axón (vacío si la neurona no tiene salida propia dibujada). */
  axon: Pt[];
  /** Posición del bulbo de salida (junto al final del axón). */
  terminal: Pt;
  /** Círculo de origen de la muestra de entrada (opcional). */
  origin?: { x: number; y: number; r: number };
  /** Sus dendritas parten de las mismas puntas que las de otra neurona que sí dibuja el origen (equipo). */
  sharedOrigin?: boolean;
  /** Tamaño del lienzo lógico. */
  size: { w: number; h: number };
}

const CH: [number, number, number][] = [[255, 96, 84], [96, 214, 112], [104, 152, 255]];
const CHN = ['rojo', 'verde', 'azul'];

export function branchesOf(pts: Pt[], at: number[], rnd: () => number, lenBase: number, lenVar: number) {
  return at.map((k) => {
    const p = pts[k], q = pts[k + 2], ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const side = rnd() < 0.5 ? -1 : 1, a2 = ang + side * (0.7 + rnd() * 0.5), len = lenBase + rnd() * lenVar;
    const e: Pt = [p[0] + Math.cos(a2) * len, p[1] + Math.sin(a2) * len];
    const c: Pt = [p[0] + Math.cos(a2 + side * 0.35) * len * 0.55, p[1] + Math.sin(a2 + side * 0.35) * len * 0.55];
    return { p, c, e };
  });
}

/**
 * La neurona de tres entradas (rojo, verde, azul) con un solo axón y un solo terminal,
 * tal cual en el prototipo aprobado.
 */
export function threeInputGeometry(): NeuronGeometry {
  const W = 640, H = 420, S = { x: 300, y: 210, r: 44 }, SW = { x: 38, y: 210, r: 19 };
  const rnd = lcg(11);
  const defs = [
    { tip: [128, 66] as Pt, c1: [196, 62] as Pt, c2: [232, 128] as Pt, a: -2.45 },
    { tip: [130, 214] as Pt, c1: [190, 228] as Pt, c2: [246, 200] as Pt, a: 3.1416 },
    { tip: [128, 354] as Pt, c1: [196, 358] as Pt, c2: [232, 292] as Pt, a: 2.45 },
  ];
  const N = 40;
  const dendrites: Dendrite[] = defs.map((d, i) => {
    const end: Pt = [S.x + Math.cos(d.a) * S.r * 0.85, S.y + Math.sin(d.a) * S.r * 0.85];
    const pts: Pt[] = [];
    for (let k = 0; k < N; k++) pts.push(bez(d.tip, d.c1, d.c2, end, k / (N - 1)));
    return { pts, tip: d.tip, branches: branchesOf(pts, [11, 22], rnd, 14, 14), rgb: CH[i], name: CHN[i], labelBelow: i === 2 };
  });
  const AN = 60, AXEND = 462, axon: Pt[] = [];
  for (let i = 0; i < AN; i++) {
    const f = i / (AN - 1), x = S.x + S.r * 0.9 + f * (AXEND - S.x - S.r * 0.9);
    axon.push([x, 210 + Math.sin(f * 9) * 7 * Math.min(1, f * 3)]);
  }
  const endP = axon[AN - 1];
  return { body: S, dendrites, axon, terminal: [endP[0] + 9, endP[1]], origin: SW, size: { w: W, h: H } };
}

/**
 * Geometría de una neurona dentro de una red: sus dendritas salen de los puntos dados
 * (las salidas de la capa anterior o las entradas) hacia el cuerpo.
 */
export function fanGeometry(body: { x: number; y: number; r: number }, sources: Pt[], size: { w: number; h: number }, withAxon: boolean): NeuronGeometry {
  const rnd = lcg(7 + Math.round(body.x + body.y));
  const dendrites: Dendrite[] = sources.map((s, i) => {
    const dx = body.x - s[0];
    const ang = Math.atan2(s[1] - body.y, s[0] - body.x);
    const end: Pt = [body.x + Math.cos(ang) * body.r * 0.85, body.y + Math.sin(ang) * body.r * 0.85];
    const pts: Pt[] = [];
    const c1: Pt = [s[0] + dx * 0.45, s[1]], c2: Pt = [end[0] - dx * 0.35, end[1]];
    for (let k = 0; k < 40; k++) pts.push(bez(s, c1, c2, end, k / 39));
    return { pts, tip: s, branches: branchesOf(pts, [11, 22], rnd, 8, 8), rgb: CH[i % 3], name: '', labelBelow: false };
  });
  const axon: Pt[] = withAxon ? [[body.x + body.r * 0.9, body.y], [body.x + body.r * 0.9 + 60, body.y]] : [];
  const end = axon.length ? axon[axon.length - 1] : [body.x + body.r, body.y];
  return { body, dendrites, axon, terminal: [end[0] + 9, end[1]], size };
}

/** Un diseño de red: una geometría por neurona (por capas) y el tamaño del lienzo lógico. */
export interface NetworkLayout {
  size: { w: number; h: number };
  neurons: NeuronGeometry[][];
}

export const TEAM_HUE: [number, number, number][] = [[255, 170, 90], [110, 214, 196], [200, 150, 255]];

/**
 * El equipo del prototipo: las tres entradas (rojo, verde, azul) comparten sus puntas y llegan a TODAS las
 * neuronas de la primera capa; la que decide (la última) tiene el único axón y el único terminal.
 * `k = 1` es una sola neurona (`[3, 1]`); `k >= 2` es `[3, k, 1]`.
 */
export function teamLayout(k: number): NetworkLayout {
  const W = 720, H = 420, AXEND = 566, NP = 40;
  const tips: Pt[] = [[92, 84], [92, 210], [92, 336]];
  const origin = { x: 30, y: 210, r: 17 };
  const F = { x: k === 1 ? 330 : 420, y: 210, r: k === 1 ? 44 : 38 };
  const ys = k === 2 ? [128, 292] : [78, 210, 342], rr = k === 2 ? 32 : 27;
  const mids = k > 1 ? Array.from({ length: k }, (_, j) => ({ x: 252, y: ys[j], r: rr })) : [];
  const first = k === 1 ? [F] : mids;
  const edge = (n: { x: number; y: number; r: number }, a: number): Pt => [n.x + Math.cos(a) * n.r * 0.85, n.y + Math.sin(a) * n.r * 0.85];
  const curve = (a: Pt, b: Pt, k1 = 0.45, k2 = 0.45): Pt[] => {
    const dx = b[0] - a[0], c1: Pt = [a[0] + dx * k1, a[1]], c2: Pt = [b[0] - dx * k2, b[1]];
    return Array.from({ length: NP }, (_, i) => bez(a, c1, c2, b, i / (NP - 1)));
  };
  const ang1 = [Math.PI + 0.66, Math.PI, Math.PI - 0.66];
  const conn1 = tips.map((tp, i) => first.map((n) => curve(tp, edge(n, ang1[i]))));
  const rnd = lcg(11);
  const twigs = tips.map((_, i) => branchesOf(conn1[i][0], [5, 11], rnd, 12, 12));
  const CH: [number, number, number][] = [[255, 96, 84], [96, 214, 112], [104, 152, 255]], CHN = ['rojo', 'verde', 'azul'];
  const firstGeoms: NeuronGeometry[] = first.map((n, j) => ({
    body: n,
    dendrites: tips.map((tp, i): Dendrite => ({
      pts: conn1[i][j], tip: tp, branches: j === 0 ? twigs[i] : [], rgb: CH[i],
      name: j === 0 ? CHN[i] : '', labelBelow: i === 2, tipGlow: j === 0,
    })),
    axon: [], terminal: [n.x + n.r, n.y],
    origin: j === 0 ? origin : undefined, sharedOrigin: j > 0, size: { w: W, h: H },
  }));
  const AN = 60, axon: Pt[] = [];
  for (let i = 0; i < AN; i++) {
    const f = i / (AN - 1), x = F.x + F.r * 0.9 + f * (AXEND - F.x - F.r * 0.9);
    axon.push([x, 210 + Math.sin(f * 9) * 7 * Math.min(1, f * 3)]);
  }
  const endP = axon[AN - 1], terminal: Pt = [endP[0] + 9, endP[1]];
  if (k === 1) {
    firstGeoms[0].axon = axon; firstGeoms[0].terminal = terminal;
    return { size: { w: W, h: H }, neurons: [[firstGeoms[0]]] };
  }
  const a2 = k === 2 ? [Math.PI + 0.5, Math.PI - 0.5] : [Math.PI + 0.72, Math.PI, Math.PI - 0.72];
  const fGeom: NeuronGeometry = {
    body: F,
    dendrites: mids.map((m, j): Dendrite => ({
      pts: curve([m.x + m.r * 0.9, m.y], edge(F, a2[j]), 0.5, 0.5), tip: [m.x + m.r * 0.9, m.y], branches: [],
      rgb: TEAM_HUE[j], name: '', labelBelow: false, tipGlow: false,
    })),
    axon, terminal, size: { w: W, h: H },
  };
  return { size: { w: W, h: H }, neurons: [firstGeoms, [fGeom]] };
}
