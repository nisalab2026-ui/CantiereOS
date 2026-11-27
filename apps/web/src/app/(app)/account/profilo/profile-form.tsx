"use client";

import { useActionState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { updateProfileAction } from "./actions";

export function ProfileForm({
  fullName,
  phone,
  email,
  version,
}: {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  version: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  const err = state.fieldErrors ?? {};
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="version" value={version} />
      <FormAlert error={state.error} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pf-fullName" label="Nome e cognome" required {...errorProp(err, "fullName")}>
          <Input
            {...fieldAttrs("pf", err, "fullName")}
            defaultValue={fullName ?? ""}
            required
            maxLength={200}
            autoComplete="name"
          />
        </FormField>
        <FormField
          id="pf-phone"
          label="Telefono"
          hint="Facoltativo, visibile ai colleghi"
          {...errorProp(err, "phone")}
        >
          <Input
            {...fieldAttrs("pf", err, "phone")}
            type="tel"
            defaultValue={phone ?? ""}
            maxLength={40}
            autoComplete="tel"
          />
        </FormField>
        <FormField
          id="pf-email"
          label="Email di accesso"
          hint="È l'indirizzo con cui entri: non si cambia da qui."
        >
          <Input id="pf-email" value={email ?? ""} readOnly disabled />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Salva profilo</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
