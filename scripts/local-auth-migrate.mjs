#!/usr/bin/env node
// Applica le migrazioni di CantiereOS al PostgreSQL dello stack Auth locale,
// dopo che Supabase Auth ha creato il proprio schema `auth`.
// SOLO SVILUPPO/TEST: si rifiuta di lavorare su host diversi da localhost.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pg = createRequire(path.join(root, "packages/db/package.json"))("pg");
const migrationsDir = path.join(root, "supabase/migrations");
const env = Object.fromEntries(
  readFileSync(path.join(root, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const url = new URL(env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  throw new Error("local-auth-migrate lavora solo su database locali");
}

const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  for (let i = 0; i < 60; i++) {
    const { rows } = await client.query(
      "select to_regclass('auth.sessions') is not null and to_regclass('auth.mfa_factors') is not null as ready",
    );
    if (rows[0].ready) break;
    if (i === 59) throw new Error("Supabase Auth non ha creato lo schema auth in tempo");
    await new Promise((r) => setTimeout(r, 1000));
  }
  const { rows } = await client.query("select to_regclass('public.tenants') is not null as done");
  if (rows[0].done) {
    console.log("Migrazioni già applicate.");
  } else {
    // Stesso comportamento di packages/db/src/migrations.ts: ordine per nome, una transazione ciascuna.
    for (const name of readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await client.query("begin");
      try {
        await client.query(readFileSync(path.join(migrationsDir, name), "utf8"));
        await client.query("commit");
        console.log(`  ✓ ${name}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migrazione fallita: ${name}`, { cause: error });
      }
    }
    console.log("Migrazioni applicate.");
  }
} finally {
  await client.end();
}
