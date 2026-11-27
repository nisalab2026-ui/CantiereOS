import { getCompanyProfile } from "@cantiereos/core";
import { ChevronRight, History, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Dati azienda" };

const STATUS: Record<string, string> = {
  trial: "In prova",
  active: "Attiva",
  suspended: "Sospesa",
  closed: "Chiusa",
};

/**
 * Dati dell'azienda attiva. Tutti i membri li leggono; li modifica solo chi ha
 * `tenant.manage` (titolare, amministratore) con verifica in due passaggi:
 * il controllo lo ripete il database (RLS).
 */
export default async function CompanyPage() {
  const { access } = await getAppContext();
  const company = await asCurrentUser((tx) => getCompanyProfile(tx, access));
  if (!company) return null;
  const canManage = access.permissions.has("tenant.manage");
  const version = new Date(company.updatedAt).toISOString();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Dati azienda"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {company.name}
            <Badge tone={company.status === "active" ? "success" : "neutral"}>
              {STATUS[company.status] ?? company.status}
            </Badge>
            {company.isDemo && <Badge tone="demo">DEMO</Badge>}
          </span>
        }
        testId="company-title"
      />
      {company.isDemo && (
        <Notice tone="warning">
          Azienda dimostrativa del seed di sviluppo: i dati non sono reali.
        </Notice>
      )}
      <Card>
        <CardHeader
          title="Identità"
          description={
            canManage
              ? "Ogni modifica resta nel registro attività con autore e valore precedente."
              : "Solo il titolare o un amministratore può modificarli."
          }
        />
        <CardBody>
          {canManage ? (
            <CompanyForm
                name={company.name}
              legalName={company.legalName}
              vatNumber={company.vatNumber}
              taxCode={company.taxCode}
              version={version}
            />
          ) : (
            <DetailList
              items={[
                { label: "Nome dell'azienda", value: company.name },
                { label: "Ragione sociale", value: company.legalName },
                {
                  label: "Partita IVA",
                  value: company.vatNumber && (
                    <span className="font-mono">{company.vatNumber}</span>
                  ),
                },
                {
                  label: "Codice fiscale",
                  value: company.taxCode && <span className="font-mono">{company.taxCode}</span>,
                },
              ]}
            />
          )}
        </CardBody>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {access.permissions.has("members.read") && (
          <QuickLink
            href="/app/membri"
            icon={Users}
            title="Utenti e accessi"
            text={`${company.members} ${company.members === 1 ? "persona attiva" : "persone attive"}, inviti e ruoli`}
          />
        )}
        {access.permissions.has("audit.read") && (
          <QuickLink
            href="/app/registro"
            icon={History}
            title="Registro attività"
            text="Chi ha modificato cosa, e quando"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Azienda creata il {formatDate(company.createdAt)}.
      </p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 text-sm transition-colors hover:bg-accent/40"
    >
      <Icon className="size-5 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
