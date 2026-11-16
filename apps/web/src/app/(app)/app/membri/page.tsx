import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Notice } from "@/components/ui";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { inviteMember, revokeInvite } from "../../actions";

export const metadata: Metadata = { title: "Membri" };

const INVITABLE_ROLES = [
  ["admin", "Amministratore"],
  ["operations_manager", "Responsabile operativo"],
  ["site_manager", "Responsabile cantiere"],
  ["back_office", "Amministrazione"],
  ["technician", "Tecnico"],
  ["owner", "Proprietario azienda"],
] as const;

export default async function MembersPage() {
  const { access, company } = await getAppContext();
  if (!access.permissions.has("members.read")) redirect("/app");
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
        order by u.email`,
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membri di {company.name}</h1>
        <p className="text-sm text-muted">Chi può accedere all&apos;azienda e con quale ruolo.</p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm" data-testid="members-table">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-4 py-2 font-medium">Ruolo</th>
              <th className="px-4 py-2 font-medium">Stato</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  {m.full_name ? `${m.full_name} · ` : ""}
                  {m.email}
                </td>
                <td className="px-4 py-2">{m.role}</td>
                <td className="px-4 py-2">
                  {m.status === "active"
                    ? "Attivo"
                    : m.status === "suspended"
                      ? "Sospeso"
                      : "Invitato"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canManage ? (
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 font-medium">Invita una persona</h2>
            <ActionForm action={inviteMember}>
              <Field label="Email" name="email" type="email" autoComplete="off" />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Ruolo</span>
                <select
                  name="roleKey"
                  defaultValue="technician"
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
                >
                  {INVITABLE_ROLES.filter(([k]) => k !== "owner" || access.roleKey === "owner").map(
                    ([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <SubmitButton>Invia invito</SubmitButton>
            </ActionForm>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 font-medium">Inviti in attesa</h2>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted">Nessun invito in attesa.</p>
            ) : (
              <ul className="space-y-2" data-testid="pending-invitations">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {i.email} · {i.role} · scade il {i.expires_at.toLocaleDateString("it-IT")}
                    </span>
                    <form action={revokeInvite}>
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button className="text-danger hover:underline">Revoca</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : access.permissionsRequiringMfa.has("members.manage") ? (
        <Notice>Per invitare persone serve la verifica in due passaggi.</Notice>
      ) : null}
    </div>
  );
}
