import { Building2, LogOut, Shield, Users, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type { CompanyMembership } from "@cantiereos/core";
import { switchCompany } from "./actions";

export function AppShell({
  email,
  companies,
  activeTenantId,
  canSeeMembers,
  children,
}: {
  email: string | null;
  companies: CompanyMembership[];
  activeTenantId: string | null;
  canSeeMembers: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/app" className="font-semibold tracking-tight text-brand">
            CantiereOS
          </Link>
          {companies.length > 0 && (
            <form
              action={switchCompany}
              className="flex items-center gap-2"
              aria-label="Azienda attiva"
            >
              <Building2 className="size-4 text-muted" aria-hidden />
              <select
                name="tenantId"
                defaultValue={activeTenantId ?? undefined}
                className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
                aria-label="Seleziona azienda"
              >
                {companies.map((c) => (
                  <option key={c.tenantId} value={c.tenantId}>
                    {c.name} — {c.roleName}
                  </option>
                ))}
              </select>
              {companies.length > 1 && (
                <button className="h-8 rounded-md border border-line px-2 text-sm hover:bg-canvas">
                  Cambia
                </button>
              )}
            </form>
          )}
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/app"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas"
            >
              <LayoutDashboard className="size-4" aria-hidden /> Panoramica
            </Link>
            {canSeeMembers && (
              <Link
                href="/app/membri"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas"
              >
                <Users className="size-4" aria-hidden /> Membri
              </Link>
            )}
            <Link
              href="/account/sicurezza"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas"
            >
              <Shield className="size-4" aria-hidden /> Sicurezza
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted" data-testid="current-user">
              {email}
            </span>
            <form action="/esci" method="post">
              <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas">
                <LogOut className="size-4" aria-hidden /> Esci
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
