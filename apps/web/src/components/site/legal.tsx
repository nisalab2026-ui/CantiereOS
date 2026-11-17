import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import {
  LEGAL_LINKS,
  LEGAL_UPDATED,
  type LegalBlock,
  type LegalDoc,
} from "@/app/(marketing)/legal-content";
import { PageIntro } from "./blocks";

/** Un `[[dato]]` mancante diventa un'evidenziazione "da completare", impossibile da non vedere. */
function Text({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900 ring-1 ring-amber-300"
            title="Dato da completare"
          >
            {p.slice(2, -2)} (da completare)
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string")
    return (
      <p>
        <Text text={block} />
      </p>
    );
  if ("list" in block)
    return (
      <ul className="list-disc space-y-2 pl-5 marker:text-primary">
        {block.list.map((item) => (
          <li key={item}>
            <Text text={item} />
          </li>
        ))}
      </ul>
    );
  const hasHead = block.table.head.some(Boolean);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[32rem] text-left text-sm">
        {hasHead && (
          <thead className="border-b border-border bg-accent/60 text-foreground">
            <tr>
              {block.table.head.map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-border">
          {block.table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th
                    key={i}
                    scope="row"
                    className="px-4 py-3 align-top font-medium text-foreground"
                  >
                    <Text text={cell} />
                  </th>
                ) : (
                  <td key={i} className="px-4 py-3 align-top">
                    <Text text={cell} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pagina legale: indice laterale fisso con la sezione corrente che si accende (data-scrollspy in
 * motion-root), sezioni che entrano allo scorrimento, avviso di bozza finché mancano i dati aziendali.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const incomplete = JSON.stringify(doc).includes("[[");
  return (
    <>
      <PageIntro eyebrow={doc.eyebrow} title={doc.title} lead={doc.lead}>
        <p className="mt-6 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Ultimo aggiornamento: {LEGAL_UPDATED}
        </p>
      </PageIntro>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-28 sm:px-6 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav aria-label="In questa pagina" data-scrollspy>
            <p className="mb-3 font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
              In questa pagina
            </p>
            <ol className="space-y-1 border-l border-border text-sm">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="legal-toc-link -ml-px block border-l-2 border-transparent py-1.5 pl-4 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-8 mb-3 font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
              Altri documenti
            </p>
            <ul className="space-y-1.5 text-sm">
              {LEGAL_LINKS.filter((l) => l.href !== `/${doc.slug}`).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-primary hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 space-y-14 text-[1.02rem] leading-relaxed text-muted-foreground">
          {incomplete && (
            <div
              role="note"
              className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              <p>
                Documento in bozza: i dati evidenziati dell&apos;azienda sono da completare e il
                testo va verificato da un consulente prima della pubblicazione definitiva del sito.
              </p>
            </div>
          )}
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} data-reveal className="scroll-mt-28 space-y-4">
              <h2 className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight text-foreground">
                <span className="font-mono text-sm text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </h2>
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} />
              ))}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
