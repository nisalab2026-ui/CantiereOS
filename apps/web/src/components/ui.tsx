import Image from "next/image";
import Link from "next/link";

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  hint,
  inputMode,
  pattern,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        inputMode={inputMode}
        pattern={pattern}
        maxLength={maxLength}
        className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Contenitore centrato per le pagine di accesso. */
/**
 * Pagine di accesso: pannello del marchio a sinistra (desktop), modulo a destra.
 * Su mobile il marchio resta in alto, compatto.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#050B1A] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(36,86,230,0.35),transparent_60%)]"
        />
        <Image
          src="/brand/logo-full.png"
          alt="CantiereOS — Gestisci, organizza, cresci"
          width={640}
          height={161}
          priority
          className="relative h-auto w-full max-w-md"
        />
        <p className="relative max-w-sm text-sm leading-relaxed text-[#98A1B3]">
          Cantieri, squadre, rapportini e documenti della tua impresa in un unico posto, con i dati
          di ogni azienda separati e protetti.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-navy">
                <Image
                  src="/brand/logo-mark.png"
                  alt=""
                  width={268}
                  height={256}
                  className="h-6 w-auto"
                />
              </span>
              <span className="text-base font-semibold tracking-tight">
                Cantiere<span className="text-primary">OS</span>
              </span>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</div>
          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: React.ReactNode;
}) {
  const cls = tone === "warning" ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-canvas";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
