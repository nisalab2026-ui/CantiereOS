import Image from "next/image";
import { Tilt } from "@/components/motion/tilt";
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
          className="cos-glow pointer-events-none absolute -right-1/4 -bottom-1/4 size-[80%] rounded-full bg-[radial-gradient(circle,rgba(36,86,230,0.45),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[-30%] bottom-0 h-[52%] overflow-hidden"
        >
          <div className="cos-floor absolute inset-0" />
        </div>
        <Image
          src="/brand/logo-full.png"
          alt="CantiereOS — Gestisci, organizza, cresci"
          width={640}
          height={161}
          priority
          className="cos-enter relative h-auto w-full max-w-sm"
        />
        <div className="relative flex flex-1 items-center justify-center py-8">
          <div className="cos-float">
            <Tilt max={14} className="rounded-3xl">
              <div className="cos-depth rounded-3xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_30px_80px_-20px_rgba(36,86,230,0.55)] backdrop-blur-sm">
                <Image
                  src="/brand/logo-mark.png"
                  alt=""
                  width={268}
                  height={256}
                  className="h-40 w-auto drop-shadow-[0_18px_30px_rgba(36,86,230,0.45)] xl:h-48"
                />
              </div>
            </Tilt>
          </div>
        </div>
        <p
          className="cos-enter relative max-w-sm text-sm leading-relaxed text-[#98A1B3]"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          Cantieri, squadre, rapportini e documenti della tua impresa in un unico posto, con i dati
          di ogni azienda separati e protetti.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="cos-enter w-full max-w-sm space-y-6">
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
