"use client";

import {
  PROJECT_KIND_LABELS,
  PROJECT_KINDS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectFormOptions,
} from "@cantiereos/core";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createProjectAction, updateProjectAction } from "./actions";
import { SiteFields } from "./site-fields";
import { useOpenFromUrl } from "@/lib/open-from-url";

export interface ProjectDefaults {
  id?: string;
  version?: string;
  code?: string;
  name?: string;
  customerId?: string;
  kind?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  managerEmployeeId?: string | null;
  description?: string | null;
}

/** Pulsante + finestra per creare o modificare una commessa. */
export function ProjectDialog({
  openFromUrl = false,
  mode,
  options,
  defaults,
  canFinance = false,
  lockCustomer = false,
}: {
  /** Apre la finestra se l'indirizzo ha ?crea=1 (menu «+ Nuovo»). */
  openFromUrl?: boolean;
  mode: "create" | "edit";
  options: ProjectFormOptions;
  defaults?: ProjectDefaults;
  canFinance?: boolean;
  /** Dalla scheda del cliente il cliente è già deciso. */
  lockCustomer?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  useOpenFromUrl(openFromUrl, () => {
    setOpen(true);
    setRound((r) => r + 1);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRound((r) => r + 1);
      }}
    >
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus aria-hidden /> Nuova commessa
          </Button>
        ) : (
          <Button variant="secondary">
            <Pencil aria-hidden /> Modifica
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "create" ? "Nuova commessa" : "Modifica commessa"}
        description="Il lavoro concordato con un cliente: contratto, preventivo accettato o manutenzione. I cantieri sono i luoghi dove si lavora. I campi con * sono obbligatori."
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
      >
        <ProjectForm
          key={round}
          mode={mode}
          options={options}
          defaults={defaults ?? {}}
          canFinance={canFinance}
          lockCustomer={lockCustomer}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  mode,
  options,
  defaults,
  canFinance,
  lockCustomer,
  onDone,
}: {
  mode: "create" | "edit";
  options: ProjectFormOptions;
  defaults: ProjectDefaults;
  canFinance: boolean;
  lockCustomer: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "create" ? createProjectAction : updateProjectAction,
    {},
  );
  const [customerId, setCustomerId] = useState(defaults.customerId ?? "");
  const [withSite, setWithSite] = useState(false);
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    if (mode === "create") router.push(`/app/commesse/${state.createdId}?creata=1`);
    else router.refresh();
  }, [state.createdId, mode, onDone, router]);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("p", err, name);
  const customer = options.customers.find((c) => c.id === customerId);
  // in modifica il cliente attuale deve restare sceglibile anche se ora è disattivato
  const customers =
    defaults.customerId && !options.customers.some((c) => c.id === defaults.customerId)
      ? [{ id: defaults.customerId, name: "Cliente attuale", sites: [] }, ...options.customers]
      : options.customers;

  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}
      <FormField id="p-name" label="Nome della commessa" required {...errorProp(err, "name")}>
        <Input
          {...f("name")}
          defaultValue={defaults.name ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Es. Rifacimento facciate condominio Aurora"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {lockCustomer && defaults.customerId ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Cliente</p>
            <p className="flex h-9 items-center rounded-sm border border-border bg-accent/40 px-3 text-sm">
              {customer?.name ?? "Cliente selezionato"}
            </p>
            <input type="hidden" name="customerId" value={defaults.customerId} />
          </div>
        ) : (
          <FormField id="p-customerId" label="Cliente" required {...errorProp(err, "customerId")}>
            <Select
              {...f("customerId")}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Scegli il cliente…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField id="p-kind" label="Tipo" required {...errorProp(err, "kind")}>
          <Select {...f("kind")} defaultValue={defaults.kind ?? "lump_sum"} required>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="p-code"
          label="Codice"
          {...(mode === "create" ? { hint: "Vuoto: numerata in automatico (es. 2026-001)" } : {})}
          {...errorProp(err, "code")}
        >
          <Input
            {...f("code")}
            defaultValue={defaults.code ?? ""}
            maxLength={30}
            autoComplete="off"
            required={mode === "edit"}
          />
        </FormField>
        <FormField id="p-status" label="Stato" {...errorProp(err, "status")}>
          <Select {...f("status")} defaultValue={defaults.status ?? "active"}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="p-startDate" label="Inizio" {...errorProp(err, "startDate")}>
          <Input {...f("startDate")} type="date" defaultValue={defaults.startDate ?? ""} />
        </FormField>
        <FormField id="p-endDate" label="Fine prevista" {...errorProp(err, "endDate")}>
          <Input {...f("endDate")} type="date" defaultValue={defaults.endDate ?? ""} />
        </FormField>
        {options.employees.length > 0 && (
          <FormField
            id="p-managerEmployeeId"
            label="Responsabile"
            hint="Direttore tecnico o capocantiere"
            {...errorProp(err, "managerEmployeeId")}
          >
            <Select {...f("managerEmployeeId")} defaultValue={defaults.managerEmployeeId ?? ""}>
              <option value="">Nessuno</option>
              {options.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>
      <FormField id="p-description" label="Descrizione" {...errorProp(err, "description")}>
        <Textarea
          {...f("description")}
          defaultValue={defaults.description ?? ""}
          maxLength={4000}
          placeholder="Oggetto del lavoro, riferimenti del contratto o del preventivo"
        />
      </FormField>

      {mode === "create" && canFinance && (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">
            Importi (visibili solo a titolare, amministratori e ufficio)
          </legend>
          <input type="hidden" name="withFinancials" value="1" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="p-contract"
              label="Importo del contratto (€)"
              hint="Es. 48.500,00"
              {...errorProp(err, "contract")}
            >
              <Input {...f("contract")} inputMode="decimal" autoComplete="off" />
            </FormField>
            <FormField
              id="p-budgetCost"
              label="Costo previsto (€)"
              hint="Il tuo budget di costo"
              {...errorProp(err, "budgetCost")}
            >
              <Input {...f("budgetCost")} inputMode="decimal" autoComplete="off" />
            </FormField>
          </div>
        </fieldset>
      )}

      {mode === "create" && (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="withSite"
              value="1"
              className="size-4 accent-[var(--color-primary)]"
              checked={withSite}
              onChange={(e) => setWithSite(e.target.checked)}
            />
            Aggiungi subito il primo cantiere
          </label>
          {withSite && (
            <div className="rounded-md border border-border p-3">
              <SiteFields
                key={customerId}
                customerSites={customer?.sites ?? []}
                errors={err}
                showStatus={false}
              />
            </div>
          )}
        </div>
      )}

      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {mode === "create" ? "Crea commessa" : "Salva modifiche"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
