"use client";

import { FORM_CATEGORIES, FORM_CATEGORY_LABELS } from "@cantiereos/core/forms";
import { Plus, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createTemplateAction } from "../actions";

/** Nuovo modello vuoto, o copia di un modello pronto (libraryKey). */
export function NewTemplateDialog({
  library,
  triggerLabel,
  variant = "primary",
}: {
  library?: { key: string; name: string; category: string; description: string };
  triggerLabel?: string;
  variant?: "primary" | "secondary";
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
      <DialogTrigger asChild>
        <Button variant={variant}>
          {library ? <Sparkles aria-hidden /> : <Plus aria-hidden />}{" "}
          {triggerLabel ?? (library ? "Usa questo modello" : "Nuovo modello")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={library ? `Usa «${library.name}»` : "Nuovo modello"}
        description={
          library
            ? "Ne crei una copia tua: potrai cambiare campi e testi prima di pubblicarla."
            : "Dai un nome al modello, poi aggiungi sezioni e campi nell'editor."
        }
      >
        <NewTemplateForm key={round} library={library} />
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateForm({
  library,
}: {
  library?: { key: string; name: string; category: string; description: string } | undefined;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTemplateAction, {});
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("t", err, name);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      {library && <input type="hidden" name="libraryKey" value={library.key} />}
      <FormField id="t-name" label="Nome del modello" required {...errorProp(err, "name")}>
        <Input
          {...f("name")}
          defaultValue={library?.name ?? ""}
          maxLength={200}
          required
          autoComplete="off"
        />
      </FormField>
      <FormField id="t-category" label="Categoria" required {...errorProp(err, "category")}>
        <Select {...f("category")} defaultValue={library?.category ?? "checklist"}>
          {FORM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FORM_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id="t-description" label="Descrizione" {...errorProp(err, "description")}>
        <Textarea
          {...f("description")}
          defaultValue={library?.description ?? ""}
          maxLength={2000}
        />
      </FormField>
      <FormAlert error={state.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Annulla
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>
          {library ? "Crea la copia" : "Crea e apri l'editor"}
        </SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
