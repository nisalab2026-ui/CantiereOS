import type {
  ChecklistValue,
  FormDefinition,
  FormField,
  FormValues,
  SignatureValue,
  YesNoValue,
} from "@cantiereos/core/forms";
import { cn } from "@/lib/cn";
import { FONT_STACKS, inkOn, resolveAppearance, type ResolvedAppearance } from "./document-style";

/**
 * Modulo in sola lettura, impaginato come un documento: è la vista dei moduli
 * chiusi e la pagina che si stampa o si salva in PDF (stili @media print).
 */
export interface DocumentHeading {
  /** Riga sopra il titolo, es. la categoria o il nome del modello. */
  kicker?: string | undefined;
  title: string;
  description?: string | undefined;
  company?: string | undefined;
}

export function FormDocument({
  definition,
  values,
  heading,
  headingPrintOnly = false,
  blank = false,
  photos = {},
}: {
  definition: FormDefinition;
  values: FormValues;
  /** Intestazione con logo, azienda, titolo, codice e revisione del modello. */
  heading?: DocumentHeading;
  headingPrintOnly?: boolean;
  /** Campi vuoti disegnati come sul modulo cartaceo (caselle, righe, spazio per la firma). */
  blank?: boolean;
  /** URL firmati delle foto del modulo, per id. */
  photos?: Record<string, { url: string; name: string }>;
}) {
  const a = resolveAppearance(definition);
  const ink = inkOn(a.accent);
  const headingFont = FONT_STACKS[a.headingFont ?? a.font];
  return (
    <article
      className={cn(
        "form-document [print-color-adjust:exact]",
        a.density === "compact"
          ? "space-y-3 text-[13px]"
          : a.density === "large"
            ? "space-y-7 text-[15px]"
            : "space-y-5 text-sm",
      )}
      data-testid="form-document"
      style={
        {
          fontFamily: FONT_STACKS[a.font],
          "--doc-accent": a.accent,
          "--doc-ink": ink,
        } as React.CSSProperties
      }
    >
      {heading && (
        <DocHeader
          a={a}
          heading={heading}
          font={headingFont}
          className={headingPrintOnly ? "hidden print:block" : undefined}
        />
      )}
      {definition.sections.map((s, i) => (
        <section key={s.id} className="break-inside-avoid-page">
          <h2
            className={cn(
              "mb-2 text-sm font-semibold",
              a.header === "band" &&
                "rounded-[3px] bg-[var(--doc-accent)] px-2.5 py-1 text-[var(--doc-ink)]",
              a.header === "line" &&
                "border-b-2 border-[var(--doc-accent)] pb-1 text-[var(--doc-accent)]",
              a.header === "minimal" &&
                "border-b border-border pb-1 uppercase tracking-wide text-muted-foreground print:text-black",
            )}
            style={{ fontFamily: headingFont }}
          >
            {a.numbered && `${i + 1}. `}
            {s.title}
          </h2>
          {s.description && (
            <p className="mb-2 text-xs text-muted-foreground print:text-neutral-600">
              {s.description}
            </p>
          )}
          <dl
            className={cn(
              "grid gap-x-6 sm:grid-cols-2 print:grid-cols-2",
              a.density === "compact" ? "gap-y-2" : "gap-y-3",
            )}
          >
            {s.fields.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "min-w-0",
                  (f.type === "checklist" ||
                    f.type === "textarea" ||
                    f.type === "signature" ||
                    f.type === "photo") &&
                    "sm:col-span-2 print:col-span-2",
                )}
              >
                <dt className="text-xs text-muted-foreground print:text-neutral-600">{f.label}</dt>
                <dd className="mt-0.5">
                  <Value field={f} value={values[f.id]} blank={blank} photos={photos} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {a.footer && (
        <footer
          className="border-t border-border pt-2 text-[11px] whitespace-pre-line text-muted-foreground print:text-neutral-600"
          data-testid="doc-footer"
        >
          {a.footer}
        </footer>
      )}
    </article>
  );
}

function DocHeader({
  a,
  heading,
  font,
  className,
}: {
  a: ResolvedAppearance;
  heading: DocumentHeading;
  font: string;
  className?: string | undefined;
}) {
  const center = a.logoPosition === "center";
  const logo = a.logo && (
    // eslint-disable-next-line @next/next/no-img-element -- logo salvato nel modello (data URL)
    <img
      src={a.logo}
      alt={heading.company ? `Logo ${heading.company}` : "Logo"}
      className="max-h-16 w-auto max-w-[60%] object-contain"
      data-testid="doc-logo"
    />
  );
  const meta = (a.code || a.revision) && (
    <dl className="shrink-0 rounded-sm border border-border text-[11px] tabular-nums print:border-neutral-400">
      {a.code && (
        <div className="flex gap-2 px-2 py-0.5">
          <dt className="text-muted-foreground print:text-neutral-600">Cod.</dt>
          <dd className="font-medium">{a.code}</dd>
        </div>
      )}
      {a.revision && (
        <div
          className={cn(
            "flex gap-2 px-2 py-0.5",
            a.code && "border-t border-border print:border-neutral-400",
          )}
        >
          <dt className="text-muted-foreground print:text-neutral-600">Rev.</dt>
          <dd className="font-medium">{a.revision}</dd>
        </div>
      )}
    </dl>
  );
  const text = (
    <div className={cn("min-w-0", center && "text-center")}>
      {a.showCompany && heading.company && (
        <p className="text-xs font-semibold" style={{ color: a.accent }}>
          {heading.company}
        </p>
      )}
      {heading.kicker && (
        <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase print:text-neutral-500">
          {heading.kicker}
        </p>
      )}
      <h1 className="text-lg leading-snug font-bold" style={{ fontFamily: font }}>
        {heading.title}
      </h1>
      {heading.description && (
        <p className="mt-1 text-xs text-muted-foreground print:text-neutral-600">
          {heading.description}
        </p>
      )}
    </div>
  );
  const top = (logo || meta) && (
    <div
      className={cn(
        "flex items-start gap-4",
        center ? "flex-col items-center" : "justify-between",
        a.logoPosition === "right" && "flex-row-reverse",
      )}
    >
      {logo || <span />}
      {meta}
    </div>
  );
  return (
    <header
      className={cn(
        "relative space-y-3 pb-3",
        a.header === "band" && "overflow-hidden rounded-sm pt-4",
        a.header === "line" && "border-b-2 border-[var(--doc-accent)]",
        a.header === "minimal" && "border-b border-border",
        className,
      )}
      data-testid="doc-header"
    >
      {a.header === "band" && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-[var(--doc-accent)]" />
      )}
      {top}
      {text}
    </header>
  );
}

const Empty = () => <span className="text-muted-foreground print:text-neutral-400">—</span>;

function Value({
  field,
  value,
  blank,
  photos,
}: {
  field: FormField;
  value: FormValues[string] | undefined;
  blank: boolean;
  photos: Record<string, { url: string; name: string }>;
}) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
    return blank ? <BlankValue field={field} /> : <Empty />;
  switch (field.type) {
    case "date":
      return <span className="tabular-nums">{itDate(String(value))}</span>;
    case "number":
      return (
        <span className="tabular-nums">
          {String(value).replace(".", ",")}
          {field.unit ? ` ${field.unit}` : ""}
        </span>
      );
    case "textarea":
      return <span className="whitespace-pre-wrap">{String(value)}</span>;
    case "yes_no": {
      const v = value as YesNoValue;
      return (
        <span>
          {v.value === "yes" ? "Sì" : v.value === "no" ? "No" : "—"}
          {v.note && <span className="text-muted-foreground"> — {v.note}</span>}
        </span>
      );
    }
    case "choice":
      return Array.isArray(value) ? <span>{value.join(", ")}</span> : <span>{String(value)}</span>;
    case "checklist": {
      const rows = (value as ChecklistValue).rows;
      return (
        <table className="mt-1 w-full border-collapse text-sm">
          <thead className="sr-only">
            <tr>
              <th>Controllo</th>
              <th>Esito</th>
              {field.withNote && <th>Nota</th>}
            </tr>
          </thead>
          <tbody>
            {field.rows.map((row, i) => {
              const r = rows[i];
              const negative = r?.value && /^(no|negativo)/i.test(r.value);
              return (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1 pr-3 align-top">{row}</td>
                  <td
                    className={cn(
                      "w-28 py-1 pr-3 align-top font-medium",
                      negative && "text-danger print:text-black print:underline",
                    )}
                  >
                    {r?.value ?? <Empty />}
                  </td>
                  {field.withNote && (
                    <td className="py-1 align-top text-muted-foreground print:text-neutral-700">
                      {r?.note ?? ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    case "photo": {
      const ids = value as string[];
      return (
        <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4 print:grid-cols-3">
          {ids.map((id, i) => {
            const p = photos[id];
            return (
              <li
                key={id}
                className="aspect-[4/3] overflow-hidden rounded-md border border-border break-inside-avoid"
              >
                {p ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato a breve durata */}
                    <img
                      src={p.url}
                      alt={`Foto ${i + 1} di ${field.label}`}
                      className="size-full object-cover"
                    />
                  </a>
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    Foto {i + 1} non disponibile
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }
    case "signature": {
      const v = value as SignatureValue;
      return (
        <figure className="inline-block rounded-md border border-border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL della firma */}
          <img
            src={v.image}
            alt={`Firma${v.name ? ` di ${v.name}` : ""}`}
            className="h-20 object-contain"
          />
          <figcaption className="mt-1 text-xs text-neutral-600">
            {v.name ? `${v.name} · ` : ""}
            {new Date(v.signedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
          </figcaption>
        </figure>
      );
    }
    default:
      return <span>{String(value)}</span>;
  }
}

const Box = ({ label }: { label: string }) => (
  <span className="mr-3 inline-flex items-center gap-1 whitespace-nowrap">
    <span aria-hidden className="inline-block size-3 rounded-[2px] border border-neutral-500" />
    {label}
  </span>
);

/** Campo non compilato, disegnato come sul foglio da stampare. */
function BlankValue({ field }: { field: FormField }) {
  switch (field.type) {
    case "auto":
      return <span className="text-xs text-neutral-400 italic">compilato in automatico</span>;
    case "yes_no":
      return (
        <span>
          <Box label="Sì" />
          <Box label="No" />
        </span>
      );
    case "choice":
      return (
        <span className="flex flex-wrap gap-y-1">
          {field.options.map((o) => (
            <Box key={o} label={o} />
          ))}
        </span>
      );
    case "checklist":
      return (
        <table className="mt-1 w-full border-collapse text-sm">
          <tbody>
            {field.rows.map((row, i) => (
              <tr key={i} className="border-b border-neutral-200 last:border-0">
                <td className="py-1 pr-3 align-top">{row}</td>
                <td className="py-1 pr-3 align-top whitespace-nowrap">
                  {field.options.map((o) => (
                    <Box key={o} label={o} />
                  ))}
                </td>
                {field.withNote && (
                  <td className="w-1/4 py-1 align-bottom">
                    <span className="block h-4 border-b border-neutral-300" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "photo":
      return (
        <span className="mt-1 flex h-24 items-center justify-center rounded-sm border border-dashed border-neutral-400 text-xs text-neutral-500">
          Spazio per le foto
        </span>
      );
    case "signature":
      return <span className="mt-2 block h-14 w-60 max-w-full border-b border-neutral-500" />;
    case "textarea":
      return (
        <span className="block space-y-4 pt-3">
          <span className="block border-b border-neutral-300" />
          <span className="block border-b border-neutral-300" />
        </span>
      );
    default:
      return (
        <span className="block h-5 border-b border-neutral-300">
          {field.type === "number" && field.unit && (
            <span className="float-right text-xs text-neutral-500">{field.unit}</span>
          )}
        </span>
      );
  }
}

function itDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
