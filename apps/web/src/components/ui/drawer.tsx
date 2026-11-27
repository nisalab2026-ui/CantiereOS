"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Pannello laterale da destra, a tutta altezza, con scorrimento interno
 * indipendente: mostra o modifica un elemento senza lasciare l'elenco.
 *
 * È guidato dall'indirizzo (es. `?anteprima=<id>`): il contenuto lo prepara il
 * server con i permessi e la RLS di chi guarda; chiudere torna a `closeHref`
 * senza ricaricare l'elenco né spostare lo scorrimento. Il link si può
 * condividere e il tasto indietro lo chiude.
 */
export function Drawer({
  title,
  description,
  closeHref,
  footer,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  closeHref: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setOpen(false);
        // lascia finire l'animazione di chiusura, poi aggiorna l'indirizzo
        setTimeout(() => router.replace(closeHref, { scroll: false }), 170);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cos-overlay fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            "cos-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-popover shadow-2xl focus:outline-none",
            className,
          )}
          data-testid="drawer"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description asChild>
                  <div className="mt-1 text-sm text-muted-foreground">{description}</div>
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Chiudi pannello"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>
          {footer && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
