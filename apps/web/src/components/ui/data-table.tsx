import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { listHref, type SearchParams } from "@/lib/list-params";

export interface Column<T> {
  key: string;
  header: string;
  /** chiave di ordinamento lato server (whitelist della pagina) */
  sortKey?: string;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => React.ReactNode;
}

/**
 * Tabella server-side: ordinamento e paginazione sono link (funzionano senza
 * JavaScript, si possono condividere, il tasto indietro funziona).
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
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-background/60 text-left">
              {columns.map((c) => {
                const active = c.sortKey && c.sortKey === sort;
                const nextDir = active && dir === "asc" ? "desc" : "asc";
                const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "px-4 py-2.5 text-xs font-medium text-muted-foreground",
                      c.align === "right" && "text-right",
                      c.className,
                    )}
                  >
                    {c.sortKey ? (
                      <Link
                        href={listHref(pathname, searchParams, {
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-2.5 align-middle",
                      c.align === "right" && "text-right tabular-nums",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
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
                href={listHref(pathname, searchParams, { page: String(page - 1) })}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent"
                aria-label="Pagina precedente"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={listHref(pathname, searchParams, { page: String(page + 1) })}
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
