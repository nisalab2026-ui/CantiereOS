"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Clock,
  ClipboardCheck,
  Building2,
  CalendarClock,
  CornerDownLeft,
  FileText,
  HardHat,
  ListTodo,
  type LucideIcon,
  MessagesSquare,
  Plus,
  Search,
  Truck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SearchKind, SearchResult } from "@cantiereos/core";
import { searchAction } from "@/app/(app)/shell-actions";
import { visibleCreateActions, visibleNav } from "./navigation";
import { readRecent, type RecentItem } from "./recent";

/** Evento per aprire la ricerca da altri punti (barra in basso sul telefono). */
export const OPEN_SEARCH_EVENT = "cos:open-search";

/** Vero se l'utente sta scrivendo: i tasti rapidi a lettera singola non devono scattare. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

const norm = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const groupClass =
  "text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5";
const itemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent";

const KIND: Record<SearchKind, { label: string; icon: LucideIcon; href: (id: string) => string }> =
  {
    customer: { label: "Clienti", icon: Building2, href: (id) => `/app/clienti/${id}` },
    supplier: { label: "Fornitori", icon: Truck, href: (id) => `/app/fornitori?id=${id}` },
    employee: { label: "Personale", icon: HardHat, href: (id) => `/app/personale/${id}` },
    team: { label: "Squadre", icon: UsersRound, href: (id) => `/app/squadre?id=${id}` },
    deadline: { label: "Scadenze", icon: CalendarClock, href: (id) => `/app/scadenze/${id}` },
    document: { label: "Documenti", icon: FileText, href: (id) => `/app/documenti/${id}` },
    task: { label: "Attività", icon: ListTodo, href: (id) => `/app/attivita/${id}` },
    payment: { label: "Pagamenti", icon: Wallet, href: (id) => `/app/pagamenti/${id}` },
    communication: {
      label: "Comunicazioni",
      icon: MessagesSquare,
      href: (id) => `/app/comunicazioni/${id}`,
    },
    form: { label: "Moduli", icon: ClipboardCheck, href: (id) => `/app/moduli/${id}` },
  };

/**
 * Ricerca e comandi (⌘K / Ctrl K, oppure «/»): schede aperte di recente,
 * azioni di creazione e pagine (filtrate per permesso), più i risultati
 * cercati sul server nell'azienda attiva.
 */
export function CommandPalette({
  permissions,
  tenantId,
}: {
  permissions: string[];
  tenantId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, start] = useTransition();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecent(tenantId));
  }, [open, tenantId]);

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
  const q = norm(term);
  const pages = visibleNav(permissions).filter((p) => !q || norm(p.label).includes(q));
  const actions = visibleCreateActions(permissions).filter(
    (a) => !q || norm(`nuovo ${a.label}`).includes(q) || norm(`crea ${a.label}`).includes(q),
  );
  const recentShown = q
    ? recent.filter((r) => norm(`${r.title} ${r.section}`).includes(q)).slice(0, 4)
    : recent.slice(0, 5);
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
                  placeholder="Cerca clienti, documenti, pagine o comandi (es. «nuovo cliente»)…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  maxLength={100}
                />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                {term.trim().length >= 2 &&
                  !pending &&
                  results.length === 0 &&
                  actions.length === 0 &&
                  pages.length === 0 &&
                  recentShown.length === 0 && (
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
                {recentShown.length > 0 && (
                  <Command.Group heading="Recenti" className={groupClass}>
                    {recentShown.map((r) => (
                      <Command.Item
                        key={r.href}
                        value={`recent-${r.href}`}
                        onSelect={() => go(r.href)}
                        className={itemClass}
                        data-testid="recent-item"
                      >
                        <Clock className="size-4 text-muted-foreground" aria-hidden />
                        <span className="flex-1 truncate">{r.title}</span>
                        <span className="text-xs text-muted-foreground">{r.section}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {actions.length > 0 && (
                  <Command.Group heading="Crea" className={groupClass}>
                    {actions.map((a) => (
                      <Command.Item
                        key={a.href}
                        value={`new-${a.href}`}
                        onSelect={() => go(a.href)}
                        className={itemClass}
                      >
                        <Plus className="size-4 text-muted-foreground" aria-hidden />
                        <span className="flex-1">Nuovo: {a.label}</span>
                        <a.icon className="size-4 text-muted-foreground" aria-hidden />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {pages.length > 0 && (
                  <Command.Group heading="Vai a" className={groupClass}>
                    {pages.map((p) => (
                      <Command.Item
                        key={p.href}
                        value={p.href}
                        onSelect={() => go(p.href)}
                        className={itemClass}
                      >
                        <p.icon className="size-4 text-muted-foreground" aria-hidden />
                        {p.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="flex items-center gap-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <CornerDownLeft className="size-3" aria-hidden /> per aprire · ↑↓ per scegliere ·
                Esc per chiudere · «/» apre la ricerca
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
