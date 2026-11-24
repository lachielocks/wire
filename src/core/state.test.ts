import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { useStore } from "./store";
import {
  defaults,
  endpoint,
  endpointKey,
  example,
  makePart,
  newProject,
  snap,
  terminal,
  uid,
  wirePoints,
} from "./types";
import { connectivity, solve } from "./solver";
import {
  autosave,
  deleteProject,
  listProjects,
  recover,
  saveProject,
  validateProject,
} from "./persistence";
import { sceneEndpoint, world } from "../scene/layout";
beforeEach(() => useStore.getState().load(newProject()));
describe("editor and state", () => {
  it("snaps positive and negative coordinates predictably", () => {
    expect(snap(29)).toBe(20);
    expect(snap(31)).toBe(40);
    expect(snap(-31)).toBe(-40);
    expect(snap(31, false)).toBe(31);
  });
  it("places, moves, rotates and deletes parts with undo and redo", () => {
    const s = useStore.getState();
    s.add("lamp", { x: 111, y: 69 });
    const id = useStore.getState().project.components[0].id;
    expect(useStore.getState().project.components[0]).toMatchObject({
      x: 120,
      y: 60,
    });
    s.update(id, { x: 200 });
    s.rotate();
    expect(terminal(useStore.getState().project.components[0], 0)).toEqual({
      x: 200,
      y: 20,
    });
    s.remove();
    expect(useStore.getState().project.components).toHaveLength(0);
    s.undo();
    expect(useStore.getState().project.components).toHaveLength(1);
    s.redo();
    expect(useStore.getState().project.components).toHaveLength(0);
  });
  it("copies connected selections with fresh IDs and valid connectivity", () => {
    const s = useStore.getState();
    s.load(example());
    const original = useStore.getState().project;
    s.select(original.components.map((c) => c.id));
    s.copy();
    s.paste();
    const p = useStore.getState().project;
    expect(p.components).toHaveLength(6);
    expect(new Set(p.components.map((c) => c.id)).size).toBe(6);
    expect(p.wires).toHaveLength(6);
    expect(validateProject(p)).toEqual(p);
    expect(solve(p).sourceCurrent).toBeCloseTo(
      solve(original).sourceCurrent * 2,
      8,
    );
  });
  it("reroutes wires when their component terminals move", () => {
    const p = example(),
      w = p.wires[0],
      before = endpoint(p, w.from);
    p.components[0].x += 100;
    const points = wirePoints(p, w);
    expect(points[0].x).toBe(before.x + 100);
    for (let i = 1; i < points.length; i++)
      expect(
        points[i].x === points[i - 1].x || points[i].y === points[i - 1].y,
      ).toBe(true);
  });
  it("creates explicit junctions by splitting a wire and preserves the circuit", () => {
    const s = useStore.getState();
    s.load(example());
    const before = solve(useStore.getState().project).sourceCurrent,
      w = useStore.getState().project.wires[0];
    s.split(w, { x: 360, y: 160 });
    const p = useStore.getState().project;
    expect(p.junctions).toHaveLength(1);
    expect(p.wires).toHaveLength(4);
    expect(solve(p).sourceCurrent).toBeCloseTo(before, 8);
    expect(p.junctions[0]).toMatchObject({ x: 360, y: 160 });
  });
  it("both representations use identical terminals and switch state", () => {
    const p = example(),
      c = p.components[1],
      a = world(terminal(c, 0)),
      b = sceneEndpoint(p, { componentId: c.id, terminal: 0 });
    expect([a[0], a[2]]).toEqual([b[0], b[2]]);
    useStore.getState().load(p);
    useStore.getState().update(c.id, { closed: false });
    expect(
      solve(useStore.getState().project).readings[p.components[2].id]
        .brightness,
    ).toBe(0);
  });
  it("does not clear a newer unsaved change when an earlier save finishes", () => {
    const s = useStore.getState(),
      rev = s.revision;
    s.add("cell", { x: 0, y: 0 });
    s.saved(rev);
    expect(useStore.getState().dirty).toBe(true);
  });
});
describe("versioned local persistence", () => {
  it("saves, loads, duplicates, and deletes an IndexedDB project", async () => {
    const p = example();
    await saveProject(p);
    expect((await listProjects()).find((r) => r.id === p.id)).toEqual(p);
    const copy = { ...p, id: crypto.randomUUID(), name: "Copy" };
    await saveProject(copy);
    expect((await listProjects()).some((r) => r.id === copy.id)).toBe(true);
    await deleteProject(p.id);
    await deleteProject(copy.id);
    expect((await listProjects()).some((r) => r.id === p.id)).toBe(false);
  });
  it("autosaves and recovers a complete versioned circuit", async () => {
    const p = example("parallel");
    await autosave(p);
    expect(await recover()).toEqual(p);
  });
  it("rejects corrupt, dangling and unsupported project formats", () => {
    expect(() => validateProject({ version: 2 })).toThrow();
    const p = example();
    p.wires[0].from = { componentId: "missing", terminal: 0 };
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects invalid types and prevents unsafe colour input", () => {
    const p = example();
    p.components[0].color = "url(javascript:test)";
    expect(() => validateProject(p)).toThrow();
    p.components[0].color = "#ff0000";
    p.settings = { ...defaults, audio: "yes" as unknown as boolean };
    expect(() => validateProject(p)).toThrow();
  });
});

