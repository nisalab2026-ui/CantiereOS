"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/forms";
import { FormAlert } from "@/components/ui/form-alert";
import { Select } from "@/components/ui/input";
import type { FormState } from "@/lib/messages";
import { linkEmployeeAccountAction } from "../actions";

/**
 * Collega la persona a un account dell'azienda. Senza collegamento la persona
 * non vede i suoi interventi nella web app dei dipendenti.
 */
export function AccountLink({
  employeeId,
  current,
  accounts,
}: {
  employeeId: string;
  current: string | null;
  accounts: { id: string; name: string; linkedTo: string | null }[];
}) {
  const router = useRouter();
  const [state, action] = useActionState<FormState, FormData>(linkEmployeeAccountAction, {});
  useEffect(() => {
    if (state.message) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={employeeId} />
      <label htmlFor="account-user" className="sr-only">
        Account collegato
      </label>
      <Select id="account-user" name="userId" defaultValue={current ?? ""} key={current ?? ""}>
        <option value="">Nessun account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id} disabled={!!a.linkedTo && a.id !== current}>
            {a.name}
            {a.linkedTo && a.id !== current ? ` (già di ${a.linkedTo})` : ""}
          </option>
        ))}
      </Select>
      {state.fieldErrors?.userId && (
        <p className="text-sm text-destructive" role="alert">
          {state.fieldErrors.userId}
        </p>
      )}
      <FormAlert error={state.error} message={state.message} />
      <div className="flex justify-end">
        <SubmitButton variant="secondary">Aggiorna collegamento</SubmitButton>
      </div>
    </form>
  );
}
