import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Indicatore numerico: solo valori letti dal database dell'azienda attiva. */
export function KpiCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {formatNumber(value)}
        {suffix && (
          <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-lg border border-border bg-card p-4 shadow-xs";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
