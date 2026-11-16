import { listMyCompanies, resolveActiveTenant } from "@cantiereos/core";
import { asCurrentUser, requireSession } from "@/lib/auth";
import { AppShell } from "../shell";

/** Area account: accessibile con la sola sessione (serve per configurare la MFA obbligatoria). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { companies, access } = await asCurrentUser(async (tx) => {
    const companies = await listMyCompanies(tx);
    const access = companies.length > 0 ? await resolveActiveTenant(tx) : null;
    return { companies, access };
  });
  return (
    <AppShell session={session} companies={companies} access={access}>
      {children}
    </AppShell>
  );
}
