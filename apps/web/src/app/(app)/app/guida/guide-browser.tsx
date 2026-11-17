"use client";

import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  FolderOpen,
  HardHat,
  History,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  MessageCircleQuestion,
  MessagesSquare,
  Rocket,
  Search,
  ShieldCheck,
  Truck,
  Users,
  UsersRound,
  Wallet,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import type { GuideIcon, GuideTopic } from "./content";

const ICONS: Record<GuideIcon, LucideIcon> = {
  start: Rocket,
  search: Search,
  dashboard: LayoutDashboard,
  tasks: ListTodo,
  calendar: CalendarClock,
  deadlines: CalendarClock,
  documents: FolderOpen,
  payments: Wallet,
  communications: MessagesSquare,
  forms: ClipboardCheck,
  customers: Building2,
  suppliers: Truck,
  staff: HardHat,
  teams: UsersRound,
  users: Users,
  audit: History,
  security: ShieldCheck,
  faq: MessageCircleQuestion,
};

/** minuscole e senza accenti: "attivita" trova "attività" */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function GuideBrowser({ topics }: { topics: GuideTopic[] }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const words = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  const shown = useMemo(() => {
    if (!words.length) return topics;
    return topics
      .map((t) => {
        const head = norm(`${t.title} ${t.summary}`);
        const entries = t.entries.filter((e) => {
          const text = `${head} ${norm(`${e.q} ${e.a.join(" ")}`)}`;
          return words.every((w) => text.includes(w));
        });
        return { ...t, entries };
      })
      .filter((t) => t.entries.length > 0);
  }, [topics, words]);
  const count = shown.reduce((n, t) => n + t.entries.length, 0);
  const searching = words.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* indice: colonna fissa su desktop, riga scorrevole su telefono */}
      <nav aria-label="Argomenti della guida" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
          {topics.map((t) => {
            const Icon = ICONS[t.icon];
            const dim = searching && !shown.some((s) => s.id === t.id);
            return (
              <li key={t.id} className="shrink-0">
                <a
                  href={`#${t.id}`}
                  className={`flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm whitespace-nowrap transition-colors hover:bg-accent lg:h-auto lg:min-h-9 lg:border-transparent lg:px-2 lg:py-1.5 lg:whitespace-normal ${dim ? "opacity-40" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {t.title}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 space-y-4">
        <div className="cos-glass sticky top-16 z-10 rounded-xl border border-border p-2">
          <label htmlFor="guide-search" className="sr-only">
            Cerca nella guida
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="guide-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca: firma, PDF, invito, scadenza…"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <p className="sr-only" aria-live="polite">
            {searching ? `${count} risposte trovate` : ""}
          </p>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={MessageCircleQuestion}
            title="Nessuna risposta trovata"
            description="Prova con un'altra parola, per esempio il nome della sezione (Moduli, Scadenze, Documenti…)."
          />
        ) : (
          shown.map((t, i) => {
            const Icon = ICONS[t.icon];
            return (
              <Card
                key={t.id}
                id={t.id}
                className="cos-enter scroll-mt-32 overflow-hidden"
                style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
                data-testid="guide-topic"
              >
                <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{t.title}</h2>
                    <p className="text-sm text-muted-foreground">{t.summary}</p>
                  </div>
                  {t.href && (
                    <Link
                      href={t.href}
                      className="group hidden shrink-0 items-center gap-1 text-sm text-primary hover:underline sm:inline-flex"
                    >
                      Apri
                      <ArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {t.entries.map((e) => (
                    <details
                      key={e.q}
                      className="guide-entry group"
                      open={searching}
                      data-testid="guide-entry"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
                        <span className="flex-1">{e.q}</span>
                        <span
                          aria-hidden
                          className="grid size-5 place-items-center rounded-full border border-border text-xs text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <div className="guide-answer space-y-2 px-5 pb-4 text-sm text-muted-foreground">
                        <Answer lines={e.a} />
                      </div>
                    </details>
                  ))}
                </div>
                {t.href && (
                  <Link
                    href={t.href}
                    className="flex items-center gap-1 border-t border-border px-5 py-3 text-sm text-primary sm:hidden"
                  >
                    Apri {t.title} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

/** paragrafi, con le righe "- " raccolte in elenchi puntati */
function Answer({ lines }: { lines: string[] }) {
  const blocks: (string | string[])[] = [];
  for (const l of lines) {
    if (l.startsWith("- ")) {
      const last = blocks.at(-1);
      if (Array.isArray(last)) last.push(l.slice(2));
      else blocks.push([l.slice(2)]);
    } else blocks.push(l);
  }
  return (
    <>
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b}</p>
        ),
      )}
    </>
  );
}
