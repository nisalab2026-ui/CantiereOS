"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import type { CompanyMembership } from "@cantiereos/core";
import { DemoBadge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchCompanyTo } from "@/app/(app)/shell-actions";

/**
 * Selettore dell'azienda attiva. L'id scelto è solo una richiesta: il server
 * verifica nel database che l'utente ne sia membro attivo.
 */
export function CompanySwitcher({
  companies,
  activeTenantId,
}: {
  companies: CompanyMembership[];
  activeTenantId: string | null;
}) {
  const [pending, start] = useTransition();
  const active = companies.find((c) => c.tenantId === activeTenantId) ?? companies[0];
  if (!active) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-navy-accent px-2.5 py-2 text-left hover:border-white/20 disabled:opacity-60"
        aria-label="Azienda attiva"
        data-testid="company-switcher"
        disabled={pending}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-semibold">
          {active.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium" data-testid="active-company">
              {active.name}
            </span>
            {active.isDemo && <DemoBadge />}
          </span>
          <span className="block truncate text-xs text-navy-muted">{active.roleName}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-navy-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Le tue aziende</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.tenantId}
            onSelect={() => start(() => switchCompanyTo(c.tenantId))}
            data-testid="company-option"
            data-tenant-id={c.tenantId}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate">{c.name}</span>
                {c.isDemo && <DemoBadge />}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{c.roleName}</span>
            </span>
            {c.tenantId === active.tenantId && (
              <Check className="text-primary!" aria-label="Attiva" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
