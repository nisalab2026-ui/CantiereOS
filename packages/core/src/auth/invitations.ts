import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requirePermission, type TenantAccess } from "./access";
import { AuthError, pgCode } from "./errors";
import type { UserTx } from "../db/transaction";

export const INVITATION_TTL_DAYS = 7;

/** Token d'invito: 256 bit casuali. Nel database si salva solo l'hash SHA-256. */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const createInvitationInput = z.object({
  email: z
    .email()
    .max(320)
    .transform((e) => e.trim().toLowerCase()),
  roleKey: z.string().min(1).max(64),
  customerId: z.uuid().nullable().optional(),
  ttlDays: z.number().int().min(1).max(30).optional(),
});

export type CreateInvitationInput = z.input<typeof createInvitationInput>;

export interface CreatedInvitation {
  invitationId: string;
  email: string;
  /** Da inviare all'invitato UNA volta (link d'invito). Non viene salvato. */
  token: string;
  expiresAt: Date;
}

/**
 * Crea un invito nell'azienda attiva. Il tenant è quello dell'accesso
 * verificato; il ruolo deve essere di sistema o dell'azienda stessa. Le regole
 * (members.manage, solo un titolare invita un titolare, cliente esterno con
 * cliente obbligatorio) sono applicate anche dal database.
 */
export async function createInvitation(
  tx: UserTx,
  access: TenantAccess,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  requirePermission(access, "members.manage");
  const parsed = createInvitationInput.safeParse(input);
  if (!parsed.success) throw new AuthError("INVALID_INPUT", "dati dell'invito non validi");
  const { email, roleKey, customerId, ttlDays } = parsed.data;

  const role = await tx.query<{ id: string }>(
    `select id from public.roles
      where key = $1 and (tenant_id is null or tenant_id = $2)
      order by tenant_id nulls first limit 1`,
    [roleKey, access.tenantId],
  );
  if (!role.rows[0]) throw new AuthError("INVALID_INPUT", "ruolo inesistente");

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + (ttlDays ?? INVITATION_TTL_DAYS) * 86_400_000);
  await tx.query("savepoint create_invitation");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.invitations (tenant_id, email, role_id, customer_id, token_hash, expires_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [access.tenantId, email, role.rows[0].id, customerId ?? null, tokenHash, expiresAt],
    );
    return { invitationId: rows[0]!.id, email, token, expiresAt };
  } catch (error) {
    await tx.query("rollback to savepoint create_invitation");
    switch (pgCode(error)) {
      case "42501":
        throw new AuthError("FORBIDDEN", "non autorizzato a creare questo invito", {
          cause: error,
        });
      case "23505":
        throw new AuthError("ALREADY_MEMBER", "esiste già un invito in attesa per questa email", {
          cause: error,
        });
      case "23503":
      case "23514":
        throw new AuthError("INVALID_INPUT", "ruolo o cliente non validi per l'invito", {
          cause: error,
        });
      default:
        throw error;
    }
  }
}

/** Revoca un invito in attesa dell'azienda attiva. */
export async function revokeInvitation(
  tx: UserTx,
  access: TenantAccess,
  invitationId: string,
): Promise<void> {
  requirePermission(access, "members.manage");
  if (!z.uuid().safeParse(invitationId).success) {
    throw new AuthError("INVALID_INVITATION", "invito non valido");
  }
  const { rowCount } = await tx.query(
    `update public.invitations set revoked_at = now()
      where id = $1 and tenant_id = $2 and accepted_at is null and revoked_at is null`,
    [invitationId, access.tenantId],
  );
  if (!rowCount) throw new AuthError("INVALID_INVITATION", "invito non trovato o già chiuso");
}

/**
 * Accetta un invito con il token ricevuto via email. Tutte le verifiche
 * (token, scadenza, email verificata coincidente, posti) sono nel database.
 * Restituisce l'azienda, che diventa quella attiva.
 */
export async function acceptInvitation(tx: UserTx, token: string): Promise<string> {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    throw new AuthError("INVALID_INVITATION", "invito non valido o scaduto");
  }
  await tx.query("savepoint accept_invitation");
  try {
    const { rows } = await tx.query<{ tenant_id: string }>(
      "select app.accept_invitation($1) as tenant_id",
      [token],
    );
    return rows[0]!.tenant_id;
  } catch (error) {
    await tx.query("rollback to savepoint accept_invitation");
    const map: Record<string, ConstructorParameters<typeof AuthError>[0]> = {
      P0002: "INVALID_INVITATION",
      "42501": "INVITATION_EMAIL_MISMATCH",
      "23505": "ALREADY_MEMBER",
      "53400": "SEAT_LIMIT_REACHED",
      "28000": "UNAUTHENTICATED",
    };
    const code = map[pgCode(error) ?? ""];
    if (code) throw new AuthError(code, code, { cause: error });
    throw error;
  }
}
