import { z } from "zod";
import { hasPermission, requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { parseInput, ValidationError } from "../validation";

/**
 * Commenti interni su un elemento (ADR-011). La visibilità segue quella
 * dell'elemento (RLS nel database); il testo lo modifica solo l'autore; la
 * cancellazione è logica.
 */
export const COMMENT_SUBJECTS = [
  "customers",
  "suppliers",
  "employees",
  "teams",
  "deadlines",
  "documents",
  "tasks",
] as const;
export type CommentSubject = (typeof COMMENT_SUBJECTS)[number];

export interface CommentRow {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  editedAt: Date | null;
  mine: boolean;
}

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isSubject = (v: string): v is CommentSubject =>
  (COMMENT_SUBJECTS as readonly string[]).includes(v);

export async function listComments(
  tx: UserTx,
  access: TenantAccess,
  subject: { table: string; id: string },
): Promise<CommentRow[]> {
  requirePermission(access, "comments.read");
  if (!isSubject(subject.table) || !isUuid(subject.id)) return [];
  const { rows } = await tx.query<CommentRow>(
    `select c.id, c.body, c.created_by as "authorId", coalesce(u.full_name, u.email) as "authorName",
            c.created_at as "createdAt", c.edited_at as "editedAt", c.created_by = auth.uid() as mine
       from public.comments c left join public.users u on u.id = c.created_by
      where c.tenant_id = $1 and c.subject_table = $2 and c.subject_id = $3 and c.deleted_at is null
      order by c.created_at, c.id
      limit 500`,
    [access.tenantId, subject.table, subject.id],
  );
  return rows;
}

const bodyInput = z.object({
  body: z.string().trim().min(1, "Scrivi il commento").max(4000, "Massimo 4000 caratteri"),
});

function mapError(error: unknown): never {
  if (pgCode(error) === "42501") {
    throw new AuthError("FORBIDDEN", "commento non consentito", { cause: error });
  }
  throw error;
}

export async function addComment(
  tx: UserTx,
  access: TenantAccess,
  subject: { table: string; id: string },
  input: { body: string },
): Promise<{ id: string }> {
  requirePermission(access, "comments.write");
  if (!isSubject(subject.table) || !isUuid(subject.id)) {
    throw new ValidationError({ form: "Elemento non valido" });
  }
  const d = parseInput(bodyInput, input);
  await tx.query("savepoint add_comment");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.comments (tenant_id, subject_table, subject_id, body)
       values ($1, $2, $3, $4) returning id`,
      [access.tenantId, subject.table, subject.id, d.body],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint add_comment");
    mapError(error);
  }
}

export async function editComment(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: { body: string },
): Promise<void> {
  requirePermission(access, "comments.write");
  const d = parseInput(bodyInput, input);
  if (!isUuid(id)) throw new ValidationError({ form: "Commento non trovato" });
  const { rowCount } = await tx.query(
    `update public.comments set body = $3
      where tenant_id = $1 and id = $2 and created_by = auth.uid() and deleted_at is null`,
    [access.tenantId, id, d.body],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Puoi modificare solo i tuoi commenti." });
}

/** L'autore elimina il proprio commento; con comments.delete (MFA) anche quelli altrui. */
export async function deleteComment(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "comments.read");
  if (!isUuid(id)) return;
  const moderator = hasPermission(access, "comments.delete");
  const { rowCount } = await tx.query(
    `update public.comments set deleted_at = now()
      where tenant_id = $1 and id = $2 and deleted_at is null
        and (created_by = auth.uid() or $3)`,
    [access.tenantId, id, moderator],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Puoi eliminare solo i tuoi commenti." });
}
