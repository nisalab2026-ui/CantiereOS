import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import type { TradeIcon } from "@/app/(marketing)/trades-content";
import { cn } from "@/lib/cn";

/**
 * Illustrazioni originali dei mestieri (SVG disegnato a mano, nessuna immagine di terzi).
 * Si muovono con lo scorrimento: il contenitore con `data-progress` dà `--vp` (0 → 1 mentre la sezione
 * attraversa lo schermo); `.trade-scene` ne ricava `--t`, l'ingresso (0 → 1 nella prima metà).
 * Senza motore (niente JavaScript o "riduci movimento") `--vp` vale 1: si vede la scena completa.
 */

const C = {
  ink: "#0f2a1d",
  deep: "#15803d",
  mid: "#22c55e",
  teal: "#0d9488",
  soft: "#86efac",
  pale: "#dcfce7",
  mist: "#f0fdf4",
  line: "#bbe5c8",
  white: "#ffffff",
};

/** Entrata a gradini: 0 → 1 con ritardo `delay` (frazione di --t). */
const step = (delay: number, speed = 1.8) => `clamp(0, calc(var(--t) * ${speed} - ${delay}), 1)`;
const rise = (delay: number, dist = 26): CSSProperties => ({
  transform: `translateY(calc((1 - ${step(delay)}) * ${dist}px))`,
  opacity: step(delay),
});
const slideX = (delay: number, dist = -40): CSSProperties => ({
  transform: `translateX(calc((1 - ${step(delay)}) * ${dist}px))`,
  opacity: step(delay),
});
const pop = (delay: number): CSSProperties => ({
  transform: `scale(${step(delay)})`,
  transformBox: "fill-box",
  transformOrigin: "center",
});
const draw = (delay = 0): CSSProperties => ({
  strokeDasharray: 1,
  strokeDashoffset: `calc(1 - ${step(delay, 1.5)})`,
});
/** Rotazione continua legata allo scorrimento di tutta la sezione. */
const spin = (deg: number, from = 0): CSSProperties => ({
  transform: `rotate(calc(${from}deg + var(--vp, 1) * ${deg}deg))`,
  transformBox: "fill-box",
  transformOrigin: "center",
});

function gearPath(cx: number, cy: number, r: number, teeth: number) {
  const inner = r * 0.8;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI / teeth) * 0.55;
    for (const [ang, rad] of [
      [a - w * 1.4, inner],
      [a - w * 0.7, r],
      [a + w * 0.7, r],
      [a + w * 1.4, inner],
    ] as const) {
      pts.push(`${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`);
    }
  }
  return `M${pts.join("L")}Z`;
}

function Frame({ children, label }: { children: ReactNode; label: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label={label} className="block h-auto w-full">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.white} />
          <stop offset="1" stopColor={C.pale} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.75" cy="0.2" r="0.6">
          <stop offset="0" stopColor={C.soft} stopOpacity="0.55" />
          <stop offset="1" stopColor={C.soft} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={C.line} strokeWidth="0.5" opacity="0.5" />
        </pattern>
      </defs>
      <rect width="320" height="240" fill={`url(#${id}-bg)`} />
      <rect width="320" height="240" fill={`url(#${id}-grid)`} />
      <rect width="320" height="240" fill={`url(#${id}-glow)`} />
      <ellipse cx="160" cy="214" rx="130" ry="10" fill={C.deep} opacity="0.08" />
      <line x1="20" y1="206" x2="300" y2="206" stroke={C.line} strokeWidth="1.5" />
      {children}
    </svg>
  );
}

