import { solve, source } from "./solver";
import {
  endpointKey,
  snap,
  uid,
  wirePoints,
  type Circuit,
  type Endpoint,
  type Part,
  type Point,
  type Simulation,
  type Wire,
} from "./types";

export const WIRE_HIT = 16;

export function projectOnSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy,
    t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
          ),
    point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

type WireHit = {
  wire: Wire;
  point: Point;
  dist: number;
  index: number;
  points: Point[];
};

export function hitWire(
  circuit: Circuit,
  p: Point,
  threshold = WIRE_HIT,
  routes?: ReadonlyMap<string, Point[]>,
): WireHit | null {
  let best: WireHit | null = null;
  for (let at = circuit.wires.length - 1; at >= 0; at--) {
    const w = circuit.wires[at];
    const pts = routes?.get(w.id) ?? wirePoints(circuit, w);
    for (let i = 0; i < pts.length - 1; i++) {
      const hit = projectOnSegment(p, pts[i], pts[i + 1]);
      if (hit.dist <= threshold && (!best || hit.dist < best.dist))
        best = {
          wire: w,
          point: hit.point,
          dist: hit.dist,
          index: i,
          points: pts,
        };
    }
  }
  return best;
}

export type WireTap = { wireId: string; segment: number; point: Point };
export type WireTarget = Endpoint | WireTap;

const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function wireTap(
  circuit: Circuit,
  pointer: Point,
  snapping: boolean,
  radius: number,
  options?: {
    only?: Wire;
    exclude?: string;
    routes?: ReadonlyMap<string, Point[]>;
  },
): WireTap | null {
  const wires = options?.only
    ? [options.only]
    : options?.exclude
      ? circuit.wires.filter((w) => w.id !== options.exclude)
      : circuit.wires;
  const hit = hitWire({ ...circuit, wires }, pointer, radius, options?.routes);
  if (!hit) return null;
  const projected = projectOnSegment(
    { x: snap(hit.point.x, snapping), y: snap(hit.point.y, snapping) },
    hit.points[hit.index],
    hit.points[hit.index + 1],
  );
  return { wireId: hit.wire.id, segment: hit.index, point: projected.point };
}

/** Resolve as many as two draft taps, keeping their host wire's route intact. */
export function resolveWireTargets(circuit: Circuit, targets: WireTarget[]) {
  const resolved: Endpoint[] = [];
  const junctions = [...circuit.junctions];
  const taps = new Map<string, { tap: WireTap; index: number }[]>();
  for (const [index, target] of targets.entries()) {
    if ("wireId" in target) {
      const group = taps.get(target.wireId) ?? [];
      group.push({ tap: target, index });
      taps.set(target.wireId, group);
    } else {
      if (
        "componentId" in target &&
        !circuit.components.some((c) => c.id === target.componentId)
      )
        return null;
      if (
        "junctionId" in target &&
        !circuit.junctions.some((j) => j.id === target.junctionId)
      )
        return null;
      resolved[index] = target;
    }
  }

  if ([...taps.keys()].some((id) => !circuit.wires.some((w) => w.id === id)))
    return null;
  const wires: Wire[] = [];
  for (const wire of circuit.wires) {
    const group = taps.get(wire.id);
    if (!group) {
      wires.push(wire);
      continue;
    }
    const points = wirePoints(circuit, wire);
    const cuts = group.map(({ tap, index }) => {
      const start = points[tap.segment];
      const end = points[tap.segment + 1];
      if (!start || !end) return null;
      const offset = distance(tap.point, start);
      if (
        Math.abs(offset + distance(tap.point, end) - distance(start, end)) >
        1e-7
      )
        return null;
      // Canonicalize a bend shared by two consecutive segments.
      const segment =
        offset === distance(start, end) ? tap.segment + 1 : tap.segment;
      return {
        ...tap,
        index,
        segment,
        offset: segment === tap.segment ? offset : 0,
      };
    });
    if (cuts.some((cut) => cut === null)) return null;
    const ordered = cuts
      .filter((cut) => cut !== null)
      .sort((a, b) => a.segment - b.segment || a.offset - b.offset);

    let wireId = wire.id;
    let from = wire.from;
    let to = wire.to;
    let fromPoint = points[0];
    let routeStart = 1;
    let lastCut: (typeof ordered)[number] | undefined;
    let lastEndpoint: Endpoint | undefined;
    const addJunction = (point: Point): Endpoint => {
      const id = uid();
      junctions.push({ id, ...point });
      return { junctionId: id };
    };
    for (const cut of ordered) {
      if (cut.segment === lastCut?.segment && cut.offset === lastCut.offset) {
        resolved[cut.index] = lastEndpoint!;
        continue;
      }
      if (cut.offset === 0 && cut.segment === 0) {
        if ("x" in from) from = addJunction(cut.point);
        resolved[cut.index] = from;
      } else if (cut.segment === points.length - 1) {
        if ("x" in to) to = addJunction(cut.point);
        resolved[cut.index] = to;
      } else {
        const to = addJunction(cut.point);
        wires.push({
          id: wireId,
          from,
          to,
          corners: simplifyPoints([
            fromPoint,
            ...points.slice(routeStart, cut.segment + 1),
            cut.point,
          ]).slice(1, -1),
        });
        wireId = uid();
        from = to;
        fromPoint = cut.point;
        routeStart = cut.segment + 1;
        resolved[cut.index] = to;
      }
      lastCut = cut;
      lastEndpoint = resolved[cut.index];
    }
    wires.push({
      id: wireId,
      from,
      to,
      corners:
        wireId !== wire.id
          ? simplifyPoints([fromPoint, ...points.slice(routeStart)]).slice(
              1,
              -1,
            )
          : wire.corners,
    });
  }
  return { wires, junctions, resolved };
}

