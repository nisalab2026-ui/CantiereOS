import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
  linkEmployeeAccount,
  listLinkableAccounts,
  listWorkOrders,
  loadWorkOrderOptions,
  resolveActiveTenant,
  saveWorkOrderNotes,
  updateWorkOrder,
  ValidationError,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import { addMember, createPool, createSession, createTenant, createUser } from "./helpers/fixtures";

/** Interventi (ADR-017): pianificazione dall'ufficio, aggiornamenti dal campo. */
let pool: pg.Pool;
let owner: VerifiedSession, office: VerifiedSession, tech: VerifiedSession, otherTech: VerifiedSession;
let tenant: string,
  helperId: string,
  techUserId: string,
  customerId: string,
  siteId: string,
  techEmployee: string,
  teamId: string;
const run = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

beforeAll(async () => {
  pool = createPool();
  const o = await createUser(pool, "int-titolare");
  const b = await createUser(pool, "int-ufficio");
  const t = await createUser(pool, "int-tecnico");
  const t2 = await createUser(pool, "int-tecnico2");
  tenant = await createTenant(pool, "Interventi A", o.id);
  await addMember(pool, tenant, b.id, "back_office");
  await addMember(pool, tenant, t.id, "technician");
  await addMember(pool, tenant, t2.id, "technician");
  owner = await createSession(pool, o);
  office = await createSession(pool, b);
  tech = await createSession(pool, t);
  otherTech = await createSession(pool, t2);
  const ins = async (sql: string, p: unknown[]) =>
    (await pool.query<{ id: string }>(sql, p)).rows[0]!.id;
  customerId = await ins(
    `insert into public.customers (tenant_id, display_name, billing_address_line, billing_city)
     values ($1, 'Condominio Aurora', 'Via Verdi 3', 'Milano') returning id`,
    [tenant],
  );
  siteId = await ins(
    `insert into public.customer_sites (tenant_id, customer_id, name, address_line, city)
     values ($1, $2, 'Centrale termica', 'Via Neri 8', 'Monza') returning id`,
    [tenant, customerId],
  );
  techEmployee = await ins(
    `insert into public.employees (tenant_id, first_name, last_name, user_id)
     values ($1, 'Bruno', 'Tecnico', $2) returning id`,
    [tenant, t.id],
  );
  techUserId = t.id;
  const helper = await ins(
    `insert into public.employees (tenant_id, first_name, last_name) values ($1, 'Aldo', 'Aiuto') returning id`,
    [tenant],
  );
  helperId = helper;
  await ins(
    `insert into public.employees (tenant_id, first_name, last_name, user_id)
     values ($1, 'Carlo', 'Altro', $2) returning id`,
    [tenant, t2.id],
  );
  teamId = await ins(
    `insert into public.teams (tenant_id, name, leader_employee_id) values ($1, 'Squadra Nord', $2) returning id`,
    [tenant, techEmployee],
  );
  for (const e of [techEmployee, helper]) {
    await pool.query(
      "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
      [tenant, teamId, e],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe("Interventi", () => {
  let id: string;

  it("l'ufficio pianifica con una squadra: indirizzo dalla sede, capo squadra dalla squadra", async () => {
    const opts = await run(office, async (tx) =>
      loadWorkOrderOptions(tx, await resolveActiveTenant(tx)),
    );
    expect(opts.teams.map((t) => t.name)).toEqual(["Squadra Nord"]);
    expect(opts.customers[0]!.sites[0]!.name).toBe("Centrale termica");

    const bad = await run(office, async (tx) =>
      createWorkOrder(tx, await resolveActiveTenant(tx), {
        title: "Caldaia",
        date: "2030-05-06",
        startTime: "10:00",
        endTime: "09:00",
      }).catch((e: unknown) => e),
    );
    expect(bad).toBeInstanceOf(ValidationError);

    const created = await run(office, async (tx) =>
      createWorkOrder(tx, await resolveActiveTenant(tx), {
        title: "Manutenzione caldaia",
        kind: "maintenance",
        customerSiteId: siteId,
        date: "2030-05-06",
        startTime: "08:30",
        endTime: "11:00",
        teamId,
      }),
    );
    id = created.id;
    expect(created.number).toBe("2030-0001");
    const d = await run(office, async (tx) => getWorkOrder(tx, await resolveActiveTenant(tx), id));
    expect(d!.customerId).toBe(customerId);
    expect(d!.address).toBe("Via Neri 8, Monza");
    expect(d!.start).toBe("2030-05-06T08:30");
    expect(d!.assignees.map((a) => [a.name, a.isLead])).toEqual([
      ["Bruno Tecnico", true],
      ["Aldo Aiuto", false],
    ]);
    expect(d!.canPlan).toBe(true);
  });

  it("il tecnico vede solo i suoi interventi e non può pianificare", async () => {
    const mine = await run(tech, async (tx) =>
      listWorkOrders(tx, await resolveActiveTenant(tx), { from: "2030-05-06", to: "2030-05-06" }),
    );
    expect(mine.map((r) => [r.title, r.isMine])).toEqual([["Manutenzione caldaia", true]]);
    const other = await run(otherTech, async (tx) =>
      listWorkOrders(tx, await resolveActiveTenant(tx), { from: "2030-05-01", to: "2030-05-31" }),
    );
    expect(other).toEqual([]);
    const denied = await run(tech, async (tx) =>
      createWorkOrder(tx, await resolveActiveTenant(tx), {
        title: "X",
        date: "2030-05-06",
        startTime: "08:00",
        endTime: "09:00",
      }).catch((e: unknown) => e),
    );
    expect(denied).toBeInstanceOf(AuthError);
  });

  it("dal campo: inizia, note, sospendi con motivo, completa; storico degli stati", async () => {
    const ctx = async <T>(
      fn: (
        tx: Parameters<Parameters<typeof run<T>>[1]>[0],
        a: Awaited<ReturnType<typeof resolveActiveTenant>>,
      ) => Promise<T>,
    ) => run(tech, async (tx) => fn(tx, await resolveActiveTenant(tx)));
    expect(await ctx((tx, a) => changeWorkOrderStatus(tx, a, id, "start"))).toBe("in_progress");
    await ctx((tx, a) => saveWorkOrderNotes(tx, a, id, "Pezzo da ordinare"));
    const noReason = await ctx((tx, a) =>
      changeWorkOrderStatus(tx, a, id, "suspend").catch((e: unknown) => e),
    );
    expect(noReason).toBeInstanceOf(ValidationError);
    await ctx((tx, a) => changeWorkOrderStatus(tx, a, id, "suspend", "Manca il ricambio"));
    const cancel = await ctx((tx, a) =>
      changeWorkOrderStatus(tx, a, id, "cancel", "x").catch((e: unknown) => e),
    );
    expect(cancel).toBeInstanceOf(AuthError);
    await ctx((tx, a) => changeWorkOrderStatus(tx, a, id, "complete"));
    const d = await ctx((tx, a) => getWorkOrder(tx, a, id));
    expect(d!.status).toBe("completed");
    expect(d!.fieldNotes).toBe("Pezzo da ordinare");
    expect(d!.canPlan).toBe(false);
    expect(d!.events.map((e) => e.toStatus)).toEqual([
      "scheduled",
      "in_progress",
      "suspended",
      "completed",
    ]);
    // un altro tecnico non vede e non scrive
    const foreign = await run(otherTech, async (tx) =>
      saveWorkOrderNotes(tx, await resolveActiveTenant(tx), id, "x").catch((e: unknown) => e),
    );
    expect(foreign).toBeInstanceOf(ValidationError);
  });

  it("l'ufficio sposta l'intervento e cambia la squadra: il tecnico riceve gli avvisi", async () => {
    await run(office, async (tx) => {
      const a = await resolveActiveTenant(tx);
      await changeWorkOrderStatus(tx, a, id, "reopen");
      await updateWorkOrder(tx, a, id, {
        title: "Manutenzione caldaia",
        customerSiteId: siteId,
        date: "2030-05-07",
        startTime: "14:00",
        endTime: "16:00",
        employeeIds: [techEmployee],
        leadEmployeeId: techEmployee,
      });
    });
    const d = await run(tech, async (tx) => getWorkOrder(tx, await resolveActiveTenant(tx), id));
    expect(d!.start).toBe("2030-05-07T14:00");
    expect(d!.assignees.map((x) => x.name)).toEqual(["Bruno Tecnico"]);
    const { rows } = await pool.query<{ kind: string }>(
      `select n.kind from public.notifications n
         join public.employees e on e.tenant_id = n.tenant_id and e.user_id = n.user_id
        where n.tenant_id = $1 and e.id = $2 and n.kind like 'work_orders.%' order by n.kind`,
      [tenant, techEmployee],
    );
    expect(rows.map((r) => r.kind)).toEqual(["work_orders.assigned", "work_orders.rescheduled"]);
  });
});

describe("collegamento persona ↔ account", () => {
  it("il titolare collega un account libero; doppioni, estranei e tecnici respinti", async () => {
    const accounts = await run(owner, async (tx) =>
      listLinkableAccounts(tx, await resolveActiveTenant(tx)),
    );
    expect(accounts.find((a) => a.id === techUserId)?.linkedTo).toBe("Bruno Tecnico");
    // account già collegato a Bruno: respinto
    await expect(
      run(owner, async (tx) =>
        linkEmployeeAccount(tx, await resolveActiveTenant(tx), helperId, techUserId),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    // utente di un'altra azienda: respinto
    const stranger = await createUser(pool, "int-estraneo");
    await expect(
      run(owner, async (tx) =>
        linkEmployeeAccount(tx, await resolveActiveTenant(tx), helperId, stranger.id),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    // il tecnico non può collegare persone
    await expect(
      run(tech, async (tx) =>
        linkEmployeeAccount(tx, await resolveActiveTenant(tx), helperId, null),
      ),
    ).rejects.toBeInstanceOf(AuthError);
    // scollega e ricollega Bruno
    await run(owner, async (tx) =>
      linkEmployeeAccount(tx, await resolveActiveTenant(tx), techEmployee, null),
    );
    await run(owner, async (tx) =>
      linkEmployeeAccount(tx, await resolveActiveTenant(tx), techEmployee, techUserId),
    );
    const mine = await run(tech, async (tx) =>
      listWorkOrders(tx, await resolveActiveTenant(tx), {
        from: "2020-01-01",
        to: "2020-01-02",
        mine: true,
      }),
    );
    expect(Array.isArray(mine)).toBe(true);
  });
});