function Edili() {
  return (
    <Frame label="Illustrazione: un edificio in costruzione con la gru">
      {/* piani che salgono uno sull'altro */}
      {[0, 1, 2, 3].map((f) => (
        <g key={f} style={rise(f * 0.22, 40)}>
          <rect
            x="62"
            y={170 - f * 34}
            width="120"
            height="34"
            fill={f % 2 ? C.white : C.mist}
            stroke={C.deep}
            strokeWidth="1.5"
          />
          {[0, 1, 2, 3].map((w) => (
            <rect
              key={w}
              x={72 + w * 27}
              y={179 - f * 34}
              width="16"
              height="15"
              rx="2"
              fill={f === 3 ? C.pale : C.soft}
              opacity={f === 3 ? 0.6 : 0.9}
            />
          ))}
        </g>
      ))}
      {/* ponteggio che si disegna */}
      <g fill="none" stroke={C.teal} strokeWidth="1.5" strokeLinecap="round">
        <path
          pathLength={1}
          style={draw(0.2)}
          d="M188 206V70M206 206V70M188 172H206M188 138H206M188 104H206M188 70H206"
        />
        <path
          pathLength={1}
          style={draw(0.5)}
          d="M188 172L206 138M188 138L206 104M188 104L206 70"
          opacity="0.6"
        />
      </g>
      {/* gru: il carrello e il carico si spostano con lo scorrimento */}
      <rect x="250" y="40" width="8" height="166" fill={C.deep} />
      <path
        d="M250 50L258 60M258 70L250 80M250 90L258 100M258 110L250 120M250 130L258 140M258 150L250 160M250 170L258 180"
        stroke={C.white}
        strokeWidth="1.2"
      />
      <rect x="120" y="36" width="190" height="7" rx="2" fill={C.deep} />
      <rect x="282" y="43" width="22" height="12" rx="2" fill={C.ink} />
      <path
        d="M254 18L254 36M254 18L130 38M254 18L300 38"
        stroke={C.deep}
        strokeWidth="1.5"
        fill="none"
      />
      <g style={{ transform: "translateX(calc((1 - var(--vp, 1)) * 90px))" }}>
        <rect x="150" y="43" width="14" height="6" rx="1.5" fill={C.ink} />
        <line x1="157" y1="49" x2="157" y2="88" stroke={C.ink} strokeWidth="1.2" />
        <rect x="136" y="88" width="42" height="9" rx="2" fill={C.mid} />
      </g>
    </Frame>
  );
}

function Elettrici() {
  return (
    <Frame label="Illustrazione: un quadro elettrico con interruttori e contatore">
      <g style={rise(0, 30)}>
        <rect
          x="52"
          y="44"
          width="124"
          height="158"
          rx="10"
          fill={C.white}
          stroke={C.deep}
          strokeWidth="2"
        />
        <rect x="64" y="56" width="100" height="18" rx="4" fill={C.pale} />
        <path d="M118 58l-8 8h6l-4 7 10-10h-6l4-5z" fill={C.deep} />
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => {
            const i = row * 4 + col;
            return (
              <g key={i}>
                <rect
                  x={66 + col * 24}
                  y={86 + row * 36}
                  width="18"
                  height="28"
                  rx="3"
                  fill={C.mist}
                  stroke={C.line}
                />
                <rect
                  x={70 + col * 24}
                  y={90 + row * 36}
                  width="10"
                  height="20"
                  rx="2"
                  fill={C.line}
                />
                {/* levette che si alzano una dopo l'altra */}
                <rect
                  x={70 + col * 24}
                  y={90 + row * 36}
                  width="10"
                  height="10"
                  rx="2"
                  fill={C.mid}
                  style={{ ...rise(0.25 + i * 0.06, 10) }}
                />
              </g>
            );
          }),
        )}
      </g>
      {/* cavo che si accende fino alla lampadina */}
      <path
        pathLength={1}
        style={draw(0.3)}
        d="M176 120C210 120 206 70 240 70"
        fill="none"
        stroke={C.mid}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="256" cy="66" r="30" fill={C.soft} style={{ opacity: step(0.8) }} />
      <path
        d="M244 66a12 12 0 1 1 24 0c0 6-4 8-5 13h-14c-1-5-5-7-5-13z"
        fill={C.white}
        stroke={C.deep}
        strokeWidth="2"
      />
      <rect x="250" y="80" width="12" height="7" rx="2" fill={C.deep} />
      {/* contatore: la lancetta gira con lo scorrimento */}
      <circle cx="254" cy="160" r="30" fill={C.white} stroke={C.deep} strokeWidth="2" />
      <path
        d="M232 160a22 22 0 0 1 44 0"
        fill="none"
        stroke={C.line}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        pathLength={1}
        style={draw(0.4)}
        d="M232 160a22 22 0 0 1 44 0"
        fill="none"
        stroke={C.mid}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line
        x1="254"
        y1="160"
        x2="254"
        y2="140"
        stroke={C.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{
          transform: "rotate(calc(-70deg + var(--vp, 1) * 140deg))",
          transformOrigin: "254px 160px",
        }}
      />
      <circle cx="254" cy="160" r="4" fill={C.ink} />
    </Frame>
  );
}

