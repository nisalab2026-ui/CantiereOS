"use client";

import { usePathname } from "next/navigation";
import type { CompanyMembership } from "@cantiereos/core";
import type { ThemePreference } from "@/lib/theme";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { titleFor } from "./navigation";
import { NotificationsButton } from "./notifications";
import { UserMenu } from "./user-menu";

export function Header({
  companies,
  activeTenantId,
  permissions,
  email,
  fullName,
  theme,
  unread,
}: {
  companies: CompanyMembership[];
  activeTenantId: string | null;
  permissions: string[];
  email: string | null;
  fullName: string | null;
  theme: ThemePreference;
  unread: number | null;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/60 px-4 backdrop-blur-xl lg:px-8">
      <MobileNav companies={companies} activeTenantId={activeTenantId} permissions={permissions} />
      <p className="hidden min-w-0 truncate text-sm font-semibold md:block md:w-48">
        {titleFor(pathname)}
      </p>
      <div className="flex flex-1 justify-center">
        {activeTenantId && <CommandPalette permissions={permissions} />}
      </div>
      <div className="flex items-center gap-1">
        {unread !== null && <NotificationsButton initialUnread={unread} />}
        <UserMenu email={email} fullName={fullName} theme={theme} />
      </div>
    </header>
  );
}