describe("branch editing and physical layout", () => {
  it("copies parallel junctions and their wires without attaching the duplicate to the original", () => {
    const s = useStore.getState();
    s.load(example("parallel"));
    const original = useStore.getState().project;
    s.select(original.components.map((c) => c.id));
    s.copy();
    s.paste();
    const p = useStore.getState().project;
    expect(p.junctions).toHaveLength(4);
    expect(p.wires).toHaveLength(original.wires.length * 2);
    expect(validateProject(p)).toEqual(p);
    expect(solve(p).sourceCurrent).toBeCloseTo(
      solve(original).sourceCurrent * 2,
      8,
    );
  });
  it("respects disabled snapping on placement", () => {
    useStore.getState().settings({ snap: false });
    useStore.getState().add("lamp", { x: 111, y: 73 });
    expect(useStore.getState().project.components[0]).toMatchObject({
      x: 111,
      y: 73,
    });
  });
});

describe("drop a part onto a wire", () => {
  it("splices the part into the wire in series", () => {
    const s = useStore.getState();
    s.load(example());
    const before = useStore.getState().project;
    const wire = before.wires[0];
    const from = endpoint(before, wire.from),
      to = endpoint(before, wire.to);
    s.add(
      "ammeter",
      { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      { splice: true },
    );
    const p = useStore.getState().project;
    expect(p.components).toHaveLength(4);
    expect(p.wires).toHaveLength(4);
    expect(p.wires.some((w) => w.id === wire.id)).toBe(false);
    const meter = p.components.find((c) => c.kind === "ammeter")!;
    expect(
      p.wires.filter((w) =>
        [w.from, w.to].some(
          (e) => "componentId" in e && e.componentId === meter.id,
        ),
      ),
    ).toHaveLength(2);
    expect(solve(p).status).toBe("complete");
    expect(solve(p).sourceCurrent).toBeCloseTo(
      1.5 / (0.1 + 0.01 + 0.01 + 7.5),
      6,
    );
  });

  it("does not splice a voltmeter into a wire", () => {
    const s = useStore.getState();
    s.load(example());
    const before = useStore.getState().project;
    const wire = before.wires[0],
      from = endpoint(before, wire.from),
      to = endpoint(before, wire.to);
    s.add(
      "voltmeter",
      { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      { splice: true },
    );
    const p = useStore.getState().project;
    expect(p.components).toHaveLength(4);
    expect(p.wires).toHaveLength(3);
    expect(p.wires.some((w) => w.id === wire.id)).toBe(true);
    const meter = p.components.find((c) => c.kind === "voltmeter")!;
    expect(
      p.wires.some((w) =>
        [w.from, w.to].some(
          (e) => "componentId" in e && e.componentId === meter.id,
        ),
      ),
    ).toBe(false);
    expect(solve(p).status).toBe("complete");
    expect(solve(p).sourceCurrent).toBeCloseTo(solve(before).sourceCurrent, 8);
  });
});

describe("auto-complete circuit", () => {
  it("completes a partial loop, continues a wire tail, and undoes as a single action", () => {
    const s = useStore.getState();
    const p = example();
    p.wires = [p.wires[0], { ...p.wires[1], to: { x: 560, y: 360 } }];
    s.load(p);
    expect(s.autoComplete()).toBe(true);
    const complete = useStore.getState().project;
    expect(complete.wires).toContainEqual(p.wires[0]);
    expect(complete.junctions).toHaveLength(1);
    expect(solve(complete).status).toBe("complete");
    expect(solve(complete).sourceCurrent).toBeCloseTo(1.5 / 7.61, 8);
    s.undo();
    expect(useStore.getState().project.wires).toEqual(p.wires);
    expect(useStore.getState().project.junctions).toHaveLength(0);
    s.redo();
    expect(useStore.getState().project.wires).toEqual(complete.wires);
  });

  it("adds a second load as a separate branch without disturbing a completed circuit", () => {
    const s = useStore.getState();
    const p = example();
    const resistor = makePart("resistor", 360, 520);
    p.components.push(resistor);
    s.load(p);
    expect(s.autoComplete()).toBe(true);
    const result = useStore.getState().project;
    expect(result.wires.slice(0, p.wires.length)).toEqual(p.wires);
    const reading = solve(result).readings[resistor.id];
    expect(Math.abs(reading.current)).toBeGreaterThan(0.01);
    expect(solve(result).status).toBe("complete");
  });

  it("keeps the polarity of sources and diodes when completing separate parts", () => {
    const s = useStore.getState();
    const p = newProject();
    const cell = makePart("cell", 200, 200);
    const battery = makePart("battery", 360, 200);
    const resistor = makePart("resistor", 520, 200);
    const diode = makePart("diode", 520, 380);
    p.components = [cell, battery, resistor, diode];
    s.load(p);
    expect(s.autoComplete()).toBe(true);
    const result = solve(useStore.getState().project);
    expect(result.status).toBe("complete");
    expect(result.readings[diode.id].current).toBeCloseTo(
      (1.5 + 4.5 - 0.7) / 102.2,
      8,
    );
    expect(result.readings[cell.id].power).toBeLessThan(0);
    expect(result.readings[battery.id].power).toBeLessThan(0);
  });

  it("routes automatic wires on different nets without crossings or overlaps", () => {
    const p = newProject();
    const cell = makePart("cell", 200, 140);
    const lamp = makePart("lamp", 360, 140);
    const meter = makePart("voltmeter", 520, 140);
    p.components = [cell, lamp, meter];
    const s = useStore.getState();
    s.load(p);
    expect(s.autoComplete()).toBe(true);
    const result = useStore.getState().project;
    expect(result.junctions).toHaveLength(2);
    const nets = connectivity(result);
    const paths = result.wires.map((wire) => ({
      net: nets.find(endpointKey(wire.from, wire.id, "a")),
      points: wirePoints(result, wire),
    }));
    for (const [i, path] of paths.entries()) {
      for (const other of paths.slice(i + 1)) {
        if (path.net === other.net) continue;
        for (const [j, start] of path.points.slice(0, -1).entries()) {
          const end = path.points[j + 1];
          const axis = start.y === end.y ? "x" : "y";
          const level = axis === "x" ? "y" : "x";
          for (const [k, a] of other.points.slice(0, -1).entries()) {
            const b = other.points[k + 1];
            if (a[level] !== b[level]) {
              const within = (n: number, from: number, to: number) =>
                n >= Math.min(from, to) && n <= Math.max(from, to);
              expect(
                within(a[axis], start[axis], end[axis]) &&
                  within(start[level], a[level], b[level]),
              ).toBe(false);
              continue;
            }
            if (start[level] !== a[level]) continue;
            const overlap =
              Math.min(
                Math.max(start[axis], end[axis]),
                Math.max(a[axis], b[axis]),
              ) -
              Math.max(
                Math.min(start[axis], end[axis]),
                Math.min(a[axis], b[axis]),
              );
            expect(overlap).toBeLessThanOrEqual(0);
          }
        }
      }
    }
  });

  it("leaves a short or an ambiguous branch unchanged", () => {
    const s = useStore.getState();
    const p = newProject();
    const battery = makePart("battery", 200, 200);
    const a = makePart("resistor", 400, 200);
    const b = makePart("lamp", 400, 380);
    p.components = [battery, a, b];
    for (const load of [a, b]) {
      p.wires.push({
        id: uid(),
        from: { componentId: battery.id, terminal: 0 },
        to: { componentId: load.id, terminal: 0 },
        corners: [],
      });
    }
    s.load(p);
    expect(s.autoComplete()).toBe(false);
    expect(useStore.getState().project.wires).toEqual(p.wires);
    expect(useStore.getState().past).toHaveLength(0);

    p.components = [battery, a];
    a.resistance = 0.1;
    p.wires = [];
    s.load(p);
    expect(s.autoComplete()).toBe(false);
    expect(useStore.getState().project.wires).toHaveLength(0);
  });
});
