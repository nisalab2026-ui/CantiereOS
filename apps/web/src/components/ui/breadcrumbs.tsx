import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Percorso di navigazione: l'ultima voce è la pagina corrente. */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Percorso" className="mb-3 text-sm text-muted-foreground">
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className={
              i === items.length - 1
                ? "flex min-w-0 items-center gap-1"
                : "flex shrink-0 items-center gap-1"
            }
          >
            {i > 0 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="whitespace-nowrap hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className="truncate text-foreground"
                title={item.label}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
