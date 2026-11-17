"use client";

import { CheckCircle2, CircleAlert, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  finishUploadAction,
  startUploadAction,
  startVersionAction,
  type StartResult,
  type UploadMeta,
} from "./actions";
import { CATEGORY_OPTIONS, formatBytes, type FolderOption, type SubjectOptions } from "./shared";

const ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.docx,.xlsx,.pptx,.odt,.ods,.doc,.xls,.txt,.csv,.p7m,.xml";
const MAX = 25 * 1024 * 1024;

type Status = "waiting" | "uploading" | "checking" | "done" | "error";
interface Item {
  file: File;
  status: Status;
  message?: string;
  documentId?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  waiting: "In attesa",
  uploading: "Caricamento…",
  checking: "Verifica del file…",
  done: "Caricato",
  error: "Non caricato",
};

const SUBJECT_GROUPS: [keyof SubjectOptions, string][] = [
  ["customer", "Clienti"],
  ["employee", "Personale"],
  ["supplier", "Fornitori"],
  ["team", "Squadre"],
];

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 200) || name;

/** Invia un file allo storage con l'URL firmato e poi chiede al server di verificarlo. */
async function sendFile(
  ticket: Extract<StartResult, { ok: true }>,
  file: File,
  onStatus: (s: Status) => void,
) {
  onStatus("uploading");
  const put = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type || ticket.contentType, "x-upsert": "false" },
    body: file,
  }).catch(() => null);
  onStatus("checking");
  // anche se l'invio fallisce chiediamo la verifica: il server marca la versione come rifiutata
  void put;
  return finishUploadAction(ticket.versionId);
}

