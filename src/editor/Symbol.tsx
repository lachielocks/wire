import type { Kind } from "../core/types";
export function Symbol({
  kind,
  closed = false,
  powered = false,
}: {
  kind: Kind;
  closed?: boolean;
  powered?: boolean;
}) {
  const circle = (label: string) => (
    <>
      <circle r="23" />
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
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
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
          <circle
            r="23"
            fill={powered ? "#fff0b3" : "none"}
            stroke={powered ? "#67532b" : "currentColor"}
          />
          <path
            d="M-16 -16L16 16M-16 16L16 -16"
            stroke={powered ? "#67532b" : "currentColor"}
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
      {kind === "motor" && circle("M")}
      {kind === "buzzer" && (
        <>
          <path d="M-24 -14H7L23 -25V25L7 14H-24Z M29 -16Q44 0 29 16" />
        </>
      )}
      {kind === "led" && (
        <>
          <path d="M-40 0H-16 M16 0H40 M-16 -17L15 0L-16 17Z M16 -18V18 M4 -27L17 -40 M14 -40H17V-37 M20 -18L33 -31 M30 -31H33V-28" />
        </>
      )}
    </g>
  );
}
