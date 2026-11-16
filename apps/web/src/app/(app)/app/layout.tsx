import { isPlatformAdminAccount } from "@cantiereos/core";
import { redirect } from "next/navigation";
import { asCurrentUser, getAppContext, getMfaStatus, MFA_REQUIRED_ROLES } from "@/lib/auth";
import { AppShell } from "../shell";

/**
 * Area applicativa. Per titolari, amministratori e Super Admin la verifica in
 * due passaggi è obbligatoria: senza fattore si va a configurarla, con
 * fattore ma sessione aal1 si va alla verifica. (Il database comunque nega i
 * permessi amministrativi alle sessioni aal1.)
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const platformAdmin = await asCurrentUser((tx) => isPlatformAdminAccount(tx));
  const mustUseMfa = MFA_REQUIRED_ROLES.has(ctx.access.roleKey) || platformAdmin;
  if (mustUseMfa && ctx.session.aal !== "aal2") {
    const mfa = await getMfaStatus(ctx.session);
    redirect(
      mfa.verifiedFactors.length > 0 ? "/mfa?next=/app" : "/account/sicurezza?obbligatoria=1",
    );
  }
  return (
    <AppShell
      email={ctx.session.email}
      companies={ctx.companies}
      activeTenantId={ctx.access.tenantId}
      canSeeMembers={ctx.access.permissions.has("members.read")}
    >
      {children}
    </AppShell>
  );
}
