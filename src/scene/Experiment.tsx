import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box, Crosshair, Maximize, RotateCcw } from "lucide-react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { useStore } from "../core/store";
import { outputLook } from "../core/output";
import {
  type Simulation,
  type Wire,
  endpoint,
  wirePoints,
} from "../core/types";
import { generateLayout, sceneEndpoint, world, type Layout } from "./layout";
import { PhysicalPart } from "./Models";
import { WoodenTable } from "./Wood";
function Cable({
  wire,
  index,
  layout,
}: {
  wire: Wire;
  index: number;
  layout: Layout;
}) {
  const circuit = useStore((s) => s.project);
  const curve = useMemo(() => {
    const anchors = wirePoints(circuit, wire).map((p, i, all) => {
      if (i === 0) return sceneEndpoint(circuit, wire.from, layout);
      if (i === all.length - 1) return sceneEndpoint(circuit, wire.to, layout);
      const q = world(p);
      return [q[0], 0.06, q[2]] as [number, number, number];
    });
    const vectors: THREE.Vector3[] = [];
    anchors.forEach((p, i) => {
      if (i) {
        const prev = anchors[i - 1];
        vectors.push(
          new THREE.Vector3(
            (p[0] + prev[0]) / 2,
            0.06 +
              Math.min(0.08, Math.hypot(p[0] - prev[0], p[2] - prev[2]) * 0.05),
            (p[2] + prev[2]) / 2,
          ),
        );
      }
      vectors.push(new THREE.Vector3(...p));
    });
    // Two coincident endpoints are still a valid electrical connection.
    if (vectors.every((p) => p.distanceTo(vectors[0]) < 0.001))
      vectors.push(vectors[0].clone().add(new THREE.Vector3(0, 0.1, 0.05)));
    return new THREE.CatmullRomCurve3(vectors, false, "centripetal");
  }, [circuit.components, circuit.junctions, wire, layout]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 64, 0.022, 8, false]} />
      <meshStandardMaterial
        color={
          index % 3 === 0 ? "#be5145" : index % 3 === 1 ? "#394741" : "#577786"
        }
        roughness={0.55}
      />
    </mesh>
  );
}
function Camera({ reset, layout }: { reset: number; layout: Layout }) {
  const controls = useRef<OrbitControlsType>(null),
    { camera, size } = useThree();
  const p = useStore((s) => s.project);
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const points = [...layout.values()].flatMap((p) =>
      [-0.6, 0.6].flatMap((x) =>
        [-0.5, 0.5].flatMap((z) =>
          [0, 1].map(
            (y) => new THREE.Vector3(p.position[0] + x, y, p.position[2] + z),
          ),
        ),
      ),
    );
    p.wires.forEach((w) =>
      [endpoint(p, w.from), ...w.corners, endpoint(p, w.to)].forEach((q) =>
        points.push(new THREE.Vector3(...world(q))),
      ),
    );
    const x = points.length
        ? (Math.min(...points.map((p) => p.x)) +
            Math.max(...points.map((p) => p.x))) /
          2
        : 0,
      z = points.length
        ? (Math.min(...points.map((p) => p.z)) +
            Math.max(...points.map((p) => p.z))) /
          2
        : 0;
    const center = new THREE.Vector3(x, 0.1, z),
      direction = new THREE.Vector3(0.9, 1.1, 1.35).normalize();
    const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), direction)
        .normalize(),
      up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan((38 * Math.PI) / 360),
      aspect = Math.max(0.1, size.width / size.height);
    const distance =
      Math.max(
        5,
        ...points.map((q) => {
          const d = q.clone().sub(center);
          return (
            d.dot(direction) +
            Math.max(
              Math.abs(d.dot(right)) / (tangent * aspect),
              Math.abs(d.dot(up)) / tangent,
            )
          );
        }),
      ) * 1.18;
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.current?.target.copy(center);
    controls.current?.update();
  }, [reset, p.id, p.components.length, size.width, size.height]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={45}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI / 2 - 0.07}
      enableDamping
      dampingFactor={0.1}
    />
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="webgl-fallback">
        <Box size={28} />
        <h3>3D is taking a break.</h3>
        <p>
          Your browser couldn’t start WebGL.
          <br />
          Your schematic and simulation still work.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Audio({ simulation }: { simulation: Simulation }) {
  const enabled = useStore((s) => s.project.settings.audio);
  const parts = useStore((s) => s.project.components);
  const active =
    enabled &&
    parts.some(
      (c) =>
        c.kind === "buzzer" &&
        Math.abs(simulation.readings[c.id]?.voltage ?? 0) >= 1 &&
        Math.abs(simulation.readings[c.id]?.current ?? 0) > 0.005,
    );
  useEffect(() => {
    if (!active) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 440;
    gain.gain.value = 0.025;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    void ctx.resume().catch(() => {});
    return () => {
      osc.stop();
      void ctx.close();
    };
  }, [active]);
  return null;
}
export function Experiment({
  simulation,
  hidden = false,
}: {
  simulation: Simulation;
  hidden?: boolean;
}) {
  const s = useStore(),
    [reset, setReset] = useState(0);
  const cache = useRef<Layout>(new Map());
  const projectId = useRef(s.project.id);
  const layout = useMemo(() => {
    if (projectId.current !== s.project.id) {
      cache.current = new Map();
      projectId.current = s.project.id;
    }
    cache.current = generateLayout(s.project, cache.current);
    return cache.current;
  }, [s.project.id, s.project.components]);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const effects = s.project.settings.effects && !reduceMotion;
  const liveMotion = s.project.components.some((c) => {
    const look = outputLook(c.kind, simulation.readings[c.id], {
      effects,
      reducedMotion: reduceMotion,
    });
    return look.spin !== 0 || look.pulse;
  });
  return (
    <div className={`experiment ${hidden ? "scene-hidden" : ""}`}>
      <Audio simulation={simulation} />
      <Boundary>
        <Suspense
          fallback={<div className="scene-loading">Setting the workbench…</div>}
        >
          <Canvas
            shadows
            dpr={[1, 1.7]}
            camera={{ position: [5, 6, 7], fov: 38 }}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              gl.domElement.dataset.testid = "experiment-canvas";
            }}
            frameloop={hidden ? "never" : liveMotion ? "always" : "demand"}
          >
            <color attach="background" args={["#ecece5"]} />
            <ambientLight intensity={1.3} />
            <hemisphereLight args={["#ffffff", "#a1a288", 1]} />
            <directionalLight
              position={[-3, 8, 4]}
              intensity={3}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-12}
              shadow-camera-right={12}
              shadow-camera-top={12}
              shadow-camera-bottom={-12}
              shadow-bias={-0.001}
            />
            <WoodenTable />

            {s.project.wires.map((w, i) => (
              <Cable key={w.id} wire={w} index={i} layout={layout} />
            ))}
            {s.project.junctions.map((j) => {
              const p = world(j);
              return (
                <mesh key={j.id} position={[p[0], 0.26, p[2]]}>
                  <sphereGeometry args={[0.055, 12, 8]} />
                  <meshStandardMaterial color="#b59d65" metalness={0.7} />
                </mesh>
              );
            })}
            {s.project.components.map((c) => (
              <PhysicalPart
                key={c.id}
                c={c}
                position={layout.get(c.id)!.position}
                reading={simulation.readings[c.id]}
                selected={s.selected.includes(c.id)}
                effects={effects}
                onSelect={() => s.select([c.id])}
                onToggle={() => s.update(c.id, { closed: !c.closed })}
              />
            ))}
            <Camera reset={reset + s.fit} layout={layout} />
          </Canvas>
        </Suspense>
      </Boundary>
      <div className="scene-badge">
        <span /> LIVE EXPERIMENT
      </div>
      <div className="scene-controls floating">
        <button
          title="Reset camera"
          aria-label="Reset camera"
          onClick={() => setReset((v) => v + 1)}
        >
          <RotateCcw size={16} />
        </button>
        <button
          title="Fit experiment"
          aria-label="Fit experiment"
          onClick={() => setReset((v) => v + 1)}
        >
          <Crosshair size={17} />
        </button>
        <button
          title="Expand 3D"
          aria-label="Expand 3D"
          onClick={() => s.setView(s.project.view === "3d" ? "split" : "3d")}
        >
          <Maximize size={16} />
        </button>
      </div>
      <div className="scene-caption">
        <span>From diagram to desktop.</span>
        <small>Orbit to explore · click a switch to try it</small>
      </div>
    </div>
  );
}
