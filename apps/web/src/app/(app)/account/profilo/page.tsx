import { getMyProfile, listMyCompanies } from "@cantiereos/core";
import { Building2, ChevronRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { asCurrentUser, getMfaStatus, requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profilo" };

/** Profilo personale: dati della persona, aziende di cui fa parte, sicurezza. */
export default async function ProfilePage() {
  const session = await requireSession();
  const [{ profile, companies }, mfa] = await Promise.all([
    asCurrentUser(async (tx) => ({
      profile: await getMyProfile(tx),
      companies: await listMyCompanies(tx),
    })),
    getMfaStatus(session),
  ]);
  if (!profile) return null;
  const version = new Date(profile.updatedAt).toISOString();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Profilo"
        description={`Account creato il ${formatDate(profile.createdAt)}.`}
        testId="profile-title"
      />
      <Card>
        <CardHeader title="Dati personali" description="Come ti vedono i colleghi nell'app." />
        <CardBody>
          <ProfileForm
            fullName={profile.fullName}
            phone={profile.phone}
            email={profile.email}
            version={version}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Le tue aziende"
          description="Il ruolo lo assegna il titolare o un amministratore di ciascuna azienda."
        />
        <ul className="divide-y divide-border" data-testid="my-companies">
          {companies.map((c) => (
            <li key={c.tenantId} className="flex items-center gap-3 px-5 py-3 text-sm">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {c.isDemo && <Badge tone="demo">DEMO</Badge>}
              <span className="text-muted-foreground">{c.roleName}</span>
            </li>
          ))}
          {companies.length === 0 && (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              Non fai ancora parte di un&apos;azienda.
            </li>
          )}
        </ul>
      </Card>
      <Link
        href="/account/sicurezza"
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 text-sm transition-colors hover:bg-accent/40"
      >
        <ShieldCheck className="size-5 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Sicurezza dell&apos;account</span>
          <span className="block text-muted-foreground">
            Verifica in due passaggi {mfa.verifiedFactors.length > 0 ? "attiva" : "non attiva"},
            codici di recupero, uscita da tutti i dispositivi.
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}
