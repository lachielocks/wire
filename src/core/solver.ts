import {
  endpointKey,
  type Circuit,
  type Part,
  type Reading,
  type Simulation,
} from "./types";
class Union {
  parents = new Map<string, string>();
  find(a: string): string {
    if (!this.parents.has(a)) this.parents.set(a, a);
    const b = this.parents.get(a)!;
    if (a === b) return a;
    const r = this.find(b);
    this.parents.set(a, r);
    return r;
  }
  join(a: string, b: string) {
    this.parents.set(this.find(a), this.find(b));
  }
}
export function connectivity(c: Circuit) {
  const u = new Union();
  c.components.forEach((p) => {
    u.find(`${p.id}:0`);
    u.find(`${p.id}:1`);
  });
  c.junctions.forEach((j) => u.find(`j:${j.id}`));
  c.wires.forEach((w) =>
    u.join(endpointKey(w.from, w.id, "a"), endpointKey(w.to, w.id, "b")),
  );
  return u;
}
function linearSolve(matrix: number[][], rhs: number[]): number[] {
  const a = matrix.map((row, i) => [...row, rhs[i]]),
    n = rhs.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    if (Math.abs(a[pivot][i]) < 1e-14)
      throw new Error(
        "This circuit could not be solved. Check its connections.",
      );
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const d = a[i][i];
    for (let k = i; k <= n; k++) a[i][k] /= d;
    for (let j = 0; j < n; j++)
      if (j !== i) {
        const f = a[j][i];
        for (let k = i; k <= n; k++) a[j][k] -= f * a[i][k];
      }
  }
  const result = a.map((r) => r[n]);
  if (result.some((v) => !Number.isFinite(v)))
    throw new Error("The solver returned an invalid value.");
  return result;
}
export const source = (p: Part) => p.kind === "cell" || p.kind === "battery";
export function resistance(p: Part): number {
  switch (p.kind) {
    case "lamp":
      return p.nominalVoltage ** 2 / p.nominalPower;
    case "switch":
    case "push":
      return p.closed ? 0.01 : 1e12;
    case "ammeter":
      return 0.01;
    case "voltmeter":
      return 1e9;
    default:
      return p.resistance;
  }
}
export function solve(c: Circuit): Simulation {
  const empty = (
    status: Simulation["status"],
    message: string,
  ): Simulation => ({
    status,
    message,
    readings: {},
    warnings: [],
    sourceCurrent: 0,
    nodeVoltages: {},
  });
  if (!c.components.length)
    return empty(
      "open",
      "Add a cell and a bulb, then connect them with wires.",
    );
  if (c.components.length > 200 || c.wires.length > 600)
    return empty(
      "error",
      "This circuit exceeds the 200-component or 600-wire limit.",
    );
  for (const p of c.components) {
    if (
      ![
        p.voltage,
        p.resistance,
        p.nominalVoltage,
        p.nominalPower,
        p.forwardVoltage,
      ].every(Number.isFinite) ||
      (source(p) && (p.voltage <= 0 || p.voltage > 100)) ||
      p.resistance <= 0 ||
      p.nominalVoltage <= 0 ||
      p.nominalPower <= 0 ||
      p.forwardVoltage <= 0
    )
      return empty(
        "error",
        `${p.label}: enter positive, finite values (sources: up to 100 V).`,
      );
  }
  try {
    const u = connectivity(c),
      net = (p: Part, t: number) => u.find(`${p.id}:${t}`);
    const nodes = [
      ...new Set(c.components.flatMap((p) => [net(p, 0), net(p, 1)])),
    ];
    // Every electrically isolated island gets its own reference. No fabricated global ground.
    const islands = new Union();
    nodes.forEach((n) => islands.find(n));
    c.components.forEach((p) => {
      if (!((p.kind === "switch" || p.kind === "push") && !p.closed))
        islands.join(net(p, 0), net(p, 1));
    });
    const refs = new Map<string, string>();
    nodes.forEach((n) => {
      const island = islands.find(n);
      if (!refs.has(island)) refs.set(island, n);
    });
    const grounds = new Set(refs.values()),
      unknowns = nodes.filter((n) => !grounds.has(n));
    const ix = new Map(unknowns.map((n, i) => [n, i]));
    const sources = c.components.filter(source);
    const ledOn = new Set<string>();
    let values: number[] = [],
      converged = false;
    const voltage = (n: string) =>
      grounds.has(n) ? 0 : (values[ix.get(n)!] ?? 0);
    for (let iteration = 0; iteration < 80; iteration++) {
      const size = unknowns.length + sources.length,
        m = Array.from({ length: size }, () => Array(size).fill(0)),
        b = Array(size).fill(0);
      const add = (i: number | undefined, j: number | undefined, v: number) => {
        if (i !== undefined && j !== undefined) m[i][j] += v;
      };
      const inject = (i: number | undefined, v: number) => {
        if (i !== undefined) b[i] += v;
      };
      c.components.forEach((p) => {
        const a = ix.get(net(p, 0)),
          z = ix.get(net(p, 1));
        if (source(p)) {
          const k = unknowns.length + sources.indexOf(p);
          add(a, k, 1);
          add(z, k, -1);
          add(k, a, 1);
          add(k, z, -1);
          // Physical source internal resistance: 0.1 Ω, limits fault current and handles parallel cells.
          m[k][k] = -0.1;
          b[k] = p.voltage;
        } else if (!((p.kind === "switch" || p.kind === "push") && !p.closed)) {
          const on = ledOn.has(p.id),
            g = p.kind === "led" ? (on ? 0.1 : 1e-10) : 1 / resistance(p);
          add(a, a, g);
          add(z, z, g);
          add(a, z, -g);
          add(z, a, -g);
          if (p.kind === "led" && on) {
            inject(a, g * p.forwardVoltage);
            inject(z, -g * p.forwardVoltage);
          }
        }
      });
      values = linearSolve(m, b);
      let changed = false;
      c.components
        .filter((p) => p.kind === "led")
        .forEach((p) => {
          const v = voltage(net(p, 0)) - voltage(net(p, 1)),
            on = v > p.forwardVoltage + 1e-9;
          if (on !== ledOn.has(p.id)) {
            changed = true;
            if (on) ledOn.add(p.id);
            else ledOn.delete(p.id);
          }
        });
      if (!changed) {
        converged = true;
        break;
      }
    }
    if (!converged)
      return empty(
        "error",
        "The LED model did not converge for this configuration. Try simplifying the circuit.",
      );
    const readings: Record<string, Reading> = {},
      warnings: string[] = [];
    let sourceCurrent = 0,
      short = false;
    c.components.forEach((p) => {
      const v = voltage(net(p, 0)) - voltage(net(p, 1));
      let current = source(p)
        ? values[unknowns.length + sources.indexOf(p)]
        : p.kind === "led"
          ? ledOn.has(p.id)
            ? (v - p.forwardVoltage) / 10
            : v * 1e-10
          : (p.kind === "switch" || p.kind === "push") && !p.closed
            ? 0
            : v / resistance(p);
      if (Math.abs(current) < 1e-9) current = 0;
      const power = v * current;
      readings[p.id] = {
        voltage: Math.abs(v) < 1e-9 ? 0 : v,
        current,
        power,
        brightness:
          p.kind === "lamp"
            ? Math.min(1.5, Math.max(0, power / p.nominalPower))
            : p.kind === "led"
              ? Math.min(1, Math.max(0, current / 0.02))
              : 0,
      };
      if (source(p)) {
        sourceCurrent += Math.abs(current);
        if (net(p, 0) === net(p, 1) || Math.abs(current) > 5) short = true;
      }
      if (p.kind === "led" && current > 0.03)
        warnings.push(
          `${p.label}: excessive current. Add a series resistor to limit it to about 20 mA.`,
        );
      if (p.kind === "led" && v < -0.1)
        warnings.push(
          `${p.label}: reverse polarity. Rotate it or swap its connections.`,
        );
      if (p.kind === "lamp" && power > p.nominalPower * 1.3)
        warnings.push(
          `${p.label}: above its power rating. A real bulb could burn out.`,
        );
      const connected = [0, 1].every((t) =>
        c.wires.some((w) =>
          [w.from, w.to].some(
            (e) =>
              "componentId" in e && e.componentId === p.id && e.terminal === t,
          ),
        ),
      );
      if (!connected) warnings.push(`${p.label} has an unconnected terminal.`);
    });
    if (short)
      warnings.unshift(
        "A source is shorted or supplying over 5 A. Open the switch and add resistance.",
      );
    // A balanced pair of sources (or a high-impedance meter) can have a complete
    // path without appreciable current. Do not call that a broken connection.
    const closedPath = () =>
      sources.some((supply) => {
        const adjacency = new Map<string, string[]>();
        for (const p of c.components) {
          if (
            p.id === supply.id ||
            ((p.kind === "switch" || p.kind === "push") && !p.closed) ||
            (p.kind === "led" && !ledOn.has(p.id))
          )
            continue;
          const a = net(p, 0),
            b = net(p, 1);
          adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
          adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
        }
        const stack = [net(supply, 0)],
          seen = new Set<string>();
        while (stack.length) {
          const n = stack.pop()!;
          if (n === net(supply, 1)) return true;
          if (seen.has(n)) continue;
          seen.add(n);
          stack.push(...(adjacency.get(n) ?? []));
        }
        return false;
      });
    const status = short
      ? "short"
      : sourceCurrent > 1e-6 || closedPath()
        ? "complete"
        : "open";
    return {
      status,
      message: short
        ? "This path has too little resistance and may allow excessive current."
        : !sources.length
          ? "Add a cell or battery to supply electrical energy."
          : status === "complete"
            ? sourceCurrent > 1e-6
              ? "The circuit is complete and current is flowing."
              : "The path is complete, but the sources balance or the current is very small."
            : "There isn’t a complete path for current. Check your wires and switches.",
      readings,
      warnings,
      sourceCurrent,
      nodeVoltages: Object.fromEntries(nodes.map((n) => [n, voltage(n)])),
    };
  } catch (error) {
    return empty(
      "error",
      error instanceof Error ? error.message : "Unable to solve this circuit.",
    );
  }
}
