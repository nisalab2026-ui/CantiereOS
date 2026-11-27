"use client";

import { useActionState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { updateCompanyAction } from "./actions";

export function CompanyForm({
  name,
  legalName,
  vatNumber,
  taxCode,
  version,
}: {
  name: string;
  legalName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  version: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCompanyAction, {});
  const err = state.fieldErrors ?? {};
  const f = (n: string) => fieldAttrs("co", err, n);
  return (
    <KeepValuesForm dispatch={action} className="space-y-4">
      <input type="hidden" name="version" value={version} />
      <FormAlert error={state.error} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="co-name"
          label="Nome dell'azienda"
          required
          hint="Compare nel menu e nei documenti dell'app"
          {...errorProp(err, "name")}
        >
          <Input
            {...f("name")}
            defaultValue={name}
            required
            maxLength={200}
            autoComplete="organization"
          />
        </FormField>
        <FormField id="co-legalName" label="Ragione sociale" {...errorProp(err, "legalName")}>
          <Input {...f("legalName")} defaultValue={legalName ?? ""} maxLength={300} />
        </FormField>
        <FormField id="co-vatNumber" label="Partita IVA" {...errorProp(err, "vatNumber")}>
          <Input
            {...f("vatNumber")}
            defaultValue={vatNumber ?? ""}
            maxLength={20}
            className="font-mono uppercase"
            autoComplete="off"
          />
        </FormField>
        <FormField id="co-taxCode" label="Codice fiscale" {...errorProp(err, "taxCode")}>
          <Input
            {...f("taxCode")}
            defaultValue={taxCode ?? ""}
            maxLength={16}
            className="font-mono uppercase"
            autoComplete="off"
          />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Salva dati azienda</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
