import {
  DEFAULT_FUSE_RATING,
  endpointKey,
  terminalSide,
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
    case "fuse":
    case "ammeter":
      return 0.01;
    case "voltmeter":
      return 1e9;
    default:
      return p.resistance;
  }
}
const sourceResistance = 0.1;
const reverseConductance = 1e-10;
const diode = (p: Part) => p.kind === "led" || p.kind === "diode";
const forwardConductance = (p: Part) => (p.kind === "led" ? 0.1 : 0.5);
const open = (p: Part) =>
  p.kind === "capacitor" ||
  ((p.kind === "switch" || p.kind === "push" || p.kind === "fuse") &&
    !p.closed);

function branchCurrent(p: Part, v: number) {
  if (source(p)) return (v - p.voltage) / sourceResistance;
  if (open(p)) return 0;
  if (diode(p))
    return (
      v * reverseConductance +
      Math.max(0, v - p.forwardVoltage) * forwardConductance(p)
    );
  return v / resistance(p);
}

function faultFor(p: Part, current: number, power: number): Reading["fault"] {
  const stress = source(p)
    ? Math.abs(current) / 5
    : p.kind === "led" || p.kind === "diode"
      ? Math.max(0, current) / (p.kind === "led" ? 0.03 : 0.1)
      : ["lamp", "resistor", "variable", "inductor"].includes(p.kind)
        ? power / (p.nominalPower * 1.3)
        : 0;
  if (source(p) ? stress > 1 : stress >= 2) return "burst";
  if (stress > 1) return "overheat";
}

export function solve(circuit: Circuit): Simulation {
  const tripped = new Set<string>();
  const withOpenFuses = (ids: ReadonlySet<string>): Circuit => ({
    ...circuit,
    components: circuit.components.map((p) =>
      ids.has(p.id) ? { ...p, closed: false } : p,
    ),
  });
  let circuitState = circuit;
  for (;;) {
    const result = solveDC(circuitState);
    const intact = circuitState.components.filter(
      (p) => p.kind === "fuse" && p.closed,
    );
    const newlyTripped = intact.filter(
      (p) =>
        Math.abs(result.readings[p.id]?.current ?? 0) >
        (p.ratedCurrent ?? DEFAULT_FUSE_RATING) * (1 + 1e-8),
    );

    if (!newlyTripped.length && intact.length) {
      const burning = circuitState.components.filter(
        (p) =>
          (p.kind === "lamp" || p.kind === "led") &&
          result.readings[p.id]?.fault,
      );
      if (burning.length) {
        // A fuse provides extra protection in the simulator when opening it
        // actually clears the light's overload, even below its current rating.
        const protector = intact.find((p) => {
          if (Math.abs(result.readings[p.id]?.current ?? 0) <= 1e-6)
            return false;
          const opened = solveDC(withOpenFuses(new Set([...tripped, p.id])));
          return burning.some((light) => {
            const reading = opened.readings[light.id];
            return reading && !reading.fault;
          });
        });
        if (protector) newlyTripped.push(protector);
      }
    }
    if (!newlyTripped.length) {
      return tripped.size ? { ...result, trippedFuses: [...tripped] } : result;
    }
    newlyTripped.forEach((p) => tripped.add(p.id));
    circuitState = withOpenFuses(tripped);
  }
}

