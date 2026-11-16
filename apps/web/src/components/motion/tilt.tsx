"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Inclinazione 3D che segue il puntatore (solo mouse/penna: su touch resta
 * piatta). Con "riduci movimento" attivo il CSS annulla la trasformazione.
 */
export function Tilt({
  children,
  className,
  max = 6,
}: {
  children: React.ReactNode;
  className?: string;
  /** inclinazione massima in gradi */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    });
  };
  const reset = () => {
    cancelAnimationFrame(frame.current);
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn("cos-tilt relative", className)}
    >
      {children}
      <span
        aria-hidden
        className="cos-shine pointer-events-none absolute inset-0 rounded-[inherit]"
      />
    </div>
  );
}
