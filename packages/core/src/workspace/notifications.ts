import { z } from "zod";
import type { TenantAccess } from "../auth/access";
import type { UserTx } from "../db/transaction";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Notifiche dell'utente nell'azienda attiva (RLS: solo le proprie). */
export async function listNotifications(
  tx: UserTx,
  access: TenantAccess,
  limit = 20,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const max = Math.min(Math.max(limit, 1), 100);
  const items = await tx.query<NotificationItem>(
    `select id, kind, title, body, link, read_at as "readAt", created_at as "createdAt"
       from public.notifications
      where tenant_id = $1 and user_id = auth.uid()
      order by created_at desc
      limit $2`,
    [access.tenantId, max],
  );
  const unread = await tx.query<{ n: number }>(
    `select count(*)::int as n from public.notifications
      where tenant_id = $1 and user_id = auth.uid() and read_at is null`,
    [access.tenantId],
  );
  return { items: items.rows, unread: unread.rows[0]?.n ?? 0 };
}

/** Segna come lette alcune notifiche (o tutte se ids è vuoto). */
export async function markNotificationsRead(
  tx: UserTx,
  access: TenantAccess,
  ids: string[] = [],
): Promise<number> {
  const valid = ids.filter((id) => z.uuid().safeParse(id).success).slice(0, 100);
  const { rowCount } = await tx.query(
    `update public.notifications set read_at = now()
      where tenant_id = $1 and user_id = auth.uid() and read_at is null
        and (cardinality($2::uuid[]) = 0 or id = any ($2::uuid[]))`,
    [access.tenantId, valid],
  );
  return rowCount ?? 0;
}