function solveDC(c: Circuit): Simulation {
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
      p.forwardVoltage <= 0 ||
      (p.ratedCurrent !== undefined &&
        (!Number.isFinite(p.ratedCurrent) || p.ratedCurrent <= 0))
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
      if (!open(p)) islands.join(net(p, 0), net(p, 1));
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
    const voltage = (n: string, solution: number[]) =>
      solution[ix.get(n)!] ?? 0;
    const branches = c.components.map((p) => ({
      p,
      from: net(p, 0),
      to: net(p, 1),
      a: ix.get(net(p, 0)),
      z: ix.get(net(p, 1)),
    }));
    const drop = (branch: (typeof branches)[number], solution: number[]) =>
      voltage(branch.from, solution) - voltage(branch.to, solution);
    const conductors = branches.filter(({ p }) => !open(p));
    const diodes = conductors.filter(({ p }) => diode(p));
    let values: number[] = Array(unknowns.length).fill(0);
    let converged = false;
    for (let iteration = 0; iteration < 100; iteration++) {
      const size = unknowns.length;
      const m = Array.from({ length: size }, () => Array(size).fill(0));
      const b = Array(size).fill(0);
      const add = (i: number | undefined, j: number | undefined, v: number) => {
        if (i !== undefined && j !== undefined) m[i][j] += v;
      };
      for (const branch of conductors) {
        const { p, a, z } = branch;
        const on = diode(p) && drop(branch, values) > p.forwardVoltage;
        const g = source(p)
          ? 1 / sourceResistance
          : diode(p)
            ? reverseConductance + (on ? forwardConductance(p) : 0)
            : 1 / resistance(p);
        const injection = source(p)
          ? p.voltage / sourceResistance
          : on
            ? p.forwardVoltage * forwardConductance(p)
            : 0;
        add(a, a, g);
        add(z, z, g);
        add(a, z, -g);
        add(z, a, -g);
        if (a !== undefined) b[a] += injection;
        if (z !== undefined) b[z] -= injection;
      }
      const candidate = linearSolve(m, b);
      if (
        diodes.every((branch) => {
          const threshold = branch.p.forwardVoltage;
          const before = drop(branch, values) - threshold;
          const after = drop(branch, candidate) - threshold;
          return Math.abs(after) <= 1e-9 || before > 0 === after > 0;
        })
      ) {
        values = candidate;
        converged = true;
        break;
      }

      // Minimize the convex circuit energy along the Newton step. Taking the
      // full step across several diode knees can alternate between two states.
      const changes = conductors.map((branch) => {
        const initial = drop(branch, values);
        return {
          p: branch.p,
          initial,
          delta: drop(branch, candidate) - initial,
        };
      });
      const slope = (step: number) =>
        changes.reduce(
          (sum, { p, initial, delta }) =>
            sum + delta * branchCurrent(p, initial + step * delta),
          0,
        );
      let low = 0;
      let high = 1;
      if (slope(1) > 0) {
        for (let i = 0; i < 40; i++) {
          const mid = (low + high) / 2;
          if (slope(mid) > 0) high = mid;
          else low = mid;
        }
      } else low = 1;
      const step = (low + high) / 2;
      values = candidate.map(
        (value, i) => values[i] + step * (value - values[i]),
      );
    }
    if (!converged)
      return empty(
        "error",
        "The diode model did not converge for this circuit.",
      );
    const readings: Record<string, Reading> = {},
      warnings: string[] = [];
    let sourceCurrent = 0,
      short = false;
    for (const branch of branches) {
      const { p, from, to } = branch;
      const floatingVoltage = islands.find(from) !== islands.find(to);
      const v = floatingVoltage ? 0 : drop(branch, values);
      const measured = branchCurrent(p, v);
      const current = Math.abs(measured) < 1e-12 ? 0 : measured;
      const power = current === 0 ? 0 : v * current;
      const fault =
        p.kind === "fuse" && !p.closed
          ? "fuse"
          : source(p) && from === to
            ? "burst"
            : faultFor(p, current, power);
      readings[p.id] = {
        voltage: Math.abs(v) < 1e-12 ? 0 : v,
        current,
        power,
        brightness:
          p.kind === "lamp"
            ? Math.min(1.5, Math.max(0, power / p.nominalPower))
            : p.kind === "led"
              ? Math.min(1, Math.max(0, current / 0.02))
              : 0,
        ...(floatingVoltage ? { floatingVoltage } : {}),
        ...(fault ? { fault } : {}),
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
      if (fault === "fuse")
        warnings.push(
          `${p.label} has blown. Fix the overload before replacing it.`,
        );
      if (
        ["diode", "resistor", "variable", "inductor"].includes(p.kind) &&
        fault
      )
        warnings.push(`${p.label}: above its simulated rating.`);
      const missing = ([0, 1] as const).filter(
        (t) =>
          !c.wires.some((w) =>
            [w.from, w.to].some(
              (e) =>
                "componentId" in e &&
                e.componentId === p.id &&
                e.terminal === t,
            ),
          ),
      );
      if (missing.length === 2)
        warnings.push(`${p.label}'s terminals aren't connected.`);
      else if (missing.length === 1)
        warnings.push(
          `${p.label}'s ${terminalSide(p, missing[0])} side isn't connected.`,
        );
    }
    if (short)
      warnings.unshift(
        "A source is shorted or supplying over 5 A. Open the switch and add resistance.",
      );
    // A balanced pair of sources (or a high-impedance meter) can have a complete
    // path without appreciable current. Do not call that a broken connection.
    const closedPath = (skip?: (p: Part) => boolean) =>
      sources.some((supply) => {
        const adjacency = new Map<string, string[]>();
        for (const p of c.components) {
          if (
            p.id === supply.id ||
            open(p) ||
            (diode(p) && readings[p.id].voltage <= p.forwardVoltage) ||
            skip?.(p)
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
    const hasPath = closedPath(),
      pathWithoutVoltmeter = closedPath((p) => p.kind === "voltmeter"),
      status = short
        ? "short"
        : sourceCurrent > 1e-6 || hasPath
          ? "complete"
          : "open";
    const seriesVoltmeter =
      status === "complete" &&
      sourceCurrent <= 1e-6 &&
      !pathWithoutVoltmeter &&
      c.components.some((p) => p.kind === "voltmeter");
    return {
      status,
      message: short
        ? "This path has too little resistance and may allow excessive current."
        : !sources.length
          ? "Add a cell or battery to supply electrical energy."
          : seriesVoltmeter
            ? "Voltmeter is in series, so almost no current flows. Connect it across a part instead."
            : status === "complete"
              ? sourceCurrent > 1e-6
                ? "The circuit is complete and current is flowing."
                : "The path is complete, but the sources balance or the current is very small."
              : warnings.find(
                    (w) =>
                      w.includes("isn't connected") ||
                      w.includes("aren't connected"),
                  )
                ? `Circuit isn't complete: ${warnings.find(
                    (w) =>
                      w.includes("isn't connected") ||
                      w.includes("aren't connected"),
                  )}`
                : "There isn’t a complete path for current. Check your wires and switches.",
      readings,
      warnings,
      sourceCurrent,
      nodeVoltages: Object.fromEntries(
        nodes.map((n) => [n, voltage(n, values)]),
      ),
    };
  } catch (error) {
    return empty(
      "error",
      error instanceof Error ? error.message : "Unable to solve this circuit.",
    );
  }
}
