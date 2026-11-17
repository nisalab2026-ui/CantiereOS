import { cn } from "@/lib/cn";

/** Elenco "etichetta: valore" per le schede di dettaglio. I vuoti mostrano un trattino. */
export function DetailList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; wide?: boolean }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className={cn("min-w-0", i.wide && "sm:col-span-2")}>
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words whitespace-pre-line">
            {i.value === null || i.value === undefined || i.value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              i.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
