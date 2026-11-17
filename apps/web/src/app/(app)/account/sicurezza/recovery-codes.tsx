"use client";

import { Copy, Download, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateRecoveryCodesAction } from "../../actions";

/**
 * Genera e mostra UNA volta i codici di recupero. Una nuova serie annulla la
 * precedente; nel database restano solo gli hash.
 */
export function RecoveryCodes({ hasCodes }: { hasCodes: boolean }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const text = codes
    ? `CantiereOS - codici di recupero MFA\nOgni codice vale una sola volta.\n\n${codes.join("\n")}\n`
    : "";

  return (
    <div className="space-y-3">
      {codes ? (
        <>
          <p className="text-sm font-medium text-warning">
            Salvali ora in un posto sicuro: non verranno più mostrati.
          </p>
          <ol
            className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-background/60 p-4 font-mono text-sm"
            data-testid="recovery-codes"
          >
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(text).then(() => setCopied(true));
              }}
            >
              <Copy aria-hidden /> {copied ? "Copiati" : "Copia"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "cantiereos-codici-recupero.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download aria-hidden /> Scarica .txt
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant={hasCodes ? "secondary" : "primary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await generateRecoveryCodesAction();
              if ("codes" in r) setCodes(r.codes);
              else setError(r.error);
            })
          }
        >
          <KeyRound aria-hidden />
          {pending
            ? "Generazione…"
            : hasCodes
              ? "Genera una nuova serie"
              : "Genera i codici di recupero"}
        </Button>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
