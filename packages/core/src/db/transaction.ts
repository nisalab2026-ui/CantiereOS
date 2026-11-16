import { randomUUID } from "node:crypto";
import type pg from "pg";
import { AuthError } from "../auth/errors";
import { sessionClaims, type VerifiedSession } from "../auth/session";

/** Interfaccia minima per eseguire query dentro una transazione. */
export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
  readonly requestId: string;
}

export interface UserTx extends Tx {
  readonly session: VerifiedSession;
}

export interface ServiceTx extends Tx {
  readonly actorUserId: string | null;
}

export interface TransactionOptions {
  /** Id di correlazione registrato nell'audit (`audit_log.request_id`). */
  requestId?: string;
}

async function runInTransaction<T>(
  pool: pg.Pool,
  setup: (client: pg.PoolClient) => Promise<void>,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    try {
      await setup(client);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Esegue fn come l'utente della sessione verificata, con RLS attiva:
 * `set local role authenticated` + claim JWT. Prima di tutto verifica nel
 * database che la sessione non sia stata revocata (logout, "esci ovunque").
 */
export async function withUserTransaction<T>(
  pool: pg.Pool,
  session: VerifiedSession,
  fn: (tx: UserTx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const requestId = options.requestId ?? randomUUID();
  return runInTransaction(
    pool,
    async (client) => {
      await client.query("set local role authenticated");
      await client.query(
        `select set_config('request.jwt.claims', $1, true),
                set_config('app.request_id', $2, true)`,
        [sessionClaims(session), requestId],
      );
      const { rows } = await client.query<{ active: boolean }>(
        "select app.current_session_active() as active",
      );
      if (!rows[0]?.active) {
        throw new AuthError("SESSION_REVOKED", "sessione revocata o scaduta");
      }
    },
    (client) => fn({ query: (text, values) => client.query(text, values), requestId, session }),
  );
}

/**
 * Esegue fn con `service_role` (bypassa RLS). Solo per operazioni di
 * piattaforma esplicite (registrazione azienda, worker). L'attore viene
 * dichiarato per l'audit. Il codice deve filtrare SEMPRE per tenant_id esplicito.
 */
export async function withServiceTransaction<T>(
  pool: pg.Pool,
  actorUserId: string | null,
  fn: (tx: ServiceTx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const requestId = options.requestId ?? randomUUID();
  return runInTransaction(
    pool,
    async (client) => {
      await client.query("set local role service_role");
      await client.query(
        `select set_config('request.jwt.claims', '', true),
                set_config('app.actor_user_id', $1, true),
                set_config('app.request_id', $2, true)`,
        [actorUserId ?? "", requestId],
      );
    },
    (client) => fn({ query: (text, values) => client.query(text, values), requestId, actorUserId }),
  );
}