function Idraulici() {
  return (
    <Frame label="Illustrazione: una caldaia collegata a un termosifone">
      <g style={rise(0, 30)}>
        <rect
          x="46"
          y="34"
          width="92"
          height="128"
          rx="12"
          fill={C.white}
          stroke={C.deep}
          strokeWidth="2"
        />
        <rect x="60" y="48" width="64" height="26" rx="5" fill={C.ink} />
        <text
          x="92"
          y="66"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill={C.soft}
          fontFamily="ui-monospace, monospace"
        >
          21°
        </text>
        <path
          d="M92 92c8 9 12 16 12 23a12 12 0 0 1-24 0c0-5 3-9 6-12 1 5 3 7 6 7-2-6-1-12 0-18z"
          fill={C.mid}
          style={pop(0.3)}
        />
        <circle cx="72" cy="146" r="6" fill={C.pale} stroke={C.deep} />
        <circle cx="112" cy="146" r="6" fill={C.pale} stroke={C.deep} />
      </g>
      {/* tubi che si disegnano, poi l'acqua scorre */}
      <path
        pathLength={1}
        style={draw(0.25)}
        d="M72 162V186H196V176"
        fill="none"
        stroke={C.deep}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        pathLength={1}
        style={draw(0.35)}
        d="M112 162V176H180V168"
        fill="none"
        stroke={C.teal}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="trade-flow"
        d="M72 162V186H196V176"
        fill="none"
        stroke={C.white}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: step(0.8) }}
      />
      {/* termosifone */}
      <g style={slideX(0.3, 40)}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={180 + i * 18}
            y="108"
            width="14"
            height="70"
            rx="7"
            fill={C.white}
            stroke={C.deep}
            strokeWidth="1.8"
          />
        ))}
        <rect x="176" y="112" width="112" height="6" rx="3" fill={C.pale} />
      </g>
      {/* onde di calore */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${200 + i * 30} 96c-6-6 6-10 0-16s6-10 0-16`}
          fill="none"
          stroke={C.mid}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            opacity: step(0.7 + i * 0.1),
            transform: `translateY(calc((1 - var(--vp, 1)) * ${12 + i * 6}px))`,
          }}
        />
      ))}
      {/* rubinetto con gocce */}
      <path d="M150 22h26v10h-8v10h-10V32h-8z" fill={C.deep} />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          className="trade-drop"
          d="M163 48c3 4 5 7 5 9a5 5 0 0 1-10 0c0-2 2-5 5-9z"
          fill={C.teal}
          style={{ animationDelay: `${i * 0.6}s` }}
        />
      ))}
    </Frame>
  );
}

function Coperture() {
  const id = useId().replace(/:/g, "");
  return (
    <Frame label="Illustrazione: un tetto con la linea vita e un operatore agganciato">
      <circle cx="270" cy="44" r="16" fill={C.soft} opacity="0.7" style={pop(0)} />
      <rect
        x="70"
        y="140"
        width="180"
        height="66"
        fill={C.white}
        stroke={C.deep}
        strokeWidth="1.8"
      />
      <rect x="100" y="160" width="26" height="24" rx="2" fill={C.pale} stroke={C.line} />
      <rect x="194" y="160" width="26" height="46" rx="2" fill={C.mist} stroke={C.line} />
      <defs>
        <clipPath id={`${id}-roof`}>
          <polygon points="40,142 120,78 200,78 280,142" />
        </clipPath>
      </defs>
      <polygon points="40,142 120,78 200,78 280,142" fill={C.deep} />
      {/* file di coppi che scivolano al loro posto */}
      <g clipPath={`url(#${id}-roof)`}>
        {[0, 1, 2, 3].map((r) => (
          <g key={r} style={slideX(r * 0.15, r % 2 ? 60 : -60)}>
            {Array.from({ length: 16 }, (_, k) => (
              <path
                key={k}
                d={`M${24 + k * 18 + (r % 2) * 9} ${92 + r * 14}q9 10 18 0`}
                fill="none"
                stroke={C.soft}
                strokeWidth="2"
                opacity="0.8"
              />
            ))}
          </g>
        ))}
      </g>
      {/* linea vita: paletti e fune che si tende */}
      <rect x="124" y="62" width="5" height="18" rx="1" fill={C.ink} />
      <rect x="191" y="62" width="5" height="18" rx="1" fill={C.ink} />
      <path
        pathLength={1}
        style={draw(0.3)}
        d="M126 64H194"
        stroke={C.mid}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* operatore agganciato che si sposta lungo la fune */}
      <g style={{ transform: "translateX(calc(var(--vp, 1) * 48px))" }}>
        <g style={{ transform: "scale(1.45)", transformOrigin: "134px 64px" }}>
          <circle cx="134" cy="64" r="3.5" fill="none" stroke={C.ink} strokeWidth="1.8" />
          <path
            d="M134 68C134 80 140 82 140 88"
            fill="none"
            stroke={C.teal}
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <circle cx="141" cy="86" r="5" fill={C.white} stroke={C.ink} strokeWidth="1.5" />
          <path d="M136 84a5 5 0 0 1 10 0z" fill={C.mid} />
          <path
            d="M141 91v12M141 96l-6 5M141 96l6 4M141 103l-5 8M141 103l5 8"
            stroke={C.ink}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      </g>
    </Frame>
  );
}

