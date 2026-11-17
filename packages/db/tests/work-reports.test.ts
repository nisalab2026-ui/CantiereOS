import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  become,
  connect,
  createUser,
  expectPgError as rawExpect,
  insertRow,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Rapportini, righe, costi riservati e passaggi di stato (ADR-015). */
let db: Db;
let s: Seed;
let projectA: string, siteA: string, otherProjectA: string, otherSiteA: string, closedA: string;
let projectB: string;
const year = new Date().getFullYear();
const SIG = "data:image/png;base64,iVBORw0KGgo=";

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  const project = (tenant: string, customer: string, code: string, status = "active") =>
    insertRow(db, "projects", {
      tenant_id: tenant,
      customer_id: customer,
      name: code,
      code,
      status,
    });
  projectA = await project(s.tenantA, s.a.customer, "WR-A");
  otherProjectA = await project(s.tenantA, s.a.customer, "WR-A2");
  closedA = await project(s.tenantA, s.a.customer, "WR-CLOSED", "completed");
  projectB = await project(s.tenantB, s.b.customer, "WR-B");
  const site = (p: string, name: string) =>
    insertRow(db, "project_sites", {
      tenant_id: s.tenantA,
      project_id: p,
      name,
      address_line: "Via Roma 1",
      city: "Milano",
    });
  siteA = await site(projectA, "Scala A");
  otherSiteA = await site(otherProjectA, "Altro");
});
afterAll(async () => {
  await db.end();
});

/** Errore atteso senza interrompere la transazione del test (savepoint). */
async function fails(run: () => Promise<unknown>, code: string): Promise<void> {
  await db.query("savepoint expected_error");
  try {
    await rawExpect(run(), code);
  } finally {
    await db.query("rollback to savepoint expected_error");
  }
}

/** Come asUser ma con commit: i dati restano per i test successivi. */
async function commitAs<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await become(db, user);
    const r = await fn();
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

const newReport = (tenant: string, project: string, site: string | null = null) =>
  db.query<{ id: string; number: string; status: string; created_by: string }>(
    `insert into public.work_reports (tenant_id, project_id, project_site_id, report_date)
     values ($1, $2, $3, current_date) returning id, number, status, created_by`,
    [tenant, project, site],
  );

