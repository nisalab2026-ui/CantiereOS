import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DASHBOARD_LAYOUT_KEY,
  dashboardKindFor,
  dashboardLayoutSchema,
  deletePreference,
  getCommandCenter,
  getDashboard,
  getPreference,
  periodRange,
  resolveDashboardLayout,
  setPreference,
  shiftMonths,
  ValidationError,
  globalSearch,
  likePattern,
  listNotifications,
  markNotificationsRead,
  resolveActiveTenant,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, tech: User, manager: User, ownerB: User;
let tenantA: string, tenantB: string;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "titolare");
  tech = await createUser(pool, "tecnico");
  manager = await createUser(pool, "responsabile");
  ownerB = await createUser(pool, "titolareb");
  tenantA = await createTenant(pool, "Azienda A", owner.id);
  tenantB = await createTenant(pool, "Azienda B", ownerB.id);
  await addMember(pool, tenantA, tech.id, "technician");
  await addMember(pool, tenantA, manager.id, "site_manager");

  const ins = (sql: string, p: unknown[]) => pool.query(sql, p);
  await ins(
    "insert into public.customers (tenant_id, display_name, code) values ($1, 'Rossi Costruzioni', 'C001'), ($1, 'Sconto_100% Srl', 'C002')",
    [tenantA],
  );
  await ins(
    "insert into public.customers (tenant_id, display_name) values ($1, 'Rossi Impianti B')",
    [tenantB],
  );
  await ins(
    "insert into public.suppliers (tenant_id, display_name) values ($1, 'Rossi Forniture')",
    [tenantA],
  );
  const emp = await pool.query<{ id: string }>(
    "insert into public.employees (tenant_id, user_id, first_name, last_name, job_title) values ($1, $2, 'Mario', 'Rossi', 'Elettricista') returning id",
    [tenantA, tech.id],
  );
  const team = await pool.query<{ id: string }>(
    "insert into public.teams (tenant_id, name, leader_employee_id) values ($1, 'Squadra Rossa', $2) returning id",
    [tenantA, emp.rows[0]!.id],
  );
  await pool.query(
    "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
    [tenantA, team.rows[0]!.id, emp.rows[0]!.id],
  );
  await pool.query(
    "insert into public.notifications (tenant_id, user_id, kind, title) values ($1, $2, 'test.a', 'Prima'), ($1, $2, 'test.b', 'Seconda'), ($1, $3, 'test.c', 'Di un altro')",
    [tenantA, tech.id, owner.id],
  );
});

afterAll(async () => {
  await pool.end();
});

const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Ricerca globale", () => {
  it("trova solo nell'azienda attiva e solo nelle fonti permesse", async () => {
    const s = await createSession(pool, owner);
    const all = await run(s, async (tx) =>
      globalSearch(tx, await resolveActiveTenant(tx), "rossi"),
    );
    expect(all.map((r) => `${r.kind}:${r.title}`).sort()).toEqual(
      ["customer:Rossi Costruzioni", "employee:Mario Rossi", "supplier:Rossi Forniture"].sort(),
    );

    const st = await createSession(pool, tech);
    const techResults = await run(st, async (tx) =>
      globalSearch(tx, await resolveActiveTenant(tx), "rossi"),
    );
    // il tecnico non ha suppliers.read
    expect(techResults.map((r) => r.kind)).not.toContain("supplier");
    expect(techResults.map((r) => r.kind)).toContain("customer");
  });

  it("caratteri speciali trattati come testo, termini troppo corti ignorati", async () => {
    expect(likePattern("100%_x\\")).toBe("%100\\%\\_x\\\\%");
    const s = await createSession(pool, owner);
    const pct = await run(s, async (tx) => globalSearch(tx, await resolveActiveTenant(tx), "%"));
    expect(pct).toEqual([]);
    const exact = await run(s, async (tx) => globalSearch(tx, await resolveActiveTenant(tx), "0%"));
    expect(exact.map((r) => r.title)).toEqual(["Sconto_100% Srl"]);
    const wild = await run(s, async (tx) =>
      globalSearch(tx, await resolveActiveTenant(tx), "r_ssi"),
    );
    expect(wild).toEqual([]);
  });
});

