import type { CompanyMembership, TenantAccess, VerifiedSession } from "@cantiereos/core";
import { cookies } from "next/headers";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { asCurrentUser } from "@/lib/auth";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

/**
 * Struttura dell'area applicativa: sidebar (navy) + header + contenuto.
 * Le voci di menu si basano sui permessi VERIFICATI dell'azienda attiva;
 * nasconderle è solo comodità: ogni pagina e azione ricontrolla sul server.
 */
export async function AppShell({
  session,
  companies,
  access,
  children,
}: {
  session: VerifiedSession;
  companies: CompanyMembership[];
  access: TenantAccess | null;
  children: React.ReactNode;
}) {
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const collapsed = store.get("cos_sidebar")?.value === "collapsed";
  const { fullName, unread } = await asCurrentUser(async (tx) => {
    const u = await tx.query<{ full_name: string | null }>(
      "select full_name from public.users where id = auth.uid()",
    );
    const n = access
      ? await tx.query<{ n: number }>(
          "select count(*)::int as n from public.notifications where tenant_id = $1 and user_id = auth.uid() and read_at is null",
          [access.tenantId],
        )
      : null;
    return { fullName: u.rows[0]?.full_name ?? null, unread: n ? (n.rows[0]?.n ?? 0) : null };
  });
  const permissions = access ? [...access.permissions] : [];
  const activeTenantId = access?.tenantId ?? null;
  return (
    <div className="flex min-h-dvh">
      <div className="contents print:hidden">
        <Sidebar
          companies={companies}
          activeTenantId={activeTenantId}
          permissions={permissions}
          initialCollapsed={collapsed}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="contents print:hidden">
          <Header
            companies={companies}
            activeTenantId={activeTenantId}
            permissions={permissions}
            email={session.email}
            fullName={fullName}
            theme={theme}
            unread={unread}
          />
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