function Manutenzioni() {
  return (
    <Frame label="Illustrazione: ingranaggi, chiave inglese e lista di controllo">
      <g style={pop(0)}>
        <path d={gearPath(118, 124, 56, 12)} fill={C.deep} style={spin(240)} />
        <circle cx="118" cy="124" r="18" fill={C.mist} />
      </g>
      <g style={pop(0.15)}>
        <path d={gearPath(194, 78, 34, 9)} fill={C.mid} style={spin(-380, 10)} />
        <circle cx="194" cy="78" r="11" fill={C.mist} />
      </g>
      <path
        d="M58 190l40-40a16 16 0 0 1 20-20l-9 9 4 8 8 4 9-9a16 16 0 0 1-20 20l-40 40z"
        fill={C.teal}
        style={{
          transform: "rotate(calc(-18deg + var(--vp, 1) * 36deg))",
          transformOrigin: "100px 160px",
        }}
      />
      <g style={slideX(0.3, 50)}>
        <rect
          x="206"
          y="122"
          width="92"
          height="76"
          rx="10"
          fill={C.white}
          stroke={C.line}
          strokeWidth="1.5"
        />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x="216"
              y={136 + i * 20}
              width="11"
              height="11"
              rx="3"
              fill={C.pale}
              stroke={C.deep}
            />
            <path
              d={`M218 ${142 + i * 20}l3 3 5-6`}
              fill="none"
              stroke={C.deep}
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              style={draw(0.5 + i * 0.15)}
            />
            <rect x="234" y={139 + i * 20} width={48 - i * 8} height="5" rx="2.5" fill={C.line} />
          </g>
        ))}
      </g>
    </Frame>
  );
}

