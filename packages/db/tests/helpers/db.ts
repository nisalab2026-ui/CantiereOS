import pg from "pg";
import { expect, inject } from "vitest";

export type Db = pg.Client;

export async function connect(): Promise<Db> {
  const client = new pg.Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  return client;
}

/** Suffisso casuale per slug/email: ogni file di test ha dati propri. */
export function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Esegue fn in una transazione che viene SEMPRE annullata (rollback):
 * i test non lasciano tracce e non si influenzano a vicenda.
 */
export async function tx<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/**
 * Impersona un utente come farebbe Supabase/PostgREST: ruolo `authenticated`
 * e claim JWT `sub`. Con userId null impersona `anon`.
 * Va chiamata dentro tx(): `set local` vale fino a fine transazione.
 */
export async function become(db: Db, userId: string | null): Promise<void> {
  const role = userId ? "authenticated" : "anon";
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
}

/** Torna superuser all'interno della transazione corrente (solo per verifiche). */
export async function becomeSuperuser(db: Db): Promise<void> {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
}

export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  return tx(db, async () => {
    await become(db, userId);
    return fn();
  });
}

export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

// --- Seed (eseguito come superuser, committato, solo nel DB effimero) ---------

export async function createUser(db: Db, label: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${uniq(label)}@test.invalid`],
  );
  return rows[0]!.id;
}

/** Crea un'azienda come farebbe il server: ruolo service_role + app.create_tenant. */
export async function createTenant(db: Db, name: string, ownerId: string): Promise<string> {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    const { rows } = await db.query<{ id: string }>("select app.create_tenant($1, $2, $3) as id", [
      name,
      uniq("t"),
      ownerId,
    ]);
    await db.query("commit");
    return rows[0]!.id;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function addMember(
  db: Db,
  tenantId: string,
  userId: string,
  role: string,
  status = "active",
): Promise<void> {
  await db.query(
    "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, $3, $4)",
    [tenantId, userId, role, status],
  );
}

export async function createPartner(db: Db, tenantId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.business_partners (tenant_id, display_name) values ($1, $2) returning id",
    [tenantId, name],
  );
  return rows[0]!.id;
}
