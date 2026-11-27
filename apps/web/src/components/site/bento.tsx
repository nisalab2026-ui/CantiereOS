import {
  Briefcase,
  CalendarRange,
  ClipboardList,
  Command,
  History,
  MapPinned,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Cell {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
  visual?: React.ReactNode;
}

/** Figura: una settimana di interventi (esempi generici, non dati di clienti). */
function WeekVisual() {
  const rows = [
    ["Lun", "08:30", "Manutenzione caldaia", "bg-primary/15 text-primary"],
    ["Lun", "14:00", "Sopralluogo copertura", "bg-cyan/15 text-cyan"],
    ["Mar", "09:00", "Verifica linea vita", "bg-warning/15 text-warning"],
    ["Mer", "07:45", "Posa quadro elettrico", "bg-primary/15 text-primary"],
  ] as const;
  return (
    <ul className="mt-6 space-y-2" aria-hidden>
      {rows.map(([d, t, l, c]) => (
        <li
          key={l}
          className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm"
        >
          <span className="w-9 font-mono text-xs text-muted-foreground">{d}</span>
          <span className="font-mono text-xs tabular-nums">{t}</span>
          <span className={cn("ml-auto rounded-md px-2 py-0.5 text-xs font-medium", c)}>{l}</span>
        </li>
      ))}
    </ul>
  );
}

function KeysVisual() {
  return (
    <div className="mt-5 flex items-center gap-1.5" aria-hidden>
      {["Ctrl", "K"].map((k) => (
        <kbd
          key={k}
          className="rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-sm shadow-[0_2px_0_var(--border)]"
        >
          {k}
        </kbd>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">«nuovo cliente»</span>
    </div>
  );
}

const CELLS: Cell[] = [
  {
    icon: CalendarRange,
    title: "Interventi e agenda della squadra",
    text: "Pianifichi orario, luogo e squadra; chi esce riceve l'avviso e trova tutto sul telefono.",
    className: "lg:col-span-2 lg:row-span-2",
    visual: <WeekVisual />,
  },
  {
    icon: ClipboardList,
    title: "Rapportini dal cantiere",
    text: "Ore, materiali, foto e firma in un minuto. Approvati in ufficio, finiscono nei costi della commessa.",
    className: "lg:col-span-2",
  },
  {
    icon: Briefcase,
    title: "Commesse e margini",
    text: "Costi sostenuti, ore lavorate e margine per cantiere, sempre aggiornati.",
  },
  {
    icon: Smartphone,
    title: "App per chi esce",
    text: "Dal browser del telefono: interventi del giorno, il giro sulla mappa e il navigatore.",
  },
  {
    icon: MapPinned,
    title: "Clienti sulla mappa",
    text: "Tutte le sedi dei clienti su una mappa, per capire chi è vicino a chi.",
    className: "lg:col-span-2",
  },
  {
    icon: Command,
    title: "Cerca e crea da tastiera",
    text: "Un tasto per trovare un cliente o creare un intervento da qualsiasi pagina.",
    visual: <KeysVisual />,
  },
  {
    icon: History,
    title: "Storico di ogni modifica",
    text: "Chi ha cambiato cosa e quando, con il valore di prima.",
  },
];

/**
 * Griglia «bento» delle funzioni secondarie: celle di misure diverse, luce che
 * segue il puntatore (`.site-spot`, posizione impostata da motion-root).
 * Solo funzioni già disponibili nel gestionale.
 */
export function BentoGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:auto-rows-[minmax(12rem,auto)] lg:grid-cols-4">
      {CELLS.map((c, i) => (
        <article
          key={c.title}
          data-reveal
          style={{ "--reveal-i": i } as React.CSSProperties}
          className={cn(
            "site-spot relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-6 transition-[translate,border-color] duration-500 hover:-translate-y-1 hover:border-primary/40",
            c.className,
          )}
          data-testid="bento-cell"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <c.icon className="size-5" aria-hidden />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">{c.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{c.text}</p>
          {c.visual}
        </article>
      ))}
    </div>
  );
}
