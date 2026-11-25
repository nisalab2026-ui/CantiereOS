"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

export interface FilterDef {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Testo dell'opzione vuota (default "<etichetta>: tutti"). */
  emptyLabel?: string;
}

/**
 * Ricerca e filtri come modulo GET: il risultato è un URL (condivisibile).
 * Con JavaScript i filtri si applicano al cambio; senza, con Invio.
 */
export function FilterBar({
  pathname,
  q,
  filters = [],
  values = {},
  placeholder = "Cerca…",
  dateRange,
  keep = {},
}: {
  pathname: string;
  q: string;
  filters?: FilterDef[];
  values?: Record<string, string | undefined>;
  placeholder?: string;
  /** Intervallo di date (parametri from/to nell'URL). */
  dateRange?: { label: string; from?: string | undefined; to?: string | undefined };
  /** Parametri da mantenere (es. la cartella aperta) quando si filtra o si azzera. */
  keep?: Record<string, string | undefined>;
}) {
  const kept = Object.entries(keep).filter((e): e is [string, string] => Boolean(e[1]));
  const resetHref = kept.length ? `${pathname}?${new URLSearchParams(kept).toString()}` : pathname;
  const form = useRef<HTMLFormElement>(null);
  const active =
    q !== "" || Object.values(values).some(Boolean) || Boolean(dateRange?.from || dateRange?.to);
  return (
    <form
      ref={form}
      action={pathname}
      method="get"
      role="search"
      className="flex flex-wrap items-center gap-2 px-4 py-3"
    >
      {kept.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          aria-label="Cerca"
          maxLength={100}
          className="h-9 w-full rounded-sm border border-input bg-card pr-3 pl-8 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.name}
          name={f.name}
          defaultValue={values[f.name] ?? ""}
          aria-label={f.label}
          onChange={() => form.current?.requestSubmit()}
          className="h-9 min-w-0 flex-1 basis-[calc(50%-0.5rem)] rounded-sm border border-input bg-card px-2 text-sm focus-visible:border-primary focus-visible:outline-none sm:flex-none sm:basis-auto"
        >
          <option value="">{f.emptyLabel ?? `${f.label}: tutti`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {dateRange && (
        <fieldset className="flex w-full min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:w-auto">
          <legend className="sr-only">{dateRange.label}</legend>
          <span aria-hidden>{dateRange.label}</span>
          <input
            type="date"
            name="from"
            defaultValue={dateRange.from ?? ""}
            aria-label={`${dateRange.label}: dal`}
            onChange={() => form.current?.requestSubmit()}
            className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none sm:flex-none"
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            name="to"
            defaultValue={dateRange.to ?? ""}
            aria-label={`${dateRange.label}: al`}
            onChange={() => form.current?.requestSubmit()}
            className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none sm:flex-none"
          />
        </fieldset>
      )}
      {active && (
        <Link
          href={resetHref}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden /> Azzera
        </Link>
      )}
    </form>
  );
}
