import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { Reading } from "../core/types";

const sparks = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

export function Overload({
  fault,
  height,
  animate,
}: {
  fault: NonNullable<Reading["fault"]>;
  height: number;
  animate: boolean;
}) {
  const flames = useRef<Group>(null);
  const particles = useRef<Group>(null);
  const smoke = useRef<Mesh>(null);
  const age = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    age.current = 0;
    if (animate) invalidate();
  }, [fault, animate, invalidate]);
  useFrame((_, delta) => {
    if (!animate) return;
    const time = (age.current += Math.min(delta, 0.05));
    if (flames.current) {
      flames.current.scale.y = 0.92 + Math.sin(time * 18) * 0.12;
      flames.current.rotation.z = Math.sin(time * 11) * 0.12;
    }
    if (smoke.current) {
      const drift = (time * 0.85) % 1;
      smoke.current.position.set(0.18 + drift * 0.3, 0.22 + drift * 0.62, 0);
      smoke.current.scale.setScalar(0.5 + drift * 1.35);
      (smoke.current.material as MeshBasicMaterial).opacity =
        0.26 * (1 - drift);
    }
    if (particles.current) {
      particles.current.visible = time < 0.7;
      particles.current.children.forEach((spark, i) => {
        const angle = sparks[i];
        const distance = 0.14 + time * (1.05 + (i % 3) * 0.22);
        spark.position.set(
          Math.cos(angle) * distance,
          0.08 + time * (1.55 + (i % 2) * 0.58) - time ** 2,
          Math.sin(angle) * distance,
        );
        spark.scale.setScalar(Math.max(0, 1 - time / 0.7));
      });
    }
    if (fault !== "fuse" || time < 0.7) invalidate();
  });
  return (
    <group position={[0, height, 0]} raycast={() => null}>
      {fault !== "fuse" && (
        <>
          <group ref={flames}>
            <mesh position={[-0.075, 0.12, 0]} rotation={[0, 0, 0.24]}>
              <coneGeometry args={[0.155, 0.36, 12]} />
              <meshBasicMaterial color="#fb632e" />
            </mesh>
            <mesh position={[0.1, 0.17, 0]} rotation={[0, 0, -0.19]}>
              <coneGeometry args={[0.15, 0.48, 12]} />
              <meshBasicMaterial color="#ed4028" />
            </mesh>
            <mesh position={[0.025, 0.045, 0.085]}>
              <coneGeometry args={[0.115, 0.27, 12]} />
              <meshBasicMaterial color="#ffd27a" />
            </mesh>
          </group>
          {animate && (
            <mesh ref={smoke}>
              <sphereGeometry args={[0.16, 12, 8]} />
              <meshBasicMaterial
                color="#56514a"
                opacity={0}
                transparent
                depthWrite={false}
              />
            </mesh>
          )}
        </>
      )}
      {animate && fault !== "overheat" && (
        <group ref={particles}>
          {sparks.map((angle, i) => (
            <mesh key={angle} rotation={[0, angle, 0.65]}>
              <octahedronGeometry args={[0.043, 0]} />
              <meshBasicMaterial color={i % 2 ? "#ff9741" : "#ffe49d"} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
