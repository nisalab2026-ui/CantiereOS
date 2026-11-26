import { z } from "zod";
import type { TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";
import { ValidationError } from "../validation";

/**
 * Preferenze personali (ADR-018): scelte di visualizzazione di una persona in
 * un'azienda. RLS: ognuno legge e scrive solo le proprie (user_id = auth.uid()).
 */
const KEY = /^[a-z][a-z0-9_.-]{1,63}$/;

function checkKey(key: string): void {
  if (!KEY.test(key)) throw new ValidationError({ form: "Preferenza non valida" });
}

/** Legge una preferenza e la valida con lo schema; se manca o non è valida → null. */
export async function getPreference<S extends z.ZodType>(
  tx: UserTx,
  access: TenantAccess,
  key: string,
  schema: S,
): Promise<z.output<S> | null> {
  checkKey(key);
  const { rows } = await tx.query<{ value: unknown }>(
    `select value from public.user_preferences
      where tenant_id = $1 and user_id = auth.uid() and key = $2`,
    [access.tenantId, key],
  );
  if (!rows[0]) return null;
  const parsed = schema.safeParse(rows[0].value);
  return parsed.success ? parsed.data : null;
}

/** Salva (o sostituisce) una preferenza già validata dal chiamante. */
export async function setPreference(
  tx: UserTx,
  access: TenantAccess,
  key: string,
  value: Record<string, unknown> | unknown[],
): Promise<void> {
  checkKey(key);
  const json = JSON.stringify(value);
  if (json.length > 16_000) throw new ValidationError({ form: "Preferenza troppo grande" });
  await tx.query(
    `insert into public.user_preferences (tenant_id, user_id, key, value)
     values ($1, auth.uid(), $2, $3::jsonb)
     on conflict (tenant_id, user_id, key) do update set value = excluded.value`,
    [access.tenantId, key, json],
  );
}

/** Torna all'impostazione predefinita. */
export async function deletePreference(
  tx: UserTx,
  access: TenantAccess,
  key: string,
): Promise<void> {
  checkKey(key);
  await tx.query(
    "delete from public.user_preferences where tenant_id = $1 and user_id = auth.uid() and key = $2",
    [access.tenantId, key],
  );
}