function Antincendio() {
  return (
    <Frame label="Illustrazione: un estintore con il cartellino del controllo e il verbale">
      <g style={rise(0, 34)}>
        <rect x="100" y="72" width="62" height="130" rx="18" fill="#ef4444" />
        <rect x="100" y="110" width="62" height="40" fill={C.white} opacity="0.9" />
        <text
          x="131"
          y="134"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill={C.ink}
          fontFamily="ui-sans-serif, system-ui"
        >
          CO₂
        </text>
        <rect x="118" y="54" width="26" height="20" rx="4" fill={C.ink} />
        <path d="M144 58h26l8 6" fill="none" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
        <path
          d="M118 62c-26 0-34 30-30 60"
          fill="none"
          stroke={C.ink}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="104" y="82" width="8" height="40" rx="4" fill={C.white} opacity="0.35" />
      </g>
      {/* cartellino verde che oscilla */}
      <g
        style={{
          transform: "rotate(calc(-14deg + var(--vp, 1) * 28deg))",
          transformOrigin: "150px 76px",
        }}
      >
        <line x1="150" y1="76" x2="160" y2="96" stroke={C.ink} strokeWidth="1.2" />
        <rect x="150" y="94" width="26" height="34" rx="4" fill={C.mid} />
        <path
          d="M156 111l5 5 9-10"
          fill="none"
          stroke={C.white}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
      {/* verbale dei presidi */}
      <g style={slideX(0.25, 50)}>
        <rect
          x="200"
          y="58"
          width="96"
          height="134"
          rx="10"
          fill={C.white}
          stroke={C.line}
          strokeWidth="1.5"
        />
        <rect x="212" y="70" width="52" height="7" rx="3" fill={C.deep} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <text
              x="212"
              y={102 + i * 20}
              fontSize="9"
              fill={C.ink}
              fontFamily="ui-monospace, monospace"
            >
              E{i + 1}
            </text>
            <rect x="230" y={95 + i * 20} width="34" height="5" rx="2.5" fill={C.line} />
            <circle
              cx="280"
              cy={98 + i * 20}
              r="6"
              fill={i < 4 ? C.pale : "#fef3c7"}
              style={pop(0.45 + i * 0.1)}
            />
            {i < 4 ? (
              <path
                d={`M277 ${98 + i * 20}l2 2 4-4`}
                fill="none"
                stroke={C.deep}
                strokeWidth="1.8"
                strokeLinecap="round"
                style={pop(0.5 + i * 0.1)}
              />
            ) : (
              <circle cx="280" cy={98 + i * 20} r="2" fill="#b45309" />
            )}
          </g>
        ))}
      </g>
    </Frame>
  );
}

function Serramenti() {
  return (
    <Frame label="Illustrazione: una finestra che si apre e il metro del rilievo">
      <circle cx="160" cy="110" r="44" fill={C.soft} opacity="0.5" style={pop(0)} />
      <rect
        x="86"
        y="40"
        width="148"
        height="142"
        rx="6"
        fill={C.white}
        stroke={C.deep}
        strokeWidth="3"
      />
      <rect x="96" y="50" width="128" height="122" fill={C.mist} />
      {/* il paesaggio che si vede aprendo */}
      <circle cx="160" cy="88" r="14" fill={C.soft} />
      <path d="M96 150Q130 118 160 140T224 128V172H96z" fill={C.mid} opacity="0.55" />
      <path d="M96 160Q140 138 180 156T224 150V172H96z" fill={C.deep} opacity="0.6" />
      {/* ante che si aprono con lo scorrimento */}
      <g style={{ transform: `scaleX(calc(1 - ${step(0.2)} * 0.45))`, transformOrigin: "96px 0" }}>
        <rect
          x="96"
          y="50"
          width="64"
          height="122"
          fill={C.pale}
          stroke={C.deep}
          strokeWidth="2.5"
        />
        <path
          d="M106 64l20-10M106 84l34-18"
          stroke={C.white}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="150" y="104" width="4" height="16" rx="2" fill={C.deep} />
      </g>
      <g style={{ transform: `scaleX(calc(1 - ${step(0.3)} * 0.45))`, transformOrigin: "224px 0" }}>
        <rect
          x="160"
          y="50"
          width="64"
          height="122"
          fill={C.pale}
          stroke={C.deep}
          strokeWidth="2.5"
        />
        <path
          d="M170 64l20-10M170 84l34-18"
          stroke={C.white}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="166" y="104" width="4" height="16" rx="2" fill={C.deep} />
      </g>
      <rect x="78" y="182" width="164" height="8" rx="2" fill={C.deep} />
      {/* metro che si srotola */}
      <g>
        <rect x="70" y="196" width="22" height="18" rx="4" fill={C.teal} />
        <g style={{ transform: `scaleX(${step(0.4)})`, transformOrigin: "92px 0" }}>
          <rect x="92" y="200" width="150" height="9" fill="#fde68a" />
          {Array.from({ length: 15 }, (_, k) => (
            <line
              key={k}
              x1={96 + k * 10}
              y1="200"
              x2={96 + k * 10}
              y2={k % 5 ? 204 : 207}
              stroke={C.ink}
              strokeWidth="0.8"
            />
          ))}
        </g>
        <text
          x="250"
          y="208"
          fontSize="10"
          fontWeight="700"
          fill={C.ink}
          style={{ opacity: step(0.9) }}
          fontFamily="ui-monospace, monospace"
        >
          148 cm
        </text>
      </g>
    </Frame>
  );
}

