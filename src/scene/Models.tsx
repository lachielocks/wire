import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { outputLook } from "../core/output";
import { format, type Part, type Reading } from "../core/types";
import { useStore } from "../core/store";
const metal = "#a9b0b2",
  dark = "#323a39";
function Cylinder({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  radius = 0.12,
  height = 0.2,
  color = metal,
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
  radius?: number;
  height?: number;
  color?: string;
}) {
  return (
    <mesh castShadow position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, height, 24]} />
      <meshStandardMaterial color={color} metalness={0.65} roughness={0.3} />
    </mesh>
  );
}
function Base({ color = "#e8e4d7" }: { color?: string }) {
  return (
    <RoundedBox
      args={[1.08, 0.14, 0.65]}
      radius={0.06}
      position={[0, 0.03, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.65} />
    </RoundedBox>
  );
}
function Posts() {
  return (
    <>
      {[-0.47, 0.47].map((x, i) => (
        <group key={x}>
          <Cylinder position={[x, 0.16, 0]} radius={0.065} height={0.17} />
          <Cylinder
            position={[x, 0.25, 0]}
            radius={0.08}
            height={0.07}
            color={i ? "#393d3c" : "#ba5144"}
          />
        </group>
      ))}
    </>
  );
}
function Lamp({
  brightness,
  overloaded = false,
}: {
  brightness: number;
  overloaded?: boolean;
}) {
  const on = brightness > 0.02 && !overloaded;
  return (
    <>
      <Base color="#e8e0cb" />
      <Posts />
      <Cylinder
        position={[0, 0.15, 0]}
        radius={0.22}
        height={0.18}
        color="#66685e"
      />
      <Cylinder position={[0, 0.28, 0]} radius={0.14} height={0.18} />
      <mesh position={[0, 0.56, 0]} castShadow>
        <sphereGeometry args={[0.25, 28, 20]} />
        <meshPhysicalMaterial
          color={overloaded ? "#c8bca8" : on ? "#ffe6a2" : "#e3eceb"}
          transparent
          opacity={
            overloaded ? 0.5 : on ? 0.45 + 0.3 * Math.min(1, brightness) : 0.3
          }
          roughness={overloaded ? 0.55 : 0.12}
          metalness={0.05}
          transmission={overloaded ? 0.05 : 0.2}
          thickness={0.03}
        />
      </mesh>
      <mesh position={[0, 0.51, 0]}>
        <torusGeometry args={[0.075, 0.015, 8, 24, Math.PI * 1.6]} />
        <meshStandardMaterial
          color={overloaded ? "#5c5348" : "#af8758"}
          emissive={overloaded ? "#000000" : "#ffbc50"}
          emissiveIntensity={on ? brightness * 5 : 0}
        />
      </mesh>
      <Cylinder position={[-0.06, 0.38, 0]} radius={0.008} height={0.23} />
      <Cylinder position={[0.06, 0.38, 0]} radius={0.008} height={0.23} />
      {on && (
        <pointLight
          position={[0, 0.65, 0]}
          color="#ffbe63"
          intensity={brightness * 1.3}
          distance={3}
          decay={2}
        />
      )}
    </>
  );
}
function Cell({ battery = false }: { battery?: boolean }) {
  return (
    <>
      <Base color="#353c37" />
      {(battery ? [-0.16, 0.16] : [0]).map((z) => (
        <group key={z} position={[0, 0.25, z]}>
          <Cylinder
            rotation={[0, 0, Math.PI / 2]}
            radius={0.17}
            height={0.74}
            color="#b98e54"
          />
          <Cylinder
            position={[-0.27, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            radius={0.173}
            height={0.19}
            color="#303d35"
          />
          <Cylinder
            position={[-0.4, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            radius={0.07}
            height={0.07}
          />
          <mesh
            position={[0, 0.172, 0.01]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          >
            <planeGeometry args={[0.08, 0.3]} />
            <meshStandardMaterial color="#e4d3a9" />
          </mesh>
        </group>
      ))}
      <Posts />
    </>
  );
}
function Switch({ closed, effects }: { closed: boolean; effects: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [closed, effects, invalidate]);
  const lever = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (lever.current) {
      lever.current.rotation.z = THREE.MathUtils.damp(
        lever.current.rotation.z,
        closed ? 0 : 0.65,
        effects ? 12 : 1000,
        d,
      );
      if (Math.abs(lever.current.rotation.z - (closed ? 0 : 0.65)) > 0.001)
        invalidate();
    }
  });
  return (
    <>
      <Base color="#d8bb82" />
      <Posts />
      <Cylinder position={[-0.3, 0.2, 0]} radius={0.08} height={0.18} />
      <Cylinder position={[0.3, 0.17, 0]} radius={0.08} height={0.13} />
      <group ref={lever} position={[-0.3, 0.26, 0]}>
        <RoundedBox
          args={[0.64, 0.045, 0.13]}
          radius={0.02}
          position={[0.29, 0, 0]}
          castShadow
        >
          <meshStandardMaterial
            color="#c4b690"
            metalness={0.85}
            roughness={0.25}
          />
        </RoundedBox>
        <mesh position={[0.28, 0.055, 0]}>
          <boxGeometry args={[0.22, 0.1, 0.14]} />
          <meshStandardMaterial color="#333b35" />
        </mesh>
      </group>
    </>
  );
}
function Resistor({
  variable = false,
  resistance,
}: {
  variable?: boolean;
  resistance: number;
}) {
  const colours = [
    "#242725",
    "#8c5540",
    "#c34a3d",
    "#df8f32",
    "#dfbd43",
    "#547853",
    "#5166a2",
    "#895c92",
    "#81817e",
    "#ebe5d7",
  ];
  let exponent = Math.floor(Math.log10(resistance)) - 1;
  let digits = Math.round(resistance / 10 ** exponent);
  if (digits >= 100) {
    digits = 10;
    exponent++;
  }
  const bands =
    resistance >= 0.1 && exponent <= 9
      ? [
          colours[Math.floor(digits / 10)],
          colours[digits % 10],
          exponent === -1
            ? "#c5a156"
            : exponent === -2
              ? "#a9b0b2"
              : colours[exponent],
          "#c5a156",
        ]
      : ["#aaa18b", "#aaa18b", "#aaa18b", "#aaa18b"];
  return (
    <>
      <Base color="#e5dfce" />
      <Posts />
      <Cylinder
        rotation={[0, 0, Math.PI / 2]}
        position={[0, 0.23, 0]}
        radius={0.105}
        height={0.57}
        color="#cbb895"
      />
      {[-0.18, -0.1, 0.02, 0.18].map((x, i) => (
        <Cylinder
          key={x}
          rotation={[0, 0, Math.PI / 2]}
          position={[x, 0.23, 0]}
          radius={0.108}
          height={0.038}
          color={bands[i]}
        />
      ))}
      {variable && (
        <Cylinder
          position={[0, 0.41, 0]}
          radius={0.12}
          height={0.2}
          color={dark}
        />
      )}
    </>
  );
}
function Motor({ current, effects }: { current: number; effects: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [current, effects, invalidate]);
  const fan = useRef<THREE.Group>(null);
  const running = Math.abs(current) > 1e-6;
  useFrame((_, d) => {
    if (!fan.current) return;
    if (effects && running) {
      fan.current.rotation.y +=
        Math.min(35, Math.abs(current) * 100) *
        Math.min(d, 0.1) *
        Math.sign(current);
      invalidate();
    } else if (running) {
      fan.current.rotation.y = Math.sign(current) * 0.45;
    }
  });
  return (
    <>
      <Base />
      <Posts />
      <Cylinder
        position={[0, 0.3, 0]}
        radius={0.24}
        height={0.4}
        color={running ? "#b7cfc8" : "#9badaa"}
      />
      <Cylinder position={[0, 0.6, 0]} radius={0.035} height={0.25} />
      <group position={[0, 0.74, 0]} ref={fan}>
        {[0, Math.PI / 2].map((a) => (
          <RoundedBox
            key={a}
            args={[0.8, 0.025, 0.14]}
            radius={0.04}
            rotation={[0, a, 0]}
            castShadow
          >
            <meshStandardMaterial color="#df9c5e" />
          </RoundedBox>
        ))}
      </group>
    </>
  );
}
function LED({ c, brightness }: { c: Part; brightness: number }) {
  return (
    <>
      <Base />
      <Posts />
      {[-0.07, 0.07].map((x) => (
        <Cylinder
          key={x}
          position={[x, 0.28, 0]}
          radius={0.013}
          height={0.35}
        />
      ))}
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.14, 0.15, 8, 20]} />
        <meshPhysicalMaterial
          color={c.color}
          emissive={c.color}
          emissiveIntensity={brightness * 2}
          transparent
          opacity={0.85}
          roughness={0.2}
        />
      </mesh>
      {brightness > 0.02 && (
        <pointLight
          color={c.color}
          position={[0, 0.6, 0]}
          intensity={brightness * 0.6}
          distance={2}
        />
      )}
    </>
  );
}
function Buzzer({ on, pulse }: { on: boolean; pulse: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const cap = useRef<THREE.Group>(null);
  useEffect(() => invalidate(), [on, pulse, invalidate]);
  useFrame((state) => {
    if (!cap.current) return;
    cap.current.scale.setScalar(
      pulse ? 1 + Math.sin(state.clock.elapsedTime * 20) * 0.08 : 1,
    );
    if (pulse) invalidate();
  });
  return (
    <>
      <Base />
      <Posts />
      <group ref={cap}>
        <Cylinder
          position={[0, 0.28, 0]}
          radius={0.24}
          height={0.32}
          color={on ? "#2f4a3c" : "#323a39"}
        />
        {[-0.12, 0, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.45, 0]}>
            <boxGeometry args={[0.035, 0.01, 0.25]} />
            <meshStandardMaterial
              color="#121915"
              emissive={on ? "#63af79" : "#000000"}
              emissiveIntensity={on ? (pulse ? 1.2 : 0.7) : 0}
            />
          </mesh>
        ))}
      </group>
      {on && (
        <pointLight
          position={[0, 0.55, 0]}
          color="#63af79"
          intensity={pulse ? 0.35 : 0.18}
          distance={1.6}
        />
      )}
    </>
  );
}
function Meter({ value, unit }: { value: string; unit: string }) {
  const display = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c5d2b0";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#283f2b";
    ctx.font = "bold 80px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, 256, 106, 470);
    ctx.font = "38px monospace";
    ctx.fillText(unit, 256, 195);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [value, unit]);
  useEffect(() => () => display.dispose(), [display]);
  return (
    <>
      <Base color="#344c42" />
      <Posts />
      <RoundedBox
        args={[0.65, 0.36, 0.5]}
        radius={0.06}
        position={[0, 0.26, 0]}
        castShadow
      >
        <meshStandardMaterial color="#e4d3a2" roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0.448, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.51, 0.29]} />
        <meshStandardMaterial map={display} />
      </mesh>
    </>
  );
}
export function PhysicalPart({
  c,
  reading,
  selected,
  effects,
  onSelect,
  onToggle,
  position,
}: {
  position: [number, number, number];
  c: Part;
  reading?: Reading;
  selected: boolean;
  effects: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const invalidate = useThree((s) => s.invalidate);
  const update = useStore((s) => s.update);
  const group = useRef<THREE.Group>(null);
  const rot = (c.rotation * Math.PI) / 180;
  useFrame((_, d) => {
    if (group.current) {
      group.current.scale.setScalar(
        effects ? THREE.MathUtils.damp(group.current.scale.x, 1, 12, d) : 1,
      );
      if (effects && group.current.scale.x < 0.999) invalidate();
    }
  });
  const initial = useMemo(() => (effects ? 0.04 : 1), []);
  return (
    <group position={position} rotation={[0, -rot, 0]}>
      <group
        ref={group}
        scale={initial}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
          if (c.kind === "push" && c.closed)
            update(c.id, { closed: false }, false);
        }}
        onPointerDown={(e) => {
          if (c.kind === "push") {
            e.stopPropagation();
            update(c.id, { closed: true }, false);
          }
        }}
        onPointerUp={(e) => {
          if (c.kind === "push") {
            e.stopPropagation();
            update(c.id, { closed: false }, false);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          if (c.kind === "switch") onToggle();
        }}
      >
        {c.kind === "cell" || c.kind === "battery" ? (
          <Cell battery={c.kind === "battery"} />
        ) : c.kind === "lamp" ? (
          <Lamp
            brightness={reading?.brightness ?? 0}
            overloaded={(reading?.brightness ?? 0) > 1.3}
          />
        ) : c.kind === "switch" || c.kind === "push" ? (
          <Switch closed={c.closed} effects={effects} />
        ) : c.kind === "resistor" || c.kind === "variable" ? (
          <Resistor
            variable={c.kind === "variable"}
            resistance={c.resistance}
          />
        ) : c.kind === "motor" ? (
          <Motor current={reading?.current ?? 0} effects={effects} />
        ) : c.kind === "led" ? (
          <LED c={c} brightness={reading?.brightness ?? 0} />
        ) : c.kind === "buzzer" ? (
          <Buzzer
            on={outputLook("buzzer", reading).on}
            pulse={outputLook("buzzer", reading, { effects }).pulse}
          />
        ) : c.kind === "ammeter" || c.kind === "voltmeter" ? (
          <Meter
            value={
              c.kind === "ammeter"
                ? (Math.abs(reading?.current ?? 0) * 1000).toFixed(1)
                : Math.abs(reading?.voltage ?? 0).toFixed(2)
            }
            unit={c.kind === "ammeter" ? "mA" : "V"}
          />
        ) : (
          <>
            <Base />
            <Posts />
            <Cylinder
              position={[0, 0.25, 0]}
              radius={0.24}
              height={0.32}
              color={dark}
            />
            {[-0.12, 0, 0.12].map((x) => (
              <mesh key={x} position={[x, 0.415, 0]}>
                <boxGeometry args={[0.035, 0.01, 0.25]} />
                <meshStandardMaterial color="#121915" />
              </mesh>
            ))}
          </>
        )}
        {(selected || hover) && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.033, 0]}>
            <ringGeometry args={[0.65, 0.67, 48]} />
            <meshBasicMaterial color="#438c6b" transparent opacity={0.8} />
          </mesh>
        )}
      </group>
      <Html
        position={[0, -0.02, 0.63]}
        center
        distanceFactor={9}
        zIndexRange={[2, 0]}
        style={{ pointerEvents: c.kind === "switch" ? "auto" : "none" }}
      >
        {c.kind === "switch" ? (
          <button
            className={`physical-label physical-switch ${selected ? "selected" : ""}`}
            aria-label={`Toggle physical ${c.label}`}
            aria-pressed={c.closed}
            onClick={() => {
              onSelect();
              onToggle();
            }}
          >
            {c.label}
            {["resistor", "variable"].includes(c.kind) && (
              <small>{format(c.resistance, "Ω")}</small>
            )}
            <small>{c.closed ? "closed" : "open"}</small>
          </button>
        ) : (
          <span className={`physical-label ${selected ? "selected" : ""}`}>
            {c.label}
            {c.kind === "push" && <small>{c.closed ? "closed" : "open"}</small>}
          </span>
        )}
      </Html>
    </group>
  );
}
