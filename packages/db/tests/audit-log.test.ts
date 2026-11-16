import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, tx, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

let db: Db;
let s: Seed;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

describe("Audit log", () => {
  it("registra autore, azienda e campi modificati", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await db.query("update public.customers set billing_city = 'Bergamo' where id = $1", [
        s.a.customer,
      ]);
      const { rows } = await db.query(
        `select tenant_id, actor_user_id, action, changed_fields
           from public.audit_log
          where table_name = 'customers' and record_id = $1 and action = 'UPDATE'`,
        [s.a.customer],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: s.tenantA,
        actor_user_id: s.users.aliceOwnerA,
        action: "UPDATE",
      });
      expect(rows[0].changed_fields).toEqual(["billing_city", "updated_at"]);
    });
  });

  it("registra le insert di ogni tabella aziendale", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "select distinct table_name from public.audit_log where tenant_id = $1 and action = 'INSERT'",
      [s.tenantA],
    );
    // ordinamento in JS: l'ORDER BY SQL dipende dalla collation del server
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [
        "contacts",
        "customer_sites",
        "customers",
        "employees",
        "invitations",
        "memberships",
        "role_permissions",
        "roles",
        "subscriptions",
        "suppliers",
        "team_members",
        "teams",
        "tenant_settings",
        "tenants",
      ].sort(),
    );
  });

  it("chi non ha audit.read non vede il registro, e nessuno vede quello di altre aziende", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rowCount } = await db.query("select 1 from public.audit_log");
      expect(rowCount).toBe(0);
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rowCount } = await db.query("select 1 from public.audit_log where tenant_id <> $1", [
        s.tenantA,
      ]);
      expect(rowCount).toBe(0);
    });
  });

  it("gli utenti non possono scrivere, modificare o cancellare il registro", async () => {
    for (const sql of [
      "update public.audit_log set action = 'X'",
      "delete from public.audit_log",
      `insert into public.audit_log (tenant_id, action) values ('${s.tenantA}', 'FAKE')`,
    ]) {
      await asUser(db, s.users.aliceOwnerA, async () => {
        await expectPgError(db.query(sql), "42501");
      });
    }
  });

  it("nemmeno il service_role può alterare il registro", async () => {
    for (const sql of [
      "update public.audit_log set action = 'X'",
      "delete from public.audit_log",
    ]) {
      await tx(db, async () => {
        await db.query("set local role service_role");
        await expectPgError(db.query(sql), "42501");
      });
    }
  });

  it("le azioni del server registrano l'attore dichiarato e il request id", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await db.query("select set_config('app.actor_user_id', $1, true)", [s.users.graceAdminA]);
      await db.query("select set_config('app.request_id', 'req-test-1', true)");
      await db.query("update public.suppliers set notes = 'job' where id = $1", [s.a.supplier]);
      const { rows } = await db.query(
        "select actor_user_id, request_id from public.audit_log where record_id = $1 and action = 'UPDATE'",
        [s.a.supplier],
      );
      expect(rows[0]).toEqual({ actor_user_id: s.users.graceAdminA, request_id: "req-test-1" });
    });
  });
});