export function roundedPathD(points: Point[], radius = 10) {
  if (points.length < 2) return "";
  if (points.length === 2)
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1],
      cur = points[i],
      next = points[i + 1],
      inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y),
      outLen = Math.hypot(next.x - cur.x, next.y - cur.y),
      rad = Math.min(radius, inLen / 2, outLen / 2);
    if (rad < 0.5) {
      d += `L${cur.x},${cur.y}`;
      continue;
    }
    const ix = cur.x - ((cur.x - prev.x) / inLen) * rad,
      iy = cur.y - ((cur.y - prev.y) / inLen) * rad,
      ox = cur.x + ((next.x - cur.x) / outLen) * rad,
      oy = cur.y + ((next.y - cur.y) / outLen) * rad;
    d += `L${ix},${iy}Q${cur.x},${cur.y} ${ox},${oy}`;
  }
  const last = points[points.length - 1];
  d += `L${last.x},${last.y}`;
  return d;
}

export function simplifyPoints(points: Point[]): Point[] {
  const cleaned: Point[] = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5) cleaned.push(p);
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
        (prev.y === cur.y && cur.y === next.y) ||
        Math.abs(
          (cur.x - prev.x) * (next.y - prev.y) -
            (cur.y - prev.y) * (next.x - prev.x),
        ) < 0.5)
    )
      continue;
    out.push(cur);
  }
  return out;
}

export function moveWireSegment(
  points: Point[],
  segmentIndex: number,
  to: Point,
): Point[] {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return points;
  const pts = points.map((p) => ({ ...p })),
    a = pts[segmentIndex],
    b = pts[segmentIndex + 1],
    horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
    isFirst = segmentIndex === 0,
    isLast = segmentIndex + 1 === pts.length - 1;
  if (horizontal) {
    const y = to.y;
    if (isFirst && isLast)
      return [
        pts[0],
        { x: pts[0].x, y },
        { x: pts[pts.length - 1].x, y },
        pts[pts.length - 1],
      ];
    if (isFirst)
      return [pts[0], { x: pts[0].x, y }, { x: b.x, y }, ...pts.slice(2)];
    if (isLast)
      return [
        ...pts.slice(0, -1),
        { x: pts[pts.length - 1].x, y },
        pts[pts.length - 1],
      ];
    a.y = y;
    b.y = y;
    return pts;
  }
  const x = to.x;
  if (isFirst && isLast)
    return [
      pts[0],
      { x, y: pts[0].y },
      { x, y: pts[pts.length - 1].y },
      pts[pts.length - 1],
    ];
  if (isFirst)
    return [pts[0], { x, y: pts[0].y }, { x, y: b.y }, ...pts.slice(2)];
  if (isLast)
    return [
      ...pts.slice(0, -1),
      { x, y: pts[pts.length - 1].y },
      pts[pts.length - 1],
    ];
  a.x = x;
  b.x = x;
  return pts;
}

