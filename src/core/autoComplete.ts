import { connectivity, solve, source } from "./solver";
import { resolveWireTargets, wireTap } from "./wires";
import {
  endpoint,
  endpointKey,
  leadVector,
  STUB,
  uid,
  wirePoints,
  type Circuit,
  type Endpoint,
  type Junction,
  type Part,
  type Point,
  type Wire,
} from "./types";

type Terminal = { componentId: string; terminal: 0 | 1 };
type Port = { net: string; end: Terminal };
type Chain = { parts: Part[]; direction: [Port, Port][] };
type Link = [Endpoint, Endpoint];

const pin = (part: Part, terminal: 0 | 1): Terminal => ({
  componentId: part.id,
  terminal,
});

const isLoad = (part: Part) =>
  !source(part) &&
  !["switch", "push", "fuse", "ammeter", "voltmeter"].includes(part.kind);

function chooseLoop(
  circuit: Circuit,
  start: Chain,
  rest: Chain[],
  displayEnd: (end: Endpoint) => Endpoint,
) {
  const parts = new Map(circuit.components.map((part) => [part.id, part]));
  const cost = (a: Terminal, b: Terminal) => {
    const aEnd = displayEnd(a);
    const bEnd = displayEnd(b);
    const from = endpoint(circuit, aEnd);
    const to = endpoint(circuit, bEnd);
    const u = leadVector(parts.get(a.componentId)!, a.terminal);
    const v = leadVector(parts.get(b.componentId)!, b.terminal);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return (
      Math.abs(dx) +
      Math.abs(dy) +
      40 *
        (Number(aEnd === a && dx * u.x + dy * u.y < 0) +
          Number(bEnd === b && dx * v.x + dy * v.y > 0))
    );
  };
  const route = (reverse: boolean): Link[] => {
    const first = start.direction[0][reverse ? 1 : 0];
    let current = start.direction[0][reverse ? 0 : 1].end;
    const remaining = new Set(rest);
    const links: Link[] = [];
    while (remaining.size) {
      let best:
        { chain: Chain; entry: Port; exit: Port; cost: number } | undefined;
      for (const chain of remaining) {
        for (const [a, b] of chain.direction) {
          const [entry, exit] = reverse ? [b, a] : [a, b];
          const distance = cost(current, entry.end);
          if (!best || distance < best.cost)
            best = { chain, entry, exit, cost: distance };
        }
      }
      if (!best) break;
      links.push([current, best.entry.end]);
      current = best.exit.end;
      remaining.delete(best.chain);
    }
    if (endpointKey(current) !== endpointKey(first.end))
      links.push([current, first.end]);
    return links;
  };
  const score = (links: Link[]) =>
    links.reduce((total, [from, to]) => {
      const points = wirePoints(circuit, {
        id: "",
        from: displayEnd(from),
        to: displayEnd(to),
        corners: [],
      });
      return points
        .slice(1)
        .reduce(
          (length, p, index) =>
            length +
            Math.abs(p.x - points[index].x) +
            Math.abs(p.y - points[index].y),
          total + Math.max(0, points.length - 2) * 40,
        );
    }, 0);
  const forward = route(false);
  const backward = route(true);
  return score(forward) <= score(backward) ? forward : backward;
}

