"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { CompanyMembership } from "@cantiereos/core";
import { CompanySwitcher } from "./company-switcher";
import { Logo, SidebarNav, Wordmark } from "./sidebar";

/** Menu a scomparsa per smartphone e tablet. */
export function MobileNav({
  companies,
  activeTenantId,
  permissions,
}: {
  companies: CompanyMembership[];
  activeTenantId: string | null;
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="flex size-9 items-center justify-center rounded-md hover:bg-accent lg:hidden"
        aria-label="Apri menu"
      >
        <Menu className="size-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-navy text-navy-foreground shadow-lg lg:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-14 items-center gap-2 px-4">
            <Logo />
            <DialogPrimitive.Title className="flex-1">
              <Wordmark />
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-navy-muted hover:bg-navy-accent"
              aria-label="Chiudi menu"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-3">
            <CompanySwitcher companies={companies} activeTenantId={activeTenantId} />
          </div>
          <SidebarNav permissions={permissions} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
