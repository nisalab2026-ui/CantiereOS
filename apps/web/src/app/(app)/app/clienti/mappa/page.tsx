import { listMapPoints } from "@cantiereos/core";
import type { Metadata } from "next";
import { PlacesMap } from "@/components/map/places-map";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { TabsNav } from "@/components/ui/tabs-nav";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { env } from "@/lib/env";
import type { SearchParams } from "@/lib/list-params";
import { mapTiles } from "@/lib/map-config";
import { sectionGate } from "@/lib/permissions";

export const metadata: Metadata = { title: "Mappa dei clienti" };

export default async function CustomersMapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "customers.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;

  const customerId = typeof sp.cliente === "string" ? sp.cliente : undefined;
  const focus = typeof sp.punto === "string" ? sp.punto : undefined;
  const data = await asCurrentUser((tx) =>
    listMapPoints(tx, access, customerId ? { customerId } : {}),
  );
  const filteredName = customerId
    ? data.points.find((p) => p.kind === "customer" && p.id === customerId)?.name
    : undefined;

  return (
    <div>
      <PageHeader
        title="Clienti"
        description={
          filteredName
            ? `Mappa di ${filteredName}: sede, sedi d'intervento e cantieri.`
            : data.canSeeSites
              ? "Dove sono clienti, sedi e cantieri dell'azienda."
              : "Dove sono i clienti e le loro sedi."
        }
      />
      <TabsNav
        label="Viste dei clienti"
        active="mappa"
        tabs={[
          { key: "elenco", label: "Elenco", href: "/app/clienti" },
          { key: "mappa", label: "Mappa", href: "/app/clienti/mappa" },
          ...(customerId && filteredName
            ? [
                {
                  key: "cliente",
                  label: `Solo ${filteredName}`,
                  href: `/app/clienti/mappa?cliente=${customerId}`,
                },
              ]
            : []),
        ]}
      />
      <div className="cos-enter">
        <PlacesMap
          points={data.points}
          tiles={mapTiles()}
          geocoding={env().GEOCODING_URL !== "off"}
          {...(focus ? { focus } : customerId ? { focus: `customer:${customerId}` } : {})}
        />
      </div>
    </div>
  );
}
