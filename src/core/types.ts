export type Kind =
  | "cell"
  | "battery"
  | "lamp"
  | "led"
  | "buzzer"
  | "motor"
  | "switch"
  | "push"
  | "variable"
  | "resistor"
  | "ammeter"
  | "voltmeter";
export type Point = { x: number; y: number };
export type Part = Point & {
  id: string;
  kind: Kind;
  label: string;
  rotation: number;
  voltage: number;
  resistance: number;
  nominalVoltage: number;
  nominalPower: number;
  closed: boolean;
  color: string;
  forwardVoltage: number;
};
export type Endpoint =
  { componentId: string; terminal: 0 | 1 } | { junctionId: string } | Point;
export type Wire = {
  id: string;
  from: Endpoint;
  to: Endpoint;
  corners: Point[];
};
export type Junction = Point & { id: string };
export type Circuit = {
  components: Part[];
  wires: Wire[];
  junctions: Junction[];
};
export type View = "2d" | "split" | "3d";
export type Settings = {
  grid: boolean;
  snap: boolean;
  effects: boolean;
  audio: boolean;
  theme: "light" | "dark" | "system";
  transparent: boolean;
};
export type Project = Circuit & {
  version: 1;
  id: string;
  name: string;
  updatedAt: number;
  view: View;
  settings: Settings;
};
export type Reading = {
  voltage: number;
  current: number;
  power: number;
  brightness: number;
};
export type Simulation = {
  status: "complete" | "open" | "short" | "error";
  message: string;
  readings: Record<string, Reading>;
  warnings: string[];
  sourceCurrent: number;
  nodeVoltages: Record<string, number>;
};
export const GRID = 20;
export const uid = () => crypto.randomUUID();
export const snap = (n: number, enabled = true) =>
  enabled ? Math.round(n / GRID) * GRID : n;
