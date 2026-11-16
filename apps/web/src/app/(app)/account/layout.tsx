import { listMyCompanies, resolveActiveTenant } from "@cantiereos/core";
import { asCurrentUser, requireSession } from "@/lib/auth";
import { AppShell } from "../shell";

/** Area account: accessibile con la sola sessione (serve per configurare la MFA obbligatoria). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { companies, tenantId } = await asCurrentUser(async (tx) => {
    const companies = await listMyCompanies(tx);
    const tenantId = companies.length > 0 ? (await resolveActiveTenant(tx)).tenantId : null;
    return { companies, tenantId };
  });
  return (
    <AppShell
      email={session.email}
      companies={companies}
      activeTenantId={tenantId}
      canSeeMembers={false}
    >
      {children}
    </AppShell>
  );
}
