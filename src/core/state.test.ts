import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { useStore } from "./store";
import {
  defaults,
  endpoint,
  example,
  newProject,
  snap,
  terminal,
  wirePoints,
} from "./types";
import { solve } from "./solver";
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
    const ep = s.split(w, { x: 360, y: 160 }),
      p = useStore.getState().project;
    expect(p.junctions).toHaveLength(1);
    expect(p.wires).toHaveLength(4);
    expect(solve(p).sourceCurrent).toBeCloseTo(before, 8);
    expect("junctionId" in ep).toBe(true);
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
