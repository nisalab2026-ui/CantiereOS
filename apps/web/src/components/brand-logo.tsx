import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Marchio di CantiereOS: una gru stilizzata su tessera verde in vetro "liquid". Al primo disegno le linee
 * si tracciano da sole, poi il carico oscilla piano sul gancio (fermo con "riduci movimento").
 * Le animazioni sono in globals.css (.brand-mark).
 */
export function BrandMark({ className, still }: { className?: string; still?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      className={cn("brand-mark shrink-0", still && "brand-mark-still", className)}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}-bg)`} />
      <rect
        width="40"
        height="40"
        rx="11"
        fill={`url(#${id}-sheen)`}
        className="brand-mark-sheen"
      />
      <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path className="brand-mark-draw" pathLength={1} d="M9 30.5h22" />
        <path className="brand-mark-draw" pathLength={1} d="M13 30.5V9.5h15" />
        <path className="brand-mark-draw" pathLength={1} d="M13 14.5l5-5" />
        <path className="brand-mark-draw" pathLength={1} d="M26 30.5v-6.5h5v6.5" />
      </g>
      <g className="brand-mark-load">
        <path d="M24.5 9.5v6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="21.5" y="15.5" width="6" height="4.5" rx="1.2" fill="#fff" />
      </g>
    </svg>
  );
}

/** Marchio + logotipo "Cantiere" nel colore del testo e "OS" in verde. */
export function BrandLogo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("brand-logo inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("size-8", markClassName)} />
      <span className={cn("font-semibold tracking-tight", textClassName)}>
        Cantiere<span className="brand-logo-os">OS</span>
      </span>
    </span>
  );
}
