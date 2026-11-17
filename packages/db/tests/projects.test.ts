import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, insertRow, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Commesse, cantieri e importi (ADR-014). */
let db: Db;
let s: Seed;
let otherCustomerA: string, otherSiteA: string;
const year = new Date().getFullYear();

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  otherCustomerA = await insertRow(db, "customers", {
    tenant_id: s.tenantA,
    display_name: "Altro cliente",
  });
  otherSiteA = await insertRow(db, "customer_sites", {
    tenant_id: s.tenantA,
    customer_id: otherCustomerA,
    name: "Sede altrui",
    address_line: "Via Altra 1",
    city: "Milano",
  });
});
afterAll(async () => {
  await db.end();
});

const newProject = (tenant: string, customer: string, extra = "") =>
  db.query<{ id: string; code: string; closed_at: string | null; created_by: string }>(
    `insert into public.projects (tenant_id, customer_id, name${extra ? ", status" : ""})
     values ($1, $2, 'Ristrutturazione${extra ? "', '" + extra : ""}')
     returning id, code, closed_at, created_by`,
    [tenant, customer],
  );

describe("Commesse", () => {
  it("codice automatico per anno, autore dal database, chiusura datata dal database", async () => {
    await asUser(db, s.users.martaManagerA, async () => {
      const a = (await newProject(s.tenantA, s.a.customer)).rows[0]!;
      const b = (await newProject(s.tenantA, s.a.customer)).rows[0]!;
      expect(a.code).toBe(`${year}-001`);
      expect(b.code).toBe(`${year}-002`);
      expect(a.created_by).toBe(s.users.martaManagerA);
      const { rows } = await db.query<{ closed_at: string | null }>(
        "update public.projects set status = 'completed' where id = $1 returning closed_at",
        [a.id],
      );
      expect(rows[0]!.closed_at).not.toBeNull();
      const reopened = await db.query<{ closed_at: string | null }>(
        "update public.projects set status = 'active' where id = $1 returning closed_at",
        [a.id],
      );
      expect(reopened.rows[0]!.closed_at).toBeNull();
      // codice duplicato nella stessa azienda (senza distinzione di maiuscole): no
      await expectPgError(
        db.query(
          "insert into public.projects (tenant_id, customer_id, name, code) values ($1, $2, 'X', $3)",
          [s.tenantA, s.a.customer, `${year}-001`],
        ),
        "23505",
      );
    });
  });

  it("il tecnico vede le commesse ma non le crea; il lettore nemmeno", async () => {
    const id = await insertRow(db, "projects", {
      tenant_id: s.tenantA,
      customer_id: s.a.customer,
      name: "Visibile",
      code: "VIS-1",
    });
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query("select id from public.projects where id = $1", [id]);
      expect(rows).toHaveLength(1);
      await expectPgError(newProject(s.tenantA, s.a.customer), "42501");
    });
  });

  it("importi solo con projects.finance: titolare e amministrazione sì, responsabile e tecnico no", async () => {
    const id = await insertRow(db, "projects", {
      tenant_id: s.tenantA,
      customer_id: s.a.customer,
      name: "Con importi",
      code: "FIN-1",
    });
    await insertRow(db, "project_financials", {
      tenant_id: s.tenantA,
      project_id: id,
      contract_amount_cents: 12_000_000,
      budget_cost_cents: 9_000_000,
    });
    for (const [user, visible] of [
      [s.users.aliceOwnerA, 1],
      [s.users.carolOfficeA, 1],
      [s.users.martaManagerA, 0],
      [s.users.bobTechA, 0],
      [s.users.victorViewerA, 0],
    ] as const) {
      await asUser(db, user, async () => {
        const { rows } = await db.query(
          "select contract_amount_cents from public.project_financials where project_id = $1",
          [id],
        );
        expect(rows).toHaveLength(visible);
      });
    }
    await asUser(db, s.users.martaManagerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.project_financials (tenant_id, project_id, contract_amount_cents) values ($1, $2, 1)",
          [s.tenantA, id],
        ),
        "42501",
      );
    });
  });
});

