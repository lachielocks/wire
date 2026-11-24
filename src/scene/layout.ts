import {
  endpoint,
  type Circuit,
  type Endpoint,
  type Point,
} from "../core/types";
export const world = (p: Point): [number, number, number] => [
  (p.x - 360) / 85,
  0.05,
  (p.y - 270) / 85,
];
export const JUNCTION_HEIGHT = 0.11;
export type Placement = {
  sourceX: number;
  sourceY: number;
  position: [number, number, number];
};
export type Layout = Map<string, Placement>;
/** Reserve unchanged parts first; only new or moved parts yield to existing equipment. */
export function generateLayout(
  c: Circuit,
  previous: Layout = new Map(),
): Layout {
  const next: Layout = new Map();
  const unchanged = c.components.filter((p) => {
    const old = previous.get(p.id);
    return old?.sourceX === p.x && old.sourceY === p.y;
  });
  for (const p of unchanged) next.set(p.id, previous.get(p.id)!);
  for (const p of c.components) {
    if (next.has(p.id)) continue;
    const target = world(p);
    let chosen = target;
    for (let i = 0; i < 400; i++) {
      const radius = i === 0 ? 0 : 0.3 * Math.ceil(Math.sqrt(i)),
        angle = i * 2.399963229728653;
      const candidate: [number, number, number] = [
        target[0] + Math.cos(angle) * radius,
        0.05,
        target[2] + Math.sin(angle) * radius,
      ];
      if (
        [...next.values()].every(
          (q) =>
            Math.hypot(
              q.position[0] - candidate[0],
              q.position[2] - candidate[2],
            ) > 1.22,
        )
      ) {
        chosen = candidate;
        break;
      }
    }
    next.set(p.id, { sourceX: p.x, sourceY: p.y, position: chosen });
  }
  return next;
}
export function sceneEndpoint(
  c: Circuit,
  ep: Endpoint,
  layout?: Layout,
): [number, number, number] {
  const p = world(endpoint(c, ep));
  if ("componentId" in ep) {
    const part = c.components.find((p) => p.id === ep.componentId);
    const placement = layout?.get(ep.componentId);
    if (part && placement) {
      const raw = world(part);
      return [
        p[0] + placement.position[0] - raw[0],
        0.3,
        p[2] + placement.position[2] - raw[2],
      ];
    }
  }
  return [
    p[0],
    "junctionId" in ep ? JUNCTION_HEIGHT : "componentId" in ep ? 0.3 : 0.06,
    p[2],
  ];
}