function dropCurrent(circuit: Circuit, wire: Wire) {
  const current = wireCurrents(circuit, solve(circuit)).get(wire.id);
  if (current !== undefined) return current;
  const controls = circuit.components.filter(
    (p) => (p.kind === "switch" || p.kind === "push") && !p.closed,
  );
  if (!controls.length) return 0;

  // Infer the direction with controls closed without changing their saved state.
  const closed = {
    ...circuit,
    components: circuit.components.map((p) =>
      controls.includes(p) ? { ...p, closed: true } : p,
    ),
  };
  return wireCurrents(closed, solve(closed)).get(wire.id) ?? 0;
}

export function spliceComponentIntoWire(
  circuit: Circuit,
  hit: WireHit,
  part: Part,
  snapping = true,
) {
  const { wire, point, index, points } = hit;
  const a = points[index];
  const b = points[index + 1];
  const horizontal = a.y === b.y;
  const axis = horizontal ? (b.x >= a.x ? 0 : 180) : b.y >= a.y ? 90 : 270;
  const supply = source(part);
  const polarized = supply || part.kind === "led" || part.kind === "diode";
  const current = polarized ? dropCurrent(circuit, wire) : 0;
  // Current leaves a source's positive terminal and enters a diode's anode.
  const flip =
    polarized && !current ? axis >= 180 : supply ? current > 0 : current < 0;
  part.rotation = (axis + (flip ? 180 : 0)) % 360;

  const position = projectOnSegment(
    { x: snap(point.x, snapping), y: snap(point.y, snapping) },
    a,
    b,
  ).point;
  Object.assign(part, position);
  const left = simplifyPoints([...points.slice(0, index + 1), position]);
  const right = simplifyPoints([position, ...points.slice(index + 1)]);
  circuit.components.push(part);
  circuit.wires = circuit.wires.filter((w) => w.id !== wire.id);
  circuit.wires.push(
    {
      id: uid(),
      from: wire.from,
      to: { componentId: part.id, terminal: flip ? 1 : 0 },
      corners: left.slice(1, -1),
    },
    {
      id: uid(),
      from: { componentId: part.id, terminal: flip ? 0 : 1 },
      to: wire.to,
      corners: right.slice(1, -1),
    },
  );
}

// A bridge has a uniquely determined current by Kirchhoff's current law.
// Ideal wire loops leave their individual currents undetermined.
export function wireCurrents(circuit: Circuit, simulation: Simulation) {
  const wires = new Map<string, number>();
  const graph = new Map<
    string,
    { id: string; to: string; forward: boolean }[]
  >();
  for (const w of circuit.wires) {
    const from = endpointKey(w.from, w.id, "a");
    const to = endpointKey(w.to, w.id, "b");
    if (!graph.has(from)) graph.set(from, []);
    if (!graph.has(to)) graph.set(to, []);
    graph.get(from)!.push({ id: w.id, to, forward: true });
    graph.get(to)!.push({ id: w.id, to: from, forward: false });
  }
  const current = new Map<string, number>();
  for (const p of circuit.components) {
    const amps = simulation.readings[p.id]?.current ?? 0;
    current.set(endpointKey({ componentId: p.id, terminal: 0 }), amps);
    current.set(endpointKey({ componentId: p.id, terminal: 1 }), -amps);
  }
  const visited = new Map<string, number>();
  function walk(node: string, parent?: string) {
    const entry = visited.size;
    visited.set(node, entry);
    let low = entry;
    let demand = current.get(node) ?? 0;
    for (const edge of graph.get(node)!) {
      if (edge.id === parent) continue;
      const neighbor = visited.get(edge.to);
      if (neighbor !== undefined) {
        low = Math.min(low, neighbor);
        continue;
      }
      const child = walk(edge.to, edge.id);
      low = Math.min(low, child.low);
      demand += child.demand;
      if (child.low > entry && Math.abs(child.demand) > 1e-6)
        wires.set(edge.id, edge.forward ? child.demand : -child.demand);
    }
    return { low, demand };
  }
  for (const node of graph.keys()) {
    if (!visited.has(node)) walk(node);
  }
  return wires;
}

export function applySegmentMove(
  circuit: Circuit,
  wire: Wire,
  segmentIndex: number,
  to: Point,
) {
  const moved = simplifyPoints(
    moveWireSegment(wirePoints(circuit, wire), segmentIndex, to),
  );
  wire.corners = moved.slice(1, -1);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
