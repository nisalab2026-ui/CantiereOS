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
      await db.query("update public.business_partners set city = 'Bergamo' where id = $1", [
        s.partners.a1,
      ]);
      const { rows } = await db.query(
        `select tenant_id, actor_user_id, action, changed_fields
           from public.audit_log
          where table_name = 'business_partners' and record_id = $1 and action = 'UPDATE'`,
        [s.partners.a1],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: s.tenantA,
        actor_user_id: s.users.aliceOwnerA,
        action: "UPDATE",
      });
      expect(rows[0].changed_fields).toEqual(["city", "updated_at"]);
    });
  });

  it("chi non ha audit.read non vede il registro", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rowCount } = await db.query("select 1 from public.audit_log");
      expect(rowCount).toBe(0);
    });
  });

  it("gli utenti non possono modificare né cancellare il registro", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(db.query("update public.audit_log set action = 'X'"), "42501");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(db.query("delete from public.audit_log"), "42501");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("insert into public.audit_log (tenant_id, action) values ($1, 'FAKE')", [
          s.tenantA,
        ]),
        "42501",
      );
    });
  });

  it("nemmeno il service_role può alterare il registro", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(db.query("update public.audit_log set action = 'X'"), "42501");
    });
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(db.query("delete from public.audit_log"), "42501");
    });
  });

  it("le azioni del server registrano l'attore dichiarato", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await db.query("select set_config('app.actor_user_id', $1, true)", [s.users.graceAdminA]);
      await db.query("select set_config('app.request_id', 'req-test-1', true)");
      await db.query("update public.business_partners set notes = 'job' where id = $1", [
        s.partners.a2,
      ]);
      const { rows } = await db.query(
        "select actor_user_id, request_id from public.audit_log where record_id = $1 and action = 'UPDATE'",
        [s.partners.a2],
      );
      expect(rows[0]).toEqual({ actor_user_id: s.users.graceAdminA, request_id: "req-test-1" });
    });
  });
});
