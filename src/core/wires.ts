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

export function hitWire(circuit: Circuit, p: Point, threshold = WIRE_HIT) {
  let best: { wire: Wire; point: Point; dist: number; index: number } | null =
    null;
  for (const w of circuit.wires) {
    const pts = wirePoints(circuit, w);
    for (let i = 0; i < pts.length - 1; i++) {
      const hit = projectOnSegment(p, pts[i], pts[i + 1]);
      if (hit.dist <= threshold && (!best || hit.dist < best.dist))
        best = { wire: w, point: hit.point, dist: hit.dist, index: i };
    }
  }
  return best;
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

function sameEndpoint(a: Endpoint, b: Endpoint) {
  return endpointKey(a) === endpointKey(b);
}

export function spliceComponentIntoWire(
  circuit: Circuit,
  wireId: string,
  drop: Point,
  part: Part,
) {
  const wire = circuit.wires.find((w) => w.id === wireId);
  if (!wire) return false;
  const pts = wirePoints(circuit, wire);
  let index = 0,
    best = Infinity,
    hit = drop;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = projectOnSegment(drop, pts[i], pts[i + 1]);
    if (h.dist < best) {
      best = h.dist;
      index = i;
      hit = h.point;
    }
  }
  const a = pts[index],
    b = pts[index + 1],
    horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
    dx = b.x - a.x,
    dy = b.y - a.y;
  part.rotation = horizontal ? (dx >= 0 ? 0 : 180) : dy >= 0 ? 90 : 270;
  part.x = snap(hit.x);
  part.y = snap(hit.y);
  const left = simplifyPoints([...pts.slice(0, index + 1), hit]),
    right = simplifyPoints([hit, ...pts.slice(index + 1)]);
  if (!circuit.components.some((c) => c.id === part.id))
    circuit.components.push(part);
  circuit.wires = circuit.wires.filter((w) => w.id !== wireId);
  circuit.wires.push(
    {
      id: uid(),
      from: wire.from,
      to: { componentId: part.id, terminal: 0 },
      corners: left.slice(1, -1),
    },
    {
      id: uid(),
      from: { componentId: part.id, terminal: 1 },
      to: wire.to,
      corners: right.slice(1, -1),
    },
  );
  return true;
}

export function wireCarriesCurrent(
  circuit: Circuit,
  wire: Wire,
  simulation: Simulation,
) {
  if (
    (simulation.status !== "complete" && simulation.status !== "short") ||
    (simulation.status === "complete" && simulation.sourceCurrent < 1e-6)
  )
    return false;
  const reachesCurrent = (start: Endpoint) => {
    if ("x" in start && !("componentId" in start) && !("junctionId" in start))
      return false;
    const stack: Endpoint[] = [start],
      seen = new Set<string>();
    while (stack.length) {
      const e = stack.pop()!;
      const key = endpointKey(e, wire.id, "walk");
      if (seen.has(key)) continue;
      seen.add(key);
      if ("componentId" in e) {
        const r = simulation.readings[e.componentId];
        if (r && Math.abs(r.current) > 1e-6) return true;
        continue;
      }
      for (const w of circuit.wires) {
        if (w.id === wire.id) continue;
        if (sameEndpoint(w.from, e)) stack.push(w.to);
        else if (sameEndpoint(w.to, e)) stack.push(w.from);
      }
    }
    return false;
  };
  return reachesCurrent(wire.from) && reachesCurrent(wire.to);
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
