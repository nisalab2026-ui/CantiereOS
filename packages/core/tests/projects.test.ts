import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  createFormSubmission,
  createFormTemplate,
  createProject,
  createProjectSite,
  getProject,
  listFormCustomerOptions,
  listFormSubmissions,
  listProjectOptions,
  listProjects,
  publishFormTemplate,
  removeProjectSite,
  resolveActiveTenant,
  saveProjectFinancials,
  setProjectStatus,
  updateProject,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Commesse e cantieri (ADR-014): permessi, importi riservati, cantieri, riepilogo. */
let pool: pg.Pool;
let owner: VerifiedSession, manager: VerifiedSession, tech: VerifiedSession;
let tenant: string, customerId: string, otherCustomerId: string, siteId: string;
const year = new Date().getFullYear();
const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

beforeAll(async () => {
  pool = createPool();
  const o = await createUser(pool, "com-titolare");
  const m = await createUser(pool, "com-responsabile");
  const t = await createUser(pool, "com-tecnico");
  tenant = await createTenant(pool, "Commesse A", o.id);
  await addMember(pool, tenant, m.id, "operations_manager");
  await addMember(pool, tenant, t.id, "technician");
  owner = await createSession(pool, o);
  manager = await createSession(pool, m);
  tech = await createSession(pool, t);
  const ins = async (sql: string, p: unknown[]) =>
    (await pool.query<{ id: string }>(sql, p)).rows[0]!.id;
  customerId = await ins(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Condominio Aurora') returning id",
    [tenant],
  );
  otherCustomerId = await ins(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Villa Rosa') returning id",
    [tenant],
  );
  siteId = await ins(
    `insert into public.customer_sites (tenant_id, customer_id, name, address_line, city)
     values ($1, $2, 'Scala B', 'Via Verdi 3', 'Milano') returning id`,
    [tenant, customerId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Commesse", () => {
  let projectId: string;

  it("il titolare crea commessa con importi e primo cantiere; codice automatico", async () => {
    const r = await run(owner, async (tx) =>
      createProject(
        tx,
        await resolveActiveTenant(tx),
        { name: "Rifacimento copertura", customerId, kind: "lump_sum", startDate: "2026-11-20" },
        {
          financials: { contract: "48.500,00", budgetCost: "36.000" },
          site: { name: "Copertura scala B", customerSiteId: siteId },
        },
      ),
    );
    expect(r.code).toBe(`${year}-001`);
    projectId = r.id;
    const p = await run(owner, async (tx) => getProject(tx, await resolveActiveTenant(tx), r.id));
    expect(p).toMatchObject({
      name: "Rifacimento copertura",
      status: "active",
      contractCents: 4_850_000,
      siteCount: 1,
      financials: { contractCents: 4_850_000, budgetCostCents: 3_600_000 },
    });
    expect(p!.sites[0]!.address).toContain("Via Verdi 3");
  });

  it("il responsabile modifica ma non vede né scrive importi; il tecnico solo legge", async () => {
    const p = await run(manager, async (tx) =>
      getProject(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(p!.financials).toBeUndefined();
    expect(p!.contractCents).toBeNull();
    await run(manager, async (tx) =>
      updateProject(
        tx,
        await resolveActiveTenant(tx),
        projectId,
        { name: "Rifacimento copertura e gronde", customerId, kind: "lump_sum" },
        new Date(p!.updatedAt).toISOString(),
      ),
    );
    await expect(
      run(manager, async (tx) =>
        saveProjectFinancials(tx, await resolveActiveTenant(tx), projectId, { contract: "1" }),
      ),
    ).rejects.toThrow(AuthError);
    await expect(
      run(manager, async (tx) =>
        createProject(
          tx,
          await resolveActiveTenant(tx),
          { name: "Con importo", customerId, kind: "other" },
          { financials: { contract: "100" } },
        ),
      ),
    ).rejects.toThrow(AuthError);
    await expect(
      run(tech, async (tx) =>
        createProject(tx, await resolveActiveTenant(tx), { name: "No", customerId, kind: "other" }),
      ),
    ).rejects.toThrow(AuthError);
    const list = await run(tech, async (tx) => listProjects(tx, await resolveActiveTenant(tx), {}));
    expect(list.rows.map((r) => r.name)).toContain("Rifacimento copertura e gronde");
  });

  it("modifica concorrente rifiutata; codice duplicato con messaggio sul campo", async () => {
    await expect(
      run(owner, async (tx) =>
        updateProject(
          tx,
          await resolveActiveTenant(tx),
          projectId,
          { name: "Vecchio", customerId, kind: "lump_sum" },
          "2000-01-01T00:00:00.000Z",
        ),
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      run(owner, async (tx) =>
        createProject(tx, await resolveActiveTenant(tx), {
          code: `${year}-001`,
          name: "Doppione",
          customerId,
          kind: "other",
        }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { code: "Codice già usato da un'altra commessa" } });
  });

  it("cantieri: sede di un altro cliente rifiutata, indirizzo proprio accettato, rimozione", async () => {
    const { id: otherSite } = await run(owner, async (tx) =>
      createProjectSite(tx, await resolveActiveTenant(tx), projectId, {
        name: "Magazzino",
        addressLine: "Via Nuova 5",
        city: "Bergamo",
        province: "bg",
      }),
    );
    const foreignSite = (
      await pool.query<{ id: string }>(
        `insert into public.customer_sites (tenant_id, customer_id, name, address_line, city)
         values ($1, $2, 'Villa', 'Via Rosa 1', 'Como') returning id`,
        [tenant, otherCustomerId],
      )
    ).rows[0]!.id;
    await expect(
      run(owner, async (tx) =>
        createProjectSite(tx, await resolveActiveTenant(tx), projectId, {
          name: "Sbagliato",
          customerSiteId: foreignSite,
        }),
      ),
    ).rejects.toMatchObject({
      fieldErrors: { customerSiteId: "La sede non è del cliente della commessa" },
    });
    await expect(
      run(owner, async (tx) =>
        createProjectSite(tx, await resolveActiveTenant(tx), projectId, {
          name: "Senza indirizzo",
        }),
      ),
    ).rejects.toThrow(ValidationError);
    await run(owner, async (tx) => removeProjectSite(tx, await resolveActiveTenant(tx), otherSite));
    const p = await run(owner, async (tx) =>
      getProject(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(p!.sites.map((s) => s.name)).toEqual(["Copertura scala B"]);
    expect(p!.sites.length).toBe(p!.siteCount);
  });

  it("un rapportino si collega alla commessa dello stesso cliente e finisce nel riepilogo", async () => {
    const formId = await run(owner, async (tx) => {
      const a = await resolveActiveTenant(tx);
      const { id: templateId } = await createFormTemplate(tx, a, {
        name: "Rapportino",
        category: "report",
        libraryKey: "rapportino-giornaliero",
      });
      await publishFormTemplate(tx, a, templateId);
      const opts = await listFormCustomerOptions(tx, a);
      expect(opts.find((c) => c.id === customerId)!.projects.map((p) => p.id)).toContain(projectId);
      expect(opts.find((c) => c.id === otherCustomerId)!.projects).toEqual([]);
      await expect(
        createFormSubmission(tx, a, { templateId, customerId: otherCustomerId, projectId }),
      ).rejects.toMatchObject({
        fieldErrors: { projectId: "La commessa non è di questo cliente" },
      });
      await expect(createFormSubmission(tx, a, { templateId, projectId })).rejects.toMatchObject({
        fieldErrors: { projectId: "Scegli prima il cliente" },
      });
      return (await createFormSubmission(tx, a, { templateId, customerId, projectId })).id;
    });
    const list = await run(owner, async (tx) =>
      listFormSubmissions(tx, await resolveActiveTenant(tx), { projectId }),
    );
    expect(list.rows.map((r) => [r.id, r.project?.id])).toEqual([[formId, projectId]]);
    const p = await run(tech, async (tx) =>
      getProject(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(p!.summary.formsDraft).toBe(1);
  });

  it("riepilogo: attività collegate contate; stato e filtri dell'elenco", async () => {
    await pool.query(
      "insert into public.tasks (tenant_id, title, project_id) values ($1, 'Ponteggio', $2), ($1, 'Lattoneria', $2)",
      [tenant, projectId],
    );
    const p = await run(owner, async (tx) =>
      getProject(tx, await resolveActiveTenant(tx), projectId),
    );
    expect(p!.summary.tasksOpen).toBe(2);
    await run(owner, async (tx) =>
      setProjectStatus(tx, await resolveActiveTenant(tx), projectId, "completed"),
    );
    const open = await run(owner, async (tx) =>
      listProjects(tx, await resolveActiveTenant(tx), {}),
    );
    expect(open.rows.map((r) => r.id)).not.toContain(projectId);
    const closed = await run(owner, async (tx) =>
      listProjects(tx, await resolveActiveTenant(tx), { status: "closed", q: "gronde" }),
    );
    expect(closed.rows.map((r) => r.id)).toEqual([projectId]);
    const options = await run(owner, async (tx) =>
      listProjectOptions(tx, await resolveActiveTenant(tx), customerId),
    );
    expect(options.map((o) => o.id)).not.toContain(projectId);
  });
});
