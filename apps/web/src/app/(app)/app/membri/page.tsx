import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Notice } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ForbiddenState } from "@/components/ui/states";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { sectionGate } from "@/lib/permissions";
import { inviteMember } from "../../actions";
import { RevokeInvitationButton } from "./revoke-button";

export const metadata: Metadata = { title: "Utenti e accessi" };

const INVITABLE_ROLES = [
  ["admin", "Amministratore"],
  ["operations_manager", "Responsabile operativo"],
  ["site_manager", "Responsabile cantiere"],
  ["back_office", "Amministrazione"],
  ["technician", "Tecnico"],
  ["owner", "Proprietario azienda"],
] as const;

const STATUS = {
  active: <Badge tone="success">Attivo</Badge>,
  suspended: <Badge tone="warning">Sospeso</Badge>,
  invited: <Badge tone="info">Invitato</Badge>,
} as Record<string, React.ReactNode>;

export default async function MembersPage() {
  const { access, company } = await getAppContext();
  const gate = sectionGate(access, "members.read");
  if (gate !== "ok") return <ForbiddenState needsMfa={gate === "mfa"} />;
  const canManage = access.permissions.has("members.manage");

  const { members, invitations } = await asCurrentUser(async (tx) => {
    const members = await tx.query<{
      id: string;
      email: string;
      full_name: string | null;
      role: string;
      status: string;
    }>(
      `select m.id, u.email, u.full_name, r.name as role, m.status
         from public.memberships m
         join public.users u on u.id = m.user_id
         join public.roles r on r.id = m.role_id
        where m.tenant_id = $1
        order by lower(coalesce(u.full_name, u.email))`,
      [access.tenantId],
    );
    const invitations = canManage
      ? await tx.query<{ id: string; email: string; role: string; expires_at: Date }>(
          `select i.id, i.email, r.name as role, i.expires_at
             from public.invitations i join public.roles r on r.id = i.role_id
            where i.tenant_id = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
            order by i.created_at desc`,
          [access.tenantId],
        )
      : { rows: [] };
    return { members: members.rows, invitations: invitations.rows };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utenti e accessi"
        description={`Chi può accedere a ${company.name} e con quale ruolo.`}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="members-table">
            <caption className="sr-only">Utenti dell&apos;azienda</caption>
            <thead>
              <tr className="border-b border-border bg-background/60 text-left">
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Persona
                </th>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Ruolo
                </th>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Stato
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{m.full_name ?? m.email}</p>
                    {m.full_name && <p className="text-xs text-muted-foreground">{m.email}</p>}
                  </td>
                  <td className="px-4 py-2.5">{m.role}</td>
                  <td className="px-4 py-2.5">{STATUS[m.status] ?? m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Invita una persona"
              description="Riceverà un link valido 7 giorni, da aprire con questa email."
            />
            <CardBody>
              <ActionForm action={inviteMember}>
                <FormField id="invite-email" label="Email" required>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={320}
                  />
                </FormField>
                <FormField id="invite-role" label="Ruolo" required>
                  <Select id="invite-role" name="roleKey" defaultValue="technician">
                    {INVITABLE_ROLES.filter(
                      ([k]) => k !== "owner" || access.roleKey === "owner",
                    ).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <SubmitButton>Invia invito</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Inviti in attesa" />
            {invitations.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nessun invito in attesa"
                description="Gli inviti inviati e non ancora accettati compariranno qui."
              />
            ) : (
              <ul className="divide-y divide-border" data-testid="pending-invitations">
                {invitations.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.role} · scade il {formatDate(i.expires_at)}
                      </p>
                    </div>
                    <RevokeInvitationButton id={i.id} email={i.email} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : access.permissionsRequiringMfa.has("members.manage") ? (
        <Notice>Per invitare persone serve la verifica in due passaggi.</Notice>
      ) : null}
    </div>
  );
}
