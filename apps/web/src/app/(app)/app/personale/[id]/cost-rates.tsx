"use client";

import type { EmployeeCostRate } from "@cantiereos/core";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input } from "@/components/ui/input";
import { errorProp } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { Money } from "../../pagamenti/payment-bits";
import { formatDue } from "../../scadenze/deadline-bits";
import { addCostRateAction, removeCostRateAction } from "../../rapportini/actions";

/**
 * Costo orario aziendale della persona (solo projects.finance), con data di
 * validità: i rapportini usano il costo valido nel loro giorno.
 */
export function CostRates({
  employeeId,
  rates,
}: {
  employeeId: string;
  rates: EmployeeCostRate[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(addCostRateAction, {});
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  useEffect(() => {
    if (state.message) router.refresh();
  }, [state, router]);
  const err = state.fieldErrors ?? {};
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  return (
    <div className="space-y-4">
      {rates.length > 0 ? (
        <ul className="divide-y divide-border text-sm" data-testid="cost-rates">
          {rates.map((r, i) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <Money cents={r.hourlyCostCents} />
                <span className="text-muted-foreground"> /h dal {formatDue(r.validFrom)}</span>
                {i === 0 && <span className="ml-2 text-xs text-success">attuale</span>}
                {r.notes && <span className="block text-xs text-muted-foreground">{r.notes}</span>}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Togli il costo dal ${formatDue(r.validFrom)}`}
                onClick={() =>
                  start(async () => {
                    const x = await removeCostRateAction(employeeId, r.id);
                    setError(x.error);
                    router.refresh();
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun costo indicato: le ore di questa persona nei rapportini non hanno ancora un costo.
        </p>
      )}
      <KeepValuesForm
        dispatch={action}
        className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="employeeId" value={employeeId} />
        <FormField id="cr-amount" label="Costo orario (€)" required {...errorProp(err, "amount")}>
          <Input id="cr-amount" name="amount" inputMode="decimal" placeholder="28,50" required />
        </FormField>
        <FormField id="cr-validFrom" label="Valido dal" required {...errorProp(err, "validFrom")}>
          <Input id="cr-validFrom" name="validFrom" type="date" defaultValue={today} required />
        </FormField>
        <SubmitButton pending={pending}>Salva</SubmitButton>
      </KeepValuesForm>
      <FormAlert error={state.error ?? error} message={state.message} />
    </div>
  );
}
