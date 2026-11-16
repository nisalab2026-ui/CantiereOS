import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, SEED_FILE } from "../src/migrations.js";
import {
  asUser,
  connect,
  createTenant,
  createUser,
  expectPgError,
  tx,
  type Db,
} from "./helpers/db.js";

/**
 * Il seed di sviluppo è stato applicato due volte dal global setup.
 * Questi test verificano che sia separato dai dati reali e isolato.
 */
let db: Db;

const DEMO = {
  alfa: "d1000000-0000-4000-8000-000000000001",
  beta: "d1000000-0000-4000-8000-000000000002",
  tecnicoAlfa: "d0000000-0000-4000-8000-000000000003",
  titolareBeta: "d0000000-0000-4000-8000-000000000004",
};

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

describe("Seed di sviluppo", () => {
  it("crea solo aziende marcate come demo", async () => {
    const { rows } = await db.query<{ id: string; is_demo: boolean; name: string }>(
      "select id, is_demo, name from public.tenants where id = any ($1) order by id",
      [[DEMO.alfa, DEMO.beta]],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.is_demo).toBe(true);
      expect(r.name.startsWith("DEMO ")).toBe(true);
    }
  });

  it("è idempotente (applicato due volte, nessun duplicato)", async () => {
    const counts = await db.query<Record<string, string>>(
      `select
         (select count(*) from public.customers where tenant_id = any ($1)) as customers,
         (select count(*) from public.suppliers where tenant_id = any ($1)) as suppliers,
         (select count(*) from public.contacts where tenant_id = any ($1)) as contacts,
         (select count(*) from public.customer_sites where tenant_id = any ($1)) as sites,
         (select count(*) from public.employees where tenant_id = any ($1)) as employees,
         (select count(*) from public.teams where tenant_id = any ($1)) as teams,
         (select count(*) from public.team_members where tenant_id = any ($1)) as team_members,
         (select count(*) from public.memberships where tenant_id = any ($1)) as memberships`,
      [[DEMO.alfa, DEMO.beta]],
    );
    expect(counts.rows[0]).toEqual({
      customers: "4",
      suppliers: "3",
      contacts: "3",
      sites: "3",
      employees: "4",
      teams: "2",
      team_members: "4",
      memberships: "5",
    });
  });

  it("usa solo email su dominio riservato .invalid", async () => {
    const { rows } = await db.query<{ email: string }>(
      "select email from public.users where id::text like 'd0000000-%'",
    );
    expect(rows.length).toBe(5);
    for (const r of rows) expect(r.email.endsWith(".invalid")).toBe(true);
  });

  it("rispetta l'isolamento: il tecnico demo di Alfa non vede i dati di Beta", async () => {
    await asUser(db, DEMO.tecnicoAlfa, async () => {
      const { rows } = await db.query<{ tenant_id: string }>(
        "select distinct tenant_id from public.customers",
      );
      expect(rows.map((r) => r.tenant_id)).toEqual([DEMO.alfa]);
    });
    await asUser(db, DEMO.titolareBeta, async () => {
      const { rowCount } = await db.query("select 1 from public.employees where tenant_id = $1", [
        DEMO.alfa,
      ]);
      expect(rowCount).toBe(0);
    });
  });

  it("si rifiuta di girare se esistono aziende reali", async () => {
    const owner = await createUser(db, "real-owner");
    await createTenant(db, "Azienda reale di test", owner);
    const seed = await readFile(SEED_FILE, "utf8");
    await tx(db, async () => {
      await expectPgError(db.query(seed), "P0001");
    });
  });

  it("nessuna migrazione contiene dati demo", async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
    for (const f of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, f), "utf8");
      expect(sql, f).not.toMatch(/demo\.cantiereos\.invalid|'d[0-9]000000-0000-4000/);
      expect(sql, f).not.toMatch(/is_demo\)\s*values[^;]*true/i);
    }
  });
});
