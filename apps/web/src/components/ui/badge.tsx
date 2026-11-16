import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-accent text-foreground",
        success: "bg-success/12 text-success",
        warning: "bg-warning/12 text-warning",
        danger: "bg-danger/12 text-danger",
        info: "bg-info/12 text-info",
        demo: "border border-warning/50 bg-warning/12 font-semibold tracking-wide text-warning",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  tone,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Marcatore obbligatorio per le aziende dimostrative (dati del seed di sviluppo). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="demo"
      className={className}
      title="Azienda dimostrativa: dati di sviluppo, non reali"
    >
      DEMO
    </Badge>
  );
}
