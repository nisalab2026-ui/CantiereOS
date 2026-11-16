import pg from "pg";
import { inject } from "vitest";
import type { VerifiedSession } from "../../src/index";

/** Pool connesso come superuser del DB effimero (come il server con l'utente `postgres`). */
export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: inject("databaseUrl"), max: 4 });
}

export function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createUser(
  pool: pg.Pool,
  label: string,
  options: { confirmed?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const email = `${uniq(label)}@test.invalid`;
  const { rows } = await pool.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id",
    [email, options.confirmed === false ? null : new Date()],
  );
  return { id: rows[0]!.id, email };
}

/** Crea una sessione in auth.sessions e la sessione "verificata" corrispondente. */
export async function createSession(
  pool: pg.Pool,
  user: { id: string; email: string },
  aal: "aal1" | "aal2" = "aal2",
): Promise<VerifiedSession> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into auth.sessions (user_id, aal) values ($1, $2) returning id",
    [user.id, aal],
  );
  return {
    userId: user.id,
    sessionId: rows[0]!.id,
    aal,
    email: user.email,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

export async function createTenant(pool: pg.Pool, name: string, ownerId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "select app.create_tenant($1, $2, $3, 'test', 50, now() + interval '30 days') as id",
    [name, uniq("t"), ownerId],
  );
  return rows[0]!.id;
}

export async function addMember(
  pool: pg.Pool,
  tenantId: string,
  userId: string,
  roleKey: string,
  status: "active" | "suspended" = "active",
): Promise<void> {
  await pool.query(
    `insert into public.memberships (tenant_id, user_id, role_id, status)
     select $1, $2, r.id, $4 from public.roles r where r.tenant_id is null and r.key = $3`,
    [tenantId, userId, roleKey, status],
  );
}