export const library: {
  kind: Kind;
  name: string;
  group: string;
  detail: string;
}[] = [
  { kind: "cell", name: "Cell", group: "Power", detail: "1.5 V" },
  { kind: "battery", name: "Battery", group: "Power", detail: "4.5 V" },
  { kind: "lamp", name: "Bulb", group: "Outputs", detail: "1.5 V, 0.3 W" },
  { kind: "led", name: "LED", group: "Outputs", detail: "Check + and −" },
  {
    kind: "motor",
    name: "Motor",
    group: "Outputs",
    detail: "Turns with current",
  },
  {
    kind: "buzzer",
    name: "Buzzer",
    group: "Outputs",
    detail: "Makes a sound",
  },
  {
    kind: "switch",
    name: "Switch",
    group: "Controls",
    detail: "Open or closed",
  },
  {
    kind: "push",
    name: "Push button",
    group: "Controls",
    detail: "Hold to connect",
  },
  {
    kind: "variable",
    name: "Variable resistor",
    group: "Controls",
    detail: "10–1,000 Ω",
  },
  { kind: "resistor", name: "Resistor", group: "Parts", detail: "100 Ω" },
  {
    kind: "ammeter",
    name: "Ammeter",
    group: "Meters",
    detail: "Measures current",
  },
  {
    kind: "voltmeter",
    name: "Voltmeter",
    group: "Meters",
    detail: "Measures voltage",
  },
];
export function makePart(kind: Kind, x: number, y: number): Part {
  return {
    id: uid(),
    kind,
    x: snap(x),
    y: snap(y),
    label: library.find((p) => p.kind === kind)!.name,
    rotation: 0,
    voltage: kind === "battery" ? 4.5 : 1.5,
    resistance: kind === "motor" ? 12 : kind === "buzzer" ? 100 : 100,
    nominalVoltage: 1.5,
    nominalPower: 0.3,
    closed: false,
    color: "#ee564a",
    forwardVoltage: 2,
  };
}
export function terminal(part: Part, t: 0 | 1): Point {
  const a = (part.rotation * Math.PI) / 180,
    d = t === 0 ? -40 : 40;
  return {
    x: part.x + Math.round(Math.cos(a) * d),
    y: part.y + Math.round(Math.sin(a) * d),
  };
}
export function endpoint(circuit: Circuit, e: Endpoint): Point {
  if ("componentId" in e) {
    const c = circuit.components.find((c) => c.id === e.componentId);
    return c ? terminal(c, e.terminal) : { x: 0, y: 0 };
  }
  if ("junctionId" in e)
    return (
      circuit.junctions.find((j) => j.id === e.junctionId) ?? { x: 0, y: 0 }
    );
  return e;
}
export function endpointKey(e: Endpoint, wireId = "", end = "") {
  return "componentId" in e
    ? `${e.componentId}:${e.terminal}`
    : "junctionId" in e
      ? `j:${e.junctionId}`
      : `loose:${wireId}:${end}`;
}
export const STUB = 20;
export function leadVector(part: Part, t: 0 | 1): Point {
  const a = (part.rotation * Math.PI) / 180,
    s = t === 0 ? -1 : 1,
    x = Math.cos(a) * s,
    y = Math.sin(a) * s;
  return Math.abs(x) >= Math.abs(y)
    ? { x: Math.sign(x) || 1, y: 0 }
    : { x: 0, y: Math.sign(y) || 1 };
}
export function terminalSide(
  part: Part,
  t: 0 | 1,
): "left" | "right" | "top" | "bottom" {
  const d = leadVector(part, t);
  return d.x < 0 ? "left" : d.x > 0 ? "right" : d.y < 0 ? "top" : "bottom";
}
export function exitDir(circuit: Circuit, e: Endpoint): Point | null {
  if ("componentId" in e) {
    const part = circuit.components.find((c) => c.id === e.componentId);
    return part ? leadVector(part, e.terminal) : null;
  }
  return null;
}
const addPoint = (a: Point, d: Point, k = 1): Point => ({
  x: a.x + d.x * k,
  y: a.y + d.y * k,
});
const samePoint = (a: Point, b: Point, e = 0.51) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= e;
function collapse(points: Point[]): Point[] {
  const cleaned: Point[] = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || !samePoint(p, prev)) cleaned.push({ x: p.x, y: p.y });
  }
  const out: Point[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const prev = out[out.length - 1],
      cur = cleaned[i],
      next = cleaned[i + 1];
    if (
      prev &&
      next &&
      ((prev.x === cur.x && cur.x === next.x) ||
        (prev.y === cur.y && cur.y === next.y))
    )
      continue;
    out.push(cur);
  }
  return out;
}
function segmentHitsBox(
  a: Point,
  b: Point,
  box: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const minX = Math.min(a.x, b.x),
    maxX = Math.max(a.x, b.x),
    minY = Math.min(a.y, b.y),
    maxY = Math.max(a.y, b.y);
  if (maxX < box.minX || minX > box.maxX || maxY < box.minY || minY > box.maxY)
    return false;
  if (a.y === b.y) return a.y >= box.minY && a.y <= box.maxY;
  if (a.x === b.x) return a.x >= box.minX && a.x <= box.maxX;
  return true;
}
function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy,
    t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
          );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function pathClear(
  pts: Point[],
  boxes: { minX: number; maxX: number; minY: number; maxY: number }[],
  avoid: Point[],
  ends: Point[],
) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    if (boxes.some((box) => segmentHitsBox(a, b, box))) return false;
    for (const p of avoid) {
      if (ends.some((e) => samePoint(e, p))) continue;
      if (distToSegment(p, a, b) < 14) return false;
    }
  }
  return true;
}
function firstMoveOk(pts: Point[], dir: Point | null) {
  if (!dir) return true;
  for (let i = 1; i < pts.length; i++) {
    if (samePoint(pts[0], pts[i])) continue;
    const dx = Math.sign(pts[i].x - pts[0].x),
      dy = Math.sign(pts[i].y - pts[0].y);
    return dx !== -dir.x || dy !== -dir.y;
  }
  return true;
}
function lastMoveOk(pts: Point[], dir: Point | null) {
  if (!dir || pts.length < 2) return true;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (samePoint(pts[i], pts[pts.length - 1])) continue;
    const dx = Math.sign(pts[pts.length - 1].x - pts[i].x),
      dy = Math.sign(pts[pts.length - 1].y - pts[i].y);
    return dx === -dir.x && dy === -dir.y;
  }
  return true;
}
function scorePath(pts: Point[]) {
  let bends = 0,
    length = 0;
  for (let i = 1; i < pts.length; i++) {
    length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (i < pts.length - 1) {
      const a = pts[i - 1],
        b = pts[i],
        c = pts[i + 1];
      if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) <= 0) bends++;
    }
  }
  return bends * 10000 + length;
}
function uniqueCoords(values: number[]) {
  return [...new Set(values.map((v) => snap(v)))];
}
function candidates(
  a: Point,
  b: Point,
  startDir: Point | null,
  endDir: Point | null,
) {
  const paths: Point[][] = [];
  const push = (pts: Point[]) => paths.push(collapse(pts));
  if (a.x === b.x || a.y === b.y) push([a, b]);
  push([a, { x: b.x, y: a.y }, b]);
  push([a, { x: a.x, y: b.y }, b]);
  const xs = uniqueCoords([
    a.x,
    b.x,
    (a.x + b.x) / 2,
    a.x + 40,
    a.x - 40,
    b.x + 40,
    b.x - 40,
    ...(startDir?.x ? [a.x + startDir.x * 40, a.x + startDir.x * 80] : []),
    ...(endDir?.x ? [b.x + endDir.x * 40, b.x + endDir.x * 80] : []),
  ]);
  const ys = uniqueCoords([
    a.y,
    b.y,
    (a.y + b.y) / 2,
    a.y + 40,
    a.y - 40,
    b.y + 40,
    b.y - 40,
    ...(startDir?.y ? [a.y + startDir.y * 40, a.y + startDir.y * 80] : []),
    ...(endDir?.y ? [b.y + endDir.y * 40, b.y + endDir.y * 80] : []),
  ]);
  for (const x of xs) push([a, { x, y: a.y }, { x, y: b.y }, b]);
  for (const y of ys) push([a, { x: a.x, y }, { x: b.x, y }, b]);
  if (startDir && endDir) {
    for (const d of [20, 40, 60, 80]) {
      const s = addPoint(a, startDir, d),
        e = addPoint(b, endDir, d);
      push([a, s, { x: e.x, y: s.y }, e, b]);
      push([a, s, { x: s.x, y: e.y }, e, b]);
    }
  }
  return paths;
}
export function routeOrthogonal(
  from: Point,
  to: Point,
  startDir: Point | null,
  endDir: Point | null,
  boxes: { minX: number; maxX: number; minY: number; maxY: number }[],
  avoid: Point[],
): Point[] {
  const start = startDir ? addPoint(from, startDir, STUB) : from,
    end = endDir ? addPoint(to, endDir, STUB) : to,
    prefix = startDir ? [from, start] : [from],
    suffix = endDir ? [end, to] : [to],
    ends = [from, to];
  let best: Point[] | null = null,
    bestScore = Infinity;
  for (const mid of candidates(start, end, startDir, endDir)) {
    const pts = collapse([...prefix, ...mid.slice(1, -1), ...suffix]);
    if (!firstMoveOk(pts, startDir) || !lastMoveOk(pts, endDir)) continue;
    if (!pathClear(pts, boxes, avoid, ends)) continue;
    const score = scorePath(pts);
    if (score < bestScore) {
      bestScore = score;
      best = pts;
    }
  }
  return best ?? collapse([...prefix, { x: end.x, y: start.y }, ...suffix]);
}
function partBody(part: Part) {
  return {
    minX: part.x - 32,
    maxX: part.x + 32,
    minY: part.y - 32,
    maxY: part.y + 32,
  };
}
export function wirePoints(c: Circuit, w: Wire): Point[] {
  const boxes = c.components.map(partBody),
    avoid = c.components.flatMap((p) => [terminal(p, 0), terminal(p, 1)]),
    anchors = [
      { pt: endpoint(c, w.from), dir: exitDir(c, w.from) },
      ...w.corners.map((pt) => ({ pt, dir: null as Point | null })),
      { pt: endpoint(c, w.to), dir: exitDir(c, w.to) },
    ];
  const out: Point[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const piece = routeOrthogonal(
      anchors[i].pt,
      anchors[i + 1].pt,
      i === 0 ? anchors[0].dir : null,
      i === anchors.length - 2 ? anchors[anchors.length - 1].dir : null,
      boxes,
      avoid,
    );
    out.push(...(i ? piece.slice(1) : piece));
  }
  return collapse(out);
}
export const pathD = (points: Point[]) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
export const defaults: Settings = {
  grid: true,
  snap: true,
  effects: true,
  audio: false,
  theme: "system",
  transparent: false,
};
export function newProject(name = "Untitled circuit"): Project {
  return {
    version: 1,
    id: uid(),
    name,
    updatedAt: Date.now(),
    components: [],
    wires: [],
    junctions: [],
    view: "split",
    settings: { ...defaults },
  };
}
export function example(
  type: "simple" | "series" | "parallel" = "simple",
): Project {
  const p = newProject(
    type === "simple"
      ? "Cell, switch and bulb"
      : type === "series"
        ? "Two bulbs in series"
        : "Two bulbs in parallel",
  );
  const cell = makePart("cell", 240, 160),
    sw = makePart("switch", 480, 160),
    lamp = makePart("lamp", 360, 380);
  sw.closed = true;
  p.components = [cell, sw, lamp];
  const connect = (
    a: Part,
    at: 0 | 1,
    b: Part,
    bt: 0 | 1,
    corners: Point[] = [],
  ) =>
    p.wires.push({
      id: uid(),
      from: { componentId: a.id, terminal: at },
      to: { componentId: b.id, terminal: bt },
      corners,
    });
  connect(cell, 1, sw, 0);
  connect(sw, 1, lamp, 1, [
    { x: 560, y: 160 },
    { x: 560, y: 380 },
  ]);
  connect(lamp, 0, cell, 0, [
    { x: 160, y: 380 },
    { x: 160, y: 160 },
  ]);
  if (type === "series") {
    lamp.x = 280;
    const second = makePart("lamp", 460, 380);
    second.label = "Bulb 2";
    p.components.push(second);
    p.wires[1].to = { componentId: second.id, terminal: 1 };
    connect(second, 0, lamp, 1);
  }
  if (type === "parallel") {
    const second = makePart("lamp", 360, 280);
    second.label = "Bulb 2";
    p.components.push(second);
    const j1 = { id: uid(), x: 160, y: 280 },
      j2 = { id: uid(), x: 560, y: 280 };
    p.junctions = [j1, j2];
    p.wires[1].to = { junctionId: j2.id };
    p.wires[1].corners = [{ x: 560, y: 160 }];
    p.wires[2].from = { junctionId: j1.id };
    p.wires[2].corners = [{ x: 160, y: 160 }];
    p.wires.push(
      {
        id: uid(),
        from: { junctionId: j1.id },
        to: { componentId: lamp.id, terminal: 0 },
        corners: [{ x: 160, y: 380 }],
      },
      {
        id: uid(),
        from: { junctionId: j2.id },
        to: { componentId: lamp.id, terminal: 1 },
        corners: [{ x: 560, y: 380 }],
      },
      {
        id: uid(),
        from: { junctionId: j1.id },
        to: { componentId: second.id, terminal: 0 },
        corners: [],
      },
      {
        id: uid(),
        from: { componentId: second.id, terminal: 1 },
        to: { junctionId: j2.id },
        corners: [],
      },
    );
  }
  return p;
}
export function format(n: number, unit: string) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.abs(n);
  return v > 0 && v < 0.001
    ? `${(n * 1e6).toFixed(1)} µ${unit}`
    : v > 0 && v < 1 && unit === "A"
      ? `${(n * 1000).toFixed(1)} m${unit}`
      : `${n.toFixed(v >= 100 ? 0 : 2).replace(/\.00$/, "")} ${unit}`;
}
