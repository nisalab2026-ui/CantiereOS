import {
  getWorkReport,
  listWorkReportPhotos,
  WORK_ITEM_KIND_LABELS,
  WORK_REPORT_STATUS_LABELS,
} from "@cantiereos/core";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formFileStorage } from "@/lib/storage";
import { PrintButton } from "../../../moduli/submission-actions";
import { formatHours, formatReportDate } from "../../report-bits";

export const metadata: Metadata = { title: "Stampa rapportino" };

/**
 * Rapportino per il cliente (A4, "Salva come PDF" dal browser). Niente costi né
 * note interne: solo lavori, ore, materiali, foto e firma.
 */
export default async function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, company } = await getAppContext();
  if (!access.permissions.has("work_reports.read")) return <ForbiddenState needsMfa={false} />;
  const storage = formFileStorage();
  const data = await asCurrentUser(async (tx) => {
    const r = await getWorkReport(tx, access, id);
    if (!r) return null;
    return { r, photos: storage ? await listWorkReportPhotos(tx, access, storage, id) : [] };
  });
  if (!data) notFound();
  const { r, photos } = data;

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="mb-4 flex flex-wrap justify-between gap-2 print:hidden">
        <Link href={`/app/rapportini/${r.id}`} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft aria-hidden /> Torna al rapportino
        </Link>
        <PrintButton />
      </div>
      <article
        className="rounded-lg border border-border bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none"
        data-testid="report-print"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-neutral-800 pb-3">
          <div>
            <p className="text-lg font-bold">{company.name}</p>
            <p className="text-xs text-neutral-600">Rapportino di lavoro</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-semibold">N. {r.number}</p>
            <p>{formatReportDate(r.reportDate)}</p>
            {r.status === "draft" && (
              <p className="text-xs font-semibold text-neutral-600 uppercase">
                {WORK_REPORT_STATUS_LABELS.draft}
              </p>
            )}
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-neutral-600">Cliente</dt>
          <dd className="font-medium">{r.customerName}</dd>
          <dt className="text-neutral-600">Commessa</dt>
          <dd>
            {r.project.code} · {r.project.name}
          </dd>
          {r.siteName && (
            <>
              <dt className="text-neutral-600">Cantiere</dt>
              <dd>
                {r.siteName}
                {r.siteAddress && ` – ${r.siteAddress}`}
              </dd>
            </>
          )}
        </dl>

        <h2 className="mt-6 mb-1 text-sm font-bold uppercase">Lavori eseguiti</h2>
        <p className="min-h-12 whitespace-pre-line">{r.workDescription || "—"}</p>

        <h2 className="mt-6 mb-1 text-sm font-bold uppercase">Manodopera</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-400 text-left text-xs text-neutral-600">
              <th className="py-1 font-medium">Persona</th>
              <th className="py-1 font-medium">Orario</th>
              <th className="py-1 font-medium">Pausa</th>
              <th className="py-1 text-right font-medium">Ore</th>
            </tr>
          </thead>
          <tbody>
            {r.labor.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-1">{l.employeeName}</td>
                <td className="py-1 tabular-nums">
                  {l.startTime && l.endTime ? `${l.startTime}–${l.endTime}` : "—"}
                </td>
                <td className="py-1 tabular-nums">
                  {l.breakMinutes ? `${l.breakMinutes} min` : "—"}
                </td>
                <td className="py-1 text-right tabular-nums">{formatHours(l.hours)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1" colSpan={3}>
                Totale
              </td>
              <td className="py-1 text-right tabular-nums">{formatHours(r.hours)}</td>
            </tr>
          </tbody>
        </table>

        {r.items.length > 0 && (
          <>
            <h2 className="mt-6 mb-1 text-sm font-bold uppercase">Materiali e mezzi</h2>
            <table className="w-full border-collapse">
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id} className="border-b border-neutral-200">
                    <td className="py-1">{i.description}</td>
                    <td className="py-1 text-neutral-600">{WORK_ITEM_KIND_LABELS[i.kind]}</td>
                    <td className="py-1 text-right tabular-nums">
                      {i.quantity.toLocaleString("it-IT")} {i.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {photos.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-bold uppercase">Foto</h2>
            <div className="grid grid-cols-3 gap-2 break-inside-avoid">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmato a breve durata
                <img
                  key={p.id}
                  src={p.url}
                  alt={`Foto ${i + 1}`}
                  className="aspect-[4/3] w-full rounded object-cover"
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <p className="text-xs text-neutral-600">Per l&apos;impresa</p>
            <p className="mt-1 border-b border-neutral-500 pb-6">{r.authorName ?? ""}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600">Per il cliente, firma per presa visione</p>
            {r.customerSignature ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL della firma */}
                <img
                  src={r.customerSignature}
                  alt={`Firma di ${r.customerSignerName ?? "cliente"}`}
                  className="h-20 object-contain"
                />
                <p className="border-t border-neutral-500 pt-1 text-xs">
                  {r.customerSignerName}
                  {r.customerSignedAt &&
                    ` · ${new Date(r.customerSignedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`}
                </p>
              </>
            ) : (
              <p className="mt-1 border-b border-neutral-500 pb-6">&nbsp;</p>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
