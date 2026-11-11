import { create } from "zustand";
import {
  makePart,
  newProject,
  snap,
  uid,
  wirePoints,
  type Endpoint,
  type Kind,
  type Part,
  type Point,
  type Project,
  type Settings,
  type View,
  type Wire,
} from "./types";
import { hitWire, spliceComponentIntoWire } from "./wires";
type Snapshot = Pick<Project, "components" | "wires" | "junctions" | "name">;
const snapshot = (p: Project): Snapshot =>
  structuredClone({
    components: p.components,
    wires: p.wires,
    junctions: p.junctions,
    name: p.name,
  });
type State = {
  project: Project;
  selected: string[];
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  revision: number;
  tool: "select" | "wire" | "pan";
  clipboard: Snapshot | null;
  fit: number;
  notice: string;
  checkpoint: () => void;
  change: (fn: (p: Project) => void, history?: boolean) => void;
  select: (ids: string[]) => void;
  setTool: (tool: State["tool"]) => void;
  add: (kind: Kind, point: Point, opts?: { splice?: boolean }) => void;
  update: (id: string, patch: Partial<Part>, history?: boolean) => void;
  remove: () => void;
  rotate: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  paste: () => void;
  connect: (from: Endpoint, to: Endpoint, corners: Point[]) => void;
  split: (wire: Wire, point: Point) => Endpoint;
  setView: (view: View) => void;
  settings: (patch: Partial<Settings>) => void;
  load: (project: Project) => void;
  fresh: () => void;
  saved: (revision: number) => void;
  toast: (notice: string) => void;
};
export const useStore = create<State>((set, get) => ({
  project: newProject(),
  selected: [],
  past: [],
  future: [],
  dirty: false,
  revision: 0,
  tool: "select",
  clipboard: null,
  fit: 0,
  notice: "",
  checkpoint: () =>
    set((s) => ({
      past: [...s.past.slice(-79), snapshot(s.project)],
      future: [],
    })),
  change: (fn, history = true) => {
    if (history) get().checkpoint();
    set((s) => {
      const p = structuredClone(s.project);
      fn(p);
      p.updatedAt = Date.now();
      return { project: p, dirty: true, revision: s.revision + 1 };
    });
  },
  select: (selected) => set({ selected }),
  setTool: (tool) => set({ tool }),
  add: (kind, point, opts) => {
    if (get().project.components.length >= 200) {
      get().toast("This project has reached the 200-component limit.");
      return;
    }
    const part = makePart(kind, point.x, point.y);
    if (!get().project.settings.snap) Object.assign(part, point);
    const hit =
      opts?.splice && kind !== "voltmeter"
        ? hitWire(get().project, point)
        : null;
    if (hit && get().project.wires.length >= 600) {
      get().toast("This project has reached the 600-wire limit.");
      return;
    }
    get().change((p) => {
      p.components.push(part);
      if (hit) spliceComponentIntoWire(p, hit.wire.id, hit.point, part);
    });
    set({ selected: [part.id], tool: "select" });
  },
  update: (id, patch, history = true) =>
    get().change((p) => {
      const part = p.components.find((c) => c.id === id);
      if (part) Object.assign(part, patch);
    }, history),
  remove: () => {
    const ids = get().selected;
    if (!ids.length) return;
    get().change((p) => {
      p.components = p.components.filter((c) => !ids.includes(c.id));
      p.junctions = p.junctions.filter((j) => !ids.includes(j.id));
      p.wires = p.wires.filter(
        (w) =>
          !ids.includes(w.id) &&
          ![w.from, w.to].some((e) =>
            "componentId" in e
              ? ids.includes(e.componentId)
              : "junctionId" in e
                ? ids.includes(e.junctionId)
                : false,
          ),
      );
    });
    set({ selected: [] });
  },
  rotate: () =>
    get().change((p) => {
      p.components.forEach((c) => {
        if (get().selected.includes(c.id)) c.rotation = (c.rotation + 90) % 360;
      });
    }),
  undo: () => {
    const s = get(),
      prev = s.past.at(-1);
    if (prev)
      set({
        project: { ...s.project, ...prev, updatedAt: Date.now() },
        past: s.past.slice(0, -1),
        future: [snapshot(s.project), ...s.future],
        selected: [],
        dirty: true,
        revision: s.revision + 1,
      });
  },
  redo: () => {
    const s = get(),
      next = s.future[0];
    if (next)
      set({
        project: { ...s.project, ...next, updatedAt: Date.now() },
        past: [...s.past, snapshot(s.project)],
        future: s.future.slice(1),
        selected: [],
        dirty: true,
        revision: s.revision + 1,
      });
  },
  copy: () => {
    const s = get();
    const components = s.project.components.filter((c) =>
      s.selected.includes(c.id),
    );
    const componentIds = new Set(components.map((c) => c.id));
    const junctions = s.project.junctions.filter(
      (j) =>
        s.selected.includes(j.id) ||
        s.project.wires
          .filter((w) =>
            [w.from, w.to].some(
              (e) => "junctionId" in e && e.junctionId === j.id,
            ),
          )
          .every((w) =>
            [w.from, w.to].every(
              (e) => !("componentId" in e) || componentIds.has(e.componentId),
            ),
          ),
    );
    const junctionIds = new Set(junctions.map((j) => j.id));
    const included = (e: Endpoint) =>
      "componentId" in e
        ? componentIds.has(e.componentId)
        : "junctionId" in e
          ? junctionIds.has(e.junctionId)
          : false;
    const wires = s.project.wires.filter(
      (w) => included(w.from) && included(w.to),
    );
    set({
      clipboard: structuredClone({ components, wires, junctions, name: "" }),
      notice: `Copied ${components.length} component${components.length === 1 ? "" : "s"}`,
    });
  },
  paste: () => {
    const clip = get().clipboard;
    if (!clip?.components.length) return;
    const current = get().project;
    if (
      current.components.length + clip.components.length > 200 ||
      current.wires.length + clip.wires.length > 600
    ) {
      get().toast("This paste would exceed the project size limit.");
      return;
    }
    const ids = new Map(
      [...clip.components, ...clip.junctions].map((c) => [c.id, uid()]),
    );
    const offset = <T extends Point & { id: string }>(c: T): T => ({
      ...c,
      id: ids.get(c.id)!,
      x: c.x + 40,
      y: c.y + 40,
    });
    const remap = (e: Endpoint): Endpoint =>
      "componentId" in e
        ? { ...e, componentId: ids.get(e.componentId)! }
        : "junctionId" in e
          ? { junctionId: ids.get(e.junctionId)! }
          : { x: e.x + 40, y: e.y + 40 };
    get().change((p) => {
      p.components.push(...clip.components.map(offset));
      p.junctions.push(...clip.junctions.map(offset));
      p.wires.push(
        ...clip.wires.map((w) => ({
          ...w,
          id: uid(),
          from: remap(w.from),
          to: remap(w.to),
          corners: w.corners.map((p) => ({ x: p.x + 40, y: p.y + 40 })),
        })),
      );
    });
    set({ selected: [...ids.values()] });
  },
  connect: (from, to, corners) =>
    get().change((p) => {
      p.wires.push({ id: uid(), from, to, corners });
    }),
  split: (w, point) => {
    const id = uid(),
      j = { id, x: point.x, y: point.y };
    const points = wirePoints(get().project, w);
    let index = 0,
      distance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      const d = Math.abs(
        Math.hypot(point.x - a.x, point.y - a.y) +
          Math.hypot(point.x - b.x, point.y - b.y) -
          Math.hypot(a.x - b.x, a.y - b.y),
      );
      if (d < distance) {
        distance = d;
        index = i;
      }
    }
    get().change((p) => {
      p.junctions.push(j);
      p.wires = p.wires.filter((v) => v.id !== w.id);
      p.wires.push(
        {
          id: uid(),
          from: w.from,
          to: { junctionId: id },
          corners: points.slice(1, index + 1),
        },
        {
          id: uid(),
          from: { junctionId: id },
          to: w.to,
          corners: points.slice(index + 1, -1),
        },
      );
    });
    return { junctionId: id };
  },
  setView: (view) =>
    get().change((p) => {
      p.view = view;
    }, false),
  settings: (patch) =>
    get().change((p) => {
      Object.assign(p.settings, patch);
    }, false),
  load: (project) =>
    set((s) => ({
      project: structuredClone(project),
      selected: [],
      past: [],
      future: [],
      dirty: false,
      revision: s.revision + 1,
      fit: s.fit + 1,
      tool: "select",
    })),
  fresh: () => get().load(newProject()),
  saved: (revision) => {
    if (revision === get().revision) set({ dirty: false });
  },
  toast: (notice) => set({ notice }),
}));
export const snappedPoint = (p: Point) => ({
  x: snap(p.x, useStore.getState().project.settings.snap),
  y: snap(p.y, useStore.getState().project.settings.snap),
});
