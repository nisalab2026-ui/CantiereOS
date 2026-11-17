"use client";

import { useState, useTransition } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog";

/**
 * Conferma per azioni distruttive: dice esattamente cosa succede.
 * `action` è una Server Action: la conferma lato client non sostituisce
 * i controlli del server.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  confirmVariant = "danger",
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
  confirmVariant?: "danger" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Annulla</Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            loading={pending}
            onClick={() =>
              start(async () => {
                await action();
                setOpen(false);
              })
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
