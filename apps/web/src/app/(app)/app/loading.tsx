"use client";

import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/states";

const UUID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/;

/** Caricamento con la forma della pagina che sta arrivando: panoramica, scheda o elenco. */
export default function Loading() {
  const path = usePathname();
  const shape = path === "/app" ? "dashboard" : UUID.test(path) ? "detail" : "list";
  return (
    <div aria-busy="true" aria-label="Caricamento" data-testid="page-skeleton">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      {shape === "dashboard" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
                <Skeleton className="mt-2 h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-32" />
              <div className="mt-4 flex h-40 items-end gap-3">
                {[45, 70, 55, 85, 60, 95].map((h, i) => (
                  <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-28" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </>
      )}
      {shape === "detail" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      )}
      {shape === "list" && (
        <div className="mt-6 rounded-xl border border-border bg-card">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="hidden h-4 w-1/5 sm:block" />
              <Skeleton className="hidden h-4 w-1/6 sm:block" />
              <Skeleton className="ml-auto h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