function Facility() {
  const blocks = [
    { x: 40, w: 52, h: 96 },
    { x: 100, w: 64, h: 150 },
    { x: 172, w: 50, h: 118 },
    { x: 230, w: 58, h: 80 },
  ];
  return (
    <Frame label="Illustrazione: edifici diversi collegati, con le finestre che si accendono">
      {blocks.map((b, i) => (
        <g key={i} style={rise(i * 0.15, 50)}>
          <rect
            x={b.x}
            y={206 - b.h}
            width={b.w}
            height={b.h}
            rx="4"
            fill={i % 2 ? C.white : C.mist}
            stroke={C.deep}
            strokeWidth="1.6"
          />
          {Array.from({ length: Math.floor((b.h - 16) / 20) }, (_, r) =>
            Array.from({ length: Math.floor((b.w - 8) / 16) }, (_, c) => {
              const k = r * 3 + c + i * 2;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 7 + c * 16}
                  y={214 - b.h + r * 20}
                  width="9"
                  height="11"
                  rx="1.5"
                  fill={C.mid}
                  style={{
                    opacity: `calc(0.15 + clamp(0, calc(var(--vp, 1) * 2.2 - ${(k % 9) * 0.12}), 1) * 0.75)`,
                  }}
                />
              );
            }),
          )}
        </g>
      ))}
      {/* collegamenti tra le sedi */}
      <path
        pathLength={1}
        style={draw(0.5)}
        d="M66 100Q132 20 197 80Q240 40 259 118"
        fill="none"
        stroke={C.teal}
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      {[
        [66, 100],
        [197, 80],
        [259, 118],
      ].map(([x, y], i) => (
        <g key={i} className="trade-pin" style={{ animationDelay: `${i * 0.4}s` }}>
          <path
            d={`M${x} ${y! + 2}c-7-9-10-13-10-18a10 10 0 0 1 20 0c0 5-3 9-10 18z`}
            fill={C.deep}
          />
          <circle cx={x} cy={y! - 16} r="3.5" fill={C.white} />
        </g>
      ))}
    </Frame>
  );
}

const SCENES: Record<TradeIcon, () => ReactNode> = {
  edili: Edili,
  elettrici: Elettrici,
  idraulici: Idraulici,
  coperture: Coperture,
  manutenzioni: Manutenzioni,
  antincendio: Antincendio,
  serramenti: Serramenti,
  facility: Facility,
};

/** Illustrazione del mestiere in una cornice di vetro. Serve un antenato con `data-progress`. */
export function TradeScene({
  icon,
  className,
  decorative,
}: {
  icon: TradeIcon;
  className?: string;
  /** Dentro un link che ha già il suo nome: nascosta ai lettori di schermo. */
  decorative?: boolean;
}) {
  const Scene = SCENES[icon];
  return (
    <div
      aria-hidden={decorative || undefined}
      className={cn(
        "trade-scene overflow-hidden rounded-3xl border border-border bg-card",
        className,
      )}
    >
      <Scene />
    </div>
  );
}