function wireInterference(points: Point[], occupied: Point[][]) {
  const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  const between = (v: number, a: number, b: number) =>
    v >= Math.min(a, b) && v <= Math.max(a, b);
  let cost = 0;
  for (const other of occupied) {
    const shared = [points[0], points.at(-1)!].filter(
      (p) => equal(p, other[0]) || equal(p, other.at(-1)!),
    );
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      for (let j = 1; j < other.length; j++) {
        const c = other[j - 1];
        const d = other[j];
        const horizontal = a.y === b.y;
        const otherHorizontal = c.y === d.y;
        if (horizontal === otherHorizontal) {
          const axis = horizontal ? "x" : "y";
          const spacing = horizontal
            ? Math.abs(a.y - c.y)
            : Math.abs(a.x - c.x);
          if (spacing >= 14) continue;
          const overlap =
            Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
            Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
          const commonLead =
            !spacing &&
            shared.some(
              (p) =>
                (equal(p, a) || equal(p, b)) && (equal(p, c) || equal(p, d)),
            );
          const excess = overlap - (commonLead ? STUB : 0);
          if (excess > 0)
            cost += spacing ? excess * 30 : 25_000 + excess * 1000;
          continue;
        }
        const [h1, h2, v1, v2] = horizontal ? [a, b, c, d] : [c, d, a, b];
        if (
          between(v1.x, h1.x, h2.x) &&
          between(h1.y, v1.y, v2.y) &&
          !shared.some((p) => p.x === v1.x && p.y === h1.y)
        )
          cost += 20_000;
      }
    }
  }
  return cost;
}

function tapLoadLead(circuit: Circuit, terminal: Terminal) {
  const key = endpointKey(terminal);
  for (const wire of circuit.wires) {
    const startsAtTerminal = endpointKey(wire.from) === key;
    if (!startsAtTerminal && endpointKey(wire.to) !== key) continue;
    const points = wirePoints(circuit, wire);
    if (!startsAtTerminal) points.reverse();
    const [start, next] = points;
    if (!next) continue;
    const length = Math.hypot(next.x - start.x, next.y - start.y);
    const available = points.length === 2 ? length - 16 : length;
    if (available < 16) continue;
    const fraction = Math.min(STUB + 8, available) / length;
    const target = {
      x: start.x + (next.x - start.x) * fraction,
      y: start.y + (next.y - start.y) * fraction,
    };
    const tap = wireTap(circuit, target, false, 1, { only: wire });
    const plan = tap && resolveWireTargets(circuit, [tap]);
    if (plan && "junctionId" in plan.resolved[0]) return plan;
  }
  return null;
}

