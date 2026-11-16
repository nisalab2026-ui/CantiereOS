import "server-only";
import pg from "pg";
import { env } from "./env";

const globalForPool = globalThis as unknown as { cantiereosPool?: pg.Pool };

/**
 * Pool PostgreSQL del server. Ogni transazione utente esegue
 * `set local role authenticated` (RLS attiva): vedi withUserTransaction.
 */
export function pool(): pg.Pool {
  globalForPool.cantiereosPool ??= new pg.Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return globalForPool.cantiereosPool;
}
