"use client";

import {
  WORK_ITEM_KIND_LABELS,
  WORK_ITEM_KINDS,
  type WorkItemKind,
  type WorkReportDetail,
} from "@cantiereos/core";
import { Clock, Copy, Package, Plus, Save, Send, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form-alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { centsToInput } from "../../pagamenti/payment-bits";
import { changeStatusAction, saveReportAction } from "../actions";
import { formatHours } from "../report-bits";

interface Labor {
  key: string;
  id?: string;
  employeeId: string;
  byTime: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  hours: string;
  notes: string;
}
interface Item {
  key: string;
  id?: string;
  kind: WorkItemKind;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

const newKey = () => `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const num = (v: number) =>
  v.toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: false });

/** Ore calcolate come fa il database: fine − inizio − pausa (oltre mezzanotte: turno notturno). */
function hoursOf(l: Labor): number | null {
  if (!l.byTime) {
    const n = Number(l.hours.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return h === undefined || mm === undefined ? NaN : h * 60 + mm;
  };
  let d = m(l.endTime) - m(l.startTime);
  if (!Number.isFinite(d)) return null;
  if (d <= 0) d += 24 * 60;
  d -= Number(l.breakMinutes || 0);
  return d > 0 ? Math.round((d / 60) * 100) / 100 : null;
}

export function ReportEditor({
  report,
  sites,
  employees,
  canFinance,
}: {
  report: WorkReportDetail;
  sites: { id: string; name: string }[];
  employees: { id: string; name: string; mine: boolean }[];
  canFinance: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    error?: string;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>({});
  const [siteId, setSiteId] = useState(report.projectSiteId ?? "");
  const [date, setDate] = useState(report.reportDate);
  const [work, setWork] = useState(report.workDescription ?? "");
  const [notes, setNotes] = useState(report.notes ?? "");
  const me = employees.find((e) => e.mine);
  const [labor, setLabor] = useState<Labor[]>(() =>
    report.labor.length === 0 && me
      ? // rapportino nuovo: la propria riga è già proposta (si salva solo con «Salva»)
        [
          {
            key: newKey(),
            employeeId: me.id,
            byTime: true,
            startTime: "07:30",
            endTime: "16:30",
            breakMinutes: "60",
            hours: "",
            notes: "",
          },
        ]
      : report.labor.map((l) => ({
          key: l.id,
          id: l.id,
          employeeId: l.employeeId,
          byTime: Boolean(l.startTime && l.endTime),
          startTime: l.startTime ?? "",
          endTime: l.endTime ?? "",
          breakMinutes: String(l.breakMinutes ?? 0),
          hours: num(l.hours),
          notes: l.notes ?? "",
        })),
  );
  const [items, setItems] = useState<Item[]>(
    report.items.map((i) => ({
      key: i.id,
      id: i.id,
      kind: i.kind,
      description: i.description,
      quantity: num(i.quantity),
      unit: i.unit ?? "",
      unitCost: i.unitCostCents != null ? centsToInput(i.unitCostCents) : "",
    })),
  );
  const [dirty, setDirty] = useState(report.labor.length === 0 && Boolean(me));
  const touch = () => {
    setDirty(true);
    if (result.message) setResult({});
  };
  const err = result.fieldErrors ?? {};

  const mine = employees.find((e) => e.mine);
  const addLabor = (employeeId = "") => {
    const prev = labor.at(-1);
    setLabor((x) => [
      ...x,
      {
        key: newKey(),
        employeeId,
        byTime: prev?.byTime ?? true,
        startTime: prev?.startTime || "07:30",
        endTime: prev?.endTime || "16:30",
        breakMinutes: prev?.breakMinutes ?? "60",
        hours: prev?.hours ?? "",
        notes: "",
      },
    ]);
    touch();
  };
  const setL = (key: string, patch: Partial<Labor>) => {
    setLabor((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  };
  const setI = (key: string, patch: Partial<Item>) => {
    setItems((x) => x.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    touch();
  };
  const total = labor.reduce((t, l) => t + (hoursOf(l) ?? 0), 0);

  const save = (thenSubmit = false) =>
    start(async () => {
      const r = await saveReportAction(
        report.id,
        {
          reportDate: date,
          ...(siteId ? { projectSiteId: siteId } : {}),
          ...(work.trim() ? { workDescription: work } : {}),
          ...(notes.trim() ? { notes } : {}),
          labor: labor.map((l) => ({
            ...(l.id ? { id: l.id } : {}),
            employeeId: l.employeeId,
            ...(l.byTime
              ? {
                  startTime: l.startTime,
                  endTime: l.endTime,
                  breakMinutes: Number(l.breakMinutes || 0),
                }
              : { hours: l.hours }),
            ...(l.notes.trim() ? { notes: l.notes } : {}),
          })),
          items: items.map((i) => ({
            ...(i.id ? { id: i.id } : {}),
            kind: i.kind,
            description: i.description,
            quantity: i.quantity,
            ...(i.unit.trim() ? { unit: i.unit } : {}),
            ...(canFinance && i.unitCost.trim() ? { unitCost: i.unitCost } : {}),
          })),
        },
        new Date(report.updatedAt).toISOString(),
      );
      if (!r.error && thenSubmit) {
        const sub = await changeStatusAction(report.id, "submit");
        setResult(sub);
        if (!sub.error) setDirty(false);
        router.refresh();
        return;
      }
      setResult(r);
      if (!r.error) {
        setDirty(false);
        // l'editor si ricarica con i dati salvati: l'avviso lo mostra la pagina
        router.replace(`/app/rapportini/${report.id}?salvato=1`, { scroll: false });
      }
    });

  return (
    <div className="space-y-4" data-testid="report-editor">
      <Card>
        <CardHeader title="Giornata" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="re-date"
              label="Giorno"
              required
              {...(err.reportDate ? { error: err.reportDate } : {})}
            >
              <Input
                id="re-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  touch();
                }}
              />
            </FormField>
            <FormField
              id="re-site"
              label="Cantiere"
              {...(err.projectSiteId ? { error: err.projectSiteId } : {})}
            >
              <Select
                id="re-site"
                value={siteId}
                disabled={sites.length === 0}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  touch();
                }}
              >
                <option value="">{sites.length ? "Nessuno in particolare" : "—"}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField
            id="re-work"
            label="Lavori eseguiti"
            hint="Cosa è stato fatto oggi: comparirà nella stampa per il cliente."
            {...(err.workDescription ? { error: err.workDescription } : {})}
          >
            <Textarea
              id="re-work"
              rows={4}
              maxLength={8000}
              value={work}
              onChange={(e) => {
                setWork(e.target.value);
                touch();
              }}
            />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ore"
          description={`Totale ${formatHours(Math.round(total * 100) / 100)}`}
          actions={
            <div className="flex flex-wrap gap-2">
              {mine && !labor.some((l) => l.employeeId === mine.id) && (
                <Button size="sm" variant="secondary" onClick={() => addLabor(mine.id)}>
                  <UserPlus aria-hidden /> Aggiungi me
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addLabor()}
                data-testid="add-labor"
              >
                <Plus aria-hidden /> Persona
              </Button>
            </div>
          }
        />
        <CardBody>
          {labor.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna riga. Aggiungi chi ha lavorato con inizio, fine e pausa, oppure con le ore
              totali.
            </p>
          ) : (
            <ul className="space-y-3">
              {labor.map((l, i) => {
                const h = hoursOf(l);
                const e = err[`labor.${i}`];
                return (
                  <li
                    key={l.key}
                    className={cn("rounded-lg border p-3", e ? "border-danger" : "border-border")}
                    data-testid="labor-row"
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select
                        aria-label={`Persona, riga ${i + 1}`}
                        value={l.employeeId}
                        onChange={(ev) => setL(l.key, { employeeId: ev.target.value })}
                      >
                        <option value="">Scegli la persona…</option>
                        {employees.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setL(l.key, { byTime: !l.byTime, hours: h ? num(h) : l.hours })
                          }
                        >
                          <Clock aria-hidden /> {l.byTime ? "Ore totali" : "Inizio e fine"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Togli la riga ${i + 1}`}
                          onClick={() => {
                            setLabor((x) => x.filter((y) => y.key !== l.key));
                            touch();
                          }}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      {l.byTime ? (
                        <>
                          <label className="text-xs text-muted-foreground">
                            Inizio
                            <Input
                              type="time"
                              className="mt-1 w-28"
                              value={l.startTime}
                              onChange={(ev) => setL(l.key, { startTime: ev.target.value })}
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Fine
                            <Input
                              type="time"
                              className="mt-1 w-28"
                              value={l.endTime}
                              onChange={(ev) => setL(l.key, { endTime: ev.target.value })}
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Pausa (min)
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={600}
                              step={5}
                              className="mt-1 w-24"
                              value={l.breakMinutes}
                              onChange={(ev) => setL(l.key, { breakMinutes: ev.target.value })}
                            />
                          </label>
                        </>
                      ) : (
                        <label className="text-xs text-muted-foreground">
                          Ore
                          <Input
                            inputMode="decimal"
                            className="mt-1 w-24"
                            placeholder="8"
                            value={l.hours}
                            onChange={(ev) => setL(l.key, { hours: ev.target.value })}
                          />
                        </label>
                      )}
                      <p className="pb-2 text-sm font-medium tabular-nums" aria-live="polite">
                        = {h ? formatHours(h) : "—"}
                      </p>
                      <Input
                        aria-label={`Note, riga ${i + 1}`}
                        placeholder="Note (facoltative)"
                        className="min-w-40 flex-1"
                        maxLength={500}
                        value={l.notes}
                        onChange={(ev) => setL(l.key, { notes: ev.target.value })}
                      />
                    </div>
                    {e && (
                      <p role="alert" className="mt-2 text-xs text-danger">
                        {e}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Materiali e mezzi"
          {...(canFinance
            ? { description: "Il prezzo unitario lo vedete solo tu e l'amministrazione." }
            : {})}
          actions={
            <Button
              size="sm"
              variant="secondary"
              data-testid="add-item"
              onClick={() => {
                setItems((x) => [
                  ...x,
                  {
                    key: newKey(),
                    kind: "material",
                    description: "",
                    quantity: "1",
                    unit: "",
                    unitCost: "",
                  },
                ]);
                touch();
              }}
            >
              <Package aria-hidden /> Voce
            </Button>
          }
        />
        <CardBody>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun materiale o mezzo indicato.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((it, i) => {
                const e = err[`items.${i}`];
                return (
                  <li
                    key={it.key}
                    className={cn("rounded-lg border p-3", e ? "border-danger" : "border-border")}
                    data-testid="item-row"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <Select
                        aria-label={`Tipo, voce ${i + 1}`}
                        className="w-44"
                        value={it.kind}
                        onChange={(ev) => setI(it.key, { kind: ev.target.value as WorkItemKind })}
                      >
                        {WORK_ITEM_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {WORK_ITEM_KIND_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                      <Input
                        aria-label={`Descrizione, voce ${i + 1}`}
                        placeholder="Descrizione (es. Coppi in laterizio)"
                        className="min-w-48 flex-1"
                        maxLength={300}
                        value={it.description}
                        onChange={(ev) => setI(it.key, { description: ev.target.value })}
                      />
                      <Input
                        aria-label={`Quantità, voce ${i + 1}`}
                        inputMode="decimal"
                        className="w-24"
                        value={it.quantity}
                        onChange={(ev) => setI(it.key, { quantity: ev.target.value })}
                      />
                      <Input
                        aria-label={`Unità, voce ${i + 1}`}
                        placeholder="pz, m², h"
                        className="w-24"
                        maxLength={20}
                        value={it.unit}
                        onChange={(ev) => setI(it.key, { unit: ev.target.value })}
                      />
                      {canFinance && (
                        <Input
                          aria-label={`Prezzo unitario in euro, voce ${i + 1}`}
                          placeholder="€ unitario"
                          inputMode="decimal"
                          className="w-28"
                          value={it.unitCost}
                          onChange={(ev) => setI(it.key, { unitCost: ev.target.value })}
                        />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Togli la voce ${i + 1}`}
                        onClick={() => {
                          setItems((x) => x.filter((y) => y.key !== it.key));
                          touch();
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                      {i > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Duplica la voce ${i + 1}`}
                          onClick={() => {
                            setItems((x) => {
                              const at = x.findIndex((y) => y.key === it.key);
                              const copy = { ...it, key: newKey() };
                              delete copy.id;
                              return [...x.slice(0, at + 1), copy, ...x.slice(at + 1)];
                            });
                            touch();
                          }}
                        >
                          <Copy aria-hidden />
                        </Button>
                      )}
                    </div>
                    {e && (
                      <p role="alert" className="mt-2 text-xs text-danger">
                        {e}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4">
            <FormField
              id="re-notes"
              label="Note interne"
              hint="Non compaiono nella stampa per il cliente."
            >
              <Textarea
                id="re-notes"
                rows={2}
                maxLength={4000}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  touch();
                }}
              />
            </FormField>
          </div>
        </CardBody>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="mr-auto min-w-0 text-sm">
          <FormAlert error={result.error} message={result.message} />
          {!result.error && !result.message && (
            <span className="text-muted-foreground">
              {dirty ? "Modifiche non salvate" : "Tutto salvato"}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => save(true)}
          disabled={pending || labor.length === 0}
          data-testid="save-submit-report"
        >
          <Send aria-hidden /> Salva e invia
        </Button>
        <Button onClick={() => save()} disabled={pending} data-testid="save-report">
          <Save aria-hidden /> {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </div>
  );
}