describe("Cantieri", () => {
  it("sede del cliente della commessa sì, sede di un altro cliente no; serve un indirizzo", async () => {
    await asUser(db, s.users.martaManagerA, async () => {
      const p = (await newProject(s.tenantA, s.a.customer)).rows[0]!;
      const ok = await db.query<{ id: string }>(
        `insert into public.project_sites (tenant_id, project_id, name, customer_site_id)
         values ($1, $2, 'Cantiere sede', $3) returning id`,
        [s.tenantA, p.id, s.a.site],
      );
      expect(ok.rows).toHaveLength(1);
      await db.query("savepoint a");
      await expectPgError(
        db.query(
          `insert into public.project_sites (tenant_id, project_id, name, customer_site_id)
           values ($1, $2, 'Sbagliato', $3)`,
          [s.tenantA, p.id, otherSiteA],
        ),
        "23514",
      );
      await db.query("rollback to savepoint a");
      await expectPgError(
        db.query(
          "insert into public.project_sites (tenant_id, project_id, name) values ($1, $2, 'Senza indirizzo')",
          [s.tenantA, p.id],
        ),
        "23514",
      );
      await db.query("rollback to savepoint a");
      await db.query(
        `insert into public.project_sites (tenant_id, project_id, name, address_line, city, province)
         values ($1, $2, 'Indirizzo proprio', 'Via Nuova 5', 'Bergamo', 'BG')`,
        [s.tenantA, p.id],
      );
      // il cliente non cambia finché ci sono cantieri sulle sue sedi
      await expectPgError(
        db.query("update public.projects set customer_id = $2 where id = $1", [
          p.id,
          otherCustomerA,
        ]),
        "23514",
      );
      await db.query("rollback to savepoint a");
      const other = (await newProject(s.tenantA, s.a.customer)).rows[0]!;
      await expectPgError(
        db.query("update public.project_sites set project_id = $2 where id = $1", [
          ok.rows[0]!.id,
          other.id,
        ]),
        "42501",
      );
    });
  });
});

describe("Isolamento tra aziende", () => {
  it("B non vede le commesse di A e non le collega ai propri dati", async () => {
    const id = await insertRow(db, "projects", {
      tenant_id: s.tenantA,
      customer_id: s.a.customer,
      name: "Di A",
      code: "ISO-1",
    });
    await asUser(db, s.users.daveOwnerB, async () => {
      for (const t of ["projects", "project_sites", "project_financials"]) {
        const { rows } = await db.query(`select id from public.${t} where tenant_id = $1`, [
          s.tenantA,
        ]);
        expect(rows, t).toHaveLength(0);
      }
      await db.query("savepoint a");
      await expectPgError(newProject(s.tenantA, s.a.customer), "42501");
      await db.query("rollback to savepoint a");
      // proprio tenant con il cliente di A: la FK composta lo impedisce
      await expectPgError(newProject(s.tenantB, s.a.customer), "23503");
      await db.query("rollback to savepoint a");
      await expectPgError(
        db.query(
          "insert into public.tasks (tenant_id, title, project_id) values ($1, 'Collegata', $2)",
          [s.tenantB, id],
        ),
        "23503",
      );
    });
  });

  it("la cronologia della commessa mostra i cantieri e gli importi solo a chi può vederli", async () => {
    const id = await insertRow(db, "projects", {
      tenant_id: s.tenantA,
      customer_id: s.a.customer,
      name: "Con storia",
      code: "HIS-1",
    });
    await insertRow(db, "project_sites", {
      tenant_id: s.tenantA,
      project_id: id,
      name: "Cantiere storia",
      address_line: "Via Storia 1",
      city: "Como",
    });
    await insertRow(db, "project_financials", {
      tenant_id: s.tenantA,
      project_id: id,
      contract_amount_cents: 100,
    });
    const tables = async (user: string) =>
      asUser(db, user, async () => {
        const { rows } = await db.query<{ table_name: string }>(
          "select table_name from app.record_history('projects', $1)",
          [id],
        );
        return new Set(rows.map((r) => r.table_name));
      });
    const owner = await tables(s.users.aliceOwnerA);
    expect([...owner].sort()).toEqual(["project_financials", "project_sites", "projects"]);
    const manager = await tables(s.users.martaManagerA);
    expect(manager.has("project_financials")).toBe(false);
    expect(manager.has("project_sites")).toBe(true);
    expect((await tables(s.users.daveOwnerB)).size).toBe(0);
  });
});
