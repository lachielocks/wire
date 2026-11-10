import { describe, expect, it } from "vitest";
import { svgSource } from "./export";
import { example } from "./types";
describe("schematic export", () => {
  it("exports clean, standalone SVG with circuit symbols and no editor handles", () => {
    const p = example("parallel"),
      svg = svgSource(p);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("Bulb 2");
    expect(svg).toContain('stroke="#293b32"');
    expect(svg).not.toContain("part-selection");
    expect(svg).not.toContain("terminal");
    expect(svg).not.toContain("data-testid");
  });
  it("supports transparency and escapes the optional project title", () => {
    const p = example();
    p.name = "<script>alert(1)</script>";
    const svg = svgSource(p, true, true);
    expect(svg).not.toContain('fill="#fff"');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});

describe("export bounds", () => {
  it("crops content that is entirely in negative coordinates", () => {
    const p = example();
    p.components.forEach((c) => {
      c.x -= 2000;
      c.y -= 2000;
    });
    p.wires.forEach((w) =>
      w.corners.forEach((c) => {
        c.x -= 2000;
        c.y -= 2000;
      }),
    );
    const text = svgSource(p);
    expect(text).toContain('viewBox="-1915 -1915 550 395"');
  });
});
