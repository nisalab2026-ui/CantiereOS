import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { applyMigrations, loadMigrations, SEED_FILE } from "./migrations.js";

/** Shim Supabase SOLO PER TEST (ruoli, schema auth, auth.uid()). */
export const SUPABASE_SHIM_FILE = path.resolve(import.meta.dirname, "../tests/supabase-shim.sql");

export interface EphemeralDatabase {
  url: string;
  drop: () => Promise<void>;
}

/**
 * Crea un database PostgreSQL effimero `cantiereos_test_*`, applica lo shim
 * Supabase (solo test), tutte le migrazioni e, se richiesto, il seed di sviluppo
 * (due volte, per verificarne l'idempotenza). `drop()` elimina SOLO quel database.
 *
 * adminUrl deve puntare a un server PostgreSQL di sviluppo/CI. Mai produzione.
 */
export async function createEphemeralDatabase(
  adminUrl: string,
  options: { seed?: boolean } = {},
): Promise<EphemeralDatabase> {
  const dbName = `cantiereos_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(await readFile(SUPABASE_SHIM_FILE, "utf8"));
    await applyMigrations(client, await loadMigrations());
    if (options.seed) {
      const seed = await readFile(SEED_FILE, "utf8");
      await client.query(seed);
      await client.query(seed);
    }
  } finally {
    await client.end();
  }

  return {
    url: url.toString(),
    drop: async () => {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    },
  };
}
