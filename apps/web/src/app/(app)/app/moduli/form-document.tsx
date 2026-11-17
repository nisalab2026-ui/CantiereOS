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
  blank = false,
  photos = {},
}: {
  definition: FormDefinition;
  values: FormValues;
  header?: React.ReactNode;
  /** Campi vuoti disegnati come sul modulo cartaceo (caselle, righe, spazio per la firma). */
  blank?: boolean;
  /** URL firmati delle foto del modulo, per id. */
  photos?: Record<string, { url: string; name: string }>;
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
                  (f.type === "checklist" ||
                    f.type === "textarea" ||
                    f.type === "signature" ||
                    f.type === "photo") &&
                    "sm:col-span-2 print:col-span-2",
                )}
              >
                <dt className="text-xs text-muted-foreground print:text-neutral-600">{f.label}</dt>
                <dd className="mt-0.5 text-sm">
                  <Value field={f} value={values[f.id]} blank={blank} photos={photos} />
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
