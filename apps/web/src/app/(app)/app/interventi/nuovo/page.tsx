import { loadWorkOrderOptions } from "@cantiereos/core";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { todayInRome } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { WorkOrderForm } from "../work-order-form";

export const metadata: Metadata = { title: "Nuovo intervento" };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_orders.write");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const options = await asCurrentUser((tx) => loadWorkOrderOptions(tx, access));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno ?? "") ? sp.giorno! : todayInRome();
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs items={[{ label: "Interventi", href: "/app/interventi" }, { label: "Nuovo" }]} />
      <PageHeader
        title="Nuovo intervento"
        description="Cosa fare, quando, dove e con chi. La squadra lo vede subito e riceve un avviso."
      />
      <WorkOrderForm
        options={options}
        defaults={{
          date,
          ...(sp.cliente ? { customerId: sp.cliente } : {}),
          ...(sp.commessa ? { projectId: sp.commessa } : {}),
        }}
      />
    </div>
  );
}
