import type { TenantAccess } from "@cantiereos/core";

/**
 * Esito del controllo di accesso a una sezione, dai permessi VERIFICATI
 * dell'azienda attiva. Il database ricontrolla comunque con RLS.
 */
export type Gate = "ok" | "mfa" | "forbidden";

export function sectionGate(access: TenantAccess, permission: string): Gate {
  if (access.permissions.has(permission)) return "ok";
  if (access.permissionsRequiringMfa.has(permission)) return "mfa";
  return "forbidden";
}
