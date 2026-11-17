import type {
  ChecklistValue,
  FormDefinition,
  FormField,
  FormValues,
  SignatureValue,
  YesNoValue,
} from "@cantiereos/core/forms";
import { cn } from "@/lib/cn";

/**
 * Modulo in sola lettura, impaginato come un documento: è la vista dei moduli
 * chiusi e la pagina che si stampa o si salva in PDF (stili @media print).
 */
export function FormDocument({
  definition,
  values,
  header,
}: {
  definition: FormDefinition;
  values: FormValues;
  header?: React.ReactNode;
}) {
  return (
    <article className="form-document space-y-5" data-testid="form-document">
      {header}
      {definition.sections.map((s, i) => (
        <section key={s.id} className="break-inside-avoid-page">
          <h2 className="mb-2 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground print:text-black">
            {i + 1}. {s.title}
          </h2>
          {s.description && (
            <p className="mb-2 text-xs text-muted-foreground print:text-neutral-600">
              {s.description}
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
            {s.fields.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "min-w-0",
                  (f.type === "checklist" || f.type === "textarea" || f.type === "signature") &&
                    "sm:col-span-2 print:col-span-2",
                )}
              >
                <dt className="text-xs text-muted-foreground print:text-neutral-600">{f.label}</dt>
                <dd className="mt-0.5 text-sm">
                  <Value field={f} value={values[f.id]} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}

const Empty = () => <span className="text-muted-foreground print:text-neutral-400">—</span>;

function Value({ field, value }: { field: FormField; value: FormValues[string] | undefined }) {
  if (value === undefined || value === null || value === "") return <Empty />;
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

function itDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