describe("Rapportini", () => {
  let reportId: string;

  it("il tecnico crea il proprio rapportino: numero e stato dal database, ore calcolate", async () => {
    await commitAs(s.users.bobTechA, async () => {
      const r = (await newReport(s.tenantA, projectA, siteA)).rows[0]!;
      expect(r.number).toBe(`${year}-0001`);
      expect(r.status).toBe("draft");
      expect(r.created_by).toBe(s.users.bobTechA);
      reportId = r.id;
      expect((await newReport(s.tenantA, projectA)).rows[0]!.number).toBe(`${year}-0002`);
      const { rows } = await db.query<{ hours: string }>(
        `insert into public.work_report_labor (tenant_id, report_id, employee_id, start_time, end_time, break_minutes, hours)
         values ($1, $2, $3, '07:30', '16:30', 60, 1) returning hours`,
        [s.tenantA, reportId, s.a.employee],
      );
      expect(rows[0]!.hours).toBe("8.00");
      await fails(
        () =>
          db.query(
            `insert into public.work_report_labor (tenant_id, report_id, employee_id, start_time, end_time, hours)
           values ($1, $2, $3, '16:00', '08:00', 1)`,
            [s.tenantA, reportId, s.a.employee],
          ),
        "23514",
      );
      await db.query(
        `insert into public.work_report_items (tenant_id, report_id, kind, description, quantity, unit)
         values ($1, $2, 'material', 'Cemento', 10, 'sacchi')`,
        [s.tenantA, reportId],
      );
      // firma: data e ora le scrive il database
      const sig = await db.query<{ customer_signed_at: string | null }>(
        `update public.work_reports set customer_signature = $2, customer_signer_name = 'Rossi'
          where id = $1 returning customer_signed_at`,
        [reportId, SIG],
      );
      expect(sig.rows[0]!.customer_signed_at).not.toBeNull();
    });
  });

  it("commessa chiusa, cantiere di un'altra commessa e commessa di un'altra azienda: rifiutati", async () => {
    await commitAs(s.users.bobTechA, async () => {
      await fails(() => newReport(s.tenantA, closedA), "23514");
      await fails(() => newReport(s.tenantA, projectA, otherSiteA), "23514");
      await fails(() => newReport(s.tenantA, projectB), "23503");
    });
    await commitAs(s.users.tomTechB, async () => {
      const { rows } = await db.query("select id from public.work_reports where id = $1", [
        reportId,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it("un altro tecnico non modifica il rapportino di Bob; il capocantiere sì", async () => {
    // eveMulti in A è capocantiere (approva): può modificare
    await commitAs(s.users.eveMulti, async () => {
      await db.query("update public.work_reports set notes = 'controllato' where id = $1", [
        reportId,
      ]);
    });
    // carol (ufficio) vede ma non compila: nessuna modifica passa
    await commitAs(s.users.carolOfficeA, async () => {
      const u = await db.query("update public.work_reports set notes = 'no' where id = $1", [
        reportId,
      ]);
      expect(u.rowCount).toBe(0);
      const d = await db.query("delete from public.work_report_items where report_id = $1", [
        reportId,
      ]);
      expect(d.rowCount).toBe(0);
    });
  });

  it("invio, approvazione solo di chi approva, righe bloccate dopo l'invio, rinvio con motivo", async () => {
    await commitAs(s.users.bobTechA, async () => {
      const { rows } = await db.query<{ submitted_by: string }>(
        "update public.work_reports set status = 'submitted' where id = $1 returning submitted_by",
        [reportId],
      );
      expect(rows[0]!.submitted_by).toBe(s.users.bobTechA);
      await fails(
        () =>
          db.query("update public.work_reports set status = 'approved' where id = $1", [reportId]),
        "42501",
      );
      await fails(
        () => db.query("update public.work_reports set notes = 'tardi' where id = $1", [reportId]),
        "42501",
      );
      await fails(
        () =>
          db.query("update public.work_report_items set quantity = 99 where report_id = $1", [
            reportId,
          ]),
        "42501",
      );
    });
    await commitAs(s.users.martaManagerA, async () => {
      await db.query(
        "update public.work_reports set status = 'draft', returned_reason = 'Mancano le ore di Luca' where id = $1",
        [reportId],
      );
    });
    await commitAs(s.users.bobTechA, async () => {
      await db.query("update public.work_reports set status = 'submitted' where id = $1", [
        reportId,
      ]);
    });
    await commitAs(s.users.martaManagerA, async () => {
      const { rows } = await db.query<{ approved_by: string; returned_reason: string | null }>(
        "update public.work_reports set status = 'approved' where id = $1 returning approved_by, returned_reason",
        [reportId],
      );
      expect(rows[0]).toMatchObject({ approved_by: s.users.martaManagerA, returned_reason: null });
      // salto di stato non previsto
      await fails(
        () =>
          db.query("update public.work_reports set status = 'submitted' where id = $1", [reportId]),
        "42501",
      );
    });
  });

  it("costi: solo con projects.finance; tariffa per persona; il tecnico non li vede", async () => {
    const itemId = (
      await db.query<{ id: string }>(
        "select id from public.work_report_items where report_id = $1",
        [reportId],
      )
    ).rows[0]!.id;
    await commitAs(s.users.carolOfficeA, async () => {
      await db.query(
        `insert into public.employee_cost_rates (tenant_id, employee_id, hourly_cost_cents, valid_from)
         values ($1, $2, 2800, '2026-01-01')`,
        [s.tenantA, s.a.employee],
      );
      await db.query(
        "insert into public.work_report_item_costs (tenant_id, item_id, unit_cost_cents) values ($1, $2, 650)",
        [s.tenantA, itemId],
      );
    });
    await commitAs(s.users.bobTechA, async () => {
      expect((await db.query("select * from public.employee_cost_rates")).rows).toHaveLength(0);
      expect((await db.query("select * from public.work_report_item_costs")).rows).toHaveLength(0);
      await fails(
        () =>
          db.query(
            `insert into public.employee_cost_rates (tenant_id, employee_id, hourly_cost_cents, valid_from)
           values ($1, $2, 1, '2026-02-01')`,
            [s.tenantA, s.a.employee],
          ),
        "42501",
      );
    });
    await commitAs(s.users.martaManagerA, async () => {
      // il responsabile operativo approva ma non vede i costi
      expect((await db.query("select * from public.employee_cost_rates")).rows).toHaveLength(0);
    });
  });

  it("fatturato: niente più modifiche; foto solo in bozza", async () => {
    await commitAs(s.users.martaManagerA, async () => {
      await fails(
        () =>
          db.query(
            "insert into public.work_report_files (tenant_id, report_id, original_name) values ($1, $2, 'a.jpg')",
            [s.tenantA, reportId],
          ),
        "42501",
      );
      await db.query("update public.work_reports set status = 'invoiced' where id = $1", [
        reportId,
      ]);
      await fails(
        () => db.query("update public.work_reports set status = 'draft' where id = $1", [reportId]),
        "42501",
      );
    });
    await commitAs(s.users.carolOfficeA, async () => {
      await fails(
        () => db.query("update public.work_report_item_costs set unit_cost_cents = 1"),
        "42501",
      );
    });
  });

  it("la cronologia della commessa include i rapportini per chi li vede tutti", async () => {
    await commitAs(s.users.martaManagerA, async () => {
      const { rows } = await db.query<{ table_name: string }>(
        "select distinct table_name from app.record_history('projects', $1)",
        [projectA],
      );
      expect(rows.map((r) => r.table_name)).toContain("work_reports");
    });
    await commitAs(s.users.bobTechA, async () => {
      const { rows } = await db.query<{ table_name: string }>(
        "select distinct table_name from app.record_history('projects', $1)",
        [projectA],
      );
      expect(rows.map((r) => r.table_name)).not.toContain("work_reports");
      const own = await db.query<{ table_name: string }>(
        "select distinct table_name from app.record_history('work_reports', $1)",
        [reportId],
      );
      expect(own.rows.map((r) => r.table_name).sort()).toEqual(
        ["work_report_items", "work_report_labor", "work_reports"].sort(),
      );
    });
  });

  it("gradi: il tecnico vede solo i suoi rapportini e quelli in cui compare; l'ufficio vede ma non compila", async () => {
    const luca = await createUser(db, "luca");
    await addMember(db, s.tenantA, luca, "technician");
    const lucaEmployee = await insertRow(db, "employees", {
      tenant_id: s.tenantA,
      user_id: luca,
      first_name: "Luca",
      last_name: "Prova",
    });
    const mine = await commitAs(
      s.users.bobTechA,
      async () => (await newReport(s.tenantA, projectA)).rows[0]!.id,
    );
    const count = async (user: string) =>
      commitAs(user, async () => {
        const { rows } = await db.query("select id from public.work_reports where id = $1", [mine]);
        const hist = await db.query("select 1 from app.record_history('work_reports', $1)", [mine]);
        return [rows.length, hist.rows.length > 0 ? 1 : 0];
      });
    expect(await count(luca)).toEqual([0, 0]);
    for (const u of [
      s.users.martaManagerA,
      s.users.carolOfficeA,
      s.users.victorViewerA,
      s.users.aliceOwnerA,
    ]) {
      expect((await count(u))[0]).toBe(1);
    }
    // Bob mette Luca tra le ore: ora Luca vede il rapportino (righe comprese)
    await commitAs(s.users.bobTechA, async () => {
      await db.query(
        `insert into public.work_report_labor (tenant_id, report_id, employee_id, hours) values ($1, $2, $3, 4)`,
        [s.tenantA, mine, lucaEmployee],
      );
    });
    expect(await count(luca)).toEqual([1, 1]);
    await commitAs(luca, async () => {
      const { rows } = await db.query(
        "select hours from public.work_report_labor where report_id = $1",
        [mine],
      );
      expect(rows).toHaveLength(1);
      // ma non lo modifica: non è l'autore
      await fails(
        () => db.query("update public.work_reports set notes = 'x' where id = $1", [mine]),
        "42501",
      );
    });
    // l'ufficio non compila rapportini
    await commitAs(s.users.carolOfficeA, async () => {
      await fails(() => newReport(s.tenantA, projectA), "42501");
    });
  });
});
