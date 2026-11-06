import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Hand,
  Minus,
  MousePointer2,
  Plus,
  Spline,
  Copy,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useStore, snappedPoint } from "../core/store";
import {
  endpoint,
  endpointKey,
  format,
  pathD,
  terminal,
  wirePoints,
  type Endpoint,
  type Point,
  type Simulation,
  type Wire,
} from "../core/types";
import { Symbol } from "./Symbol";
type Draft = { from: Endpoint; corners: Point[]; replace?: string };
export function Editor({ simulation }: { simulation: Simulation }) {
  const s = useStore(),
    svg = useRef<SVGSVGElement>(null),
    holder = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 }),
    [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [draft, setDraft] = useState<Draft | null>(null),
    [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [box, setBox] = useState<{ from: Point; to: Point } | null>(null);
  const [context, setContext] = useState<Point | null>(null);
  const openContext = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    s.select([id]);
    const r = holder.current!.getBoundingClientRect();
    setContext({
      x: Math.min(e.clientX - r.left, size.w - 150),
      y: Math.min(e.clientY - r.top, size.h - 130),
    });
  };
  const gesture = useRef<null | {
    type: "parts" | "pan" | "box" | "corner";
    start: Point;
    origins?: { id: string; x: number; y: number }[];
    camera?: typeof camera;
    wireId?: string;
    index?: number;
    checkpointed?: boolean;
  }>(null);
  const wireDown = useRef<Point | null>(null);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(),
        anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
      setCamera((c) => {
        const scale = Math.max(
            0.2,
            Math.min(3, c.scale * Math.exp(-e.deltaY * 0.0015)),
          ),
          f = scale / c.scale;
        return {
          scale,
          x: anchor.x - (anchor.x - c.x) * f,
          y: anchor.y - (anchor.y - c.y) * f,
        };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const o = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    if (holder.current) o.observe(holder.current);
    return () => o.disconnect();
  }, []);
  const fit = () => {
    const ps = [
      ...s.project.components,
      ...s.project.junctions,
      ...s.project.wires.flatMap((w) => w.corners),
    ];
    const minX = Math.min(...ps.map((p) => p.x)) - 90,
      maxX = Math.max(...ps.map((p) => p.x)) + 90,
      minY = Math.min(...ps.map((p) => p.y)) - 100,
      maxY = Math.max(...ps.map((p) => p.y)) + 100;
    const scale = ps.length
      ? Math.max(
          0.15,
          Math.min(
            1.35,
            (size.w - 50) / (maxX - minX),
            (size.h - 100) / (maxY - minY),
          ),
        )
      : 1;
    setCamera({
      scale,
      x: ps.length ? size.w / 2 - ((minX + maxX) / 2) * scale : 0,
      y: ps.length ? size.h / 2 - ((minY + maxY) / 2) * scale - 20 : 0,
    });
  };
  useEffect(fit, [s.fit, size.w, size.h]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContext(null);
        setDraft(null);
        setBox(null);
        gesture.current = null;
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - camera.x) / camera.scale,
      y: (e.clientY - r.top - camera.y) / camera.scale,
    };
  };
  const finish = (to: Endpoint) => {
    if (!draft) return;
    if (s.project.wires.length >= 600 && !draft.replace) {
      s.toast("This project has reached the 600-wire limit.");
      setDraft(null);
      return;
    }
    if (endpointKey(draft.from) === endpointKey(to) && !("x" in to)) return;
    s.change((p) => {
      if (draft.replace)
        p.wires = p.wires.filter((w) => w.id !== draft.replace);
      p.wires.push({
        id: crypto.randomUUID(),
        from: draft.from,
        to,
        corners: draft.corners,
      });
    });
    setDraft(null);
    wireDown.current = null;
  };
  const terminalDown = (e: React.PointerEvent, ep: Endpoint) => {
    e.stopPropagation();
    if (draft) finish(ep);
    else {
      setDraft({ from: ep, corners: [] });
      setCursor(endpoint(s.project, ep));
      wireDown.current = point(e);
    }
  };
  const nearestTerminal = (p: Point): Endpoint | null => {
    for (const c of s.project.components)
      for (const t of [0, 1] as const) {
        const q = terminal(c, t);
        if (Math.hypot(p.x - q.x, p.y - q.y) < 14 / camera.scale)
          return { componentId: c.id, terminal: t };
      }
    for (const j of s.project.junctions)
      if (Math.hypot(p.x - j.x, p.y - j.y) < 12 / camera.scale)
        return { junctionId: j.id };
    return null;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = point(e);
    setCursor(snappedPoint(p));
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pan") {
      setCamera({
        ...camera,
        x: g.camera!.x + e.clientX - g.start.x,
        y: g.camera!.y + e.clientY - g.start.y,
      });
      return;
    }
    if (g.type === "box") {
      setBox({ from: g.start, to: p });
      return;
    }
    if (g.type === "parts") {
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      const changed = g.origins!.some((o) => {
        const c =
            s.project.components.find((c) => c.id === o.id) ??
            s.project.junctions.find((j) => j.id === o.id),
          to = snappedPoint({ x: o.x + dx, y: o.y + dy });
        return c && (c.x !== to.x || c.y !== to.y);
      });
      if (!changed) return;
      if (!g.checkpointed) {
        s.checkpoint();
        g.checkpointed = true;
      }
      s.change((proj) => {
        g.origins!.forEach((o) => {
          const c =
            proj.components.find((c) => c.id === o.id) ??
            proj.junctions.find((j) => j.id === o.id);
          if (c) Object.assign(c, snappedPoint({ x: o.x + dx, y: o.y + dy }));
        });
      }, false);
    }
    if (g.type === "corner") {
      const before = s.project.wires.find((w) => w.id === g.wireId)?.corners[
          g.index!
        ],
        to = snappedPoint(p);
      if (before?.x === to.x && before.y === to.y) return;
      if (!g.checkpointed) {
        s.checkpoint();
        g.checkpointed = true;
      }
      s.change((proj) => {
        const w = proj.wires.find((w) => w.id === g.wireId);
        if (w) w.corners[g.index!] = snappedPoint(p);
      }, false);
    }
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (gesture.current?.type === "box" && box)
      s.select(
        s.project.components
          .filter(
            (c) =>
              c.x >= Math.min(box.from.x, box.to.x) &&
              c.x <= Math.max(box.from.x, box.to.x) &&
              c.y >= Math.min(box.from.y, box.to.y) &&
              c.y <= Math.max(box.from.y, box.to.y),
          )
          .map((c) => c.id),
      );
    gesture.current = null;
    setBox(null);
    if (
      draft &&
      wireDown.current &&
      Math.hypot(
        point(e).x - wireDown.current.x,
        point(e).y - wireDown.current.y,
      ) > 15
    ) {
      const ep = nearestTerminal(point(e));
      finish(ep ?? snappedPoint(point(e)));
    }
    wireDown.current = null;
  };
  const clickWire = (e: React.MouseEvent, w: Wire, junction = false) => {
    e.stopPropagation();
    if (s.tool !== "wire" && !draft && !junction) {
      s.select([w.id]);
      return;
    }
    const raw = point(e),
      points = wirePoints(s.project, w);
    let nearest = raw,
      best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        q =
          a.x === b.x
            ? {
                x: a.x,
                y: Math.max(
                  Math.min(a.y, b.y),
                  Math.min(Math.max(a.y, b.y), snappedPoint(raw).y),
                ),
              }
            : {
                x: Math.max(
                  Math.min(a.x, b.x),
                  Math.min(Math.max(a.x, b.x), snappedPoint(raw).x),
                ),
                y: a.y,
              };
      const d = Math.hypot(raw.x - q.x, raw.y - q.y);
      if (d < best) {
        best = d;
        nearest = q;
      }
    }
    const ep = s.split(w, nearest);
    if (draft) finish(ep);
    else if (!junction) {
      setDraft({ from: ep, corners: [] });
      setCursor(nearest);
    }
  };
  const zoom = (factor: number, anchor = { x: size.w / 2, y: size.h / 2 }) =>
    setCamera((c) => {
      const scale = Math.max(0.2, Math.min(3, c.scale * factor)),
        f = scale / c.scale;
      return {
        scale,
        x: anchor.x - (anchor.x - c.x) * f,
        y: anchor.y - (anchor.y - c.y) * f,
      };
    });
  return (
    <div className={`schematic editor-tool-${s.tool}`} ref={holder}>
      <svg
        ref={svg}
        className="schematic-svg"
        aria-label="Circuit schematic editor"
        data-testid="schematic"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          gesture.current = null;
          wireDown.current = null;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const kind = e.dataTransfer.getData("wire/component");
          if (
            kind &&
            [
              "cell",
              "battery",
              "lamp",
              "led",
              "motor",
              "buzzer",
              "switch",
              "push",
              "variable",
              "resistor",
              "ammeter",
              "voltmeter",
            ].includes(kind)
          )
            s.add(kind as Parameters<typeof s.add>[0], point(e));
        }}
        onPointerDown={(e) => {
          setContext(null);
          if (e.button === 1 || s.tool === "pan" || e.altKey) {
            svg.current!.setPointerCapture(e.pointerId);
            gesture.current = {
              type: "pan",
              start: { x: e.clientX, y: e.clientY },
              camera,
            };
            return;
          }
          if (e.button !== 0) return;
          const p = snappedPoint(point(e));
          if (draft) {
            setDraft({ ...draft, corners: [...draft.corners, p] });
            return;
          }
          if (s.tool === "wire") {
            setDraft({ from: p, corners: [] });
            setCursor(p);
            wireDown.current = p;
            return;
          }
          s.select([]);
          gesture.current = { type: "box", start: point(e) };
          svg.current!.setPointerCapture(e.pointerId);
        }}
        onDoubleClick={(e) => {
          if (draft) finish(snappedPoint(point(e)));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setDraft(null);
          setContext(null);
        }}
      >
        <defs>
          <pattern
            id="dots"
            width={20 * camera.scale}
            height={20 * camera.scale}
            x={camera.x}
            y={camera.y}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r="1" fill="var(--dot)" />
          </pattern>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={s.project.settings.grid ? "url(#dots)" : "transparent"}
        />
        <g
          transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}
        >
          {s.project.wires.map((w) => (
            <g
              key={w.id}
              className={`wire ${s.selected.includes(w.id) ? "selected" : ""} ${draft?.replace === w.id ? "reconnecting" : ""}`}
              onPointerDown={(e) => clickWire(e, w)}
              onContextMenu={(e) => openContext(e, w.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                clickWire(e, w, true);
              }}
            >
              <path
                d={pathD(wirePoints(s.project, w))}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
              />
              <path
                d={pathD(wirePoints(s.project, w))}
                className="wire-line"
                fill="none"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {[w.from, w.to].map((ep, i) =>
                !("componentId" in ep) && !("junctionId" in ep) ? (
                  <circle
                    key={i}
                    cx={ep.x}
                    cy={ep.y}
                    r="4"
                    className="loose-end"
                  />
                ) : null,
              )}
              {s.selected.includes(w.id) && (
                <>
                  {[w.from, w.to].map((ep, i) => {
                    const p = endpoint(s.project, ep);
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="7"
                        className="wire-handle"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraft({
                            from: i ? w.from : w.to,
                            corners: i ? w.corners : [...w.corners].reverse(),
                            replace: w.id,
                          });
                          setCursor(p);
                          wireDown.current = p;
                          svg.current!.setPointerCapture(e.pointerId);
                        }}
                      />
                    );
                  })}
                  {w.corners.map((p, i) => (
                    <rect
                      key={i}
                      x={p.x - 5}
                      y={p.y - 5}
                      width="10"
                      height="10"
                      className="wire-handle"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        gesture.current = {
                          type: "corner",
                          start: point(e),
                          wireId: w.id,
                          index: i,
                        };
                        svg.current!.setPointerCapture(e.pointerId);
                      }}
                    />
                  ))}
                </>
              )}
            </g>
          ))}
          {s.project.junctions.map((j) => (
            <g
              key={j.id}
              onPointerDown={(e) => {
                if (draft || s.tool === "wire")
                  terminalDown(e, { junctionId: j.id });
                else {
                  e.stopPropagation();
                  s.select([j.id]);
                  gesture.current = {
                    type: "parts",
                    start: point(e),
                    origins: [j],
                  };
                  svg.current!.setPointerCapture(e.pointerId);
                }
              }}
            >
              <circle cx={j.x} cy={j.y} r="12" fill="transparent" />
              <circle
                cx={j.x}
                cy={j.y}
                r="4.5"
                fill={s.selected.includes(j.id) ? "var(--green)" : "var(--ink)"}
              />
            </g>
          ))}
          {s.project.components.map((c) => {
            const selected = s.selected.includes(c.id),
              reading = simulation.readings[c.id];
            return (
              <g
                key={c.id}
                data-testid={`part-${c.kind}`}
                data-part-id={c.id}
                onContextMenu={(e) => openContext(e, c.id)}
                className={`schematic-part ${selected ? "selected" : ""}`}
                transform={`translate(${c.x} ${c.y})`}
                tabIndex={0}
                role="group"
                aria-label={`${c.label}, ${c.kind === "switch" ? (c.closed ? "closed" : "open") : "component"}`}
                onFocus={() => {
                  if (!s.selected.includes(c.id)) s.select([c.id]);
                }}
                onKeyDown={(e) => {
                  const delta = (
                    {
                      ArrowLeft: [-20, 0],
                      ArrowRight: [20, 0],
                      ArrowUp: [0, -20],
                      ArrowDown: [0, 20],
                    } as Record<string, number[]>
                  )[e.key];
                  if (delta) {
                    e.preventDefault();
                    s.update(c.id, { x: c.x + delta[0], y: c.y + delta[1] });
                    return;
                  }
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (c.kind === "switch")
                      s.update(c.id, { closed: !c.closed });
                    else s.select([c.id]);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setContext(null);
                  if (s.tool === "pan" || e.altKey || e.button === 1) {
                    gesture.current = {
                      type: "pan",
                      start: { x: e.clientX, y: e.clientY },
                      camera,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    return;
                  }
                  if (e.button !== 0) return;
                  if (draft || s.tool === "wire") return;
                  const ids = e.shiftKey
                    ? selected
                      ? s.selected.filter((id) => id !== c.id)
                      : [...s.selected, c.id]
                    : selected
                      ? s.selected
                      : [c.id];
                  s.select(ids);
                  gesture.current = {
                    type: "parts",
                    start: point(e),
                    origins: s.project.components.filter((c) =>
                      ids.includes(c.id),
                    ),
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (c.kind === "switch")
                    s.update(c.id, { closed: !c.closed });
                }}
              >
                <rect
                  x="-51"
                  y="-48"
                  width="102"
                  height="102"
                  rx="12"
                  className="part-selection"
                />
                <g transform={`rotate(${c.rotation})`}>
                  <rect
                    x="-35"
                    y="-30"
                    width="70"
                    height="60"
                    fill="var(--canvas)"
                    stroke="none"
                  />
                  <Symbol
                    kind={c.kind}
                    closed={c.closed}
                    powered={!!reading && reading.brightness > 0.02}
                  />
                  {[0, 1].map((t) => (
                    <g
                      key={t}
                      data-terminal={`${c.id}:${t}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${c.label} terminal ${t === 0 ? "one" : "two"}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          const ep: Endpoint = {
                            componentId: c.id,
                            terminal: t as 0 | 1,
                          };
                          if (draft) finish(ep);
                          else {
                            setDraft({ from: ep, corners: [] });
                            setCursor(terminal(c, t as 0 | 1));
                            wireDown.current = null;
                          }
                        }
                      }}
                      onPointerDown={(e) =>
                        terminalDown(e, {
                          componentId: c.id,
                          terminal: t as 0 | 1,
                        })
                      }
                    >
                      <circle cx={t ? 40 : -40} r="12" fill="transparent" />
                      <circle cx={t ? 40 : -40} r="4" className="terminal" />
                    </g>
                  ))}
                </g>
                <text textAnchor="middle" y="58" className="component-label">
                  {c.label}
                </text>
                <text textAnchor="middle" y="74" className="component-value">
                  {c.kind === "cell" || c.kind === "battery"
                    ? format(c.voltage, "V")
                    : c.kind === "lamp"
                      ? `${format(c.nominalVoltage, "V")} · ${format(c.nominalPower, "W")}`
                      : c.kind === "resistor" || c.kind === "variable"
                        ? format(c.resistance, "Ω")
                        : c.kind === "ammeter"
                          ? format(Math.abs(reading?.current ?? 0), "A")
                          : c.kind === "voltmeter"
                            ? format(Math.abs(reading?.voltage ?? 0), "V")
                            : c.kind === "switch" || c.kind === "push"
                              ? c.closed
                                ? "Closed"
                                : "Open"
                              : ""}
                </text>
              </g>
            );
          })}
          {draft && (
            <path
              d={pathD(
                wirePoints(s.project, {
                  id: "preview",
                  from: draft.from,
                  to: cursor,
                  corners: draft.corners,
                }),
              )}
              className="wire-preview"
              fill="none"
              strokeWidth="2.5"
            />
          )}
          {box && (
            <rect
              x={Math.min(box.from.x, box.to.x)}
              y={Math.min(box.from.y, box.to.y)}
              width={Math.abs(box.to.x - box.from.x)}
              height={Math.abs(box.to.y - box.from.y)}
              fill="var(--green-tint)"
              fillOpacity=".6"
              stroke="var(--green)"
              strokeDasharray="4 3"
            />
          )}
        </g>
      </svg>
      {!s.project.components.length && (
        <div className="empty-grid">
          <span className="empty-spark">✦</span>
          <h2>Every idea starts with a spark.</h2>
          <p>
            Drag a cell onto the grid.
            <br />
            Add a lamp, then connect their terminals.
          </p>
        </div>
      )}
      {context && (
        <div
          className="context-menu"
          role="menu"
          aria-label="Selection actions"
          style={{ left: context.x, top: context.y }}
        >
          <button
            role="menuitem"
            onClick={() => {
              s.rotate();
              setContext(null);
            }}
          >
            <RotateCw size={14} />
            Rotate <kbd>R</kbd>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              s.copy();
              setContext(null);
            }}
          >
            <Copy size={14} />
            Copy <kbd>⌘ C</kbd>
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              s.remove();
              setContext(null);
            }}
          >
            <Trash2 size={14} />
            Delete <kbd>⌫</kbd>
          </button>
        </div>
      )}
      <div className="editor-tools floating">
        <button
          title="Select (V)"
          aria-label="Select tool"
          aria-pressed={s.tool === "select"}
          className={s.tool === "select" ? "active" : ""}
          onClick={() => s.setTool("select")}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          title="Wire (W)"
          aria-label="Wire tool"
          aria-pressed={s.tool === "wire"}
          className={s.tool === "wire" ? "active" : ""}
          onClick={() => s.setTool("wire")}
        >
          <Spline size={18} />
        </button>
        <button
          title="Pan (Alt + drag)"
          aria-label="Pan tool"
          aria-pressed={s.tool === "pan"}
          className={s.tool === "pan" ? "active" : ""}
          onClick={() => s.setTool("pan")}
        >
          <Hand size={17} />
        </button>
        <span className="tool-separator" />
        <button aria-label="Zoom out" onClick={() => zoom(0.85)}>
          <Minus size={17} />
        </button>
        <span className="zoom-label">{Math.round(camera.scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => zoom(1.15)}>
          <Plus size={17} />
        </button>
        <button title="Fit circuit (F)" aria-label="Fit circuit" onClick={fit}>
          <Crosshair size={17} />
        </button>
      </div>
      <div className="canvas-hint">
        {draft
          ? "Click a terminal to connect · click for corners · double-click to end · Esc to cancel"
          : s.tool === "wire"
            ? "Connect terminals · click a wire to create a junction"
            : "Drag to move · double-click a switch to toggle"}
      </div>
    </div>
  );
}
