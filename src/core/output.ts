import type { Kind, Reading } from "./types";

export type OutputLook = {
  on: boolean;
  level: number;
  overloaded: boolean;
  reverse: boolean;
  spin: number;
  pulse: boolean;
  animate: boolean;
};

export function buzzerOn(reading?: Reading) {
  return (
    Math.abs(reading?.voltage ?? 0) >= 1 &&
    Math.abs(reading?.current ?? 0) > 0.005
  );
}

export function outputLook(
  kind: Kind,
  reading?: Reading,
  options: { effects?: boolean; reducedMotion?: boolean } = {},
): OutputLook {
  const animate = (options.effects ?? true) && !options.reducedMotion;
  const off: OutputLook = {
    on: false,
    level: 0,
    overloaded: false,
    reverse: false,
    spin: 0,
    pulse: false,
    animate,
  };
  if (!reading) return off;
  if (kind === "lamp") {
    const level = reading.brightness;
    return {
      ...off,
      on: level > 0.02,
      level,
      overloaded: level > 1.3,
    };
  }
  if (kind === "led") {
    return {
      ...off,
      on: reading.current > 1e-6 && reading.brightness > 0.02,
      level: reading.brightness,
      overloaded: reading.current > 0.03,
      reverse: reading.voltage < -0.1 || reading.current < -1e-4,
    };
  }
  if (kind === "motor") {
    const current = reading.current,
      on = Math.abs(current) > 1e-6;
    return {
      ...off,
      on,
      level: Math.min(1, Math.abs(current) / 0.2),
      reverse: current < 0,
      spin: on && animate ? current : 0,
    };
  }
  if (kind === "buzzer") {
    const on = buzzerOn(reading);
    return {
      ...off,
      on,
      level: on ? 1 : 0,
      pulse: on && animate,
    };
  }
  return off;
}
