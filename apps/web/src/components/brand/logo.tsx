import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Marchio di CantiereOS: una "C" aperta che racchiude tre edifici in crescita, su una tessera verde
 * di vetro. Disegnato in SVG (nitido a ogni dimensione, colori dai token). Con `animated` la "C" si
 * traccia, gli edifici salgono uno dopo l'altro e un riflesso attraversa la tessera; al passaggio
 * del puntatore gli edifici rimbalzano. Le animazioni sono in globals.css (`.cos-logo`) e si fermano
 * con "riduci movimento".
 */
export function LogoMark({
  className,
  animated = false,
  title,
}: {
  className?: string;
  animated?: boolean;
  /** Testo per i lettori di schermo; senza titolo il marchio è decorativo. */
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("cos-logo", animated && "cos-logo-animated", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="1" y="1" width="38" height="38" rx="11" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${id}-tile)`} />
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${id}-sheen)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <g transform="rotate(18 20 20)">
          <rect
            className="cos-logo-sweep"
            x="-14"
            y="-6"
            width="12"
            height="52"
            fill={`url(#${id}-sweep)`}
          />
        </g>
      </g>
      <path
        className="cos-logo-arc"
        d="M28.5 12.2 A11 11 0 1 0 28.5 27.8"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        pathLength={100}
      />
      <rect
        className="cos-logo-bar"
        style={{ "--i": 0 } as React.CSSProperties}
        x="15.2"
        y="20.5"
        width="3"
        height="6"
        rx="1.2"
        fill="#fff"
      />
      <rect
        className="cos-logo-bar"
        style={{ "--i": 1 } as React.CSSProperties}
        x="19.7"
        y="17"
        width="3"
        height="9.5"
        rx="1.2"
        fill="#fff"
      />
      <rect
        className="cos-logo-bar"
        style={{ "--i": 2 } as React.CSSProperties}
        x="24.2"
        y="13.5"
        width="3"
        height="13"
        rx="1.2"
        fill="#d1fae5"
      />
    </svg>
  );
}

/** Marchio e nome insieme. "OS" prende il colore principale. */
export function Logo({
  className,
  animated = false,
  markClassName,
}: {
  className?: string;
  animated?: boolean;
  markClassName?: string;
}) {
  return (
    <span className={cn("cos-logo-lockup inline-flex items-center gap-2.5", className)}>
      <LogoMark animated={animated} className={cn("size-8 shrink-0", markClassName)} />
      <span className="font-semibold tracking-tight">
        Cantiere<span className="text-primary">OS</span>
      </span>
    </span>
  );
}