describe("Notifiche", () => {
  it("elenca solo le proprie e le segna come lette", async () => {
    const s = await createSession(pool, tech);
    const first = await run(s, async (tx) => listNotifications(tx, await resolveActiveTenant(tx)));
    expect(first.unread).toBe(2);
    expect(first.items.map((n) => n.title).sort()).toEqual(["Prima", "Seconda"]);

    const one = first.items[0]!.id;
    expect(
      await run(s, async (tx) =>
        markNotificationsRead(tx, await resolveActiveTenant(tx), [one, "non-uuid"]),
      ),
    ).toBe(1);
    expect(
      (await run(s, async (tx) => listNotifications(tx, await resolveActiveTenant(tx)))).unread,
    ).toBe(1);
    expect(
      await run(s, async (tx) => markNotificationsRead(tx, await resolveActiveTenant(tx))),
    ).toBe(1);

    const so = await createSession(pool, owner);
    const others = await run(so, async (tx) =>
      listNotifications(tx, await resolveActiveTenant(tx)),
    );
    expect(others.items.map((n) => n.title)).toEqual(["Di un altro"]);
  });
});

describe("Dashboard per ruolo", () => {
  it("sceglie la dashboard dal ruolo", () => {
    expect(dashboardKindFor("owner")).toBe("admin");
    expect(dashboardKindFor("back_office")).toBe("admin");
    expect(dashboardKindFor("site_manager")).toBe("manager");
    expect(dashboardKindFor("operations_manager")).toBe("manager");
    expect(dashboardKindFor("technician")).toBe("technician");
    expect(dashboardKindFor("external_client")).toBe("portal");
  });

  it("amministrazione: numeri reali dell'azienda, con MFA anche posti e attività", async () => {
    const s = await createSession(pool, owner, "aal2");
    const d = await run(s, async (tx) => getDashboard(tx, await resolveActiveTenant(tx)));
    expect(d).toMatchObject({
      kind: "admin",
      activeMembers: 3,
      seats: 50,
      customers: 2,
      suppliers: 1,
      employees: 1,
      pendingInvitations: 0,
    });
    if (d.kind !== "admin") throw new Error();
    expect(d.recentActivity!.length).toBeGreaterThan(0);

    const s1 = await createSession(pool, owner, "aal1");
    const d1 = await run(s1, async (tx) => getDashboard(tx, await resolveActiveTenant(tx)));
    expect(d1).toMatchObject({
      kind: "admin",
      seats: null,
      recentActivity: null,
      pendingInvitations: null,
      customers: 2,
    });
  });

  it("responsabile e tecnico vedono le proprie sezioni", async () => {
    const sm = await createSession(pool, manager);
    const m = await run(sm, async (tx) => getDashboard(tx, await resolveActiveTenant(tx)));
    expect(m).toMatchObject({ kind: "manager", employees: 1, customers: 2 });
    if (m.kind !== "manager") throw new Error();
    expect(m.teams).toEqual([
      expect.objectContaining({ name: "Squadra Rossa", leader: "Mario Rossi", members: 1 }),
    ]);

    const st = await createSession(pool, tech);
    const t = await run(st, async (tx) => getDashboard(tx, await resolveActiveTenant(tx)));
    expect(t).toMatchObject({
      kind: "technician",
      employee: { firstName: "Mario", jobTitle: "Elettricista" },
    });
    if (t.kind !== "technician") throw new Error();
    expect(t.teams!.map((x) => x.name)).toEqual(["Squadra Rossa"]);
  });
});

const romeToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

describe("Periodo della panoramica", () => {
  it("mese in corso fino a oggi contro lo stesso tratto del mese prima", () => {
    expect(periodRange("month", "2026-03-31")).toEqual({
      period: "month",
      from: "2026-03-01",
      to: "2026-04-01",
      prevFrom: "2026-02-01",
      prevTo: "2026-03-01",
    });
    expect(periodRange("last-month", "2026-01-15")).toMatchObject({
      from: "2025-12-01",
      to: "2026-01-01",
      prevFrom: "2025-11-01",
      prevTo: "2025-12-01",
    });
    expect(periodRange("quarter", "2026-11-26")).toMatchObject({
      from: "2026-10-01",
      to: "2026-11-27",
      prevFrom: "2026-07-01",
      prevTo: "2026-08-27",
    });
    expect(shiftMonths("2026-05-31", -1)).toBe("2026-04-30");
  });

  it("disposizione: ordine salvato, widget nuovi in coda, solo quelli disponibili", () => {
    const r = resolveDashboardLayout({ order: ["map", "kpis"], hidden: ["activity"] }, [
      "kpis",
      "cash",
      "map",
      "activity",
    ]);
    expect(r).toEqual({ visible: ["map", "kpis", "cash"], hidden: ["activity"] });
    expect(resolveDashboardLayout(null, ["cash", "kpis"]).visible).toEqual(["kpis", "cash"]);
    expect(dashboardLayoutSchema.safeParse({ order: ["boh"], hidden: [] }).success).toBe(false);
  });
});

