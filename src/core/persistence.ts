import { openDB } from "idb";
import { library, type Endpoint, type Project } from "./types";
const database = () =>
  openDB("wire-projects", 1, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("recovery");
    },
  });
export async function saveProject(p: Project) {
  const db = await database();
  await db.put("projects", structuredClone(p));
}
export async function listProjects(): Promise<Project[]> {
  const db = await database();
  const rows = await db.getAll("projects");
  const valid: Project[] = [];
  for (const row of rows) {
    try {
      valid.push(validateProject(row));
    } catch {
      /* A damaged record must not hide other projects. */
    }
  }
  return valid.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function deleteProject(id: string) {
  const db = await database();
  await db.delete("projects", id);
}
export async function autosave(p: Project) {
  const db = await database();
  await db.put("recovery", structuredClone(p), "latest");
}
export async function recover(): Promise<Project | null> {
  const db = await database();
  const p = await db.get("recovery", "latest");
  return p ? validateProject(p) : null;
}
export function validateProject(value: unknown): Project {
  const p = value as Project,
    finite = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e9;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !(
      typeof p.updatedAt === "number" &&
      Number.isSafeInteger(p.updatedAt) &&
      p.updatedAt >= 0
    ) ||
    !Array.isArray(p.components) ||
    !Array.isArray(p.wires) ||
    !Array.isArray(p.junctions) ||
    p.components.length > 200 ||
    p.wires.length > 600 ||
    p.junctions.length > 600 ||
    !["2d", "split", "3d"].includes(p.view)
  )
    throw new Error("This is not a supported Wire project (version 1).");
  const ids = new Set<string>();
  const id = (s: unknown) => {
    if (
      typeof s !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s,
      ) ||
      ids.has(s)
    )
      throw new Error("Invalid or repeated object ID.");
    ids.add(s);
  };
  const point = (v: { x: number; y: number }) =>
    v && finite(v.x) && finite(v.y);
  for (const c of p.components) {
    id(c.id);
    if (
      !point(c) ||
      !library.some((l) => l.kind === c.kind) ||
      typeof c.label !== "string" ||
      c.label.length > 200 ||
      !finite(c.rotation) ||
      c.rotation % 90 !== 0 ||
      ![
        c.voltage,
        c.resistance,
        c.nominalPower,
        c.nominalVoltage,
        c.forwardVoltage,
      ].every(finite) ||
      c.voltage <= 0 ||
      c.voltage > 100 ||
      c.resistance <= 0 ||
      c.nominalPower <= 0 ||
      c.nominalVoltage <= 0 ||
      c.forwardVoltage <= 0 ||
      typeof c.closed !== "boolean" ||
      !/^#[0-9a-f]{6}$/i.test(c.color)
    )
      throw new Error("The project contains invalid component values.");
  }
  for (const j of p.junctions) {
    id(j.id);
    if (!point(j)) throw new Error("Invalid junction.");
  }
  const ep = (e: Endpoint) =>
    e &&
    ("componentId" in e
      ? p.components.some((c) => c.id === e.componentId) &&
        (e.terminal === 0 || e.terminal === 1)
      : "junctionId" in e
        ? p.junctions.some((j) => j.id === e.junctionId)
        : point(e));
  for (const w of p.wires) {
    id(w.id);
    if (
      !ep(w.from) ||
      !ep(w.to) ||
      !Array.isArray(w.corners) ||
      w.corners.length > 100 ||
      !w.corners.every(point)
    )
      throw new Error("The project contains an invalid wire connection.");
  }
  const s = p.settings;
  if (
    !s ||
    !["light", "dark", "system"].includes(s.theme) ||
    ![s.grid, s.snap, s.effects, s.audio, s.transparent].every(
      (v) => typeof v === "boolean",
    )
  )
    throw new Error("Invalid project settings.");
  return structuredClone(p);
}
