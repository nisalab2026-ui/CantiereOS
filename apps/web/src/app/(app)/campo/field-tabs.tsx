"use client";

import { CalendarDays, History, House, Map } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/campo", label: "Oggi", icon: House },
  { href: "/campo/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/campo/mappa", label: "Mappa", icon: Map },
  { href: "/campo/storico", label: "Storico", icon: History },
] as const;

/** Quattro schede in basso, grandi per il pollice. */
export function FieldTabs() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/campo"
      ? path === "/campo" || path.startsWith("/campo/interventi")
      : path.startsWith(href);
  return (
    <nav
      aria-label="Sezioni"
      className="cos-glass fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  on ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200",
                    on && "bg-primary/12",
                  )}
                >
                  <Icon className="size-5" aria-hidden strokeWidth={on ? 2.25 : 1.75} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
