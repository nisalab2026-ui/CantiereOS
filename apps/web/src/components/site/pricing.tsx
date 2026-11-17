"use client";

import { ArrowRight, Check, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { Plan } from "@/app/(marketing)/content";
import { cn } from "@/lib/cn";

/**
 * Piani con selettore annuale/mensile e un piccolo calcolo: quanti siete? Il calcolo indica il piano che
 * costa meno per quel numero di utenti, tra quelli che lo ammettono (utenti oltre gli inclusi a
 * `extraUser` € al mese, fino al massimo del piano). Oltre l'ultimo piano: offerta su misura.
 */
export function Pricing({
  plans,
  extraUser,
  signedIn,
}: {
  plans: Plan[];
  extraUser: number;
  signedIn: boolean;
}) {
  const [yearly, setYearly] = useState(true);
  const [users, setUsers] = useState(6);
  const usersId = useId();

  const costFor = (p: Plan) => {
    const base = yearly ? p.yearly : p.monthly;
    const extra = Math.max(0, users - p.included);
    return base + extra * extraUser;
  };
  const best = useMemo(() => {
    const fit = plans.filter((p) => users <= p.max);
    return fit.length ? fit.reduce((a, b) => (costFor(b) < costFor(a) ? b : a)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, users, yearly]);

  return (
    <div>
      <div className="flex flex-col items-center gap-6">
        <div
          role="radiogroup"
          aria-label="Fatturazione"
          className="relative grid grid-cols-2 rounded-full border border-border bg-card p-1 text-sm"
        >
          <span
            aria-hidden
            className="cos-primary absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: yearly ? "translateX(100%)" : "none" }}
          />
          {[
            [false, "Mensile"],
            [true, "Annuale · 2 mesi in regalo"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={yearly === v}
              onClick={() => setYearly(v as boolean)}
              className={cn(
                "relative z-10 h-9 rounded-full px-4 font-medium transition-colors sm:px-5",
                yearly === v
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {plans.map((p, i) => {
          const price = yearly ? p.yearly : p.monthly;
          return (
            <article
              key={p.id}
              data-reveal
              style={{ "--reveal-i": i } as React.CSSProperties}
              className={cn(
                "price-card site-spot relative flex flex-col rounded-3xl border border-border bg-card p-7 sm:p-8",
                p.recommended && "price-card-hero lg:-my-4 lg:py-12",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-semibold">{p.name}</h3>
                {p.recommended && (
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    Il più scelto
                  </span>
                )}
              </div>
              <p className="mt-2 min-h-12 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span
                  key={`${p.id}-${price}`}
                  data-changed
                  className="price-amount text-5xl font-semibold tracking-tight tabular-nums"
                >
                  {price} €
                </span>
                <span className="text-muted-foreground">/ mese</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                IVA esclusa{yearly ? `, ${p.yearly * 12} € l'anno` : ", fatturazione mensile"}
              </p>
              <p className="mt-5 text-sm font-medium">{p.users}</p>
              <ul className="mt-4 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={signedIn ? "/app" : "/registrati"}
                data-magnetic
                data-cursor="PROVA"
                className={cn(
                  "mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium",
                  p.recommended
                    ? "cos-primary bg-primary text-primary-foreground"
                    : "border border-border hover:bg-accent",
                )}
              >
                {signedIn ? "Apri il gestionale" : "Prova gratis 30 giorni"}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </article>
          );
        })}
      </div>

      <div
        data-reveal
        className="mx-auto mt-16 flex max-w-3xl flex-col items-center gap-5 rounded-3xl border border-border bg-card p-6 text-center sm:flex-row sm:p-8 sm:text-left"
      >
        <div className="flex-1">
          <label htmlFor={usersId} className="text-sm font-medium">
            Quante persone useranno CantiereOS?
          </label>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {best ? (
              <>
                Per {users} {users === 1 ? "utente" : "utenti"} il piano giusto è{" "}
                <b className="text-foreground">{best.name}</b>: {costFor(best)} € al mese
                {yearly ? " con fatturazione annuale" : ""}, IVA esclusa.
              </>
            ) : (
              <>Oltre {plans[plans.length - 1]!.max} utenti prepariamo un'offerta su misura.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUsers((u) => Math.max(1, u - 1))}
            className="grid size-10 place-items-center rounded-full border border-border hover:bg-accent"
            aria-label="Un utente in meno"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            id={usersId}
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={users}
            onChange={(e) => setUsers(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
            className="h-10 w-16 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums"
          />
          <button
            type="button"
            onClick={() => setUsers((u) => Math.min(200, u + 1))}
            className="grid size-10 place-items-center rounded-full border border-border hover:bg-accent"
            aria-label="Un utente in più"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
