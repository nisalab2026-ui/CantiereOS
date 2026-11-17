"use client";

import type { FormCustomerOption } from "@cantiereos/core";
import {
  formProgress,
  validateFormData,
  type FormDefinition,
  type FormValue,
  type FormValues,
} from "@cantiereos/core/forms";
import { CheckCircle2, CloudOff, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField as Field, Input, Select } from "@/components/ui/input";
import { saveSubmissionAction } from "./actions";
import { FormFields } from "./form-fields";

interface Draft {
  title: string;
  customerId: string;
  siteId: string;
  data: FormValues;
}

/**
 * Compilazione di un modulo. Salva la bozza sul server quando lo chiedi; nel
 * frattempo tiene una copia nel browser, così una pagina chiusa per sbaglio in
 * cantiere non fa perdere quello che hai scritto.
 */
export function FormFiller({
  id,
  version,
  definition,
  initial,
  customers,
}: {
  id: string;
  version: string;
  definition: FormDefinition;
  initial: Draft;
  customers: FormCustomerOption[];
}) {
  const router = useRouter();
  const storageKey = `cantiereos:modulo:${id}`;
  const [draft, setDraft] = useState<Draft>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const first = useRef(true);

  // copia locale trovata da una sessione precedente non salvata
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { version: string; draft: Draft };
      if (saved.version === version) setRestorable(saved.draft);
      else localStorage.removeItem(storageKey);
    } catch {
      /* archiviazione non disponibile */
    }
  }, [storageKey, version]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version, draft }));
      } catch {
        /* archiviazione non disponibile */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, dirty, storageKey, version]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // dopo un salvataggio il server ricalcola i dati automatici: li riprendiamo
  useEffect(() => {
    const auto = definition.sections.flatMap((s) => s.fields).filter((f) => f.type === "auto");
    if (!auto.length) return;
    setDraft((d) => ({
      ...d,
      data: {
        ...d.data,
        ...Object.fromEntries(auto.map((f) => [f.id, initial.data[f.id] ?? null])),
      },
    }));
  }, [version, definition, initial.data]);

  const progress = useMemo(() => formProgress(definition, draft.data), [definition, draft.data]);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const customer = customers.find((c) => c.id === draft.customerId);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage({});
  };
  const setValue = (fid: string, v: FormValue) => {
    setDraft((d) => ({ ...d, data: { ...d.data, [fid]: v } }));
    setDirty(true);
    setErrors((e) => {
      if (!e[fid]) return e;
      const { [fid]: _, ...rest } = e;
      return rest;
    });
  };

  const save = (complete: boolean) =>
    start(async () => {
      setMessage({});
      if (complete) {
        const local = validateFormData(definition, draft.data, "complete");
        if (Object.keys(local.errors).length) {
          setErrors(local.errors);
          setConfirm(false);
          setMessage({ error: "Mancano dei campi obbligatori: sono evidenziati in rosso." });
          document.getElementById(`f-${Object.keys(local.errors)[0]}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          return;
        }
      }
      const r = await saveSubmissionAction(id, version, draft, complete);
      setConfirm(false);
      if (r.error) {
        setErrors(r.fieldErrors ?? {});
        setMessage({ error: r.error });
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* archiviazione non disponibile */
      }
      setDirty(false);
      setErrors({});
      setMessage({ ok: r.message ?? "Salvato." });
      router.refresh();
    });

  return (
    <div className="space-y-5 pb-24">
      {restorable && (
        <div
          role="status"
          className="cos-enter flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <CloudOff className="size-4 text-warning" aria-hidden />
          <span className="flex-1">
            Su questo dispositivo ci sono modifiche non salvate di questo modulo.
          </span>
          <Button
            size="sm"
            onClick={() => {
              setDraft(restorable);
              setDirty(true);
              setRestorable(null);
            }}
          >
            Ripristina
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* archiviazione non disponibile */
              }
              setRestorable(null);
            }}
          >
            Ignora
          </Button>
        </div>
      )}

      <section className="grid gap-4 rounded-lg border border-border bg-card/60 p-4 sm:grid-cols-3 sm:p-5">
        <Field
          id="sub-title"
          label="Titolo"
          required
          {...(errors.title ? { error: errors.title } : {})}
        >
          <Input
            id="sub-title"
            value={draft.title}
            maxLength={200}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field id="sub-customer" label="Cliente (committente)">
          <Select
            id="sub-customer"
            value={draft.customerId}
            onChange={(e) => update({ customerId: e.target.value, siteId: "" })}
          >
            <option value="">Nessuno</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="sub-site"
          label="Sede / sito"
          {...(errors.siteId ? { error: errors.siteId } : {})}
          {...(customer && customer.sites.length === 0
            ? { hint: "Il cliente non ha sedi registrate." }
            : {})}
        >
          <Select
            id="sub-site"
            value={draft.siteId}
            disabled={!customer || customer.sites.length === 0}
            onChange={(e) => update({ siteId: e.target.value })}
          >
            <option value="">Nessuna</option>
            {customer?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.address}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <FormFields definition={definition} values={draft.data} onChange={setValue} errors={errors} />

      {/* barra delle azioni sempre a portata di pollice */}
      <div className="cos-glass sticky bottom-3 z-20 flex items-center gap-2 rounded-xl border border-border px-3 py-2 shadow-lg print:hidden sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate" aria-live="polite">
              {dirty ? "Non salvato" : (message.ok ?? "Compilazione")}
            </span>
            <span className="tabular-nums" data-testid="form-progress">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent"
            role="progressbar"
            aria-label="Campi compilati"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => save(false)}>
          <Save aria-hidden /> Salva<span className="hidden sm:inline"> bozza</span>
        </Button>
        <Button size="sm" onClick={() => setConfirm(true)} disabled={pending}>
          <CheckCircle2 aria-hidden /> Chiudi<span className="hidden sm:inline"> modulo</span>
        </Button>
      </div>
      <FormAlert error={message.error} />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Chiudere il modulo?"
          description="Un modulo chiuso non si può più modificare: resta com'è, con data e autore della chiusura. Potrà riaprirlo solo chi gestisce i moduli."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button loading={pending} onClick={() => save(true)}>
              Chiudi modulo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
