import { describe, expect, it } from "vitest";
import { generateLayout, sceneEndpoint } from "./layout";
import { example, makePart, type Circuit } from "../core/types";
describe("automatic physical layout", () => {
  it("is deterministic and avoids equipment collisions", () => {
    const c: Circuit = {
      components: [
        makePart("cell", 200, 200),
        makePart("lamp", 200, 200),
        makePart("switch", 200, 200),
      ],
      wires: [],
      junctions: [],
    };
    const a = generateLayout(c),
      b = generateLayout(c);
    expect([...a]).toEqual([...b]);
    const pos = [...a.values()];
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        expect(
          Math.hypot(
            pos[i].position[0] - pos[j].position[0],
            pos[i].position[2] - pos[j].position[2],
          ),
        ).toBeGreaterThan(1.22);
  });
  it("preserves unrelated positions when adding or moving a component", () => {
    const c = example();
    const a = generateLayout(c),
      lamp = c.components[2];
    c.components.push(makePart("motor", lamp.x, lamp.y));
    const b = generateLayout(c, a);
    expect(b.get(lamp.id)).toEqual(a.get(lamp.id));
    c.components[0].x += 20;
    const d = generateLayout(c, b);
    expect(d.get(lamp.id)).toEqual(a.get(lamp.id));
  });
  it("keeps terminals attached to their actual displaced physical component", () => {
    const c = example();
    c.components[2].x = c.components[0].x;
    c.components[2].y = c.components[0].y;
    const layout = generateLayout(c);
    const lamp = c.components[2],
      pos = layout.get(lamp.id)!.position;
    const left = sceneEndpoint(
      c,
      { componentId: lamp.id, terminal: 0 },
      layout,
    );
    expect(left[0]).toBeCloseTo(pos[0] - 40 / 85, 8);
    expect(left[2]).toBeCloseTo(pos[2], 8);
  });
});
