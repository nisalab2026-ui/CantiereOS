import { getWorkOrder, loadWorkOrderOptions } from "@cantiereos/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { sectionGate } from "@/lib/permissions";
import { WorkOrderForm } from "../../work-order-form";

export const metadata: Metadata = { title: "Modifica intervento" };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_orders.write");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const { order, options } = await asCurrentUser(async (tx) => ({
    order: await getWorkOrder(tx, access, id),
    options: await loadWorkOrderOptions(tx, access),
  }));
  if (!order) notFound();
  const lead = order.assignees.find((a) => a.isLead);
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: "Interventi", href: "/app/interventi" },
          { label: order.number, href: `/app/interventi/${order.id}` },
          { label: "Modifica" },
        ]}
      />
      <PageHeader title="Modifica intervento" description={order.title} />
      <WorkOrderForm
        options={options}
        defaults={{
          id: order.id,
          title: order.title,
          kind: order.kind,
          priority: order.priority,
          customerId: order.customerId,
          customerSiteId: order.customerSiteId,
          projectId: order.projectId,
          projectSiteId: order.projectSiteId,
          date: order.start.slice(0, 10),
          startTime: order.start.slice(11, 16),
          endDate: order.end.slice(0, 10),
          endTime: order.end.slice(11, 16),
          addressLine: order.addressLine,
          postalCode: order.postalCode,
          city: order.city,
          province: order.province,
          description: order.description,
          employeeIds: order.assignees.map((a) => a.employeeId),
          leadEmployeeId: lead?.employeeId ?? null,
        }}
      />
    </div>
  );
}
