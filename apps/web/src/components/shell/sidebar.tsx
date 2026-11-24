"use client";

import { BrandMark } from "@/components/brand-logo";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompanyMembership } from "@cantiereos/core";
import { cn } from "@/lib/cn";
import { setSidebarCollapsed } from "@/app/(app)/shell-actions";
import { CompanySwitcher } from "./company-switcher";
import { isActive, NAV_GROUPS, visibleNav } from "./navigation";

export function SidebarNav({
  permissions,
  collapsed = false,
  onNavigate,
}: {
  permissions: string[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = visibleNav(permissions);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Menu principale" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g}>
          {!collapsed && (
            <p className="mb-1 px-2 text-[11px] font-medium tracking-wider text-navy-muted uppercase">
              {NAV_GROUPS[g]}
            </p>
          )}
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => onNavigate?.()}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? i.label : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-2 text-sm text-navy-muted transition-colors hover:bg-navy-accent hover:text-navy-foreground",
                        active &&
                          "bg-navy-accent font-medium text-navy-foreground shadow-[inset_2px_0_0_var(--primary)]",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <i.icon
                        className={cn("size-4 shrink-0", active && "text-[#86efac]")}
                        aria-hidden
                      />
                      {collapsed ? <span className="sr-only">{i.label}</span> : i.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Sidebar desktop (navy), comprimibile; la preferenza è salvata in un cookie. */
export function Sidebar({
  companies,
  activeTenantId,
  permissions,
  initialCollapsed,
}: {
  companies: CompanyMembership[];
  activeTenantId: string | null;
  permissions: string[];
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [, start] = useTransition();
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    start(() => setSidebarCollapsed(next));
  };
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-white/5 bg-navy text-navy-foreground backdrop-blur-xl transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <Logo />
        {!collapsed && <Wordmark />}
      </div>
      {!collapsed && (
        <div className="px-3">
          <CompanySwitcher companies={companies} activeTenantId={activeTenantId} />
        </div>
      )}
      <SidebarNav permissions={permissions} collapsed={collapsed} />
      <div className={cn("border-t border-white/10 p-3", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-navy-muted hover:bg-navy-accent hover:text-navy-foreground"
          aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && "Comprimi"}
        </button>
      </div>
    </aside>
  );
}

/** Marchio CantiereOS (gru su tessera verde), animato al primo disegno. */
export function Logo({ className }: { className?: string }) {
  return <BrandMark className={cn("size-7", className)} />;
}

/** Logotipo: "Cantiere" chiaro + "OS" verde, come nel marchio. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight", className)}>
      Cantiere<span className="text-[#22c55e]">OS</span>
    </span>
  );
}
