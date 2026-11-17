"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Building2,
  CalendarClock,
  CornerDownLeft,
  HardHat,
  Search,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SearchKind, SearchResult } from "@cantiereos/core";
import { searchAction } from "@/app/(app)/shell-actions";
import { visibleNav } from "./navigation";

const KIND: Record<SearchKind, { label: string; icon: LucideIcon; href: (id: string) => string }> =
  {
    customer: { label: "Clienti", icon: Building2, href: (id) => `/app/clienti/${id}` },
    supplier: { label: "Fornitori", icon: Truck, href: (id) => `/app/fornitori?id=${id}` },
    employee: { label: "Personale", icon: HardHat, href: (id) => `/app/personale/${id}` },
    team: { label: "Squadre", icon: UsersRound, href: (id) => `/app/squadre?id=${id}` },
    deadline: { label: "Scadenze", icon: CalendarClock, href: (id) => `/app/scadenze/${id}` },
  };

/**
 * Ricerca globale (⌘K / Ctrl K): pagine del menu (filtrate per permesso) e
 * risultati cercati sul server nell'azienda attiva.
 */
export function CommandPalette({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(() => {
      start(async () => {
        const found = await searchAction(term);
        if (id === seq.current) setResults(found);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [term]);

  const go = (href: string) => {
    setOpen(false);
    setTerm("");
    router.push(href);
  };
  const pages = visibleNav(permissions);
  const grouped = (Object.keys(KIND) as SearchKind[])
    .map((k) => ({ kind: k, items: results.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:border-input"
        data-testid="open-search"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Cerca…</span>
        <kbd className="hidden rounded border border-border px-1.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="cos-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            className="cos-pop fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Ricerca globale</DialogPrimitive.Title>
            <Command shouldFilter={false} label="Ricerca globale">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <Command.Input
                  value={term}
                  onValueChange={setTerm}
                  placeholder="Cerca clienti, fornitori, personale, squadre o pagine…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  maxLength={100}
                />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                {term.trim().length >= 2 && !pending && results.length === 0 && (
                  <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nessun risultato per “{term.trim()}”.
                  </Command.Empty>
                )}
                {pending && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Ricerca in corso…</p>
                )}
                {grouped.map((g) => {
                  const k = KIND[g.kind];
                  return (
                    <Command.Group
                      key={g.kind}
                      heading={k.label}
                      className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {g.items.map((r) => (
                        <Command.Item
                          key={`${r.kind}-${r.id}`}
                          value={`${r.kind}-${r.id}`}
                          onSelect={() => go(k.href(r.id))}
                          className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                          data-testid="search-result"
                        >
                          <k.icon className="size-4 text-muted-foreground" aria-hidden />
                          <span className="flex-1 truncate">{r.title}</span>
                          {r.subtitle && (
                            <span className="truncate text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
                {term.trim().length < 2 && (
                  <Command.Group
                    heading="Pagine"
                    className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                  >
                    {pages.map((p) => (
                      <Command.Item
                        key={p.href}
                        value={p.href}
                        onSelect={() => go(p.href)}
                        className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent"
                      >
                        <p.icon className="size-4 text-muted-foreground" aria-hidden />
                        {p.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="flex items-center gap-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <CornerDownLeft className="size-3" aria-hidden /> per aprire · Esc per chiudere
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
