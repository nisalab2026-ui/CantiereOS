import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { applyMigrations, loadMigrations, SEED_FILE } from "../../src/migrations.js";

/**
 * Crea un database PostgreSQL effimero, applica lo shim Supabase (solo test),
 * tutte le migrazioni e il seed di sviluppo, poi lo elimina a fine run.
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

  const dbName = `cantiereos_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${dbName}`;

  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  try {
    const shim = await readFile(path.join(import.meta.dirname, "../supabase-shim.sql"), "utf8");
    await client.query(shim);
    await applyMigrations(client, await loadMigrations());
    // Il seed di sviluppo viene applicato DUE volte: verifica che sia idempotente.
    const seed = await readFile(SEED_FILE, "utf8");
    await client.query(seed);
    await client.query(seed);
  } finally {
    await client.end();
  }

  project.provide("databaseUrl", testUrl.toString());

  return async () => {
    // Elimina SOLO il database effimero creato da questo run.
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
