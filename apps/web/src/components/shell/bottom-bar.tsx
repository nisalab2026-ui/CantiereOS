"use client";

import { LayoutDashboard, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { OPEN_SEARCH_EVENT } from "./command-palette";
import { isActive, visibleNav } from "./navigation";
import { NewMenu } from "./new-menu";

/** Le sezioni più usate in cantiere, nell'ordine in cui le cerchiamo. */
const PREFERRED = ["/app/interventi", "/app/rapportini", "/app/attivita", "/app/clienti"];

/**
 * Barra in basso su telefono: Panoramica, due sezioni principali (secondo i
 * permessi), Cerca e «+ Nuovo» a portata di pollice. Il menu completo resta
 * nel pulsante in alto a sinistra.
 */
export function BottomBar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const nav = visibleNav(permissions);
  const main = PREFERRED.map((h) => nav.find((n) => n.href === h))
    .filter((n) => n !== undefined)
    .slice(0, 2);
  const items = [{ href: "/app", label: "Home", icon: LayoutDashboard }, ...main];
  const tab =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors active:scale-95";
  return (
    <nav
      aria-label="Scorciatoie"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden print:hidden"
      data-testid="bottom-bar"
    >
      <div className="mx-auto flex h-14 max-w-md items-stretch px-2">
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(tab, active && "text-primary")}
            >
              <i.icon className="size-5" aria-hidden />
              <span className="truncate">{i.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={tab}
          onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        >
          <Search className="size-5" aria-hidden />
          Cerca
        </button>
        <NewMenu permissions={permissions} variant="bottom" />
      </div>
    </nav>
  );
}
