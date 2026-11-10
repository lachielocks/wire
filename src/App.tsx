import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Lightbulb,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Redo2,
  Save,
  Search,
  Settings2,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
  TriangleAlert,
} from "lucide-react";
import { useStore } from "./core/store";
import {
  defaults,
  example,
  format,
  library,
  uid,
  type Kind,
  type Project,
} from "./core/types";
import { solve } from "./core/solver";
import {
  autosave,
  deleteProject,
  listProjects,
  recover,
  saveProject,
  validateProject,
} from "./core/persistence";
import { Editor } from "./editor/Editor";
import { Symbol } from "./editor/Symbol";
import { Inspector } from "./ui/Inspector";
import { Modal } from "./ui/Modal";
import { AnimatedContent } from "./ui/AnimatedContent";
const Experiment = lazy(() =>
  import("./scene/Experiment").then((m) => ({ default: m.Experiment })),
);
type Dialog = "new" | "open" | "saveas" | "export" | "settings" | "help" | null;
function Logo() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="currentColor" />
      <path
        d="M8 11V23C8 28 15 28 15 23V13C15 8 21 8 21 13V23C21 28 28 28 28 23V11"
        stroke="var(--logo-stroke)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export default function App() {
  const s = useStore(),
    simulation = useMemo(
      () => solve(s.project),
      [s.project.components, s.project.wires, s.project.junctions],
    );
  const [dialog, setDialog] = useState<Dialog>(null),
    [search, setSearch] = useState(""),
    [inspector, setInspector] = useState(() => window.innerWidth > 950),
    [projects, setProjects] = useState<Project[]>([]),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false),
    [titleOnExport, setTitleOnExport] = useState(false),
    [exporting, setExporting] = useState(false),
    [mobileLibrary, setMobileLibrary] = useState(false),
    [explain, setExplain] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width:700px)").matches,
  );
  const effectiveView =
    compact && s.project.view === "split" ? "2d" : s.project.view;
  useEffect(() => {
    const mq = window.matchMedia("(max-width:700px)"),
      update = () => setCompact(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const toast = s.toast;
  useEffect(() => {
    const rev = useStore.getState().revision;
    recover()
      .then((p) => {
        if (p && useStore.getState().revision === rev) {
          p.settings.audio = false;
          useStore.getState().load(p);
        }
      })
      .catch(() =>
        toast(
          "Local recovery is unavailable. You can still export project files.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      autosave(s.project).catch(() =>
        toast(
          "Couldn’t autosave locally. Export a project file to keep your work.",
        ),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [s.project, ready]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        s.project.settings.theme === "system"
          ? mq.matches
            ? "dark"
            : "light"
          : s.project.settings.theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s.project.settings.theme]);
  useEffect(() => {
    if (!s.notice) return;
    const timer = setTimeout(() => toast(""), 4000);
    return () => clearTimeout(timer);
  }, [s.notice]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  const save = useCallback(async () => {
    const state = useStore.getState();
    setSaving(true);
    try {
      await saveProject(state.project);
      state.saved(state.revision);
      toast("Saved on this device");
    } catch {
      toast("Couldn’t save locally. Try exporting a project file.");
    } finally {
      setSaving(false);
    }
  }, []);
  const open = async () => {
    setDialog("open");
    try {
      setProjects(await listProjects());
    } catch {
      toast(
        "Your saved projects couldn’t be read. Try importing a project file.",
      );
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        dialog ||
        e.defaultPrevented ||
        (e.target instanceof HTMLElement &&
          (e.target.matches("input,textarea,select") ||
            e.target.isContentEditable))
      )
        return;
      const st = useStore.getState(),
        k = e.key.toLowerCase(),
        mod = e.metaKey || e.ctrlKey;
      if (mod) {
        if (k === "s") {
          e.preventDefault();
          void save();
        } else if (k === "z") {
          e.preventDefault();
          e.shiftKey ? st.redo() : st.undo();
        } else if (k === "c") {
          e.preventDefault();
          st.copy();
        } else if (k === "v") {
          e.preventDefault();
          st.paste();
        } else if (k === "a") {
          e.preventDefault();
          st.select(st.project.components.map((c) => c.id));
        }
        return;
      }
      if (k === "v") st.setTool("select");
      if (k === "/") {
        e.preventDefault();
        setMobileLibrary(true);
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(
              'input[aria-label="Search components"]',
            )
            ?.focus(),
        );
      }
      if (k === "w") st.setTool("wire");
      if (k === "r" && st.selected.length) st.rotate();
      if (k === "f") useStore.setState({ fit: st.fit + 1 });
      if (k === "delete" || k === "backspace") {
        e.preventDefault();
        st.remove();
      }
      if (k === "escape") {
        st.select([]);
        st.setTool("select");
      }
      if (k === "?") setDialog("help");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, save]);
  const runExport = async (type: "svg" | "png" | "3d" | "project") => {
    setExporting(true);
    try {
      const { download, exportDiagram, exportScene } =
        await import("./core/export");
      if (type === "project")
        download(
          new Blob([JSON.stringify(s.project, null, 2)], {
            type: "application/json",
          }),
          `${s.project.name}.wire.json`,
        );
      else if (type === "3d") await exportScene(s.project);
      else await exportDiagram(s.project, type, titleOnExport);
      toast("Export ready.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };
  const add = (kind: Kind) => {
    const count = s.project.components.length;
    s.add(kind, {
      x: 200 + (count % 3) * 160,
      y: 140 + Math.floor(count / 3) * 160,
    });
    setMobileLibrary(false);
  };
  const visible = library.filter((p) =>
    `${p.name} ${p.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Wire home"
        >
          <Logo />
          <span>
            wire<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="topbar-divider" />
        <button
          className="project-title"
          title="Rename project"
          onClick={() => {
            setName(s.project.name);
            setDialog("saveas");
          }}
        >
          {s.project.name}
          <span
            className={`save-dot ${s.dirty ? "unsaved" : ""}`}
            title={s.dirty ? "Unsaved changes" : "Saved"}
          />
          <ChevronDown size={13} />
        </button>
        <div className="history-buttons">
          <button
            className="icon-button"
            title="Undo (⌘/Ctrl Z)"
            aria-label="Undo"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="Redo (⌘/Ctrl Shift Z)"
            aria-label="Redo"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="topbar-actions">
          <button
            className="text-button new-project"
            onClick={() => setDialog("new")}
          >
            <FilePlus2 size={15} />
            <span>New</span>
          </button>
          <button
            className="text-button"
            aria-label="Open"
            onClick={() => void open()}
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <button
            className="text-button"
            aria-label="Save project"
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Save size={16} />
            )}
            <span>Save</span>
          </button>
          <span className="topbar-divider" />
          <button className="export-button" onClick={() => setDialog("export")}>
            <ArrowUpRight size={16} />
            <span>Export</span>
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="icon-button help-button"
            aria-label="Help"
            title="Help & shortcuts"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={18} />
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Circuit builder</div>
          <h1>
            Build a circuit<span>.</span>
          </h1>
          <p>Draw it. Connect it. See it work.</p>
        </div>
        <div className="heading-right">
          <span className="local-badge">
            <span />
            Saved on this device
          </span>
          <button
            className="secondary examples-button"
            onClick={() => setDialog("new")}
          >
            <BookOpen size={15} /> Examples <ChevronDown size={13} />
          </button>
        </div>
      </div>
      <main className={`workbench ${!inspector ? "inspector-closed" : ""}`}>
        <aside
          className={`library-panel ${mobileLibrary ? "mobile-open" : ""}`}
        >
          <div className="panel-heading">
            <span>
              Components <small>{library.length}</small>
            </span>
            <button
              className="icon-button mobile-close"
              onClick={() => setMobileLibrary(false)}
              aria-label="Close components"
            >
              <X size={16} />
            </button>
          </div>
          <div className="library-search">
            <Search size={15} />
            <input
              aria-label="Search components"
              placeholder="Find a component…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>/</kbd>
          </div>
          <div className="component-list">
            {[...new Set(visible.map((p) => p.group))].map((group) => (
              <section key={group}>
                <h3>{group}</h3>
                {visible
                  .filter((p) => p.group === group)
                  .map((p, i) => (
                    <AnimatedContent key={p.kind} delay={i * 0.025}>
                      <button
                        className="library-part"
                        draggable
                        aria-label={`Add ${p.name}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("wire/component", p.kind);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => add(p.kind)}
                      >
                        <span className="library-symbol">
                          <svg viewBox="-55 -45 110 90">
                            <Symbol kind={p.kind} />
                          </svg>
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.detail}</small>
                        </span>
                        <span className="drag-grip">⠿</span>
                      </button>
                    </AnimatedContent>
                  ))}
              </section>
            ))}
            {!visible.length && (
              <p className="no-results">No components found.</p>
            )}
          </div>
          <div className="library-footer">
            <span className="mini-logo">↳</span>
            <span>
              Drag a part onto the canvas.
              <br />
              <strong>Drop it on a wire to add it in line.</strong>
            </span>
          </div>
        </aside>
        <section className="workspace">
          <div className="workspace-toolbar">
            <div className="workspace-label">
              <button
                className="icon-button mobile-library-button"
                aria-label="Show components"
                onClick={() => setMobileLibrary((v) => !v)}
              >
                <Grid2X2 size={16} />
              </button>
              <span className="workspace-square" />
              <span>Canvas</span>
            </div>
            <div
              className="view-control"
              role="group"
              aria-label="Workspace view"
            >
              {(
                [
                  { view: "2d", label: "2D", icon: Pencil },
                  {
                    view: "split",
                    label: "Split",
                    icon: SplitSquareHorizontal,
                  },
                  { view: "3d", label: "3D", icon: Box },
                ] as const
              ).map(({ view, label, icon: Icon }) => (
                <button
                  key={view}
                  aria-label={`${label} view`}
                  aria-pressed={effectiveView === view}
                  onClick={() => s.setView(view)}
                  className={effectiveView === view ? "active" : ""}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <div className="workspace-options">
              <button
                className={`icon-button ${s.project.settings.grid ? "is-active" : ""}`}
                aria-label="Toggle grid"
                aria-pressed={s.project.settings.grid}
                title="Toggle grid"
                onClick={() => s.settings({ grid: !s.project.settings.grid })}
              >
                <Grid2X2 size={15} />
              </button>
              <button
                className="icon-button"
                title={inspector ? "Hide properties" : "Show properties"}
                aria-label="Toggle properties"
                onClick={() => setInspector((v) => !v)}
              >
                {inspector ? (
                  <PanelRightClose size={16} />
                ) : (
                  <PanelRightOpen size={16} />
                )}
              </button>
            </div>
          </div>
          <div className={`viewports view-${effectiveView}`}>
            <div className="schematic-pane">
              <div className="viewport-heading">
                <span>
                  <Pencil size={12} /> Circuit
                </span>
                <small>2D</small>
              </div>
              <Editor simulation={simulation} />
            </div>
            <div className="experiment-pane">
              <Suspense
                fallback={
                  <div className="scene-loading">
                    <LoaderCircle className="spin" size={20} />
                    Loading 3D…
                  </div>
                }
              >
                <Experiment
                  simulation={simulation}
                  hidden={effectiveView === "2d"}
                />
              </Suspense>
            </div>
          </div>
          <div className={`circuit-status status-${simulation.status}`}>
            <div className="status-main" role="status" aria-live="polite">
              <span className="status-indicator">
                {simulation.status === "complete" ? (
                  <Check size={12} />
                ) : simulation.status === "short" ||
                  simulation.status === "error" ? (
                  <Zap size={12} />
                ) : (
                  <span />
                )}
              </span>
              <strong data-testid="simulation-status">
                {simulation.status === "complete"
                  ? "Circuit complete"
                  : simulation.status === "short"
                    ? "Short circuit"
                    : simulation.status === "error"
                      ? "Check your circuit"
                      : "Open circuit"}
              </strong>
              <span className="status-description">
                {simulation.status === "complete"
                  ? simulation.sourceCurrent > 1e-6
                    ? "Current is flowing."
                    : "The path is complete, but almost no current is flowing."
                  : simulation.status === "open"
                    ? "The circuit is not complete yet."
                    : simulation.message}
              </span>
            </div>
            <div className="status-details">
              {simulation.warnings.length > 0 && (
                <button
                  className="warning-count"
                  aria-label="Show circuit warnings"
                  title="Circuit warnings"
                  onClick={() => setExplain((v) => !v)}
                >
                  <TriangleAlert size={13} />
                  {simulation.warnings.length}
                </button>
              )}
              {simulation.sourceCurrent > 0 && (
                <span title="Sum of source-current magnitudes">
                  {format(simulation.sourceCurrent, "A")}
                </span>
              )}
              <button
                className="icon-button"
                aria-label="Explain circuit status"
                onClick={() => setExplain((v) => !v)}
              >
                <CircleHelp size={15} />
              </button>
            </div>
            {explain && (
              <div className="status-popover">
                <h3>
                  {simulation.status === "complete"
                    ? "The circuit is complete"
                    : "What’s happening?"}
                </h3>
                <p>{simulation.message}</p>
                {simulation.warnings.length > 0 && (
                  <ul>
                    {simulation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <small>
                  Conventional current flows from + to − around the external
                  circuit.
                </small>
              </div>
            )}
          </div>
        </section>
        {inspector && (
          <Inspector
            simulation={simulation}
            onClose={() => setInspector(false)}
            onHelp={() => setDialog("help")}
          />
        )}
      </main>
      <footer className="app-footer">
        <span>Made for Year 9 science</span>
        <span>
          Wire by{" "}
          <a
            href="https://github.com/lachielocks/wire"
            target="_blank"
            rel="noreferrer"
          >
            Transnology <ArrowUpRight size={11} />
          </a>
        </span>
        <button onClick={() => setDialog("help")}>
          <span className="keyboard-symbol">⌘</span> Keyboard shortcuts
        </button>
      </footer>
      {s.notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {s.notice}
          <button aria-label="Dismiss notification" onClick={() => toast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".json,.wire.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 2_000_000)
              throw new Error("Project files must be smaller than 2 MB.");
            const p = validateProject(JSON.parse(await file.text()));
            p.settings.audio = false;
            s.load(p);
            setDialog(null);
            toast("Project imported");
          } catch (err) {
            toast(
              err instanceof Error
                ? err.message
                : "This project file is invalid.",
            );
          }
        }}
      />
      {dialog === "new" && (
        <Modal title="New circuit" onClose={() => setDialog(null)}>
          <p className="modal-intro">
            Start with a blank canvas, or open a ready-made circuit.
          </p>
          {s.dirty && (
            <div className="inline-note">
              You have unsaved changes.{" "}
              <button onClick={() => void save()}>
                Save your current circuit
              </button>{" "}
              before starting another.
            </div>
          )}
          <div className="example-grid">
            {[
              {
                name: "Blank canvas",
                desc: "Start empty and build your own.",
                type: "blank",
              },
              {
                name: "Cell, switch and bulb",
                desc: "One cell, a switch and a bulb.",
                type: "simple",
              },
              {
                name: "Two bulbs in series",
                desc: "One path through both bulbs.",
                type: "series",
              },
              {
                name: "Two bulbs in parallel",
                desc: "Two paths, side by side.",
                type: "parallel",
              },
            ].map((p, i) => (
              <button
                key={p.type}
                className="example-option"
                onClick={() => {
                  if (p.type === "blank") s.fresh();
                  else
                    s.load(example(p.type as "simple" | "series" | "parallel"));
                  setDialog(null);
                }}
              >
                <span className="example-number">0{i + 1}</span>
                <strong>{p.name}</strong>
                <small>{p.desc}</small>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "open" && (
        <Modal title="Open a circuit" onClose={() => setDialog(null)}>
          <p className="modal-intro">Saved in this browser, on this device.</p>
          {s.dirty && (
            <div className="inline-note">
              Save your current changes before opening another project.{" "}
              <button onClick={() => void save()}>Save now</button>
            </div>
          )}
          <div className="saved-projects">
            {projects.length ? (
              projects.map((p) => (
                <div className="saved-project" key={p.id}>
                  <button
                    onClick={() => {
                      const next = validateProject(p);
                      next.settings.audio = false;
                      s.load(next);
                      setDialog(null);
                    }}
                  >
                    <span className="saved-project-icon">
                      <Lightbulb size={20} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.components.length} components ·{" "}
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </small>
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    title="Duplicate saved project"
                    aria-label={`Duplicate ${p.name}`}
                    onClick={async () => {
                      try {
                        await saveProject({
                          ...p,
                          id: uid(),
                          name: `${p.name} copy`,
                          updatedAt: Date.now(),
                        });
                        setProjects(await listProjects());
                      } catch {
                        toast("Couldn’t duplicate the project.");
                      }
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      try {
                        await deleteProject(p.id);
                        setProjects(await listProjects());
                        toast("Saved project deleted");
                      } catch {
                        toast("Couldn’t delete the saved project.");
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-projects">
                <FolderOpen size={30} />
                <h3>No saved circuits yet</h3>
                <p>Save a circuit and it will show up here.</p>
              </div>
            )}
          </div>
          <button
            className="secondary full-width"
            onClick={() => importRef.current?.click()}
          >
            <Upload size={16} /> Import a Wire project
          </button>
        </Modal>
      )}
      {dialog === "saveas" && (
        <Modal title="Name this circuit" onClose={() => setDialog(null)}>
          <label className="field">
            <span>Project name</span>
            <input
              autoFocus
              aria-label="Project name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  s.change((p) => {
                    p.name = name.trim();
                  });
                  void save();
                  setDialog(null);
                }
              }}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary"
              disabled={!name.trim()}
              onClick={async () => {
                const copy = {
                  ...structuredClone(s.project),
                  id: uid(),
                  name: name.trim(),
                  updatedAt: Date.now(),
                };
                try {
                  await saveProject(copy);
                  s.load(copy);
                  toast("Saved as a new project");
                  setDialog(null);
                } catch {
                  toast("Couldn’t save this project.");
                }
              }}
            >
              <Copy size={15} /> Save as copy
            </button>
            <button
              className="primary"
              disabled={!name.trim()}
              onClick={() => {
                s.change((p) => {
                  p.name = name.trim();
                });
                void save();
                setDialog(null);
              }}
            >
              <Check size={16} /> Rename & save
            </button>
          </div>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal title="Export" onClose={() => setDialog(null)}>
          <p className="modal-intro">
            Save a circuit diagram, a 3D photo, or a project file.
          </p>
          <div className="export-options">
            {[
              {
                type: "png",
                title: "Circuit · PNG",
                desc: "A high-resolution picture of the diagram.",
                icon: Download,
              },
              {
                type: "svg",
                title: "Circuit · SVG",
                desc: "A vector diagram, sharp at any size.",
                icon: Pencil,
              },
              {
                type: "3d",
                title: "3D view · PNG",
                desc: "A photo of the current 3D view.",
                icon: Box,
              },
              {
                type: "project",
                title: "Wire project · JSON",
                desc: "Keep a backup or open on another device.",
                icon: FolderOpen,
              },
            ].map(({ type, title, desc, icon: Icon }) => (
              <button
                key={type}
                disabled={
                  exporting || (type === "3d" && effectiveView === "2d")
                }
                onClick={() =>
                  void runExport(type as "png" | "svg" | "3d" | "project")
                }
              >
                <Icon size={20} />
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
                <ArrowDownToLine size={17} />
              </button>
            ))}
          </div>
          <label className="check-option">
            <input
              type="checkbox"
              checked={s.project.settings.transparent}
              onChange={(e) => s.settings({ transparent: e.target.checked })}
            />{" "}
            Transparent schematic background
          </label>
          <label className="check-option">
            <input
              type="checkbox"
              checked={titleOnExport}
              onChange={(e) => setTitleOnExport(e.target.checked)}
            />{" "}
            Include project title in schematic
          </label>
          <p className="small muted">
            3D screenshots include the physical circuit, without interface
            labels.
          </p>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="Settings" onClose={() => setDialog(null)}>
          <div className="settings-list">
            <label className="field">
              <span>Appearance</span>
              <select
                aria-label="Appearance"
                value={s.project.settings.theme}
                onChange={(e) =>
                  s.settings({
                    theme: e.target.value as "light" | "dark" | "system",
                  })
                }
              >
                <option value="system">Match your device</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            {[
              {
                key: "grid",
                name: "Dot grid",
                desc: "Show dots on the canvas.",
              },
              {
                key: "snap",
                name: "Snap to grid",
                desc: "Keep components and wires lined up.",
              },
              {
                key: "effects",
                name: "Visual effects",
                desc: "Component entrances and motor animation.",
              },
              {
                key: "audio",
                name: "Buzzer audio",
                desc: "Allow powered buzzers to make sound.",
              },
            ].map((row) => (
              <label key={row.key} className="setting-toggle">
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.desc}</small>
                </span>
                <input
                  type="checkbox"
                  checked={
                    s.project.settings[
                      row.key as keyof typeof defaults
                    ] as boolean
                  }
                  onChange={(e) => s.settings({ [row.key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
          <p className="model-note">
            Projects stay on this device. Export a Wire project file to keep a
            portable backup. Reduced-motion preferences are respected
            automatically.
          </p>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="Help" wide onClose={() => setDialog(null)}>
          <div className="help-columns">
            <div>
              <h3>Make your first circuit</h3>
              <ol>
                <li>
                  Drag a cell and a bulb onto the canvas, or click them in the
                  parts list.
                </li>
                <li>
                  Click one terminal, then click the next. Click empty space to
                  add a bend. Double-click to leave a loose end.
                </li>
                <li>
                  Connect both sides to complete the circuit. The bulb lights up
                  when current flows.
                </li>
                <li>
                  Add a switch. Double-click it in 2D, click it in 3D, or use
                  Properties to open and close it.
                </li>
                <li>
                  Drop a part onto an existing wire to split that wire and
                  connect the part in line.
                </li>
              </ol>
              <h3>Joins and branches</h3>
              <p>
                In the wire tool, click a wire to add a join and start a branch.
                Double-click a wire with the select tool to add a join dot.
                Wires that cross without a dot stay separate. Select a wire to
                drag its ends, bends, or segments.
              </p>
              <h3>How the numbers work</h3>
              <p>
                Wire uses DC modified nodal analysis. Sources include 0.1 Ω
                internal resistance. Bulbs have constant resistance R = V²/P;
                brightness follows P/P-rated. Closed switches and ammeters are
                0.01 Ω. Voltmeters are 1 GΩ.
              </p>
              <p>
                LEDs use a forward drop plus 10 Ω, with polarity and overcurrent
                warnings. Motors and buzzers are resistive approximations. Fan
                speed is illustrative; the buzzer activates above 1 V and 5 mA.
                Real filament heating, transients, AC, torque, and component
                damage are not simulated.
              </p>
            </div>
            <div>
              <h3>Keyboard shortcuts</h3>
              <div className="shortcuts">
                {[
                  ["V", "Select tool"],
                  ["W", "Wire tool"],
                  ["R", "Rotate selection"],
                  ["⌫ / Delete", "Delete selection"],
                  ["⌘/Ctrl Z", "Undo"],
                  ["⌘/Ctrl ⇧ Z", "Redo"],
                  ["⌘/Ctrl S", "Save"],
                  ["⌘/Ctrl C", "Copy"],
                  ["⌘/Ctrl V", "Paste"],
                  ["⌘/Ctrl A", "Select all"],
                  ["Esc", "Cancel operation"],
                  ["F", "Fit circuit"],
                  ["Alt + drag", "Pan canvas"],
                  ["Scroll", "Zoom"],
                  ["Shift + click", "Add to selection"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
              <div className="inline-note">
                Click a component to inspect it. Drag an empty area to select
                several components. Tab to schematic components and press Enter
                on a switch.
              </div>
              <h3>Limits</h3>
              <p>
                Up to 200 components and 600 wires per project. Values are
                simplified educational models, not predictions for building
                mains-powered circuits.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