export function UploadDialog({
  folders,
  subjects,
  defaults = {},
  lockSubject = false,
  lockedSubjectName,
  canConfidential,
  canDeadline,
  storageReady,
  triggerLabel = "Carica documenti",
}: {
  folders: FolderOption[];
  subjects: SubjectOptions;
  defaults?: { folderId?: string; subject?: string };
  lockSubject?: boolean;
  lockedSubjectName?: string;
  canConfidential: boolean;
  canDeadline: boolean;
  storageReady: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setItems([]);
    setError(undefined);
    setFieldErrors({});
    setBusy(false);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].map<Item>((file) =>
      file.size > MAX
        ? { file, status: "error", message: "Supera i 25 MB" }
        : { file, status: "waiting" },
    );
    setItems((cur) => [...cur.filter((i) => i.status !== "done"), ...next].slice(0, 50));
  };

  const update = (index: number, patch: Partial<Item>) =>
    setItems((cur) => cur.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  async function submit(form: FormData) {
    setError(undefined);
    setFieldErrors({});
    const pending = items
      .map((it, i) => [it, i] as const)
      .filter(([it]) => it.status === "waiting");
    if (pending.length === 0) {
      setError("Scegli almeno un file da caricare.");
      return;
    }
    setBusy(true);
    const single = items.length === 1;
    let lastId: string | undefined;
    let ok = 0;
    for (const [it, index] of pending) {
      const meta: UploadMeta = {
        title: single
          ? String(form.get("title") ?? "") || baseName(it.file.name)
          : baseName(it.file.name),
        category: String(form.get("category") ?? "other"),
        description: String(form.get("description") ?? ""),
        folderId: String(form.get("folderId") ?? ""),
        subject: String(form.get("subject") ?? ""),
        isConfidential: form.get("isConfidential") === "on",
        expiresOn: String(form.get("expiresOn") ?? ""),
        createDeadline: form.get("createDeadline") === "on",
      };
      const ticket = await startUploadAction(meta, {
        name: it.file.name,
        size: it.file.size,
        type: it.file.type,
      });
      if (!ticket.ok) {
        update(index, { status: "error", message: ticket.fieldErrors?.file ?? ticket.error });
        if (ticket.fieldErrors) {
          const { file: _f, ...rest } = ticket.fieldErrors;
          if (Object.keys(rest).length) {
            setFieldErrors(rest);
            setError(ticket.error);
            break; // errore nei dati comuni: inutile proseguire con gli altri file
          }
        }
        continue;
      }
      const out = await sendFile(ticket, it.file, (status) => update(index, { status }));
      if (out.ok) {
        ok++;
        lastId = out.documentId;
        update(index, { status: "done", documentId: out.documentId });
      } else {
        update(index, { status: "error", message: out.reason });
      }
    }
    setBusy(false);
    if (ok > 0 && single && lastId) {
      setOpen(false);
      router.push(`/app/documenti/${lastId}?caricato=1`);
      return;
    }
    if (ok > 0) router.refresh();
  }

  const allDone = items.length > 0 && items.every((i) => i.status === "done");
  const err = (k: string) => (fieldErrors[k] ? { error: fieldErrors[k] } : {});

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload aria-hidden /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Carica documenti"
        description="Puoi scegliere più file insieme: i dati qui sotto valgono per tutti. Massimo 25 MB per file."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        {!storageReady ? (
          <FormAlert error="Archiviazione file non configurata: l'amministratore deve impostare lo storage dei documenti (vedi .env.example)." />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm transition-colors",
                dragging && "border-primary bg-primary/8",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden />
              <p>Trascina qui i file oppure</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Scegli file
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                aria-label="File da caricare"
                data-testid="upload-input"
                onChange={(e) => {
                  addFiles(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">
                PDF, immagini, Word, Excel, testo, firmati .p7m e XML (es. fatture elettroniche).
              </p>
            </div>

            {items.length > 0 && (
              <ul
                className="divide-y divide-border rounded-md border border-border text-sm"
                data-testid="upload-list"
              >
                {items.map((it, i) => (
                  <li key={`${it.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                    <StatusIcon status={it.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{it.file.name}</p>
                      <p
                        className={cn(
                          "text-xs text-muted-foreground",
                          it.status === "error" && "text-danger",
                        )}
                      >
                        {formatBytes(it.file.size)} · {it.message ?? STATUS_LABEL[it.status]}
                      </p>
                    </div>
                    {it.status === "waiting" && !busy && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                      >
                        Togli
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {items.length <= 1 && (
              <FormField
                id="up-title"
                label="Titolo"
                hint="Se vuoto, si usa il nome del file"
                {...err("title")}
              >
                <Input id="up-title" name="title" maxLength={200} autoComplete="off" />
              </FormField>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="up-category" label="Categoria" required {...err("category")}>
                <Select id="up-category" name="category" defaultValue="other">
                  {CATEGORY_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="up-folderId" label="Cartella" {...err("folderId")}>
                <Select id="up-folderId" name="folderId" defaultValue={defaults.folderId ?? ""}>
                  <option value="">Nessuna cartella</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              {lockSubject && defaults.subject ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Collegato a</p>
                  <p className="flex h-9 items-center rounded-sm border border-border bg-accent/40 px-3 text-sm">
                    {lockedSubjectName}
                  </p>
                  <input type="hidden" name="subject" value={defaults.subject} />
                </div>
              ) : (
                <FormField id="up-subject" label="Collegato a" {...err("subject")}>
                  <Select id="up-subject" name="subject" defaultValue={defaults.subject ?? ""}>
                    <option value="">Nessun collegamento</option>
                    {SUBJECT_GROUPS.map(([type, label]) =>
                      subjects[type] && subjects[type].length > 0 ? (
                        <optgroup key={type} label={label}>
                          {subjects[type].map((o) => (
                            <option key={o.id} value={`${type}:${o.id}`}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null,
                    )}
                  </Select>
                </FormField>
              )}
              <FormField
                id="up-expiresOn"
                label="Scadenza del documento"
                hint="Es. fine validità di DURC, certificati, polizze"
                {...err("expiresOn")}
              >
                <Input id="up-expiresOn" name="expiresOn" type="date" />
              </FormField>
            </div>
            <div className="space-y-2 text-sm">
              {canDeadline && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="createDeadline" className="mt-0.5" />
                  <span>
                    Crea un promemoria nello scadenziario alla data di scadenza
                    <span className="block text-xs text-muted-foreground">
                      Avvisi 30 giorni prima, a chi gestisce le scadenze.
                    </span>
                  </span>
                </label>
              )}
              {canConfidential && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="isConfidential" className="mt-0.5" />
                  <span>
                    Documento riservato
                    <span className="block text-xs text-muted-foreground">
                      Visibile solo a chi ha il permesso per i documenti riservati (es. documenti
                      d&apos;identità).
                    </span>
                  </span>
                </label>
              )}
            </div>
            <FormField id="up-description" label="Descrizione" {...err("description")}>
              <Textarea id="up-description" name="description" maxLength={4000} rows={2} />
            </FormField>
            <FormAlert error={error} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={busy}>
                  {allDone ? "Chiudi" : "Annulla"}
                </Button>
              </DialogClose>
              {!allDone && (
                <Button type="submit" loading={busy}>
                  Carica {items.filter((i) => i.status === "waiting").length || ""}
                </Button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done")
    return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />;
  if (status === "error")
    return <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />;
  if (status === "uploading" || status === "checking")
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />;
  return <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

/** Nuova versione di un documento esistente. */
export function VersionUploadDialog({
  documentId,
  storageReady,
}: {
  documentId: string;
  storageReady: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState<string | undefined>();
  const busy = status === "uploading" || status === "checking";

  async function submit(form: FormData) {
    setError(undefined);
    if (!file) {
      setError("Scegli il file della nuova versione.");
      return;
    }
    if (file.size > MAX) {
      setError("Il file supera i 25 MB.");
      return;
    }
    const ticket = await startVersionAction(
      documentId,
      { name: file.name, size: file.size, type: file.type },
      String(form.get("notes") ?? ""),
    );
    if (!ticket.ok) {
      setError(ticket.fieldErrors?.file ?? ticket.error);
      return;
    }
    const out = await sendFile(ticket, file, setStatus);
    if (out.ok) {
      setStatus("done");
      setOpen(false);
      router.refresh();
    } else {
      setStatus("error");
      setError(out.reason);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (o) {
          setFile(null);
          setStatus("waiting");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Upload aria-hidden /> Nuova versione
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Carica una nuova versione"
        description="La nuova versione diventa quella corrente; le precedenti restano consultabili nello storico."
      >
        {!storageReady ? (
          <FormAlert error="Archiviazione file non configurata." />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            <FormField id="ver-file" label="File" required>
              <Input
                id="ver-file"
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
              />
            </FormField>
            <FormField id="ver-notes" label="Cosa cambia" hint="Es. versione firmata, rinnovo 2027">
              <Input id="ver-notes" name="notes" maxLength={2000} autoComplete="off" />
            </FormField>
            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {STATUS_LABEL[status]}
              </p>
            )}
            <FormAlert error={error} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={busy}>
                  Annulla
                </Button>
              </DialogClose>
              <Button type="submit" loading={busy}>
                Carica versione
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
