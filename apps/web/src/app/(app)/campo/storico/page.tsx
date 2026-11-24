import { listWorkOrders, type WorkOrderRow } from "@cantiereos/core";
import { History } from "lucide-react";
import type { Metadata } from "next";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { todayInRome } from "@/lib/format";
import { addDays, FieldOrderRow, longDay } from "../field-bits";

export const metadata: Metadata = { title: "Storico" };

/** Interventi svolti negli ultimi due mesi, dal più recente. */
export default async function FieldHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const today = todayInRome();
  const q = (sp.q ?? "").slice(0, 100);
  const rows = (
    await asCurrentUser((tx) =>
      listWorkOrders(tx, access, { from: addDays(today, -61), to: today, mine: true, q }),
    )
  )
    .filter((r) => r.status === "completed" || r.status === "cancelled")
    .reverse();
  const byDay = new Map<string, WorkOrderRow[]>();
  for (const r of rows) {
    const d = r.start.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Storico</h1>
        <p className="text-sm text-muted-foreground">
          I tuoi interventi chiusi negli ultimi due mesi.
        </p>
      </div>
      <form role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Cerca cliente, lavoro, indirizzo"
          aria-label="Cerca nello storico"
          className="h-11 w-full rounded-full border border-border bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <History className="size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium">{q ? "Nessun risultato" : "Ancora niente qui"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Gli interventi completati compaiono in questo elenco.
          </p>
        </div>
      ) : (
        [...byDay.entries()].map(([d, items]) => (
          <section key={d} className="space-y-2">
            <h2 className="text-sm font-semibold first-letter:uppercase">{longDay(d)}</h2>
            <ul className="space-y-2">
              {items.map((o) => (
                <li key={o.id}>
                  <FieldOrderRow o={o} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
