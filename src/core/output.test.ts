import { describe, expect, it } from "vitest";
import { example, makePart } from "./types";
import { solve } from "./solver";
import { buzzerOn, outputLook } from "./output";

const reading = (
  patch: Partial<{
    voltage: number;
    current: number;
    power: number;
    brightness: number;
  }>,
) => ({ voltage: 0, current: 0, power: 0, brightness: 0, ...patch });

describe("output appearance", () => {
  it("turns a bulb on from simulated power and marks overload", () => {
    const p = example();
    const lamp = p.components.find((c) => c.kind === "lamp")!;
    const on = outputLook("lamp", solve(p).readings[lamp.id]);
    expect(on.on).toBe(true);
    expect(on.level).toBeGreaterThan(0.9);
    expect(on.overloaded).toBe(false);
    p.components.find((c) => c.kind === "switch")!.closed = false;
    expect(outputLook("lamp", solve(p).readings[lamp.id]).on).toBe(false);
    expect(outputLook("lamp", reading({ brightness: 1.4 })).overloaded).toBe(
      true,
    );
    expect(outputLook("lamp", reading({ brightness: 0.01 })).on).toBe(false);
  });
  it("spins a motor with signed current and stays still without motion", () => {
    const forward = outputLook("motor", reading({ current: 0.15 }));
    expect(forward.on).toBe(true);
    expect(forward.spin).toBeCloseTo(0.15);
    expect(forward.reverse).toBe(false);
    const back = outputLook("motor", reading({ current: -0.1 }));
    expect(back.spin).toBeCloseTo(-0.1);
    expect(back.reverse).toBe(true);
    const still = outputLook("motor", reading({ current: 0.15 }), {
      reducedMotion: true,
    });
    expect(still.on).toBe(true);
    expect(still.spin).toBe(0);
    expect(still.animate).toBe(false);
    expect(outputLook("motor", reading({ current: 0 })).on).toBe(false);
  });
  it("lights an LED only when forward current is flowing", () => {
    const p = example();
    const led = makePart("led", 360, 380);
    const lamp = p.components.find((c) => c.kind === "lamp")!;
    led.x = lamp.x;
    led.y = lamp.y;
    p.components = p.components.filter((c) => c.id !== lamp.id);
    p.components.push(led);
    p.wires.forEach((w) => {
      if ("componentId" in w.from && w.from.componentId === lamp.id)
        w.from.componentId = led.id;
      if ("componentId" in w.to && w.to.componentId === lamp.id)
        w.to.componentId = led.id;
    });
    // 1.5 V cell is below the 2 V forward drop, so the LED stays off.
    expect(outputLook("led", solve(p).readings[led.id]).on).toBe(false);
    expect(
      outputLook("led", reading({ current: 0.01, brightness: 0.5, voltage: 2 }))
        .on,
    ).toBe(true);
    expect(
      outputLook(
        "led",
        reading({ current: -0.001, voltage: -1, brightness: 0 }),
      ).on,
    ).toBe(false);
    expect(
      outputLook(
        "led",
        reading({ current: -0.001, voltage: -1, brightness: 0 }),
      ).reverse,
    ).toBe(true);
  });
  it("pulses a buzzer only when it is electrically active", () => {
    expect(buzzerOn(reading({ voltage: 1.2, current: 0.01 }))).toBe(true);
    expect(buzzerOn(reading({ voltage: 0.5, current: 0.01 }))).toBe(false);
    const pulse = outputLook(
      "buzzer",
      reading({ voltage: 1.2, current: 0.01 }),
    );
    expect(pulse.on).toBe(true);
    expect(pulse.pulse).toBe(true);
    const staticOn = outputLook(
      "buzzer",
      reading({ voltage: 1.2, current: 0.01 }),
      { effects: false },
    );
    expect(staticOn.on).toBe(true);
    expect(staticOn.pulse).toBe(false);
  });
});
