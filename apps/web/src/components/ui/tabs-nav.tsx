import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Schede come link (?tab=…): funzionano senza JavaScript, si possono
 * condividere e il tasto indietro le ripercorre.
 */
export function TabsNav({
  tabs,
  active,
  label,
}: {
  tabs: { key: string; label: string; href: string; count?: number | null }[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-4 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const current = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  current
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count != null && (
                  <span className="rounded-sm bg-accent px-1.5 text-xs tabular-nums">
                    {t.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
