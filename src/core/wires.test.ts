import { describe, expect, it } from "vitest";
import { solve } from "./solver";
import {
  makePart,
  newProject,
  terminal,
  terminalSide,
  uid,
  wirePoints,
  type Wire,
} from "./types";
import {
  hitWire,
  moveWireSegment,
  roundedPathD,
  simplifyPoints,
  spliceComponentIntoWire,
  wireCarriesCurrent,
} from "./wires";

function seriesCellLamp() {
  const p = newProject(),
    cell = makePart("cell", 200, 200),
    lamp = makePart("lamp", 400, 200);
  p.components = [cell, lamp];
  p.wires = [
    {
      id: uid(),
      from: { componentId: cell.id, terminal: 1 },
      to: { componentId: lamp.id, terminal: 0 },
      corners: [],
    },
    {
      id: uid(),
      from: { componentId: lamp.id, terminal: 1 },
      to: { componentId: cell.id, terminal: 0 },
      corners: [
        { x: 440, y: 300 },
        { x: 160, y: 300 },
      ],
    },
  ];
  return { p, cell, lamp, top: p.wires[0], bottom: p.wires[1] };
}

describe("wire paths", () => {
  it("rounds orthogonal corners without changing the end points", () => {
    const d = roundedPathD([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d.endsWith("L40,40")).toBe(true);
    expect(d).toContain("Q40,0 40,10");
  });
  it("removes collinear midpoints", () => {
    expect(
      simplifyPoints([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
    ]);
  });
  it("bends a straight segment into a rounded U-shape", () => {
    expect(
      moveWireSegment(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        0,
        { x: 50, y: 40 },
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 0 },
    ]);
  });
});

describe("splice into a wire", () => {
  it("puts a dropped part in series and keeps the circuit working", () => {
    const { p, top } = seriesCellLamp();
    expect(solve(p).status).toBe("complete");
    const before = solve(p).sourceCurrent;
    const sw = makePart("switch", 0, 0);
    sw.closed = true;
    expect(spliceComponentIntoWire(p, top.id, { x: 300, y: 200 }, sw)).toBe(
      true,
    );
    expect(p.components).toHaveLength(3);
    expect(p.wires).toHaveLength(3);
    expect(p.wires.some((w) => w.id === top.id)).toBe(false);
    expect(
      p.wires.filter(
        (w) =>
          ("componentId" in w.from && w.from.componentId === sw.id) ||
          ("componentId" in w.to && w.to.componentId === sw.id),
      ),
    ).toHaveLength(2);
    expect(sw.rotation).toBe(0);
    expect(sw).toMatchObject({ x: 300, y: 200 });
    const after = solve(p);
    expect(after.status).toBe("complete");
    expect(after.sourceCurrent).toBeCloseTo(1.5 / (0.1 + 0.01 + 7.5), 6);
    expect(after.sourceCurrent).toBeLessThan(before);
    sw.closed = false;
    expect(solve(p).status).toBe("open");
    expect(solve(p).sourceCurrent).toBe(0);
  });
  it("ignores a drop that is not on a wire", () => {
    const { p } = seriesCellLamp();
    expect(hitWire(p, { x: 20, y: 20 })).toBeNull();
    expect(hitWire(p, { x: 300, y: 200 })?.wire).toBe(p.wires[0]);
  });
  it("marks only current-carrying wires as live", () => {
    const { p, top, bottom } = seriesCellLamp();
    const sim = solve(p);
    expect(wireCarriesCurrent(p, top, sim)).toBe(true);
    expect(wireCarriesCurrent(p, bottom, sim)).toBe(true);
    const dangling: Wire = {
      id: uid(),
      from: { componentId: p.components[0].id, terminal: 1 },
      to: { x: 300, y: 80 },
      corners: [],
    };
    p.wires.push(dangling);
    expect(wireCarriesCurrent(p, dangling, solve(p))).toBe(false);
  });
});

describe("lead-aware wire routing", () => {
  it("leaves a right-hand terminal to the right, not back through the part", () => {
    const p = newProject(),
      motor = makePart("motor", 300, 200),
      meter = makePart("voltmeter", 300, 360);
    p.components = [motor, meter];
    p.wires = [
      {
        id: uid(),
        from: { componentId: motor.id, terminal: 1 },
        to: { componentId: meter.id, terminal: 0 },
        corners: [],
      },
    ];
    const pts = wirePoints(p, p.wires[0]),
      start = terminal(motor, 1),
      left = terminal(motor, 0);
    expect(pts[0]).toEqual(start);
    expect(pts[1].x).toBeGreaterThan(start.x);
    expect(pts[1].y).toBe(start.y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const throughBody =
        a.y === b.y &&
        Math.abs(a.y - motor.y) < 32 &&
        Math.min(a.x, b.x) < motor.x &&
        Math.max(a.x, b.x) > motor.x;
      expect(throughBody).toBe(false);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len2 = dx * dx + dy * dy,
        t =
          len2 === 0
            ? 0
            : Math.max(
                0,
                Math.min(1, ((left.x - a.x) * dx + (left.y - a.y) * dy) / len2),
              ),
        dist = Math.hypot(left.x - (a.x + t * dx), left.y - (a.y + t * dy));
      expect(dist).toBeGreaterThan(14);
    }
  });
  it("keeps a straight lead when two terminals already line up", () => {
    const p = newProject(),
      cell = makePart("cell", 200, 200),
      lamp = makePart("lamp", 400, 200);
    p.components = [cell, lamp];
    p.wires = [
      {
        id: uid(),
        from: { componentId: cell.id, terminal: 1 },
        to: { componentId: lamp.id, terminal: 0 },
        corners: [],
      },
    ];
    const pts = wirePoints(p, p.wires[0]);
    expect(pts.every((q) => q.y === 200)).toBe(true);
    expect(pts[0]).toEqual(terminal(cell, 1));
    expect(pts.at(-1)).toEqual(terminal(lamp, 0));
  });
  it("names terminal sides from the part rotation", () => {
    const motor = makePart("motor", 0, 0);
    expect(terminalSide(motor, 0)).toBe("left");
    expect(terminalSide(motor, 1)).toBe("right");
    motor.rotation = 90;
    expect(terminalSide(motor, 0)).toBe("top");
    expect(terminalSide(motor, 1)).toBe("bottom");
  });
});
