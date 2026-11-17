"use client";

import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@cantiereos/core";
import { ChevronDown, Euro, MapPinPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import {
  deleteProjectAction,
  removeSiteAction,
  saveFinancialsAction,
  saveSiteAction,
  setProjectStatusAction,
} from "./actions";
import { SiteFields, type CustomerSiteOption, type SiteDefaults } from "./site-fields";

/** Cambio di stato: in offerta, in corso, sospesa, conclusa, annullata. */
export function ProjectStatusMenu({ id, status }: { id: string; status: ProjectStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" loading={pending}>
            Stato: {PROJECT_STATUS_LABELS[status]} <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Cambia lo stato della commessa</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(v) =>
              start(async () => {
                if (v === status) return;
                const r = await setProjectStatusAction(id, v as ProjectStatus);
                setError(r.error);
                router.refresh();
              })
            }
          >
            {PROJECT_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline">
          <Trash2 aria-hidden /> Elimina
        </Button>
      }
      title="Eliminare la commessa?"
      description={`«${title}» sparirà dagli elenchi insieme ai suoi cantieri. Moduli, attività e documenti collegati restano. La cronologia resta nel registro attività.`}
      confirmLabel="Elimina"
      action={() => deleteProjectAction(id)}
    />
  );
}

/** Finestra con un form che si ricrea a ogni apertura. */
function FormDialog({
  trigger,
  title,
  description,
  wide = false,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  wide?: boolean;
  children: (onDone: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRound((r) => r + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={title}
        description={description}
        {...(wide ? { className: "max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto" } : {})}
      >
        <div key={round}>{children(() => setOpen(false))}</div>
      </DialogContent>
    </Dialog>
  );
}

function useDone(state: FormState, onDone: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!state.createdId) return;
    onDone();
    router.refresh();
  }, [state, onDone, router]);
}

function Footer({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <DialogClose asChild>
        <Button type="button" variant="secondary">
          Annulla
        </Button>
      </DialogClose>
      <SubmitButton pending={pending}>{label}</SubmitButton>
    </div>
  );
}

// --- Importi -------------------------------------------------------------------

export function FinancialsDialog({
  projectId,
  defaults,
}: {
  projectId: string;
  defaults: { contract: string; budgetCost: string; notes: string };
}) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="secondary">
          <Euro aria-hidden /> Modifica importi
        </Button>
      }
      title="Importi della commessa"
      description="Visibili solo a titolare, amministratori e ufficio. Costi e ore effettivi arriveranno dai rapportini."
    >
      {(onDone) => <FinancialsForm projectId={projectId} defaults={defaults} onDone={onDone} />}
    </FormDialog>
  );
}

function FinancialsForm({
  projectId,
  defaults,
  onDone,
}: {
  projectId: string;
  defaults: { contract: string; budgetCost: string; notes: string };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFinancialsAction, {});
  useDone(state, onDone);
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("f", err, name);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="id" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="f-contract"
          label="Importo del contratto (€)"
          hint="Es. 48.500,00"
          {...errorProp(err, "contract")}
        >
          <Input
            {...f("contract")}
            defaultValue={defaults.contract}
            inputMode="decimal"
            autoComplete="off"
          />
        </FormField>
        <FormField id="f-budgetCost" label="Costo previsto (€)" {...errorProp(err, "budgetCost")}>
          <Input
            {...f("budgetCost")}
            defaultValue={defaults.budgetCost}
            inputMode="decimal"
            autoComplete="off"
          />
        </FormField>
      </div>
      <FormField id="f-financialNotes" label="Note" {...errorProp(err, "notes")}>
        <Textarea
          id="f-financialNotes"
          name="financialNotes"
          defaultValue={defaults.notes}
          maxLength={2000}
          placeholder="Es. SAL mensili, ritenuta a garanzia 5%"
        />
      </FormField>
      <FormAlert error={state.error} />
      <Footer pending={pending} label="Salva importi" />
    </KeepValuesForm>
  );
}

// --- Cantieri ------------------------------------------------------------------

export function SiteDialog({
  projectId,
  customerSites,
  site,
}: {
  projectId: string;
  customerSites: CustomerSiteOption[];
  /** presente = modifica */
  site?: SiteDefaults & { id: string; name: string };
}) {
  return (
    <FormDialog
      wide
      trigger={
        site ? (
          <Button size="sm" variant="ghost" aria-label={`Modifica il cantiere ${site.name}`}>
            <Pencil aria-hidden /> Modifica
          </Button>
        ) : (
          <Button size="sm" variant="secondary">
            <MapPinPlus aria-hidden /> Aggiungi cantiere
          </Button>
        )
      }
      title={site ? "Modifica cantiere" : "Nuovo cantiere"}
      description="Il luogo dove si lavora: una sede del cliente o un indirizzo diverso. I campi con * sono obbligatori."
    >
      {(onDone) => (
        <SiteForm projectId={projectId} customerSites={customerSites} site={site} onDone={onDone} />
      )}
    </FormDialog>
  );
}

function SiteForm({
  projectId,
  customerSites,
  site,
  onDone,
}: {
  projectId: string;
  customerSites: CustomerSiteOption[];
  site: (SiteDefaults & { id: string }) | undefined;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSiteAction, {});
  useDone(state, onDone);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {site && <input type="hidden" name="siteId" value={site.id} />}
      <SiteFields
        customerSites={customerSites}
        {...(site ? { defaults: site } : {})}
        errors={state.fieldErrors ?? {}}
      />
      <FormAlert error={state.error} />
      <Footer pending={pending} label={site ? "Salva cantiere" : "Aggiungi cantiere"} />
    </KeepValuesForm>
  );
}

export function RemoveSiteButton({
  projectId,
  siteId,
  name,
}: {
  projectId: string;
  siteId: string;
  name: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" aria-label={`Togli il cantiere ${name}`}>
          <Trash2 aria-hidden /> Togli
        </Button>
      }
      title="Togliere il cantiere?"
      description={`«${name}» non comparirà più nella commessa. La sua cronologia resta nel registro attività.`}
      confirmLabel="Togli cantiere"
      action={async () => {
        await removeSiteAction(projectId, siteId);
        router.refresh();
      }}
    />
  );
}
