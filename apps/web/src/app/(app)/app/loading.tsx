import { Skeleton } from "@/components/ui/states";

/** Caricamento: segnaposto con la forma di intestazione + tabella. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex gap-2 px-4 py-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-32" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="h-4 w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
