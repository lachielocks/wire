import { renderToStaticMarkup } from "react-dom/server";
import { endpoint, pathD, wirePoints, type Project } from "./types";
import { Symbol } from "../editor/Symbol";
export function svgSource(p: Project, transparent = false, title = false) {
  const points = [
    ...p.components,
    ...p.junctions,
    ...p.wires.flatMap((w) => [
      endpoint(p, w.from),
      ...w.corners,
      endpoint(p, w.to),
    ]),
  ];
  // Crop to content, including rotated symbols and readable labels.
  const x = points.length ? Math.min(...points.map((p) => p.x)) - 75 : -75,
    y = points.length
      ? Math.min(...points.map((p) => p.y)) - 75 - (title ? 35 : 0)
      : -75,
    maxX = (points.length ? Math.max(...points.map((p) => p.x)) : 200) + 75,
    maxY = (points.length ? Math.max(...points.map((p) => p.y)) : 100) + 100;
  // Bound the raster size even for diagrams spread over a very large workspace.
  const scale = Math.min(
    2,
    8192 / (maxX - x),
    8192 / (maxY - y),
    Math.sqrt(16e6 / ((maxX - x) * (maxY - y))),
  );
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={Math.max(1, Math.round((maxX - x) * scale))}
      height={Math.max(1, Math.round((maxY - y) * scale))}
      viewBox={`${x} ${y} ${maxX - x} ${maxY - y}`}
      color="#293b32"
      style={{ fontFamily: "Arial,sans-serif" }}
    >
      {!transparent && (
        <rect x={x} y={y} width={maxX - x} height={maxY - y} fill="#fff" />
      )}
      {title && (
        <text x={x + 20} y={y + 30} fontSize="22" fill="#293b32">
          {p.name}
        </text>
      )}
      {p.wires.map((w) => (
        <path
          key={w.id}
          d={pathD(wirePoints(p, w))}
          fill="none"
          stroke="#293b32"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}
      {p.junctions.map((j) => (
        <circle key={j.id} cx={j.x} cy={j.y} r="4" fill="#293b32" />
      ))}
      {p.components.map((c) => (
        <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
          <g transform={`rotate(${c.rotation})`}>
            <rect
              x="-30"
              y="-30"
              width="60"
              height="60"
              fill={transparent ? "none" : "white"}
            />
            <Symbol kind={c.kind} closed={c.closed} />
          </g>
          <text textAnchor="middle" y="58" fontSize="12" fill="#293b32">
            {c.label}
          </text>
        </g>
      ))}
    </svg>,
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportDiagram(
  p: Project,
  type: "svg" | "png",
  title = false,
) {
  const text = svgSource(p, p.settings.transparent, title),
    blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
    name = p.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "circuit";
  if (type === "svg") {
    download(blob, `${name}.svg`);
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Unable to render this diagram."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PNG export is unavailable.");
    ctx.drawImage(img, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Unable to create a PNG."))),
        "image/png",
      ),
    );
    download(png, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportScene(p: Project) {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-testid="experiment-canvas"]',
  );
  if (!canvas) throw new Error("Open the 3D view before taking a screenshot.");
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) =>
      b ? resolve(b) : reject(new Error("Unable to capture the scene.")),
    ),
  );
  download(blob, `${p.name}-3D.png`);
}
