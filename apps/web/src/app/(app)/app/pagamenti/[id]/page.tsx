import { getPayment, getRecordHistory, PAYMENT_METHOD_LABELS } from "@cantiereos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { loadDeadlineOptions } from "@/lib/deadline-options";
import { formatDateTime, todayInRome } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { formatDue } from "../../scadenze/deadline-bits";
import { DeletePaymentButton, MarkPaidButton, PaymentStatusButton } from "../payment-actions";
import { centsToInput, Money, PaymentDirection, PaymentStateBadge } from "../payment-bits";
import { PaymentDialog } from "../payment-form";

export const metadata: Metadata = { title: "Pagamento" };

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "payments.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("payments.write");
  const canDelete = access.permissions.has("payments.delete");

  const data = await asCurrentUser(async (tx) => {
    const p = await getPayment(tx, access, id);
    if (!p) return null;
    const options = canWrite ? await loadDeadlineOptions(tx, access, p.counterparty) : null;
    return { p, history: await getRecordHistory(tx, access, "payments", id), options };
  });
  if (!data) notFound();
  const { p, history, options } = data;
  const open = p.status === "open";

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Pagamenti", href: "/app/pagamenti" }, { label: p.description }]}
      />
      <PageHeader
        title={p.description}
        testId="payment-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PaymentStateBadge state={p.state} />
            <PaymentDirection direction={p.direction} />
            <span aria-hidden>·</span>
            <Money cents={p.amountCents} className="font-medium text-foreground" />
            <span aria-hidden>·</span>
            <span className="tabular-nums">entro il {formatDue(p.dueDate)}</span>
          </span>
        }
        actions={
          canWrite ? (
            <div key={`${p.id}-${p.status}`} className="flex flex-wrap justify-end gap-2">
              {open && (
                <MarkPaidButton
                  id={p.id}
                  incoming={p.direction === "incoming"}
                  amount={centsToInput(p.amountCents)}
                  method={p.method}
                  today={todayInRome()}
                />
              )}
              {open && options && (
                <PaymentDialog
                  mode="edit"
                  customers={options.subjects.customer}
                  suppliers={options.subjects.supplier}
                  defaults={{
                    id: p.id,
                    version: new Date(p.updatedAt).toISOString(),
                    direction: p.direction,
                    description: p.description,
                    referenceCode: p.referenceCode,
                    amount: centsToInput(p.amountCents),
                    dueDate: p.dueDate,
                    method: p.method,
                    notes: p.notes,
                    counterpartyId: p.counterparty?.id ?? null,
                  }}
                />
              )}
              {open && <PaymentStatusButton id={p.id} to="cancelled" />}
              {!open && <PaymentStatusButton id={p.id} to="open" />}
              {canDelete && <DeletePaymentButton id={p.id} title={p.description} />}
            </div>
          ) : undefined
        }
      />
      {sp.creato === "1" && <Notice>Pagamento registrato.</Notice>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dettagli" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: p.direction === "incoming" ? "Cliente" : "Fornitore",
                    value: p.counterparty ? (
                      p.counterparty.type === "customer" ? (
                        <Link
                          href={`/app/clienti/${p.counterparty.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.counterparty.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{p.counterparty.name}</span>
                      )
                    ) : null,
                  },
                  { label: "Riferimento", value: p.referenceCode },
                  { label: "Importo previsto", value: <Money cents={p.amountCents} /> },
                  { label: "Data prevista", value: formatDue(p.dueDate) },
                  {
                    label: "Modalità",
                    value: p.method ? (PAYMENT_METHOD_LABELS[p.method] ?? p.method) : null,
                  },
                  {
                    label: "Registrato",
                    value: `${formatDateTime(p.createdAt)}${p.createdByName ? ` da ${p.createdByName}` : ""}`,
                  },
                  { label: "Note", value: p.notes, wide: true },
                ]}
              />
            </CardBody>
          </Card>
          {p.status === "paid" && (
            <Card>
              <CardHeader title={p.direction === "incoming" ? "Incasso" : "Pagamento"} />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Data", value: p.paidOn ? formatDue(p.paidOn) : null },
                    {
                      label: "Importo",
                      value:
                        p.paidAmountCents !== null ? (
                          <span>
                            <Money cents={p.paidAmountCents} />
                            {p.paidAmountCents !== p.amountCents && (
                              <span className="text-muted-foreground">
                                {" "}
                                (differenza <Money cents={p.amountCents - p.paidAmountCents} />)
                              </span>
                            )}
                          </span>
                        ) : null,
                    },
                    { label: "Segnato da", value: p.recordedByName },
                    { label: "Il", value: p.recordedAt ? formatDateTime(p.recordedAt) : null },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader
            title="Cronologia"
            description="Ogni modifica, con autore e valori prima e dopo."
          />
          <CardBody>
            <Timeline events={history} showRecord={false} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
