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
  { kind: "lamp", name: "Lamp", group: "Outputs", detail: "A little light" },
  { kind: "led", name: "LED", group: "Outputs", detail: "Mind the polarity" },
  { kind: "motor", name: "Motor", group: "Outputs", detail: "Make it move" },
  {
    kind: "buzzer",
    name: "Buzzer",
    group: "Outputs",
    detail: "Make some noise",
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
  { kind: "resistor", name: "Resistor", group: "Components", detail: "100 Ω" },
  {
    kind: "ammeter",
    name: "Ammeter",
    group: "Measurements",
    detail: "Measure current",
  },
  {
    kind: "voltmeter",
    name: "Voltmeter",
    group: "Measurements",
    detail: "Measure voltage",
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
export function wirePoints(c: Circuit, w: Wire): Point[] {
  const a = endpoint(c, w.from),
    b = endpoint(c, w.to);
  const anchors = [a, ...w.corners, b];
  return anchors.flatMap((p, i) => {
    if (!i) return [p];
    const prev = anchors[i - 1];
    return prev.x !== p.x && prev.y !== p.y ? [{ x: p.x, y: prev.y }, p] : [p];
  });
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
      ? "A little light"
      : type === "series"
        ? "Two lamps in series"
        : "Two paths, one circuit",
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
    second.label = "Lamp 2";
    p.components.push(second);
    p.wires[1].to = { componentId: second.id, terminal: 1 };
    connect(second, 0, lamp, 1);
  }
  if (type === "parallel") {
    const second = makePart("lamp", 360, 280);
    second.label = "Lamp 2";
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