export function autoCompleteCircuit(
  circuit: Circuit,
):
  | { wires: Wire[]; junctions: Junction[]; count: number }
  | { message: string } {
  const supplies = circuit.components.filter(source);
  const loads = circuit.components.filter(isLoad);
  if (!supplies.length || !loads.length)
    return {
      message:
        "Add a cell or battery and a load, such as a bulb, to auto-complete a circuit.",
    };

  const nets = connectivity(circuit);
  const netOf = (end: Terminal) => nets.find(endpointKey(end));
  const occupied = new Set(
    circuit.wires.flatMap((wire) => [
      endpointKey(wire.from),
      endpointKey(wire.to),
    ]),
  );
  const graph = new Map<
    string,
    { here: Terminal; net: string; part: Part }[]
  >();
  for (const part of circuit.components) {
    if (
      part.kind === "voltmeter" &&
      ![pin(part, 0), pin(part, 1)].every((end) =>
        occupied.has(endpointKey(end)),
      )
    )
      continue;
    for (const t of [0, 1] as const) {
      const here = pin(part, t);
      const other = pin(part, t === 0 ? 1 : 0);
      const net = netOf(here);
      const entries = graph.get(net) ?? [];
      entries.push({ here, net: netOf(other), part });
      graph.set(net, entries);
    }
  }

  const seen = new Set<string>();
  const chains: Chain[] = [];
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const ports: Port[] = [];
    const parts = new Set<Part>();
    const pending = [start];
    while (pending.length) {
      const net = pending.pop()!;
      if (seen.has(net)) continue;
      seen.add(net);
      const edges = graph.get(net)!;
      if (edges.length === 1) ports.push({ net, end: edges[0].here });
      for (const edge of edges) {
        parts.add(edge.part);
        pending.push(edge.net);
      }
    }
    if (!ports.length) continue;
    if (ports.length !== 2)
      return {
        message:
          "Several branch ends could connect here. Wire one branch manually, then try auto-complete again.",
      };

    const [a, b] = ports;
    const parents = new Map<
      string,
      { previous: string; part: Part; terminal: 0 | 1 }
    >();
    const queue = [a.net];
    for (let i = 0; i < queue.length && !parents.has(b.net); i++) {
      const previous = queue[i];
      for (const edge of graph.get(previous)!) {
        if (edge.net === a.net || parents.has(edge.net)) continue;
        parents.set(edge.net, {
          previous,
          part: edge.part,
          terminal: edge.here.terminal,
        });
        queue.push(edge.net);
      }
    }
    let forward = true;
    let backward = true;
    for (let net = b.net; net !== a.net;) {
      const edge = parents.get(net)!;
      if (
        source(edge.part) ||
        edge.part.kind === "diode" ||
        edge.part.kind === "led"
      ) {
        const entrance = source(edge.part) ? 1 : 0;
        forward &&= edge.terminal === entrance;
        backward &&= edge.terminal !== entrance;
      }
      net = edge.previous;
    }
    const direction: Chain["direction"] = [];
    if (forward) direction.push([a, b]);
    if (backward) direction.push([b, a]);
    if (!direction.length)
      return {
        message:
          "Some connected parts face opposite ways. Check the source and diode polarity before auto-completing.",
      };
    chains.push({ parts: [...parts], direction });
  }

  // Continue existing wire tails at their visible ends.
  const tails = new Map<
    string,
    { wire: Wire; side: "from" | "to"; point: Point }
  >();
  for (const wire of circuit.wires) {
    for (const side of ["from", "to"] as const) {
      const end = wire[side];
      if ("x" in end) {
        const net = nets.find(
          endpointKey(end, wire.id, side === "from" ? "a" : "b"),
        );
        tails.set(net, { wire, side, point: end });
      }
    }
  }

  const displayEnd = (end: Endpoint): Endpoint =>
    "componentId" in end ? (tails.get(netOf(end))?.point ?? end) : end;

  let links: Link[] = [];
  const supplyChain = chains.find((chain) => chain.parts.some(source));
  if (supplyChain) {
    if (!chains.some((chain) => chain.parts.some(isLoad)))
      return {
        message:
          "Connect the open source to a load before auto-completing this circuit.",
      };
    links = chooseLoop(
      circuit,
      supplyChain,
      chains.filter((chain) => chain !== supplyChain),
      displayEnd,
    );
  } else if (chains.length) {
    const live = solve(circuit);
    const supply = supplies.find(
      (part) =>
        (live.readings[part.id]?.voltage ?? 0) > 0 &&
        netOf(pin(part, 0)) !== netOf(pin(part, 1)),
    );
    if (!supply || !chains.some((chain) => chain.parts.some(isLoad)))
      return {
        message: "Place a load on the open branch before auto-completing it.",
      };
    const negative = pin(supply, 1);
    const positive = pin(supply, 0);
    links = chooseLoop(
      circuit,
      {
        parts: [supply],
        direction: [
          [
            { net: netOf(negative), end: negative },
            { net: netOf(positive), end: positive },
          ],
        ],
      },
      chains,
      displayEnd,
    );
  }

  const junctions = [...circuit.junctions];
  let wires = [...circuit.wires];
  const continued = new Map<string, Endpoint>();
  const attach = (end: Endpoint): Endpoint => {
    if (!("componentId" in end)) return end;
    const net = nets.find(endpointKey(end));
    const existing = continued.get(net);
    if (existing) return existing;
    const tail = tails.get(net);
    if (!tail) return end;
    const { id } = tail.wire;
    const joint = { junctionId: uid() };
    junctions.push({ id: joint.junctionId, ...tail.point });
    wires = wires.map((wire) =>
      wire.id === id ? { ...wire, [tail.side]: joint } : wire,
    );
    continued.set(net, joint);
    return joint;
  };
  let occupiedPaths = circuit.wires
    .map((wire) => wirePoints(circuit, wire))
    .filter((path) => path.length > 1);
  const appendWire = (from: Endpoint, to: Endpoint) => {
    const wire: Wire = { id: uid(), from, to, corners: [] };
    const diagram = { ...circuit, wires, junctions };
    const path = wirePoints(diagram, wire, (points) =>
      wireInterference(points, occupiedPaths),
    );
    wire.corners = path.slice(1, -1);
    wires.push(wire);
    const committedPath = wirePoints(diagram, wire);
    if (committedPath.length > 1) occupiedPaths.push(committedPath);
  };
  for (const [a, b] of links) appendWire(attach(a), attach(b));

  const wired = { ...circuit, wires, junctions };
  const completeNets = connectivity(wired);
  const same = (a: Terminal, b: Terminal) =>
    completeNets.find(endpointKey(a)) === completeNets.find(endpointKey(b));
  for (const meter of circuit.components.filter(
    (part) => part.kind === "voltmeter",
  )) {
    const probes = [pin(meter, 0), pin(meter, 1)] as const;
    const connected = probes.map((probe) =>
      wires.some(
        (w) =>
          endpointKey(w.from) === endpointKey(probe) ||
          endpointKey(w.to) === endpointKey(probe),
      ),
    );
    if (connected.every(Boolean)) continue;
    let best: { ends: [Terminal, Terminal]; cost: number } | undefined;
    for (const load of loads) {
      for (const t of [0, 1] as const) {
        const ends: [Terminal, Terminal] = [
          pin(load, t),
          pin(load, t === 0 ? 1 : 0),
        ];
        if (
          same(ends[0], ends[1]) ||
          connected.some((used, i) => used && !same(probes[i], ends[i]))
        )
          continue;
        const cost = probes.reduce((sum, probe, i) => {
          if (connected[i]) return sum;
          const a = endpoint(circuit, probe);
          const b = endpoint(circuit, ends[i]);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const u = leadVector(meter, probe.terminal);
          const v = leadVector(load, ends[i].terminal);
          const leaving = dx * u.x + dy * u.y;
          const arriving = -dx * v.x - dy * v.y;
          const direct = leaving > 0 && arriving > 0 && (dx === 0 || dy === 0);
          return (
            sum +
            Math.abs(dx) +
            Math.abs(dy) +
            40 * (Number(leaving < 0) + Number(arriving < 0)) -
            (direct ? STUB : 0)
          );
        }, 0);
        if (!best || cost < best.cost) best = { ends, cost };
      }
    }
    if (!best) continue;
    probes.forEach((from, i) => {
      if (connected[i]) return;
      const terminal = best.ends[i];
      const plan = tapLoadLead({ ...circuit, wires, junctions }, terminal);
      if (plan) {
        wires = plan.wires;
        junctions.push(...plan.junctions.slice(junctions.length));
        const diagram = { ...circuit, wires, junctions };
        occupiedPaths = wires
          .map((wire) => wirePoints(diagram, wire))
          .filter((path) => path.length > 1);
      }
      appendWire(from, plan?.resolved[0] ?? terminal);
    });
  }

  const count = wires.length - circuit.wires.length;
  if (!count) return { message: "No open ends could be auto-completed." };
  if (wires.length > 600 || junctions.length > 600)
    return { message: "Auto-complete would exceed the project size limit." };
  // Check the path with controls closed so an open switch cannot hide a short.
  const check = solve({
    ...circuit,
    wires,
    junctions,
    components: circuit.components.map((part) =>
      part.kind === "switch" || part.kind === "push"
        ? { ...part, closed: true }
        : part,
    ),
  });
  if (check.status === "short" || check.status === "error")
    return {
      message:
        "Auto-complete could not find a connection without a short or overload.",
    };
  return { wires, junctions, count };
}
