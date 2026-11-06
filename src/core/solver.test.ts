import { describe, expect, it } from "vitest";
import { connectivity, solve } from "./solver";
import { example, makePart, newProject, uid, type Kind } from "./types";
function loop(kinds: Kind[], voltage = 3) {
  const p = newProject();
  const parts = kinds.map((kind, i) => makePart(kind, i * 120, 0));
  parts[0].voltage = voltage;
  p.components = parts;
  p.wires = parts.map((part, i) => ({
    id: uid(),
    from: { componentId: part.id, terminal: 1 as const },
    to: { componentId: parts[(i + 1) % parts.length].id, terminal: 0 as const },
    corners: [],
  }));
  return p;
}
const reading = (kind: Kind, p: ReturnType<typeof loop>) =>
  solve(p).readings[p.components.find((p) => p.kind === kind)!.id];
describe("DC modified nodal analysis", () => {
  it("solves the cell-switch-lamp example using Ohm’s law", () => {
    const p = example(),
      r = solve(p);
    expect(r.status).toBe("complete");
    expect(r.sourceCurrent).toBeCloseTo(1.5 / 7.61, 8);
    const lamp = reading("lamp", p);
    expect(lamp.voltage).toBeCloseTo((1.5 / 7.61) * 7.5, 8);
    expect(lamp.power).toBeCloseTo((1.5 / 7.61) ** 2 * 7.5, 8);
    expect(lamp.brightness).toBeCloseTo(lamp.power / 0.3, 8);
  });
  it("shares current in series and reduces lamp brightness", () => {
    const p = example("series"),
      r = solve(p);
    expect(r.sourceCurrent).toBeCloseTo(1.5 / 15.11, 8);
    const lamps = p.components.filter((c) => c.kind === "lamp");
    expect(r.readings[lamps[0].id].current).toBeCloseTo(
      r.readings[lamps[1].id].current,
      10,
    );
    expect(r.readings[lamps[0].id].brightness).toBeLessThan(
      reading("lamp", example()).brightness,
    );
  });
  it("splits current across parallel branches", () => {
    const p = example("parallel"),
      r = solve(p);
    expect(r.status).toBe("complete");
    expect(r.sourceCurrent).toBeCloseTo(1.5 / 3.86, 8);
    const lamps = p.components.filter((c) => c.kind === "lamp");
    expect(Math.abs(r.readings[lamps[0].id].current)).toBeCloseTo(
      r.sourceCurrent / 2,
      8,
    );
    expect(Math.abs(r.readings[lamps[1].id].voltage)).toBeCloseTo(
      Math.abs(r.readings[lamps[0].id].voltage),
      8,
    );
  });
  it("opens and closes a switch in the live graph", () => {
    const p = example(),
      sw = p.components.find((c) => c.kind === "switch")!;
    sw.closed = false;
    expect(solve(p).status).toBe("open");
    expect(reading("lamp", p).power).toBe(0);
    sw.closed = true;
    expect(solve(p).status).toBe("complete");
  });
  it("calculates resistor voltage, current and power", () => {
    const p = loop(["battery", "resistor"], 9);
    const r = reading("resistor", p);
    expect(Math.abs(r.current)).toBeCloseTo(9 / 100.1, 8);
    expect(r.power).toBeCloseTo((9 / 100.1) ** 2 * 100, 8);
  });
  it("handles two series sources", () => {
    const p = loop(["cell", "cell", "resistor"], 3);
    p.components[1].voltage = 1.5;
    expect(solve(p).sourceCurrent / 2).toBeCloseTo(4.5 / 100.2, 8);
  });
  it("uses independent grounds for disconnected islands", () => {
    const a = loop(["battery", "resistor"], 3),
      b = loop(["cell", "lamp"], 1.5);
    const p = {
      components: [...a.components, ...b.components],
      wires: [...a.wires, ...b.wires],
      junctions: [],
    };
    expect(solve(p).status).toBe("complete");
    expect(Math.abs(solve(p).readings[a.components[1].id].current)).toBeCloseTo(
      3 / 100.1,
      8,
    );
    expect(Math.abs(solve(p).readings[b.components[1].id].current)).toBeCloseTo(
      1.5 / 7.6,
      8,
    );
  });
  it("detects a source short without showing Infinity", () => {
    const p = loop(["cell"], 1.5),
      r = solve(p);
    expect(r.status).toBe("short");
    expect(r.sourceCurrent).toBeCloseTo(15, 8);
    expect(JSON.stringify(r)).not.toContain("null");
  });
  it("treats a detached component as a normal editing state", () => {
    const p = newProject();
    p.components = [makePart("cell", 0, 0), makePart("lamp", 200, 0)];
    const r = solve(p);
    expect(r.status).toBe("open");
    expect(r.warnings).toHaveLength(2);
    expect(r.sourceCurrent).toBe(0);
  });
  it("rejects invalid electrical models", () => {
    const p = example();
    p.components[0].voltage = NaN;
    expect(solve(p).status).toBe("error");
    p.components[0].voltage = 1.5;
    p.components[2].nominalPower = 0;
    expect(solve(p).status).toBe("error");
  });
  it("handles a battery connected directly in parallel with another battery", () => {
    const p = loop(["cell", "cell"], 1.5);
    expect(solve(p).status).toBe("short");
  });
  it("only explicit endpoints connect, never geometric overlap", () => {
    const a = makePart("resistor", 0, 0),
      b = makePart("resistor", 0, 0);
    const p = { components: [a, b], wires: [], junctions: [] };
    const u = connectivity(p);
    expect(u.find(`${a.id}:0`)).not.toBe(u.find(`${b.id}:0`));
  });
  it("preserves separate crossing wires and joins explicit junction branches", () => {
    const p = example("parallel"),
      u = connectivity(p);
    const j = p.junctions[0];
    const lamps = p.components.filter((c) => c.kind === "lamp");
    expect(u.find(`j:${j.id}`)).toBe(u.find(`${lamps[0].id}:0`));
    expect(u.find(`j:${j.id}`)).toBe(u.find(`${lamps[1].id}:0`));
    const loose = uid();
    p.wires.push({
      id: loose,
      from: { x: j.x, y: j.y },
      to: { x: 500, y: 400 },
      corners: [],
    });
    const separate = connectivity(p);
    expect(separate.find(`loose:${loose}:a`)).not.toBe(
      separate.find(`j:${j.id}`),
    );
  });
});
describe("expanded component models", () => {
  function ledCircuit(reverse = false, resistance = 100) {
    const p = loop(["battery", "led", "resistor"], 3);
    p.components[2].resistance = resistance; // Loop flows from battery + backwards around this list: reverse LED to point with it.
    if (!reverse) {
      p.wires.forEach((w) => {
        for (const k of ["from", "to"] as const) {
          const ep = w[k];
          if ("componentId" in ep && ep.componentId === p.components[1].id)
            ep.terminal = ep.terminal === 0 ? 1 : 0;
        }
      });
    }
    return p;
  }
  it("models forward LED drop and resistor-limited current", () => {
    const p = ledCircuit(),
      r = reading("led", p);
    expect(r.current).toBeCloseTo((3 - 2) / 110.1, 7);
    expect(r.brightness).toBeGreaterThan(0);
  });
  it("blocks reverse LED current and warns about polarity", () => {
    const p = ledCircuit(true),
      r = solve(p);
    expect(Math.abs(reading("led", p).current)).toBeLessThan(1e-6);
    expect(reading("led", p).brightness).toBe(0);
    expect(r.warnings.some((w) => w.includes("reverse polarity"))).toBe(true);
  });
  it("warns on LED overcurrent", () => {
    const p = ledCircuit(false, 0.01);
    expect(solve(p).warnings.some((w) => w.includes("excessive current"))).toBe(
      true,
    );
  });
  it("measures branch current with an ammeter", () => {
    const p = loop(["battery", "ammeter", "resistor"], 3);
    expect(Math.abs(reading("ammeter", p).current)).toBeCloseTo(3 / 100.11, 8);
  });
  it("does not significantly load a circuit with a voltmeter", () => {
    const p = loop(["battery", "resistor"], 3),
      v = makePart("voltmeter", 100, 200);
    p.components.push(v);
    for (const t of [0, 1] as const)
      p.wires.push({
        id: uid(),
        from: { componentId: p.components[1].id, terminal: t },
        to: { componentId: v.id, terminal: t },
        corners: [],
      });
    expect(Math.abs(reading("voltmeter", p).voltage)).toBeCloseTo(
      (3 * 100) / 100.1,
      6,
    );
  });
  it.each(["motor", "buzzer", "variable"] as Kind[])(
    "solves the %s resistive model",
    (kind) => {
      const p = loop(["battery", kind], 3);
      expect(Math.abs(reading(kind, p).current)).toBeCloseTo(
        3 / (p.components[1].resistance + 0.1),
        8,
      );
    },
  );
});

describe("complete paths at negligible current", () => {
  it("does not confuse balanced sources with an open circuit", () => {
    const p = loop(["cell", "cell"], 1.5);
    p.wires[0].to = { componentId: p.components[1].id, terminal: 1 };
    p.wires[1].from = { componentId: p.components[1].id, terminal: 0 };
    const r = solve(p);
    expect(r.status).toBe("complete");
    expect(r.sourceCurrent).toBe(0);
    expect(r.message).toContain("sources balance");
  });
  it("recognises the complete high-impedance path through a voltmeter", () => {
    const p = loop(["cell", "voltmeter"], 1.5),
      r = solve(p);
    expect(r.status).toBe("complete");
    expect(Math.abs(r.readings[p.components[1].id].voltage)).toBeCloseTo(
      1.5,
      6,
    );
  });
});
