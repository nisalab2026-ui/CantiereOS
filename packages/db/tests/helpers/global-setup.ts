import type { TestProject } from "vitest/node";
import { createEphemeralDatabase } from "../../src/ephemeral.js";

/**
 * Crea un database PostgreSQL effimero con shim Supabase (solo test), tutte le
 * migrazioni e il seed di sviluppo (applicato due volte: deve essere idempotente).
 * Lo elimina a fine run.
 *
 * TEST_DATABASE_URL deve puntare a un server PostgreSQL di sviluppo/CI con un
 * utente che possa creare database e ruoli. Mai un database di produzione.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      "TEST_DATABASE_URL non impostata. Vedi packages/db/README.md per avviare un PostgreSQL locale.",
    );
  }
  const db = await createEphemeralDatabase(adminUrl, { seed: true });
  project.provide("databaseUrl", db.url);
  return db.drop;
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
