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

/** Interventi: squadra, visibilità per grado, aggiornamenti dal campo, avvisi (ADR-017). */
let db: Db;
let s: Seed;
let projectA: string, siteA: string, otherSiteA: string;
let luca: string;
const year = new Date().getFullYear();

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  const project = (code: string) =>
    insertRow(db, "projects", {
      tenant_id: s.tenantA,
      customer_id: s.a.customer,
      name: code,
      code,
      status: "active",
    });
  projectA = await project("WO-A");
  const otherProject = await project("WO-A2");
  const site = (p: string, name: string, address: string) =>
    insertRow(db, "project_sites", {
      tenant_id: s.tenantA,
      project_id: p,
      name,
      address_line: address,
      city: "Milano",
    });
  siteA = await site(projectA, "Scala A", "Via Roma 1");
  otherSiteA = await site(otherProject, "Altro", "Via Po 2");
  luca = await createUser(db, "luca-wo");
  await addMember(db, s.tenantA, luca, "technician");
  await insertRow(db, "employees", {
    tenant_id: s.tenantA,
    user_id: luca,
    first_name: "Luca",
    last_name: "Campo",
  });
});
afterAll(async () => {
  await db.end();
});

async function fails(run: () => Promise<unknown>, code: string): Promise<void> {
  await db.query("savepoint expected_error");
  try {
    await rawExpect(run(), code);
  } finally {
    await db.query("rollback to savepoint expected_error");
  }
}

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

const newOrder = (projectSite: string | null, start = "2030-03-04 08:00+01", end = "2030-03-04 12:00+01") =>
  db.query<{
    id: string;
    number: string;
    status: string;
    customer_id: string;
    project_id: string;
    address_line: string;
  }>(
    `insert into public.work_orders (tenant_id, title, project_site_id, scheduled_start, scheduled_end)
     values ($1, 'Manutenzione caldaia', $2, $3, $4)
     returning id, number, status, customer_id, project_id, address_line`,
    [s.tenantA, projectSite, start, end],
  );

const visible = (user: string, id: string) =>
  commitAs(user, async () => {
    const { rows } = await db.query("select id from public.work_orders where id = $1", [id]);
    return rows.length;
  });

const notices = (user: string, kind: string) =>
  commitAs(user, async () => {
    const { rows } = await db.query("select title from public.notifications where kind = $1", [kind]);
    return rows.length;
  });

