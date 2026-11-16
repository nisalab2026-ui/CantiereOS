import { createEphemeralDatabase } from "@cantiereos/db";
import type { TestProject } from "vitest/node";

/** Database effimero con shim Supabase (solo test) e migrazioni, senza seed demo. */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("TEST_DATABASE_URL non impostata (vedi packages/db/README.md).");
  }
  const db = await createEphemeralDatabase(adminUrl);
  project.provide("databaseUrl", db.url);
  return db.drop;
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
