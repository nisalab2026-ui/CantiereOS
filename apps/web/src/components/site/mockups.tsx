import {
  Bell,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  FolderOpen,
  HardHat,
  Image as ImageIcon,
  LayoutDashboard,
  ListTodo,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Illustrazioni dell'interfaccia per il sito pubblico, disegnate in HTML con gli stessi token del
 * gestionale (si adattano a tema chiaro e scuro). Sono figure: i nomi sono esempi generici, non dati
 * di clienti, e per i lettori di schermo ogni figura ha una descrizione breve.
 */

export function AppWindow({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <figure
      role="img"
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_120px_-40px_rgb(21_128_61/0.55)]",
        className,
      )}
    >
      <div aria-hidden className="flex h-9 items-center gap-1.5 border-b border-border px-3.5">
        <i className="size-2.5 rounded-full bg-danger/70" />
        <i className="size-2.5 rounded-full bg-warning/70" />
        <i className="size-2.5 rounded-full bg-success/70" />
        <span className="mx-auto flex h-5 w-44 items-center justify-center gap-1 rounded-md bg-accent text-[10px] text-muted-foreground sm:w-60">
          CantiereOS
        </span>
      </div>
      <div aria-hidden>{children}</div>
    </figure>
  );
}

const SIDEBAR = [
  { icon: LayoutDashboard, label: "Panoramica", on: true },
  { icon: ListTodo, label: "Attività" },
  { icon: CalendarClock, label: "Scadenze" },
  { icon: ClipboardCheck, label: "Moduli" },
  { icon: FolderOpen, label: "Documenti" },
  { icon: Wallet, label: "Pagamenti" },
  { icon: Users, label: "Clienti" },
  { icon: HardHat, label: "Personale" },
];

/** Panoramica "Richiede attenzione": la figura principale della home. */
export function DashboardMock() {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] text-left">
      <aside className="hidden w-44 border-r border-border p-3 sm:block">
        <ul className="space-y-0.5">
          {SIDEBAR.map(({ icon: Icon, label, on }) => (
            <li
              key={label}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-xs",
                on ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Oggi</p>
            <p className="text-sm font-semibold sm:text-base">Richiede attenzione</p>
          </div>
          <span className="ml-auto flex h-7 w-28 items-center gap-1.5 rounded-md border border-border px-2 text-[10px] text-muted-foreground sm:w-40">
            <Search className="size-3" /> Cerca…
          </span>
          <span className="relative grid size-7 place-items-center rounded-md border border-border">
            <Bell className="size-3.5" />
            <i className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-cyan" />
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { k: "Scadute", v: "3", c: "text-danger" },
            { k: "Entro 30 giorni", v: "12", c: "text-warning" },
            { k: "Moduli da chiudere", v: "5", c: "text-primary" },
          ].map((x) => (
            <div
              key={x.k}
              className="rounded-lg border border-border bg-background/40 p-2.5 sm:p-3"
            >
              <p className="truncate text-[10px] text-muted-foreground">{x.k}</p>
              <p className={cn("text-lg font-semibold tabular-nums sm:text-2xl", x.c)}>{x.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-background/40">
            {[
              { t: "Revisione estintori", s: "Condominio Aurora", d: "Scaduta", tone: "danger" },
              { t: "Patentino PLE · M. Ferri", s: "Personale", d: "tra 6 giorni", tone: "warning" },
              {
                t: "Ispezione linea vita",
                s: "Capannone Nord",
                d: "tra 12 giorni",
                tone: "warning",
              },
              {
                t: "Contratto manutenzione",
                s: "Scuola Primaria",
                d: "tra 28 giorni",
                tone: "info",
              },
            ].map((r) => (
              <div
                key={r.t}
                className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0"
              >
                <i
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    r.tone === "danger"
                      ? "bg-danger"
                      : r.tone === "warning"
                        ? "bg-warning"
                        : "bg-info",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{r.t}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{r.s}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
                    r.tone === "danger"
                      ? "bg-danger/15 text-danger"
                      : r.tone === "warning"
                        ? "bg-warning/15 text-warning"
                        : "bg-info/15 text-info",
                  )}
                >
                  {r.d}
                </span>
              </div>
            ))}
          </div>
          <div className="hidden rounded-lg border border-border bg-background/40 p-3 lg:block">
            <p className="text-[10px] text-muted-foreground">Scadenze per mese</p>
            <div className="mt-3 flex h-24 items-end gap-1.5">
              {[40, 65, 30, 85, 55, 70, 45, 90].map((h, i) => (
                <i
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-primary/50 to-cyan/80"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Figure piccole per i capitoli delle funzionalità. */
export function FeatureMock({ id }: { id: string }) {
  switch (id) {
    case "scadenze":
      return (
        <MiniCard title="Scadenze" icon={CalendarClock}>
          {[
            ["Revisione estintori", "Scaduta", "danger"],
            ["Verifica impianto di terra", "tra 9 giorni", "warning"],
            ["Corso sicurezza · 4 persone", "tra 21 giorni", "info"],
            ["Polizza RC", "Completata", "success"],
          ].map(([t, d, tone]) => (
            <Row key={t} title={t!} tone={tone!} badge={d!} />
          ))}
        </MiniCard>
      );
    case "moduli":
      return (
        <MiniCard title="Ispezione linea vita" icon={ClipboardCheck}>
          {["Ancoraggi integri", "Fune senza usura", "Targhetta leggibile"].map((t, i) => (
            <div key={t} className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span className="flex-1 truncate text-xs">{t}</span>
              <span className="flex overflow-hidden rounded-md border border-border text-[10px]">
                <span
                  className={cn("px-2 py-0.5", i !== 2 && "bg-success/20 font-medium text-success")}
                >
                  Sì
                </span>
                <span
                  className={cn("px-2 py-0.5", i === 2 && "bg-danger/15 font-medium text-danger")}
                >
                  No
                </span>
              </span>
            </div>
          ))}
          <div className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">Firma del tecnico</p>
            <svg viewBox="0 0 160 36" className="mt-1 h-8 w-36 text-primary" fill="none">
              <path
                d="M4 26c10-14 18-20 22-12s-6 16 2 12 14-20 20-16-2 18 6 14 10-12 16-10 4 10 12 6 14-10 22-8 10 4 18 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </MiniCard>
      );
    case "documenti":
      return (
        <MiniCard title="Documenti" icon={FolderOpen}>
          {[
            [FileText, "Certificato conformità.pdf", "v3"],
            [ImageIcon, "Foto sopralluogo.jpg", "v1"],
            [FileText, "Contratto manutenzione.pdf", "v2"],
            [FileText, "Scheda tecnica DPI.pdf", "v1"],
          ].map(([Icon, t, v]) => {
            const I = Icon as typeof FileText;
            return (
              <div
                key={t as string}
                className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0"
              >
                <I className="size-3.5 text-primary" />
                <span className="flex-1 truncate text-xs">{t as string}</span>
                <span className="rounded bg-accent px-1.5 text-[10px] text-muted-foreground">
                  {v as string}
                </span>
              </div>
            );
          })}
        </MiniCard>
      );
    case "attivita":
      return (
        <MiniCard title="Novembre" icon={CalendarClock}>
          <div className="grid grid-cols-7 gap-1 p-3 text-center text-[10px]">
            {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
              <span key={i} className="text-muted-foreground">
                {d}
              </span>
            ))}
            {Array.from({ length: 21 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "grid h-7 place-items-center rounded-md",
                  i === 9 && "bg-primary font-semibold text-primary-foreground",
                  [3, 12, 16].includes(i) && "bg-warning/15 text-warning",
                  [6, 13].includes(i) && "text-muted-foreground/50",
                )}
              >
                {i + 10}
              </span>
            ))}
          </div>
        </MiniCard>
      );
    case "pagamenti":
      return (
        <MiniCard title="Incassi attesi" icon={Wallet}>
          {[
            ["Acconto lavori bagno", "2.400 €", "Incassato", "success"],
            ["SAL 2 · Ristrutturazione", "8.750 €", "Parziale", "warning"],
            ["Manutenzione annuale", "980 €", "In attesa", "info"],
          ].map(([t, a, s, tone]) => (
            <div
              key={t}
              className="flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-0"
            >
              <span className="flex-1 truncate text-xs">{t}</span>
              <span className="text-xs font-semibold tabular-nums">{a}</span>
              <Badge tone={tone!}>{s}</Badge>
            </div>
          ))}
        </MiniCard>
      );
    default:
      return (
        <MiniCard title="Squadra Nord" icon={Users}>
          {[
            ["MF", "Marco Ferri", "Capocantiere"],
            ["LG", "Luca Gentile", "Elettricista"],
            ["SR", "Sara Rinaldi", "Tecnico"],
          ].map(([i, n, r]) => (
            <div
              key={n}
              className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-0"
            >
              <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                {i}
              </span>
              <span className="flex-1 truncate text-xs font-medium">{n}</span>
              <span className="text-[10px] text-muted-foreground">{r}</span>
            </div>
          ))}
        </MiniCard>
      );
  }
}

function MiniCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-left shadow-[0_30px_80px_-40px_rgb(21_128_61/0.5)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon className="size-3.5 text-primary" />
        <span className="text-xs font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "info" && "bg-info/15 text-info",
        tone === "success" && "bg-success/15 text-success",
      )}
    >
      {children}
    </span>
  );
}

