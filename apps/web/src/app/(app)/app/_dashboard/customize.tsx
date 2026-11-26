"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutDashboard, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { resetDashboardLayoutAction, saveDashboardLayoutAction } from "./actions";

type Item = { id: string; label: string; visible: boolean };

/**
 * Personalizza la panoramica: mostra, nascondi e riordina i riquadri. Elenca
 * solo quelli che la persona può vedere; la scelta si salva nel database e la
 * segue su ogni dispositivo.
 */
export function CustomizeDashboard({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const toggle = (i: number) =>
    setItems((xs) => xs.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));

  const finish = (r: { message?: string; error?: string }) => {
    if (r.error) return setError(r.error);
    setOpen(false);
    if (r.message) toast(r.message);
    router.refresh();
  };
  const save = () =>
    start(async () =>
      finish(
        await saveDashboardLayoutAction({
          order: items.map((x) => x.id),
          hidden: items.filter((x) => !x.visible).map((x) => x.id),
        }),
      ),
    );
  const reset = () => start(async () => finish(await resetDashboardLayoutAction()));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setItems(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="customize-dashboard">
          <LayoutDashboard aria-hidden /> Personalizza
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Personalizza la panoramica"
        description="Scegli quali riquadri vedere e in che ordine. Vale solo per te, su ogni dispositivo."
      >
        <ol
          className="divide-y divide-border rounded-md border border-border"
          data-testid="widget-list"
        >
          {items.map((x, i) => (
            <li
              key={x.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm",
                !x.visible && "opacity-60",
              )}
              data-testid={`widget-${x.id}`}
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", !x.visible && "line-through")}>
                {x.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Sposta su: ${x.label}`}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label={`Sposta giù: ${x.label}`}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => toggle(i)}
                aria-pressed={!x.visible}
                aria-label={`${x.visible ? "Nascondi" : "Mostra"}: ${x.label}`}
              >
                {x.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              </Button>
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger" data-testid="form-error">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
            <RotateCcw aria-hidden /> Ripristina
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annulla
              </Button>
            </DialogClose>
            <Button type="button" onClick={save} loading={pending}>
              Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
