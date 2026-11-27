"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CompanyMembership } from "@cantiereos/core";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { CommandPalette, isTyping } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { titleFor } from "./navigation";
import { NewMenu } from "./new-menu";
import { NotificationsButton } from "./notifications";
import { RecentTracker } from "./recent";
import { UserMenu } from "./user-menu";

/**
 * Vero dopo aver scorso la pagina. Soglie diverse in andata e ritorno: la barra
 * che si abbassa sposta il contenuto e non deve rimbalzare vicino al limite.
 */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setScrolled((was) => (was ? window.scrollY > 4 : window.scrollY > 24));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return scrolled;
}

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
  const compact = useScrolled();
  const [newOpen, setNewOpen] = useState(false);

  // «N» apre «+ Nuovo» quando non si sta scrivendo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      setNewOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      data-compact={compact ? "" : undefined}
      className={cn(
        "sticky top-0 z-30 flex items-center gap-3 border-b px-4 backdrop-blur-xl backdrop-saturate-150 transition-[height,background-color,box-shadow,border-color] duration-200 lg:px-8",
        compact
          ? "h-12 border-border bg-background/85 shadow-[0_8px_24px_-16px_rgb(0_0_0/0.35)]"
          : "h-14 border-transparent bg-background/40",
      )}
      data-testid="app-header"
    >
      <MobileNav companies={companies} activeTenantId={activeTenantId} permissions={permissions} />
      <p
        className={cn(
          "hidden min-w-0 truncate font-semibold transition-[font-size] duration-200 md:block md:w-48",
          compact ? "text-[13px]" : "text-sm",
        )}
      >
        {titleFor(pathname)}
      </p>
      <div className="flex flex-1 justify-center">
        {activeTenantId && <CommandPalette permissions={permissions} tenantId={activeTenantId} />}
      </div>
      <div className="flex items-center gap-1.5">
        {activeTenantId && (
          <>
            <RecentTracker tenantId={activeTenantId} />
            <NewMenu permissions={permissions} open={newOpen} onOpenChange={setNewOpen} />
          </>
        )}
        {unread !== null && <NotificationsButton initialUnread={unread} />}
        <UserMenu email={email} fullName={fullName} theme={theme} />
      </div>
    </header>
  );
}
