"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Tablet 3D costruito nel codice (nessun file .glb, nessun marchio): scocca in
 * alluminio, vetro nero, schermo con una schermata vera di CantiereOS.
 *
 * Il movimento non passa da React: a ogni fotogramma si legge quanto la
 * sezione ha attraversato lo schermo e si avvicinano rotazione, posizione e
 * scala al valore voluto (smorzamento esponenziale, indipendente dagli fps).
 * Fuori dallo schermo il disegno si ferma.
 *
 * Nomi delle mesh (come in un modello .glb, vedi docs/SITO_PUBBLICO.md):
 * "Body", "Glass", "Screen", "Camera".
 */
export const TABLET_SCREEN_SRC = "/site/tablet-panoramica.jpg";
/** Proporzioni della schermata (2388 × 1668, come un tablet da 11" in orizzontale). */
const SCREEN_RATIO = 2388 / 1668;

const W = 3.0;
const H = 2.14;
const R = 0.16;
const DEPTH = 0.05;
const BEVEL = 0.022;
const SCREEN_W = 2.82;
const SCREEN_H = SCREEN_W / SCREEN_RATIO;

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Allontana la camera quanto basta perché il tablet entri nel riquadro, a ogni misura. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    const byWidth = (W * 1.08) / 2 / (half * aspect);
    const byHeight = (H * 1.16) / 2 / half;
    cam.position.set(0, 0, Math.max(byWidth, byHeight));
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Tablet({
  track,
  onReady,
}: {
  track: React.RefObject<HTMLElement | null>;
  onReady: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const ready = useRef(false);
  const { gl } = useThree();
  const [screen, setScreen] = useState<THREE.Texture | null>(null);

  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedRect(W - BEVEL * 2, H - BEVEL * 2, R), {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 5,
      curveSegments: 24,
    });
    g.center();
    return g;
  }, []);
  const glass = useMemo(
    () => new THREE.ShapeGeometry(roundedRect(W - 0.05, H - 0.05, R - 0.02), 24),
    [],
  );
  const front = DEPTH / 2 + BEVEL;

  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(TABLET_SCREEN_SRC, (t) => {
      if (!alive) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = gl.capabilities.getMaxAnisotropy();
      setScreen(t);
    });
    return () => {
      alive = false;
    };
  }, [gl]);
  useEffect(() => () => screen?.dispose(), [screen]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame((_, dt) => {
    const g = group.current;
    const el = track.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 quando la figura entra dal basso, 1 quando ha raggiunto il terzo alto dello schermo
    const p = easeOut(clamp01((vh * 0.95 - r.top) / (vh * 0.7)));
    const px = pointer.current.x;
    const py = pointer.current.y;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    g.rotation.x += (mix(-0.62, -0.05, p) + py * 0.05 - g.rotation.x) * k;
    g.rotation.y += (mix(0.55, 0, p) + px * 0.1 - g.rotation.y) * k;
    g.rotation.z += (mix(-0.12, 0, p) - g.rotation.z) * k;
    g.position.y += (mix(-0.35, 0, p) - g.position.y) * k;
    const s = mix(0.84, 1, p);
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * k);
    if (screen && !ready.current) {
      ready.current = true;
      onReady();
    }
  });

  return (
    <group ref={group} rotation={[-0.62, 0.55, -0.12]} scale={0.84}>
      <mesh name="Body" geometry={body}>
        <meshPhysicalMaterial color="#c9cfd3" metalness={0.85} roughness={0.32} clearcoat={0.3} />
      </mesh>
      <mesh name="Glass" geometry={glass} position={[0, 0, front + 0.001]}>
        <meshPhysicalMaterial color="#07100b" roughness={0.12} metalness={0.1} clearcoat={1} />
      </mesh>
      {screen && (
        <mesh name="Screen" position={[0, 0, front + 0.003]}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      )}
      <mesh name="Camera" position={[W / 2 - 0.05, 0, front + 0.002]}>
        <circleGeometry args={[0.012, 16]} />
        <meshBasicMaterial color="#1d2a24" />
      </mesh>
    </group>
  );
}

export default function TabletCanvas({
  track,
  onReady,
}: {
  track: React.RefObject<HTMLElement | null>;
  onReady: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={host} className="absolute inset-0">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ fov: 28, position: [0, 0, 8], near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        aria-hidden
      >
        <Environment />
        <FitCamera />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <Tablet track={track} onReady={onReady} />
      </Canvas>
    </div>
  );
}
