import {
  getRecordHistory,
  getWorkReport,
  listWorkReportPhotos,
  loadWorkReportOptions,
  WORK_ITEM_KIND_LABELS,
} from "@cantiereos/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/history/timeline";
import { Notice } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { formFileStorage } from "@/lib/storage";
import { Money } from "../../pagamenti/payment-bits";
import { formatHours, formatReportDate, ReportStatusBadge } from "../report-bits";
import { PricesDialog, ReportStatusActions } from "./report-actions";
import { ReportEditor } from "./report-editor";
import { ReportPhotos, ReportSignature } from "./report-extras";

export const metadata: Metadata = { title: "Rapportino" };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await getAppContext();
  const gate = sectionGate(access, "work_reports.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("work_reports.write");
  const canFinance = access.permissions.has("projects.finance");
  const storage = formFileStorage();

  const data = await asCurrentUser(async (tx) => {
    const r = await getWorkReport(tx, access, id);
    if (!r) return null;
    return {
      r,
      options: r.canEdit ? await loadWorkReportOptions(tx, access) : null,
      photos: storage ? await listWorkReportPhotos(tx, access, storage, id) : [],
      history: await getRecordHistory(tx, access, "work_reports", id),
    };
  });
  if (!data) notFound();
  const { r, options, photos, history } = data;
  const sites = options?.projects.find((p) => p.id === r.project.id)?.sites ?? [];
  const title = `Rapportino ${r.number}`;

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Rapportini", href: "/app/rapportini" }, { label: r.number }]}
      />
      <PageHeader
        title={title}
        testId="report-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ReportStatusBadge status={r.status} />
            <span>{formatReportDate(r.reportDate)}</span>
            <span aria-hidden>·</span>
            <Link href={`/app/commesse/${r.project.id}`} className="hover:underline">
              <span className="font-mono text-xs">{r.project.code}</span> {r.project.name}
            </Link>
            <span aria-hidden>·</span>
            <span>{r.customerName}</span>
            {r.siteName && (
              <>
                <span aria-hidden>·</span>
                <span>{r.siteName}</span>
              </>
            )}
          </span>
        }
        actions={
          <ReportStatusActions
            key={`${r.id}-${r.status}`}
            id={r.id}
            status={r.status}
            isAuthor={r.isMine}
            canWrite={canWrite}
            canApprove={r.canApprove}
            canDelete={access.permissions.has("work_reports.delete")}
          />
        }
      />
      {sp.salvato === "1" && r.status === "draft" && <Notice>Rapportino salvato.</Notice>}
      {sp.nuovo === "1" && r.status === "draft" && (
        <Notice>
          Rapportino {r.number} creato. Aggiungi ore e materiali, poi salva e invialo.
        </Notice>
      )}
      {r.status === "draft" && r.returnedReason && (
        <Notice tone="warning">
          <strong>Restituito per correzioni:</strong> {r.returnedReason}
        </Notice>
      )}
      {r.status === "submitted" && (
        <Notice>
          Inviato {r.submittedAt ? formatDateTime(r.submittedAt) : ""}
          {r.submittedByName ? ` da ${r.submittedByName}` : ""}: in attesa di approvazione.
        </Notice>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {r.canEdit && options ? (
            <ReportEditor
              key={new Date(r.updatedAt).toISOString()}
              report={r}
              sites={sites}
              employees={options.employees}
              canFinance={canFinance}
            />
          ) : (
            <ReadOnlyReport r={r} canFinance={canFinance} />
          )}
        </div>
        <div className="space-y-4">
          {r.costs && (
            <Card>
              <CardHeader
                title="Costi"
                description="Da costo orario delle persone e prezzi delle voci. Li vedete solo tu e l'amministrazione."
              />
              <CardBody className="space-y-2 text-sm" data-testid="report-costs">
                <Row label="Manodopera" cents={r.costs.laborCents} />
                <Row label="Materiali e mezzi" cents={r.costs.itemsCents} />
                <Row label="Totale" cents={r.costs.laborCents + r.costs.itemsCents} strong />
                {(r.costs.missingRates > 0 || r.costs.missingPrices > 0) && (
                  <p className="text-xs text-warning">
                    {r.costs.missingRates > 0 &&
                      `${r.costs.missingRates} ${r.costs.missingRates === 1 ? "persona" : "persone"} senza costo orario (scheda del personale). `}
                    {r.costs.missingPrices > 0 &&
                      `${r.costs.missingPrices} ${r.costs.missingPrices === 1 ? "voce" : "voci"} senza prezzo.`}
                  </p>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Foto" />
            <CardBody>
              {storage ? (
                <ReportPhotos id={r.id} photos={photos} editable={r.canEdit} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Archiviazione foto non configurata: contatta l&apos;amministratore.
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Firma del cliente"
              {...(r.canEdit
                ? { description: "Fai firmare il cliente sul telefono o sul tablet." }
                : {})}
            />
            <CardBody>
              <ReportSignature
                id={r.id}
                signature={r.customerSignature}
                signerName={r.customerSignerName}
                signedAt={r.customerSignedAt}
                editable={r.canEdit}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cronologia" />
            <CardBody>
              <Timeline events={history} />
              {r.approvedAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Approvato {formatDateTime(r.approvedAt)}
                  {r.approvedByName ? ` da ${r.approvedByName}` : ""}.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <p
      className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}
    >
      <span>{label}</span>
      <Money cents={cents} />
    </p>
  );
}

function ReadOnlyReport({
  r,
  canFinance,
}: {
  r: Awaited<ReturnType<typeof getWorkReport>> & object;
  canFinance: boolean;
}) {
  return (
    <>
      <Card>
        <CardHeader title="Lavori eseguiti" />
        <CardBody>
          <p className="text-sm whitespace-pre-line">{r.workDescription || "—"}</p>
          {r.notes && (
            <p className="mt-3 text-xs whitespace-pre-line text-muted-foreground">
              Note interne: {r.notes}
            </p>
          )}
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Ore" description={`Totale ${formatHours(r.hours)}`} />
        <table className="w-full text-sm" data-testid="report-labor">
          <caption className="sr-only">Ore per persona</caption>
          <thead className="bg-accent/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-4 py-2 font-medium">Orario</th>
              <th className="px-4 py-2 text-right font-medium">Ore</th>
            </tr>
          </thead>
          <tbody>
            {r.labor.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2">
                  {l.employeeName}
                  {l.notes && (
                    <span className="block text-xs text-muted-foreground">{l.notes}</span>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {l.startTime && l.endTime
                    ? `${l.startTime}–${l.endTime}${l.breakMinutes ? `, pausa ${l.breakMinutes}′` : ""}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatHours(l.hours)}</td>
              </tr>
            ))}
            {r.labor.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                  Nessuna riga.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          title="Materiali e mezzi"
          {...(canFinance && r.items.length > 0
            ? { actions: <PricesDialog id={r.id} items={r.items} /> }
            : {})}
        />
        <table className="w-full text-sm">
          <caption className="sr-only">Materiali e mezzi</caption>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.id} className="border-t border-border first:border-t-0">
                <td className="px-4 py-2">
                  {i.description}
                  <span className="block text-xs text-muted-foreground">
                    {WORK_ITEM_KIND_LABELS[i.kind]}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {i.quantity.toLocaleString("it-IT")} {i.unit}
                </td>
                {canFinance && (
                  <td className="px-4 py-2 text-right">
                    {i.unitCostCents != null ? <Money cents={i.unitCostCents} /> : "—"}
                  </td>
                )}
              </tr>
            ))}
            {r.items.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground">Nessuna voce.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
