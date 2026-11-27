"use client";

import {
  WORK_ORDER_KIND_LABELS,
  WORK_ORDER_KINDS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderOptions,
} from "@cantiereos/core";
import { Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { KeepValuesForm, SubmitButton } from "@/components/forms";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";
import type { FormState } from "@/lib/messages";
import { createWorkOrderAction, updateWorkOrderAction } from "./actions";

export interface WorkOrderDefaults {
  id?: string;
  title?: string;
  kind?: string;
  priority?: string;
  customerId?: string | null;
  customerSiteId?: string | null;
  projectId?: string | null;
  projectSiteId?: string | null;
  date?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  description?: string | null;
  employeeIds?: string[];
  leadEmployeeId?: string | null;
}

/** Modulo dell'intervento: cosa, quando, dove, chi. Il database ricontrolla i collegamenti. */
export function WorkOrderForm({
  options,
  defaults,
}: {
  options: WorkOrderOptions;
  defaults: WorkOrderDefaults;
}) {
  const edit = Boolean(defaults.id);
  const [state, action] = useActionState<FormState, FormData>(
    edit ? updateWorkOrderAction : createWorkOrderAction,
    {},
  );
  const err = state.fieldErrors ?? {};
  const f = (name: string) => fieldAttrs("wo", err, name);

  const [customerId, setCustomerId] = useState(defaults.customerId ?? "");
  const [projectId, setProjectId] = useState(defaults.projectId ?? "");
  const [crew, setCrew] = useState<string[]>(defaults.employeeIds ?? []);
  const [lead, setLead] = useState(defaults.leadEmployeeId ?? "");
  const [multiDay, setMultiDay] = useState(
    Boolean(defaults.endDate && defaults.date && defaults.endDate !== defaults.date),
  );

  const customer = options.customers.find((c) => c.id === customerId);
  const projects = useMemo(
    () => options.projects.filter((p) => !customerId || p.customerId === customerId),
    [options.projects, customerId],
  );
  const project = options.projects.find((p) => p.id === projectId);
  const names = new Map(options.employees.map((e) => [e.id, e.name]));

  return (
    <KeepValuesForm dispatch={action} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <FormAlert error={state.error} />

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Il lavoro</h2>
        <FormField id="wo-title" label="Cosa c'è da fare" required {...errorProp(err, "title")}>
          <Input
            {...f("title")}
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={defaults.title ?? ""}
            placeholder="Es. Manutenzione caldaia, Sostituzione grondaia"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="wo-kind" label="Tipo" {...errorProp(err, "kind")}>
            <Select {...f("kind")} defaultValue={defaults.kind ?? "maintenance"}>
              {WORK_ORDER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WORK_ORDER_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="wo-priority" label="Priorità" {...errorProp(err, "priority")}>
            <Select {...f("priority")} defaultValue={defaults.priority ?? "normal"}>
              {WORK_ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {WORK_ORDER_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField
          id="wo-description"
          label="Descrizione per la squadra"
          hint="Cosa fare, materiale da portare, chiavi, referenti sul posto"
          {...errorProp(err, "description")}
        >
          <Textarea
            {...f("description")}
            rows={4}
            maxLength={8000}
            defaultValue={defaults.description ?? ""}
          />
        </FormField>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Quando</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="wo-date" label="Giorno" required {...errorProp(err, "date")}>
            <Input {...f("date")} type="date" required defaultValue={defaults.date ?? ""} />
          </FormField>
          <FormField id="wo-startTime" label="Dalle" required {...errorProp(err, "startTime")}>
            <Input
              {...f("startTime")}
              type="time"
              required
              defaultValue={defaults.startTime ?? "08:00"}
            />
          </FormField>
          <FormField id="wo-endTime" label="Alle" required {...errorProp(err, "endTime")}>
            <Input
              {...f("endTime")}
              type="time"
              required
              defaultValue={defaults.endTime ?? "12:00"}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(e) => setMultiDay(e.target.checked)}
            className="size-4 accent-primary"
          />
          Dura più giorni
        </label>
        {multiDay && (
          <FormField id="wo-endDate" label="Fino al giorno" {...errorProp(err, "endDate")}>
            <Input {...f("endDate")} type="date" defaultValue={defaults.endDate ?? ""} />
          </FormField>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Dove e per chi</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="wo-customerId" label="Cliente" {...errorProp(err, "customerId")}>
            <Select
              {...f("customerId")}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setProjectId("");
              }}
            >
              <option value="">Nessun cliente (lavoro interno)</option>
              {options.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="wo-customerSiteId"
            label="Sede del cliente"
            {...errorProp(err, "customerSiteId")}
          >
            <Select
              {...f("customerSiteId")}
              defaultValue={defaults.customerSiteId ?? ""}
              disabled={!customer || customer.sites.length === 0}
              key={`site-${customerId}`}
            >
              <option value="">
                {customer && customer.sites.length === 0 ? "Nessuna sede" : "Indirizzo del cliente"}
              </option>
              {customer?.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="wo-projectId" label="Commessa" {...errorProp(err, "projectId")}>
            <Select
              {...f("projectId")}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Nessuna commessa</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="wo-projectSiteId" label="Cantiere" {...errorProp(err, "projectSiteId")}>
            <Select
              {...f("projectSiteId")}
              defaultValue={defaults.projectSiteId ?? ""}
              disabled={!project || project.sites.length === 0}
              key={`ps-${projectId}`}
            >
              <option value="">
                {project && project.sites.length === 0 ? "Nessun cantiere" : "—"}
              </option>
              {project?.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <details
          className="group rounded-md border border-border/70 p-3"
          open={Boolean(defaults.addressLine)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Indirizzo diverso
            <span className="ml-2 font-normal text-muted-foreground">
              Se vuoto, si usa quello del cantiere, della sede o del cliente
            </span>
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField id="wo-addressLine" label="Via e numero" {...errorProp(err, "addressLine")}>
              <Input
                {...f("addressLine")}
                maxLength={300}
                defaultValue={defaults.addressLine ?? ""}
              />
            </FormField>
            <FormField id="wo-postalCode" label="CAP" {...errorProp(err, "postalCode")}>
              <Input {...f("postalCode")} maxLength={20} defaultValue={defaults.postalCode ?? ""} />
            </FormField>
            <FormField id="wo-city" label="Comune" {...errorProp(err, "city")}>
              <Input {...f("city")} maxLength={120} defaultValue={defaults.city ?? ""} />
            </FormField>
            <FormField id="wo-province" label="Prov." {...errorProp(err, "province")}>
              <Input {...f("province")} maxLength={10} defaultValue={defaults.province ?? ""} />
            </FormField>
          </div>
        </details>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Squadra</h2>
          <span className="text-xs text-muted-foreground">Chi viene aggiunto riceve un avviso</span>
        </div>
        {options.teams.length > 0 && (
          <FormField
            id="wo-teamId"
            label="Aggiungi una squadra"
            hint="Ne copia le persone e il capo squadra"
            {...errorProp(err, "teamId")}
          >
            <Select {...f("teamId")} defaultValue="">
              <option value="">—</option>
              {options.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Persone</legend>
          {options.employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna persona attiva.{" "}
              <Link href="/app/personale" className="underline">
                Aggiungila nel Personale
              </Link>
              .
            </p>
          ) : (
            <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {options.employees.map((e) => {
                const on = crew.includes(e.id);
                return (
                  <label
                    key={e.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      on ? "border-primary/50 bg-primary/8" : "border-border hover:bg-accent/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="employeeIds"
                      value={e.id}
                      checked={on}
                      onChange={() =>
                        setCrew((c) => (on ? c.filter((x) => x !== e.id) : [...c, e.id]))
                      }
                      className="size-4 accent-primary"
                    />
                    {e.name}
                  </label>
                );
              })}
            </div>
          )}
          {err.employeeIds && <p className="mt-1 text-xs text-danger">{err.employeeIds}</p>}
        </fieldset>
        {crew.length > 1 && (
          <FormField
            id="wo-leadEmployeeId"
            label="Capo squadra"
            {...errorProp(err, "leadEmployeeId")}
          >
            <Select {...f("leadEmployeeId")} value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">Nessuno</option>
              {crew.map((id) => (
                <option key={id} value={id}>
                  {names.get(id)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {crew.length === 1 && <input type="hidden" name="leadEmployeeId" value={crew[0]} />}
        {crew.length === 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden /> Senza squadra l&apos;intervento non compare a
            nessuno sul campo.
          </p>
        )}
      </Card>

      <div className="flex justify-end gap-2">
        <Link
          href={defaults.id ? `/app/interventi/${defaults.id}` : "/app/interventi"}
          className={buttonVariants({ variant: "secondary" })}
        >
          Annulla
        </Link>
        <SubmitButton>{edit ? "Salva modifiche" : "Crea intervento"}</SubmitButton>
      </div>
    </KeepValuesForm>
  );
}
