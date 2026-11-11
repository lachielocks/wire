import type { Kind } from "../core/types";
import type { OutputLook } from "../core/output";
export function Symbol({
  kind,
  closed = false,
  look,
  color = "#ee564a",
}: {
  kind: Kind;
  closed?: boolean;
  look?: OutputLook;
  color?: string;
}) {
  const on = look?.on ?? false,
    level = look?.level ?? 0,
    overloaded = look?.overloaded ?? false,
    spin = look?.spin ?? 0,
    pulse = look?.pulse ?? false;
  const glow = Math.min(1, Math.max(0, level));
  const circle = (label: string, fill = "none") => (
    <>
      <circle r="23" fill={fill} />
      <text
        y="6"
        textAnchor="middle"
        stroke="none"
        fill="currentColor"
        fontSize="20"
        fontFamily="sans-serif"
      >
        {label}
      </text>
    </>
  );
  const spinSeconds = Math.max(0.18, 0.9 / Math.max(0.08, Math.abs(spin) * 8));
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-output={
        kind === "lamp" ||
        kind === "led" ||
        kind === "motor" ||
        kind === "buzzer"
          ? overloaded
            ? "overloaded"
            : on
              ? "on"
              : "off"
          : undefined
      }
    >
      {["cell", "battery"].includes(kind) ? (
        <>
          <path
            d={
              kind === "cell"
                ? "M-40 0H-5 M5 0H40 M-5 -23V23 M5 -13V13"
                : "M-40 0H-15 M15 0H40 M-15 -23V23 M-5 -13V13 M5 -23V23 M15 -13V13"
            }
          />
          <text x="-24" y="-12" fontSize="12" fill="currentColor" stroke="none">
            +
          </text>
        </>
      ) : (
        <path d="M-40 0H-24 M24 0H40" />
      )}
      {kind === "lamp" && (
        <>
          {on && !overloaded && (
            <circle
              r="32"
              fill="#ffd36a"
              stroke="none"
              opacity={0.35 + 0.4 * glow}
            />
          )}
          <circle
            r="23"
            fill={
              overloaded
                ? "#cfc6b4"
                : on
                  ? `rgba(255, 220, 80, ${0.7 + 0.3 * glow})`
                  : "none"
            }
            stroke={overloaded ? "#7a6a52" : on ? "#67532b" : "currentColor"}
          />
          <path
            d={
              overloaded
                ? "M-16 -16L-4 -2 M4 2L16 16M-16 16L-3 5 M5 -3L16 -16"
                : "M-16 -16L16 16M-16 16L16 -16"
            }
            stroke={overloaded ? "#7a6a52" : on ? "#67532b" : "currentColor"}
          />
        </>
      )}
      {(kind === "switch" || kind === "push") && (
        <>
          <path d="M-40 0H-20 M20 0H40" />
          <circle cx="-20" r="3" fill="currentColor" />
          <circle cx="20" r="3" fill="currentColor" />
          <path d={closed ? "M-20 0H20" : "M-20 0L15 -22"} />
          {kind === "push" && <path d="M-6 -27H9 M2 -27V-17" />}
        </>
      )}
      {(kind === "resistor" || kind === "variable") && (
        <>
          <rect x="-24" y="-11" width="48" height="22" />
          {kind === "variable" && (
            <path d="M-18 26L22 -26 M12 -23L22 -26L23 -16" />
          )}
        </>
      )}
      {kind === "ammeter" && circle("A")}
      {kind === "voltmeter" && circle("V")}
      {kind === "motor" && (
        <>
          {circle("M", on ? "rgba(67, 140, 107, 0.16)" : "none")}
          <g
            className={spin ? "symbol-spin" : undefined}
            style={
              spin
                ? {
                    animationDuration: `${spinSeconds}s`,
                    animationDirection: spin < 0 ? "reverse" : "normal",
                  }
                : on
                  ? { transform: "rotate(28deg)" }
                  : undefined
            }
          >
            <circle r="20" fill="currentColor" fillOpacity="0" stroke="none" />
            <path d="M0 -18V-8 M0 8V18 M-18 0H-8 M8 0H18" />
          </g>
        </>
      )}
      {kind === "buzzer" && (
        <>
          <path
            d="M-24 -14H7L23 -25V25L7 14H-24Z"
            fill={on ? "rgba(67, 140, 107, 0.16)" : "none"}
          />
          <path
            className={pulse ? "symbol-pulse" : undefined}
            d="M29 -16Q44 0 29 16"
            opacity={on ? 1 : 0.7}
          />
          {on && (
            <path
              className={pulse ? "symbol-pulse" : undefined}
              d="M33 -22Q52 0 33 22"
              opacity={pulse ? 0.8 : 1}
            />
          )}
        </>
      )}
      {kind === "led" && (
        <>
          <path d="M-40 0H-16 M16 0H40 M16 -18V18" />
          <path
            d="M-16 -17L15 0L-16 17Z"
            fill={on ? color : "none"}
            fillOpacity={on ? 0.3 + 0.7 * glow : 0}
            stroke={on ? color : "currentColor"}
          />
          {on && (
            <circle
              r="10"
              cx="0"
              cy="0"
              fill={color}
              stroke="none"
              opacity={0.2 + 0.35 * glow}
            />
          )}
          <path d="M4 -27L17 -40 M14 -40H17V-37 M20 -18L33 -31 M30 -31H33V-28" />
        </>
      )}
    </g>
  );
}
