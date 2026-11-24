import { listWorkOrders } from "@cantiereos/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RouteMap } from "@/components/map/route-map";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { todayInRome } from "@/lib/format";
import { mapTiles } from "@/lib/map-config";
import { timeOf } from "../../app/interventi/work-order-bits";
import { addDays, fieldHref, FieldOrderRow, longDay } from "../field-bits";

export const metadata: Metadata = { title: "Mappa" };

/** Il giro di un giorno: tappe numerate nell'ordine previsto e percorso. */
export default async function FieldMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const today = todayInRome();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : today;
  const rows = (
    await asCurrentUser((tx) => listWorkOrders(tx, access, { from: day, to: day, mine: true }))
  ).filter((r) => r.status !== "cancelled");
  const missing = rows.filter((r) => r.latitude === null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/campo/mappa?d=${addDays(day, -1)}`}
          aria-label="Giorno precedente"
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="text-center">
          <h1 className="font-semibold first-letter:uppercase">
            {day === today ? "Oggi" : longDay(day)}
          </h1>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "tappa" : "tappe"}
          </p>
        </div>
        <Link
          href={`/campo/mappa?d=${addDays(day, 1)}`}
          aria-label="Giorno successivo"
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>

      <RouteMap
        tiles={mapTiles()}
        className="h-[52dvh] min-h-72"
        stops={rows.map((o) => ({
          id: o.id,
          title: o.title,
          time: timeOf(o.start),
          lat: o.latitude,
          lng: o.longitude,
          status: o.status,
          href: fieldHref(o.id),
        }))}
      />
      {missing > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing === 1 ? "Una tappa non ha" : `${missing} tappe non hanno`} ancora la posizione:
          l&apos;ufficio può aggiungerla dalla mappa dei clienti.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((o, i) => (
          <li key={o.id}>
            <FieldOrderRow o={o} index={i + 1} day={day} />
          </li>
        ))}
      </ul>
    </div>
  );
}