describe("Centro di controllo", () => {
  it("incassi del periodo, confronto e andamento: solo azienda attiva e con permesso", async () => {
    const today = romeToday();
    const prevDay = `${shiftMonths(today, -1).slice(0, 7)}-01`;
    const cust = await pool.query<{ id: string }>(
      "select id from public.customers where tenant_id = $1 and code = 'C001'",
      [tenantA],
    );
    const custB = await pool.query<{ id: string }>(
      "select id from public.customers where tenant_id = $1 limit 1",
      [tenantB],
    );
    const pay = `insert into public.payments
      (tenant_id, direction, description, amount_cents, due_date, status, paid_on, paid_amount_cents, customer_id)
      values ($1, 'incoming', $2, $3, $4, $5, $6, $7, $8)`;
    await pool.query(pay, [tenantA, "SAL 1", 12000, today, "paid", today, 10000, cust.rows[0]!.id]);
    await pool.query(pay, [
      tenantA,
      "SAL 0",
      5000,
      prevDay,
      "paid",
      prevDay,
      5000,
      cust.rows[0]!.id,
    ]);
    await pool.query(pay, [tenantA, "Aperto", 7000, today, "open", null, null, cust.rows[0]!.id]);
    await pool.query(pay, [
      tenantB,
      "Altra",
      99900,
      today,
      "paid",
      today,
      99900,
      custB.rows[0]!.id,
    ]);

    const s = await createSession(pool, owner);
    const cc = await run(s, async (tx) =>
      getCommandCenter(tx, await resolveActiveTenant(tx), "month", today),
    );
    expect(cc.cash?.collectedCents).toBe(10000);
    expect(cc.cash?.prevCollectedCents).toBe(5000);
    expect(cc.cash?.byMonth).toHaveLength(6);
    expect(cc.cash?.byMonth.at(-1)).toEqual({ month: today.slice(0, 7), cents: 10000 });
    expect(cc.customers).toEqual({ active: 2, newInPeriod: 2, newPrev: 0 });
    expect(cc.workOrders?.today).toEqual([]);
    expect(cc.queues.reportsToApprove).toEqual({ count: 0, oldest: null });

    // il tecnico non vede i pagamenti: niente widget economico
    const st = await createSession(pool, tech);
    const techCc = await run(st, async (tx) =>
      getCommandCenter(tx, await resolveActiveTenant(tx), "month", today),
    );
    expect(techCc.cash).toBeNull();
    expect(techCc.queues.reportsToApprove).toBeNull();
  });
});

describe("Preferenze personali", () => {
  it("salva, rilegge e cancella solo le proprie", async () => {
    const s = await createSession(pool, owner);
    const layout = { order: ["cash", "kpis"], hidden: ["map"] };
    await run(s, async (tx) =>
      setPreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY, layout),
    );
    const read = await run(s, async (tx) =>
      getPreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY, dashboardLayoutSchema),
    );
    expect(read).toEqual(layout);

    const sm = await createSession(pool, manager);
    const other = await run(sm, async (tx) =>
      getPreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY, dashboardLayoutSchema),
    );
    expect(other).toBeNull();

    await run(s, async (tx) =>
      deletePreference(tx, await resolveActiveTenant(tx), DASHBOARD_LAYOUT_KEY),
    );
    expect(
      await run(s, async (tx) =>
        getPreference(
          tx,
          await resolveActiveTenant(tx),
          DASHBOARD_LAYOUT_KEY,
          dashboardLayoutSchema,
        ),
      ),
    ).toBeNull();
    await expect(
      run(s, async (tx) => setPreference(tx, await resolveActiveTenant(tx), "Non valida", {})),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
