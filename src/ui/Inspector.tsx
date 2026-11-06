import {
  Activity,
  ArrowUpRight,
  Check,
  CircleHelp,
  Lightbulb,
  RotateCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "../core/store";
import { format, library, type Part, type Simulation } from "../core/types";
import { Symbol } from "../editor/Symbol";
import { AnimatedContent } from "./AnimatedContent";
export function Inspector({
  simulation,
  onClose,
  onHelp,
}: {
  simulation: Simulation;
  onClose: () => void;
  onHelp: () => void;
}) {
  const s = useStore(),
    c = s.project.components.find((c) => s.selected.includes(c.id)),
    wire = s.project.wires.find((w) => s.selected.includes(w.id)),
    j = s.project.junctions.find((j) => s.selected.includes(j.id));
  const number = (
    label: string,
    key: keyof Part,
    unit: string,
    min = 0.001,
    max = 1e6,
  ) => (
    <label className="field">
      <span>{label}</span>
      <div className="input-unit">
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step="any"
          value={c![key] as number}
          onChange={(e) => {
            const v = e.currentTarget.valueAsNumber;
            if (Number.isFinite(v) && v >= min && v <= max)
              s.update(c!.id, { [key]: v });
          }}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span>
          <Settings2 size={15} /> Inspector
        </span>
        <button
          className="icon-button"
          aria-label="Close inspector"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      {c ? (
        <AnimatedContent key={c.id} className="inspector-content">
          <div className="inspector-symbol">
            <svg viewBox="-60 -55 120 110">
              <Symbol
                kind={c.kind}
                closed={c.closed}
                powered={(simulation.readings[c.id]?.brightness ?? 0) > 0.02}
              />
            </svg>
            <span>{library.find((p) => p.kind === c.kind)?.group}</span>
          </div>
          <h2>{library.find((p) => p.kind === c.kind)?.name}</h2>
          <p className="muted small">A small part of a bright idea.</p>
          <div className="inspector-fields">
            <label className="field">
              <span>Label</span>
              <input
                aria-label="Component label"
                maxLength={80}
                value={c.label}
                onChange={(e) => s.update(c.id, { label: e.target.value })}
              />
            </label>
            {(c.kind === "cell" || c.kind === "battery") &&
              number("Voltage", "voltage", "V", 0.1, 100)}
            {["resistor", "variable", "motor", "buzzer"].includes(c.kind) &&
              number("Resistance", "resistance", "Ω", 0.01)}
            {c.kind === "variable" && (
              <label className="field">
                <span>
                  Adjust resistance <b>{c.resistance.toFixed(0)} Ω</b>
                </span>
                <input
                  aria-label="Adjust resistance"
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={c.resistance}
                  onChange={(e) =>
                    s.update(c.id, { resistance: +e.target.value })
                  }
                />
              </label>
            )}
            {c.kind === "lamp" && (
              <>
                {number("Rated voltage", "nominalVoltage", "V", 0.1, 100)}
                {number("Rated power", "nominalPower", "W", 0.01, 100)}
              </>
            )}
            {c.kind === "led" && (
              <>
                {number("Forward voltage", "forwardVoltage", "V", 0.1, 10)}
                <label className="field">
                  <span>Light colour</span>
                  <div className="colour-options">
                    {[
                      "#ee564a",
                      "#edb83f",
                      "#63af79",
                      "#609ae0",
                      "#c487da",
                    ].map((color) => (
                      <button
                        key={color}
                        aria-label={`LED colour ${color}`}
                        aria-pressed={c.color === color}
                        style={{ background: color }}
                        onClick={() => s.update(c.id, { color })}
                      >
                        {c.color === color && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </label>
              </>
            )}
            {c.kind === "switch" && (
              <div className="field">
                <span>Switch state</span>
                <button
                  className={`switch-state ${c.closed ? "on" : ""}`}
                  data-testid="switch-toggle"
                  onClick={() => s.update(c.id, { closed: !c.closed })}
                >
                  <span className="toggle-track">
                    <i />
                  </span>
                  {c.closed
                    ? "Closed · current can flow"
                    : "Open · breaks the circuit"}
                </button>
              </div>
            )}
            {c.kind === "push" && (
              <button
                className="primary"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  s.update(c.id, { closed: true });
                }}
                onPointerUp={() => s.update(c.id, { closed: false })}
                onPointerCancel={() => s.update(c.id, { closed: false })}
                onBlur={() => {
                  if (c.closed) s.update(c.id, { closed: false });
                }}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    s.update(c.id, { closed: true });
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    s.update(c.id, { closed: false });
                  }
                }}
              >
                Hold to connect
              </button>
            )}
            <div className="field">
              <span>Orientation</span>
              <button
                className="secondary orientation"
                onClick={() => s.rotate()}
              >
                <RotateCw size={15} />
                {c.rotation}°<kbd>R</kbd>
              </button>
            </div>
          </div>
          {simulation.readings[c.id] && (
            <div className="readings">
              <h3>
                <Activity size={14} /> Live measurements
              </h3>
              <div>
                <span>Voltage</span>
                <strong data-testid="reading-voltage">
                  {format(Math.abs(simulation.readings[c.id].voltage), "V")}
                </strong>
              </div>
              <div>
                <span>Current</span>
                <strong data-testid="reading-current">
                  {format(Math.abs(simulation.readings[c.id].current), "A")}
                </strong>
              </div>
              <div>
                <span>Power</span>
                <strong>
                  {format(Math.abs(simulation.readings[c.id].power), "W")}
                </strong>
              </div>
              {c.kind === "lamp" && (
                <div className="brightness">
                  <span>Brightness</span>
                  <div>
                    <i
                      style={{
                        width: `${Math.min(100, simulation.readings[c.id].brightness * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {Math.round(simulation.readings[c.id].brightness * 100)}% of
                    rated power
                  </small>
                </div>
              )}
            </div>
          )}
          <p className="model-note">
            {c.kind === "lamp"
              ? "A simplified lamp: constant resistance from its rated voltage and power."
              : c.kind === "led"
                ? "Simplified LED: forward-voltage drop + 10 Ω dynamic resistance. Add an external current-limiting resistor."
                : c.kind === "motor"
                  ? "Resistive DC motor model. Speed is illustrative; torque and startup behaviour are not simulated."
                  : c.kind === "buzzer"
                    ? "Activates above 1 V and 5 mA. Enable audio in settings to hear it."
                    : c.kind === "voltmeter"
                      ? "1 GΩ input resistance. Connect across the two points you want to measure."
                      : c.kind === "ammeter"
                        ? "0.01 Ω internal resistance. Insert into the branch you want to measure."
                        : c.kind === "cell" || c.kind === "battery"
                          ? "DC voltage source with 0.1 Ω internal resistance. The long schematic line is positive."
                          : "Values and connections update the simulation immediately."}
          </p>
          <button className="danger-text" onClick={s.remove}>
            <Trash2 size={14} /> Delete{" "}
            {s.selected.length > 1 ? "selection" : "component"}
            <kbd>⌫</kbd>
          </button>
        </AnimatedContent>
      ) : wire || j ? (
        <div className="inspector-content">
          <h2>{wire ? "Connecting wire" : "Junction"}</h2>
          <p className="muted small">
            {wire
              ? "Drag an endpoint handle to reconnect. Drag a corner to reshape the wire. Double-click a wire to add a junction."
              : "Only wires attached to this dot share an electrical connection. A plain crossing does not connect."}
          </p>
          <button className="danger-text" onClick={s.remove}>
            <Trash2 size={14} /> Delete selection
          </button>
        </div>
      ) : (
        <div className="inspector-content idle-inspector">
          <div className="idle-icon">
            <MouseIcon />
          </div>
          <h2>A closer look.</h2>
          <p>
            Select a component to adjust its properties and see live
            measurements.
          </p>
          <div className="little-lesson">
            <span className="eyebrow">
              <Lightbulb size={14} /> A LIGHTBULB MOMENT
            </span>
            <h3>One path or two?</h3>
            <p>
              In series, the same current flows through every lamp. Add a
              parallel branch and give it another way around.
            </p>
            <button onClick={onHelp}>
              Explore the basics <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="quick-tips">
            <h3>Make yourself at home</h3>
            <p>
              <kbd>W</kbd> Connect with a wire
            </p>
            <p>
              <kbd>R</kbd> Rotate a component
            </p>
            <p>
              <kbd>F</kbd> Fit your circuit
            </p>
            <button onClick={onHelp}>
              <CircleHelp size={14} /> All shortcuts & help
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
function MouseIcon() {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M10 7L30 22L21 24L17 33Z" />
      <path d="M25 10L28 5M31 14L37 13M21 6V1" />
    </svg>
  );
}