describe("Interventi", () => {
  let orderId: string;

  it("chi pianifica crea l'intervento: numero, stato, cliente e indirizzo dal cantiere", async () => {
    await commitAs(s.users.martaManagerA, async () => {
      const r = (await newOrder(siteA)).rows[0]!;
      expect(r.number).toBe("2030-0001");
      expect(r.status).toBe("scheduled");
      expect(r.project_id).toBe(projectA);
      expect(r.customer_id).toBe(s.a.customer);
      expect(r.address_line).toBe("Via Roma 1");
      orderId = r.id;
      const ev = await db.query("select to_status from public.work_order_events where work_order_id = $1", [
        orderId,
      ]);
      expect(ev.rows).toEqual([{ to_status: "scheduled" }]);
      // cantiere di un'altra commessa, fine prima dell'inizio
      await fails(
        () =>
          db.query(
            `insert into public.work_orders (tenant_id, title, project_id, project_site_id, scheduled_start, scheduled_end)
             values ($1, 'X', $2, $3, now(), now() + interval '1 hour')`,
            [s.tenantA, projectA, otherSiteA],
          ),
        "23514",
      );
      await fails(() => newOrder(null, "2030-03-04 12:00+01", "2030-03-04 08:00+01"), "23514");
    });
    expect(year).toBeGreaterThan(2000);
  });

  it("assegnazione: il tecnico riceve l'avviso e vede solo i suoi interventi", async () => {
    expect(await visible(s.users.bobTechA, orderId)).toBe(0);
    await commitAs(s.users.martaManagerA, () =>
      db.query(
        `insert into public.work_order_assignees (tenant_id, work_order_id, employee_id, is_lead)
         values ($1, $2, $3, true)`,
        [s.tenantA, orderId, s.a.employee],
      ),
    );
    expect(await notices(s.users.bobTechA, "work_orders.assigned")).toBe(1);
    expect(await visible(s.users.bobTechA, orderId)).toBe(1);
    expect(await visible(luca, orderId)).toBe(0);
    expect(await visible(s.users.carolOfficeA, orderId)).toBe(1);
    expect(await visible(s.users.tomTechB, orderId)).toBe(0);
    expect(await visible(s.users.daveOwnerB, orderId)).toBe(0);
  });

  it("il tecnico non pianifica: niente nuovi interventi né squadre", async () => {
    await db.query("begin");
    await become(db, s.users.bobTechA);
    await fails(() => newOrder(siteA), "42501");
    await fails(
      () =>
        db.query(
          `insert into public.work_order_assignees (tenant_id, work_order_id, employee_id) values ($1, $2, $3)`,
          [s.tenantA, orderId, s.a.employee2],
        ),
      "42501",
    );
    await db.query("rollback");
  });

  it("dal campo: stato e note sì, orari e cliente no; passaggi controllati", async () => {
    await commitAs(s.users.bobTechA, async () => {
      await fails(
        () => db.query("update public.work_orders set title = 'Altro' where id = $1", [orderId]),
        "42501",
      );
      await fails(
        () => db.query("update public.work_orders set status = 'completed' where id = $1", [orderId]),
        "23514",
      );
      // sospeso senza motivo
      await fails(
        () => db.query("update public.work_orders set status = 'suspended' where id = $1", [orderId]),
        "23514",
      );
      const started = await db.query<{ started_at: string | null }>(
        `update public.work_orders set status = 'in_progress', field_notes = 'Arrivato'
          where id = $1 returning started_at`,
        [orderId],
      );
      expect(started.rows[0]!.started_at).not.toBeNull();
      await fails(
        () =>
          db.query("update public.work_orders set status = 'cancelled', status_reason = 'x' where id = $1", [
            orderId,
          ]),
        "23514",
      );
      const done = await db.query<{ completed_at: string | null }>(
        "update public.work_orders set status = 'completed' where id = $1 returning completed_at",
        [orderId],
      );
      expect(done.rows[0]!.completed_at).not.toBeNull();
      const ev = await db.query("select to_status from public.work_order_events where work_order_id = $1", [
        orderId,
      ]);
      expect(ev.rows.map((r) => r.to_status)).toEqual(["scheduled", "in_progress", "completed"]);
    });
    // un altro tecnico non tocca l'intervento
    const other = await commitAs(luca, () =>
      db.query("update public.work_orders set field_notes = 'x' where id = $1", [orderId]),
    );
    expect(other.rowCount).toBe(0);
  });

  it("chi pianifica riapre, sposta e annulla: la squadra riceve gli avvisi", async () => {
    await commitAs(s.users.martaManagerA, async () => {
      const r = await db.query<{ completed_at: string | null }>(
        "update public.work_orders set status = 'in_progress' where id = $1 returning completed_at",
        [orderId],
      );
      expect(r.rows[0]!.completed_at).toBeNull();
      await db.query(
        `update public.work_orders set scheduled_start = '2030-03-05 08:00+01', scheduled_end = '2030-03-05 10:00+01'
          where id = $1`,
        [orderId],
      );
      await db.query(
        "update public.work_orders set status = 'cancelled', status_reason = 'Cliente assente' where id = $1",
        [orderId],
      );
    });
    expect(await notices(s.users.bobTechA, "work_orders.rescheduled")).toBe(1);
    expect(await notices(s.users.bobTechA, "work_orders.cancelled")).toBe(1);
    // l'ufficio pianifica ma non elimina (serve work_orders.delete)
    const del = await commitAs(s.users.carolOfficeA, () =>
      db.query("delete from public.work_orders where id = $1", [orderId]),
    );
    expect(del.rowCount).toBe(0);
  });
});
