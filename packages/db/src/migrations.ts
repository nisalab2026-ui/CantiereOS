import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../supabase/migrations");

/** Seed di sviluppo: dati dimostrativi, MAI applicati in produzione. */
export const SEED_FILE = path.resolve(
  import.meta.dirname,
  "../../../supabase/seeds/development.sql",
);

const MIGRATION_FILE = /^\d{14}_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  name: string;
  sql: string;
}

/** Legge le migrazioni versionate in ordine lessicografico (= cronologico). */
export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const invalid = entries.filter((f) => !MIGRATION_FILE.test(f));
  if (invalid.length > 0) {
    throw new Error(`Nome migrazione non valido: ${invalid.join(", ")}`);
  }
  return Promise.all(
    entries.map(async (name) => ({
      name,
      sql: await readFile(path.join(dir, name), "utf8"),
    })),
  );
}

/** Applica ogni migrazione in una transazione separata (come Supabase CLI). */
export async function applyMigrations(client: Client, migrations: MigrationFile[]): Promise<void> {
  for (const migration of migrations) {
    try {
      await client.query("begin");
      await client.query(migration.sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migrazione fallita: ${migration.name}`, { cause: error });
    }
  }
}
