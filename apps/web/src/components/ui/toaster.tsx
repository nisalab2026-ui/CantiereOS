"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "info" | "warning";
interface Item {
  id: number;
  text: string;
  tone: Tone;
  leaving?: boolean;
}

const EVENT = "cos-toast";
const LIFETIME = 5000;

/** Avviso a scomparsa: conferma di un'operazione riuscita. Da qualsiasi componente client. */
export function toast(text: string, tone: Tone = "success") {
  if (typeof window === "undefined" || !text) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }));
}

const ICON = { success: CheckCircle2, info: Info, warning: TriangleAlert } as const;
const TONE = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
} as const;

/** Contenitore degli avvisi, montato una volta nel layout principale. */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    const dismiss = (id: number) => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 200);
      map.delete(id);
    };
    const schedule = (id: number) => {
      clearTimeout(map.get(id));
      map.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME),
      );
    };
    const onToast = (e: Event) => {
      const { text, tone } = (e as CustomEvent<{ text: string; tone: Tone }>).detail;
      setItems((xs) => {
        // Lo stesso testo già visibile non si duplica: riparte il tempo.
        const same = xs.find((x) => x.text === text && !x.leaving);
        if (same) {
          schedule(same.id);
          return xs;
        }
        const id = ++seq.current;
        schedule(id);
        return [...xs.slice(-2), { id, text, tone }];
      });
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      map.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
    >
      {items.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            className={cn(
              "cos-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-popover/95 px-4 py-3 text-sm shadow-lg backdrop-blur-xl",
              t.leaving && "cos-toast-out",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[t.tone])} aria-hidden />
            <p className="min-w-0 flex-1 font-medium">{t.text}</p>
            <button
              type="button"
              aria-label="Chiudi avviso"
              onClick={() =>
                setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, leaving: true } : x)))
              }
              className="-mr-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
