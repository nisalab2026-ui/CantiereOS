/**
 * Grafici a barre semplici (una serie, un solo colore): HTML + CSS, nessuna
 * libreria. Ogni barra mostra il valore al passaggio o al focus; una tabella
 * nascosta offre gli stessi dati a chi usa un lettore di schermo.
 */
const monthFmt = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function MonthBars({
  data,
  caption,
  hrefFor,
  format = String,
  valueLabel = "Scadenze",
}: {
  data: { month: string; count: number }[];
  caption: string;
  hrefFor?: (month: string) => string;
  /** come mostrare il valore (es. importi in euro) */
  format?: (n: number) => string;
  /** intestazione della colonna dei valori nella tabella accessibile */
  valueLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <figure>
      <div className="flex h-40 items-end gap-3 border-b border-border px-1" aria-hidden>
        {data.map((d) => {
          const date = new Date(`${d.month}-01T00:00:00Z`);
          const bar = (
            <span className="group relative flex h-full w-full flex-col items-center justify-end">
              <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-sm border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="capitalize">{monthLongFmt.format(date)}</span>: {format(d.count)}
              </span>
              <span
                className="w-full max-w-10 rounded-t-[4px] bg-primary/85 transition-colors group-hover:bg-primary"
                style={{ height: d.count === 0 ? 2 : `${Math.max(4, (d.count / max) * 100)}%` }}
              />
            </span>
          );
          return hrefFor ? (
            <a
              key={d.month}
              href={hrefFor(d.month)}
              className="flex h-full flex-1 focus-visible:outline-none"
              tabIndex={-1}
            >
              {bar}
            </a>
          ) : (
            <div key={d.month} className="flex h-full flex-1">
              {bar}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-3 px-1 text-xs text-muted-foreground" aria-hidden>
        {data.map((d) => (
          <span key={d.month} className="flex-1 text-center capitalize">
            {monthFmt.format(new Date(`${d.month}-01T00:00:00Z`))}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Mese</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{monthLongFmt.format(new Date(`${d.month}-01T00:00:00Z`))}</td>
              <td>{format(d.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Barre orizzontali etichettate (categoria · valore), con link alla lista filtrata. */
export function LabeledBars({
  rows,
}: {
  rows: { key: string; label: string; value: number; note?: string | undefined; href?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span>{r.label}</span>
              <span className="tabular-nums">
                {r.value}
                {r.note && <span className="ml-1.5 text-xs text-danger">{r.note}</span>}
              </span>
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-accent" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary/85"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <a href={r.href} className="block rounded-sm hover:opacity-90">
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
