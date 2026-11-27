import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { listHref, type SearchParams } from "@/lib/list-params";

/** Fondo pieno delle celle (serve alla prima colonna fissa) con evidenza al passaggio e in selezione. */
const ROW_BG =
  "bg-popover group-hover/row:bg-[color-mix(in_oklab,var(--accent)_70%,var(--popover))] group-data-[selected]/row:bg-[color-mix(in_oklab,var(--primary)_10%,var(--popover))]";

/** Parametro dell'indirizzo che apre il pannello laterale di un elemento. */
export const PREVIEW_PARAM = "anteprima";

/** Azione rapida di una riga: pulsante a icona con etichetta accessibile. */
export function RowAction({
  href,
  label,
  icon: Icon,
  testId,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  testId?: string;
}) {
  const external = /^(mailto|tel):/.test(href);
  const cls =
    "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground";
  const icon = <Icon className="size-4" aria-hidden />;
  return external ? (
    <a href={href} className={cls} aria-label={label} title={label} data-testid={testId}>
      {icon}
    </a>
  ) : (
    <Link
      href={href}
      scroll={false}
      className={cls}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      {icon}
    </Link>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  /** chiave di ordinamento lato server (whitelist della pagina) */
  sortKey?: string;
  align?: "left" | "right";
  /** Numeri, importi, codici: carattere monospazio con cifre allineate. */
  mono?: boolean;
  /**
   * Classi della colonna. Se manca, sul telefono restano visibili solo la prima
   * e l'ultima colonna (di solito nome e stato): le altre compaiono da sm in su.
   */
  className?: string;
  render: (row: T) => React.ReactNode;
}

/**
 * Tabella server-side: ordinamento e paginazione sono link (funzionano senza
 * JavaScript, si possono condividere, il tasto indietro funziona).
 *
 * Da desktop la tabella scorre dentro il suo riquadro: l'intestazione resta in
 * alto e la prima colonna resta ferma scorrendo in orizzontale. Le azioni
 * rapide di una riga compaiono al passaggio del mouse (sempre visibili su
 * schermi touch); `selectedId` evidenzia la riga aperta nel pannello laterale.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  pathname,
  searchParams,
  empty,
  caption,
  rowActions,
  selectedId,
}: {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  pathname: string;
  searchParams: SearchParams;
  empty: React.ReactNode;
  caption: string;
  rowActions?: (row: T) => React.ReactNode;
  selectedId?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // ordinare o cambiare pagina chiude il pannello laterale
  const { [PREVIEW_PARAM]: _preview, ...listParams } = searchParams;
  const colClass = (c: Column<T>, i: number) =>
    c.className ?? (i === 0 || i === columns.length - 1 ? undefined : "hidden sm:table-cell");
  return (
    <div>
      <div
        className="overflow-auto overscroll-x-contain lg:max-h-[calc(100dvh-15rem)] lg:min-h-64"
        data-testid="table-scroll"
      >
        <table className="w-full border-separate border-spacing-0 text-sm" data-testid="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left">
              {columns.map((c, ci) => {
                const active = c.sortKey && c.sortKey === sort;
                const nextDir = active && dir === "asc" ? "desc" : "asc";
                const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "sticky top-0 z-10 border-b border-border bg-popover/95 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground backdrop-blur",
                      ci === 0 && "left-0 z-20 shadow-[inset_-1px_0_0_var(--border)]",
                      c.align === "right" && "text-right",
                      colClass(c, ci),
                    )}
                  >
                    {c.sortKey ? (
                      <Link
                        href={listHref(pathname, listParams, {
                          sort: c.sortKey,
                          dir: nextDir,
                          page: null,
                        })}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.header}
                        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th
                  scope="col"
                  className="sticky top-0 z-10 w-px border-b border-border bg-popover/95 px-2 backdrop-blur"
                >
                  <span className="sr-only">Azioni</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className="group/row cos-enter"
                style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                aria-selected={selectedId === row.id || undefined}
                data-selected={selectedId === row.id || undefined}
              >
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      "border-b border-border px-4 py-2.5 align-middle transition-colors group-last/row:border-0",
                      ROW_BG,
                      ci === 0 && "sticky left-0 z-[5] shadow-[inset_-1px_0_0_var(--border)]",
                      c.align === "right" && "text-right tabular-nums",
                      (c.mono || c.align === "right") && "font-mono text-[13px] tabular-nums",
                      colClass(c, ci),
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {rowActions && (
                  <td
                    className={cn(
                      "border-b border-border px-2 py-1.5 text-right whitespace-nowrap transition-colors group-last/row:border-0",
                      ROW_BG,
                    )}
                  >
                    <div className="inline-flex items-center gap-0.5 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:hover)]:opacity-0">
                      {rowActions(row)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && empty}
      </div>
      {total > 0 && (
        <nav
          className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5 text-sm text-muted-foreground"
          aria-label="Paginazione"
        >
          <span data-testid="table-total">
            {formatNumber(total)} {total === 1 ? "risultato" : "risultati"} · pagina {page} di{" "}
            {pages}
          </span>
          <div className="flex gap-1">
            {page > 1 ? (
              <Link
                href={listHref(pathname, listParams, { page: String(page - 1) })}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
                aria-label="Pagina precedente"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={listHref(pathname, listParams, { page: String(page + 1) })}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
                aria-label="Pagina successiva"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </nav>
      )}
    </div>
  );
}
