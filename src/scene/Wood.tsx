import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
/** A tiny deterministic grain texture, generated locally; no downloaded assets. */
export function WoodenTable() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(512, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 512; x++) {
        const grain =
          Math.sin(y * 0.65 + Math.sin(x * 0.015 + y * 0.012) * 2) +
          0.45 * Math.sin(y * 2.4 + x * 0.004) +
          0.16 * Math.sin(x * 1.71 + y * 13.9);
        const n = (y * 512 + x) * 4;
        img.data[n] = 220 + grain * 2.4;
        img.data[n + 1] = 202 + grain * 2.8;
        img.data[n + 2] = 170 + grain * 3.4;
        img.data[n + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(22, 22);
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <RoundedBox
      args={[200, 0.22, 200]}
      radius={0.07}
      position={[0, -0.1, 0]}
      receiveShadow
    >
      <meshStandardMaterial map={texture} roughness={0.8} />
    </RoundedBox>
  );
}
