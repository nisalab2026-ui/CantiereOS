"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { visibleCreateActions } from "./navigation";

/**
 * «+ Nuovo»: crea un elemento da qualsiasi pagina. Mostra solo ciò che il
 * server permette di creare; ogni salvataggio ricontrolla comunque il permesso.
 */
export function NewMenu({
  permissions,
  open: controlledOpen,
  onOpenChange,
  variant = "header",
}: {
  permissions: string[];
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** «header»: pulsante nella barra in alto; «bottom»: tasto tondo nella barra del telefono. */
  variant?: "header" | "bottom";
}) {
  const router = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const actions = visibleCreateActions(permissions);
  if (actions.length === 0) return null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={variant === "bottom"}>
      {variant === "header" ? (
        <DropdownMenuTrigger
          className={cn(buttonVariants({ size: "sm" }), "hidden gap-1.5 px-2.5 sm:inline-flex")}
          data-testid="new-menu"
        >
          <Plus aria-hidden /> Nuovo
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground active:scale-95"
          data-testid="bottom-new"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Plus className="size-4" aria-hidden />
          </span>
          Nuovo
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        side={variant === "bottom" ? "top" : "bottom"}
        className="max-h-[70dvh] w-60 overflow-y-auto"
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const hit = actions.find((a) => a.key === e.key.toLowerCase());
          if (hit) {
            e.preventDefault();
            setOpen(false);
            router.push(hit.href);
          }
        }}
      >
        <DropdownMenuLabel>Crea</DropdownMenuLabel>
        {actions.map((a) => (
          <DropdownMenuItem key={a.href} onSelect={() => router.push(a.href)}>
            <a.icon aria-hidden />
            <span className="flex-1">{a.label}</span>
            <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground uppercase">
              {a.key}
            </kbd>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
