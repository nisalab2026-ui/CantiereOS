import {
  getFormSubmission,
  getRecordHistory,
  listFormCustomerOptions,
  listFormPhotos,
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
import { FormStatusBadge } from "../form-bits";
import { FormDocument } from "../form-document";
import { FormFiller } from "../form-filler";
import { DeleteSubmissionButton, PrintButton, ReopenSubmissionButton } from "../submission-actions";

export const metadata: Metadata = { title: "Modulo" };

export default async function FormSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access, company } = await getAppContext();
  const gate = sectionGate(access, "forms.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canWrite = access.permissions.has("forms.write");
  const canManage = access.permissions.has("forms.manage");
  const canDelete = access.permissions.has("forms.delete");

  const storage = formFileStorage();
  const data = await asCurrentUser(async (tx) => {
    const s = await getFormSubmission(tx, access, id);
    if (!s) return null;
    return {
      s,
      history: await getRecordHistory(tx, access, "form_submissions", id),
      customers: canWrite && s.status === "draft" ? await listFormCustomerOptions(tx, access) : [],
      photos: storage ? await listFormPhotos(tx, access, storage, id) : {},
    };
  });
  if (!data) notFound();
  const { s, history, customers, photos } = data;
  const editing = canWrite && s.status === "draft";
  // il cliente collegato resta selezionabile anche se nel frattempo è stato archiviato
  if (editing && s.customer && !customers.some((c) => c.id === s.customer!.id)) {
    customers.push({
      id: s.customer.id,
      name: s.customer.name,
      sites: s.site ? [{ id: s.site.id, name: s.site.name, address: "" }] : [],
    });
  }

  return (
    <div>
      <div className="print:hidden">
        <Breadcrumbs items={[{ label: "Moduli", href: "/app/moduli" }, { label: s.title }]} />
      </div>
      <PageHeader
        title={s.title}
        testId="form-title"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <FormStatusBadge status={s.status} />
            <span>
              {s.templateName} · versione {s.version}
            </span>
            {s.customer && (
              <>
                <span aria-hidden>·</span>
                <Link href={`/app/clienti/${s.customer.id}`} className="hover:underline">
                  {s.customer.name}
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <div
            key={`${s.id}-${s.status}`}
            className="flex flex-wrap justify-end gap-2 print:hidden"
          >
            <PrintButton />
            {s.status === "completed" && canManage && <ReopenSubmissionButton id={s.id} />}
            {canDelete && <DeleteSubmissionButton id={s.id} title={s.title} />}
          </div>
        }
      />
      {sp.nuovo === "1" && s.status === "draft" && (
        <div className="print:hidden">
          <Notice>
            Modulo creato. Compilalo e salva la bozza quando vuoi; chiudilo quando è completo.
          </Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {editing ? (
            <FormFiller
              id={s.id}
              version={new Date(s.updatedAt).toISOString()}
              definition={s.definition}
              initial={{
                title: s.title,
                customerId: s.customer?.id ?? "",
                siteId: s.site?.id ?? "",
                data: s.data,
              }}
              customers={customers}
              photos={photos}
            />
          ) : (
            <Card className="print:border-0 print:shadow-none">
              <CardBody className="print:p-0">
                <FormDocument
                  definition={s.definition}
                  values={s.data}
                  photos={photos}
                  heading={{
                    kicker: `${s.templateName} · versione ${s.version}`,
                    title: s.title,
                    company: company.name,
                  }}
                />
                <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground print:text-neutral-600">
                  {s.status === "completed"
                    ? `Chiuso il ${formatDateTime(s.completedAt!)}${s.completedByName ? ` da ${s.completedByName}` : ""}.`
                    : "Bozza: non ancora chiuso."}{" "}
                  Creato il {formatDateTime(s.createdAt)}
                  {s.createdByName ? ` da ${s.createdByName}` : ""}.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
        <Card className="self-start print:hidden">
          <CardHeader
            title="Cronologia"
            description="Chi l'ha compilato, chiuso o riaperto, e quando."
          />
          <CardBody>
            <Timeline events={history} showRecord={false} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