function Row({ title, badge, tone }: { title: string; badge: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-0">
      <span className="flex-1 truncate text-xs">{title}</span>
      <Badge tone={tone}>{badge}</Badge>
    </div>
  );
}

/** Telefono con l'agenda del tecnico. */
export function PhoneMock({ className }: { className?: string }) {
  return (
    <figure
      role="img"
      aria-label="Illustrazione: l'agenda del tecnico sul telefono"
      className={cn(
        "relative mx-auto w-[260px] rounded-[2.4rem] border border-border bg-card p-2.5 shadow-[0_40px_120px_-30px_rgb(21_128_61/0.6)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="overflow-hidden rounded-[1.9rem] border border-border bg-background/60"
      >
        <div className="flex justify-center pt-2">
          <i className="h-5 w-20 rounded-full bg-foreground/90" />
        </div>
        <div className="px-4 pt-3 pb-5 text-left">
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Martedì 17</p>
          <p className="text-lg font-semibold">La tua giornata</p>
          <div className="mt-3 space-y-2">
            {[
              ["08:00", "Sopralluogo copertura", "Capannone Nord", true],
              ["10:30", "Ispezione linea vita", "Modulo da compilare", false],
              ["14:00", "Manutenzione caldaia", "Condominio Aurora", false],
            ].map(([h, t, s, done]) => (
              <div
                key={t as string}
                className="flex gap-2.5 rounded-xl border border-border bg-card p-2.5"
              >
                <span className="w-9 text-[10px] font-semibold text-primary tabular-nums">
                  {h as string}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-xs font-medium",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {t as string}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">{s as string}</p>
                </div>
                {done ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <i className="mt-1 size-2 rounded-full bg-warning" />
                )}
              </div>
            ))}
          </div>
          <div className="cos-primary mt-4 flex h-10 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
            Compila il modulo
          </div>
        </div>
      </div>
    </figure>
  );
}
