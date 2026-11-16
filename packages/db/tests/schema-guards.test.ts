import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "./helpers/db.js";

/**
 * Guardie sullo schema: valgono per OGNI migrazione futura.
 * Una nuova tabella che dimentica RLS, tenant_id, FK composte, trigger o
 * audit fa fallire la CI.
 */
let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

/** Tabelle globali senza tenant_id. */
const GLOBAL_TABLES = new Set(["tenants", "users", "permissions"]);
/** tenant_id nullable: righe globali ammesse (eventi piattaforma, ruoli di sistema). */
const TENANT_NULLABLE = new Set(["audit_log", "roles", "role_permissions"]);
/** Tabelle che non subiscono il trigger di audit / immutabilità. */
const NO_AUDIT = new Set(["audit_log"]);
/** FK verso tabelle con tenant_id che legittimamente non includono tenant_id. */
const FK_EXCEPTIONS = new Set([
  "role_permissions_role_fk", // affiancata da role_permissions_tenant_role_fk
  "memberships_role_id_fkey", // ruoli di sistema condivisi; verificata da trigger
]);

async function publicTables(): Promise<{ name: string; rls: boolean }[]> {
  const { rows } = await db.query<{ name: string; rls: boolean }>(
    `select c.relname as name, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 1`,
  );
  return rows;
}

async function tenantTables(): Promise<string[]> {
  return (await publicTables()).map((t) => t.name).filter((n) => !GLOBAL_TABLES.has(n));
}

async function hasTrigger(table: string, fn: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = $1::regclass and p.proname = $2`,
    [`public.${table}`, fn],
  );
  return (rowCount ?? 0) > 0;
}

describe("Guardie sullo schema", () => {
  it("ogni tabella in public ha RLS attiva e almeno una policy", async () => {
    const tables = await publicTables();
    expect(tables.length).toBeGreaterThanOrEqual(16);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
    const { rows } = await db.query<{ name: string }>(
      `select c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("ogni chiave primaria è un UUID (tranne audit_log)", async () => {
    const { rows } = await db.query<{ table_name: string; data_type: string }>(
      `select tc.table_name, c.data_type
         from information_schema.table_constraints tc
         join information_schema.key_column_usage k
           on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
         join information_schema.columns c
           on c.table_schema = k.table_schema and c.table_name = k.table_name and c.column_name = k.column_name
        where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
          and tc.table_name <> 'audit_log'`,
    );
    expect(rows.filter((r) => r.data_type !== "uuid")).toEqual([]);
  });

  it("ogni tabella aziendale ha tenant_id (NOT NULL) con FK a tenants", async () => {
    for (const table of await tenantTables()) {
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
          where conrelid = $1::regclass and contype = 'f' and confrelid = 'public.tenants'::regclass`,
        [`public.${table}`],
      );
      expect(fk.rowCount, `${table}: manca FK verso tenants`).toBeGreaterThan(0);
    }
  });

  it("ogni FK tra tabelle aziendali include tenant_id (FK composta)", async () => {
    const { rows } = await db.query<{ conname: string; src: string; dst: string }>(
      `select con.conname, src.relname as src, dst.relname as dst
         from pg_constraint con
         join pg_class src on src.oid = con.conrelid
         join pg_class dst on dst.oid = con.confrelid
         join pg_namespace n on n.oid = src.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
          and dst.relname <> 'tenants'
          and exists (select 1 from pg_attribute a where a.attrelid = con.conrelid and a.attname = 'tenant_id')
          and exists (select 1 from pg_attribute a where a.attrelid = con.confrelid and a.attname = 'tenant_id')
          and not exists (
            select 1 from pg_attribute a
             where a.attrelid = con.conrelid and a.attname = 'tenant_id' and a.attnum = any (con.conkey)
          )`,
    );
    expect(rows.filter((r) => !FK_EXCEPTIONS.has(r.conname))).toEqual([]);
  });

  it("ogni tabella aziendale ha i trigger di immutabilità e audit", async () => {
    for (const table of await tenantTables()) {
      if (NO_AUDIT.has(table)) continue;
      expect(await hasTrigger(table, "prevent_tenant_change"), `${table}: immutabilità`).toBe(true);
      expect(await hasTrigger(table, "audit_row_change"), `${table}: audit`).toBe(true);
    }
  });

  it("le tabelle con created_by lo impostano da trigger", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'created_by'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(await hasTrigger(r.table_name, "set_created_by"), r.table_name).toBe(true);
    }
  });

  it("anon non ha privilegi su nessuna tabella in public", async () => {
    const { rows } = await db.query(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });

  it("authenticated non può scrivere tenant_id, created_by, created_at in update", async () => {
    const { rows } = await db.query(
      `select table_name, column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
          and column_name in ('id', 'tenant_id', 'created_by', 'created_at', 'updated_at')`,
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

  it("gli helper di migrazione non sono eseguibili dagli utenti", async () => {
    for (const fn of [
      "app.grant_tenant_table(regclass)",
      "app.create_tenant_policies(regclass,text,text,text)",
    ]) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege('authenticated', $1, 'execute') as ok",
        [fn],
      );
      expect(rows[0]!.ok, fn).toBe(false);
    }
  });
});
