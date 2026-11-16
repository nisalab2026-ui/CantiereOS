import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/motion/count-up";
import { Tilt } from "@/components/motion/tilt";
import { cn } from "@/lib/cn";

/** Indicatore numerico: solo valori letti dal database dell'azienda attiva. */
export function KpiCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  href,
  index = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  /** posizione nella griglia, per l'ingresso a cascata */
  index?: number;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="cos-depth flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p
        className="cos-depth mt-2 text-2xl font-semibold tracking-tight tabular-nums"
        data-testid="kpi-value"
      >
        <CountUp value={value} />
        {suffix && (
          <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block h-full rounded-lg border border-border bg-card p-4 shadow-xs";
  return (
    <div className="cos-enter" style={{ "--i": index } as React.CSSProperties}>
      <Tilt className="h-full rounded-lg">
        {href ? (
          <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
            {body}
          </Link>
        ) : (
          <div className={cls}>{body}</div>
        )}
      </Tilt>
    </div>
  );
}
