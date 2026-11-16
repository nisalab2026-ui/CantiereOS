import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "./helpers/db.js";

/**
 * Guardie sullo schema: valgono per OGNI migrazione futura.
 * Una nuova tabella che dimentica RLS, tenant_id o i trigger fa fallire la CI.
 */
let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

const TENANT_EXEMPT = new Set(["tenants", "profiles", "permissions", "role_permissions"]);
// audit_log ha tenant_id nullable (eventi di piattaforma) ed è append-only.
const TENANT_NULLABLE = new Set(["audit_log"]);
const IMMUTABILITY_EXEMPT = new Set(["audit_log"]);

async function publicTables(): Promise<{ name: string; rls: boolean }[]> {
  const { rows } = await db.query<{ name: string; rls: boolean }>(
    `select c.relname as name, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 1`,
  );
  return rows;
}

describe("Guardie sullo schema", () => {
  it("ogni tabella in public ha RLS attiva", async () => {
    const tables = await publicTables();
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
  });

  it("ogni tabella in public ha almeno una policy", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("ogni tabella di dominio ha tenant_id NOT NULL con FK a tenants", async () => {
    const tables = (await publicTables()).map((t) => t.name).filter((n) => !TENANT_EXEMPT.has(n));
    for (const table of tables) {
      const col = await db.query<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = $1 and column_name = 'tenant_id'`,
        [table],
      );
      expect(col.rowCount, `${table}: manca tenant_id`).toBe(1);
      if (!TENANT_NULLABLE.has(table)) {
        expect(col.rows[0]!.is_nullable, `${table}: tenant_id nullable`).toBe("NO");
      }
      const fk = await db.query(
        `select 1 from pg_constraint
          where conrelid = $1::regclass and contype = 'f'
            and confrelid = 'public.tenants'::regclass`,
        [`public.${table}`],
      );
      expect(fk.rowCount, `${table}: manca FK verso tenants`).toBeGreaterThan(0);
    }
  });

  it("ogni tabella di dominio rende tenant_id immutabile", async () => {
    const tables = (await publicTables())
      .map((t) => t.name)
      .filter((n) => !TENANT_EXEMPT.has(n) && !IMMUTABILITY_EXEMPT.has(n));
    for (const table of tables) {
      const { rowCount } = await db.query(
        `select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = $1::regclass and p.proname = 'prevent_tenant_change'`,
        [`public.${table}`],
      );
      expect(rowCount, `${table}: manca trigger prevent_tenant_change`).toBe(1);
    }
  });

  it("anon non ha privilegi su nessuna tabella in public", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });

  it("ogni funzione SECURITY DEFINER ha search_path fissato", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef and n.nspname in ('public', 'app')
          and not exists (
            select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
          )`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("nessuna funzione dello schema app è eseguibile da PUBLIC o anon", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app'
          and (has_function_privilege('anon', p.oid, 'execute')
               or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                          where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});
