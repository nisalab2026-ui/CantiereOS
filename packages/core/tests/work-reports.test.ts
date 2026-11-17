import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addEmployeeCostRate,
  AuthError,
  changeWorkReportStatus,
  createWorkReport,
  getProjectWorkSummary,
  getWorkReport,
  listWorkReports,
  loadWorkReportOptions,
  resolveActiveTenant,
  saveWorkReport,
  saveWorkReportPrices,
  signWorkReport,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Rapportini (ADR-015): compilazione, invio, approvazione, costi riservati. */
let pool: pg.Pool;
let owner: VerifiedSession, manager: VerifiedSession, tech: VerifiedSession;
let tenant: string, projectId: string, siteId: string, techEmployee: string;
const year = new Date().getFullYear();
const today = `${year}-11-17`;
const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);
const PNG = "data:image/png;base64,iVBORw0KGgo=";

beforeAll(async () => {
  pool = createPool();
  const o = await createUser(pool, "rap-titolare");
  const m = await createUser(pool, "rap-responsabile");
  const t = await createUser(pool, "rap-tecnico");
  tenant = await createTenant(pool, "Rapportini A", o.id);
  await addMember(pool, tenant, m.id, "operations_manager");
  await addMember(pool, tenant, t.id, "technician");
  owner = await createSession(pool, o);
  manager = await createSession(pool, m);
  tech = await createSession(pool, t);
  const ins = async (sql: string, p: unknown[]) =>
    (await pool.query<{ id: string }>(sql, p)).rows[0]!.id;
  const customerId = await ins(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Condominio Aurora') returning id",
    [tenant],
  );
  projectId = await ins(
    "insert into public.projects (tenant_id, customer_id, name, code) values ($1, $2, 'Copertura', 'C-1') returning id",
    [tenant, customerId],
  );
  siteId = await ins(
    `insert into public.project_sites (tenant_id, project_id, name, address_line, city)
     values ($1, $2, 'Scala B', 'Via Verdi 3', 'Milano') returning id`,
    [tenant, projectId],
  );
  techEmployee = await ins(
    `insert into public.employees (tenant_id, first_name, last_name, employment_type, user_id)
     values ($1, 'Bruno', 'Tecnico', 'employee', $2) returning id`,
    [tenant, t.id],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Rapportini", () => {
  let reportId: string;

  it("il tecnico compila: numero automatico, ore calcolate da inizio, fine e pausa", async () => {
    const opts = await run(tech, async (tx) =>
      loadWorkReportOptions(tx, await resolveActiveTenant(tx)),
    );
    expect(opts.projects.map((p) => p.code)).toContain("C-1");
    expect(opts.employees.find((e) => e.mine)?.id).toBe(techEmployee);

    const r = await run(tech, async (tx) =>
      createWorkReport(tx, await resolveActiveTenant(tx), {
        projectId,
        projectSiteId: siteId,
        reportDate: today,
      }),
    );
    expect(r.number).toBe(`${year}-0001`);
    reportId = r.id;

    // errore sulla riga: chiave labor.0
    const bad = await run(tech, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const d = (await getWorkReport(tx, a, reportId))!;
      return saveWorkReport(
        tx,
        a,
        reportId,
        { reportDate: today, labor: [{ employeeId: techEmployee }], items: [] },
        d.updatedAt.toISOString(),
      ).catch((e: unknown) => e);
    });
    expect(bad).toBeInstanceOf(ValidationError);
    expect((bad as ValidationError).fieldErrors).toHaveProperty("labor.0");

    const d = await run(tech, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const cur = (await getWorkReport(tx, a, reportId))!;
      expect(cur.canEdit).toBe(true);
      await saveWorkReport(
        tx,
        a,
        reportId,
        {
          projectSiteId: siteId,
          reportDate: today,
          workDescription: "Sostituzione coppi lato nord",
          labor: [
            { employeeId: techEmployee, startTime: "07:30", endTime: "16:30", breakMinutes: 60 },
          ],
          items: [
            {
              kind: "material",
              description: "Coppi",
              quantity: "120",
              unit: "pz",
              unitCost: "1,50",
            },
          ],
        },
        cur.updatedAt.toISOString(),
      );
      return (await getWorkReport(tx, a, reportId))!;
    });
    expect(d.labor[0]!.hours).toBe(8);
    expect(d.items[0]!.quantity).toBe(120);
    // il tecnico non ha projects.finance: nessun prezzo salvato né mostrato
    expect(d.items[0]).not.toHaveProperty("unitCostCents");
    expect(d.costs).toBeUndefined();
  });

  it("modifica concorrente: il secondo salvataggio con dati vecchi è respinto", async () => {
    const err = await run(tech, async (tx) =>
      saveWorkReport(
        tx,
        await resolveActiveTenant(tx),
        reportId,
        { reportDate: today, labor: [], items: [] },
        "2000-01-01T00:00:00.000Z",
      ).catch((e: unknown) => e),
    );
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("firma del cliente, invio, poi il tecnico non può più modificare né approvare", async () => {
    await run(tech, async (tx) => {
      const a = await resolveActiveTenant(tx);
      await signWorkReport(tx, a, reportId, { signature: PNG, signerName: "Sig. Rossi" });
      await changeWorkReportStatus(tx, a, reportId, "submit");
    });
    const d = await run(tech, async (tx) =>
      getWorkReport(tx, await resolveActiveTenant(tx), reportId),
    );
    expect(d!.status).toBe("submitted");
    expect(d!.customerSignedAt).not.toBeNull();
    expect(d!.canEdit).toBe(false);
    const err = await run(tech, async (tx) =>
      changeWorkReportStatus(tx, await resolveActiveTenant(tx), reportId, "approve").catch(
        (e: unknown) => e,
      ),
    );
    expect(err).toBeInstanceOf(AuthError);
  });

  it("restituzione con motivo obbligatorio, nuovo invio e approvazione del responsabile", async () => {
    const noReason = await run(manager, async (tx) =>
      changeWorkReportStatus(tx, await resolveActiveTenant(tx), reportId, "return", " ").catch(
        (e: unknown) => e,
      ),
    );
    expect((noReason as ValidationError).fieldErrors).toHaveProperty("reason");
    await run(manager, async (tx) =>
      changeWorkReportStatus(
        tx,
        await resolveActiveTenant(tx),
        reportId,
        "return",
        "Manca la pausa pranzo",
      ),
    );
    await run(tech, async (tx) =>
      changeWorkReportStatus(tx, await resolveActiveTenant(tx), reportId, "submit"),
    );
    await run(manager, async (tx) =>
      changeWorkReportStatus(tx, await resolveActiveTenant(tx), reportId, "approve"),
    );
    const list = await run(manager, async (tx) =>
      listWorkReports(tx, await resolveActiveTenant(tx), { status: "approved", projectId }),
    );
    expect(list.rows.map((r) => r.id)).toEqual([reportId]);
    const s = await run(manager, async (tx) =>
      getProjectWorkSummary(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(s!.hoursApproved).toBe(8);
    expect(s!.reports.approved).toBe(1);
    expect(s!.costs).toBeUndefined(); // il responsabile non vede i costi
  });

  it("il titolare indica costo orario e prezzi: costi reali della commessa", async () => {
    const before = await run(owner, async (tx) =>
      getProjectWorkSummary(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(before!.costs).toEqual({
      laborCents: 0,
      itemsCents: 0,
      missingRates: 1,
      missingPrices: 1,
    });
    await run(owner, async (tx) => {
      const a = await resolveActiveTenant(tx);
      await addEmployeeCostRate(tx, a, techEmployee, {
        amount: "30,00",
        validFrom: `${year}-01-01`,
      });
      const d = (await getWorkReport(tx, a, reportId))!;
      await saveWorkReportPrices(tx, a, reportId, { [d.items[0]!.id]: "1,50" });
    });
    const after = await run(owner, async (tx) =>
      getProjectWorkSummary(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(after!.costs).toEqual({
      laborCents: 24_000,
      itemsCents: 18_000,
      missingRates: 0,
      missingPrices: 0,
    });
    const err = await run(manager, async (tx) =>
      addEmployeeCostRate(tx, await resolveActiveTenant(tx), techEmployee, {
        amount: "10",
        validFrom: today,
      }).catch((e: unknown) => e),
    );
    expect(err).toBeInstanceOf(AuthError);
  });
});
