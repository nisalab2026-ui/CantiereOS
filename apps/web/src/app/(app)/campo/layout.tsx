import { isPlatformAdminAccount } from "@cantiereos/core";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/sidebar";
import { asCurrentUser, getAppContext, getMfaStatus, MFA_REQUIRED_ROLES } from "@/lib/auth";
import { FieldTabs } from "./field-tabs";

export const metadata: Metadata = {
  title: { default: "Campo", template: "%s · Campo" },
  appleWebApp: { capable: true, title: "Campo", statusBarStyle: "default" },
};
export const viewport: Viewport = { viewportFit: "cover" };

/**
 * App dei dipendenti sul campo (ADR-017): stessa sessione, stessi dati e stessi
 * permessi del gestionale, interfaccia da telefono con solo ciò che serve.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const platformAdmin = await asCurrentUser((tx) => isPlatformAdminAccount(tx));
  if ((MFA_REQUIRED_ROLES.has(ctx.access.roleKey) || platformAdmin) && ctx.session.aal !== "aal2") {
    const mfa = await getMfaStatus(ctx.session);
    redirect(
      mfa.verifiedFactors.length > 0 ? "/mfa?next=/campo" : "/account/sicurezza?obbligatoria=1",
    );
  }
  if (!ctx.access.permissions.has("work_orders.read")) redirect("/app");
  const office = ctx.access.permissions.has("work_orders_all.read");

  return (
    <div className="field-app min-h-dvh bg-background">
      <header className="cos-glass sticky top-0 z-30 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <Link href="/campo" className="flex items-center gap-2" aria-label="Oggi">
            <Logo className="h-6" />
            <span className="text-[15px] font-semibold tracking-tight">Campo</span>
          </Link>
          <span className="ml-auto truncate text-xs text-muted-foreground">{ctx.company.name}</span>
          {office && (
            <Link
              href="/app"
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Gestionale
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <FieldTabs />
    </div>
  );
}
