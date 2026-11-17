import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Registro delle esportazioni: chi può esportare, chi può leggere, immutabilità. */
let db: Db;
let s: Seed;

const insert = (tenantId: string, section: string) =>
  db.query(
    `insert into public.data_exports (tenant_id, section, filters, row_count)
     values ($1, $2, '{"q":"rossi"}', 3)`,
    [tenantId, section],
  );

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

describe("data_exports", () => {
  it("chi legge una sezione può registrarne l'esportazione, con autore dal server", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await insert(s.tenantA, "customers");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await insert(s.tenantA, "deadlines");
      const { rows } = await db.query<{ created_by: string; row_count: number }>(
        "select created_by, row_count from public.data_exports where section = 'deadlines'",
      );
      expect(rows).toEqual([{ created_by: s.users.aliceOwnerA, row_count: 3 }]);
      // finisce nel registro attività
      const { rowCount } = await db.query(
        "select 1 from public.audit_log where table_name = 'data_exports' and action = 'INSERT' and actor_user_id = $1",
        [s.users.aliceOwnerA],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("senza il permesso di lettura della sezione l'esportazione è negata", async () => {
    // il tecnico non ha audit.read: non può esportare il registro
    await asUser(db, s.users.bobTechA, () => expectPgError(insert(s.tenantA, "audit"), "42501"));
    // nessuno esporta per un'altra azienda
    await asUser(db, s.users.bobTechA, () =>
      expectPgError(insert(s.tenantB, "customers"), "42501"),
    );
    await asUser(db, s.users.outsider, () =>
      expectPgError(insert(s.tenantA, "customers"), "42501"),
    );
  });

  it("l'autore non si può falsificare", async () => {
    // created_by non è tra le colonne inseribili: anche se passato viene rifiutato o ignorato
    await asUser(db, s.users.aliceOwnerA, async () => {
      const r = await db
        .query(
          "insert into public.data_exports (tenant_id, section, row_count, created_by) values ($1, 'customers', 1, $2)",
          [s.tenantA, s.users.bobTechA],
        )
        .then(
          () => "ok",
          (e: { code: string }) => e.code,
        );
      expect(r).toBe("42501");
    });
  });

  it("le esportazioni si leggono solo con audit.read e sono immutabili", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await insert(s.tenantA, "customers");
      await expectPgError(db.query("update public.data_exports set row_count = 0"), "42501");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await insert(s.tenantA, "customers");
      await expectPgError(db.query("delete from public.data_exports"), "42501");
    });
    await asUser(db, s.users.bobTechA, async () => {
      await insert(s.tenantA, "customers");
      const { rowCount } = await db.query("select 1 from public.data_exports");
      expect(rowCount).toBe(0);
    });
  });

  it("l'owner senza MFA (aal1) non esporta il registro attività", async () => {
    await asUser(
      db,
      s.users.aliceOwnerA,
      () => expectPgError(insert(s.tenantA, "audit"), "42501"),
      "aal1",
    );
  });

  it("valori non ammessi sono rifiutati", async () => {
    // sezione sconosciuta: nessun permesso la copre (RLS) e il vincolo la rifiuta comunque
    await asUser(db, s.users.aliceOwnerA, () =>
      expectPgError(insert(s.tenantA, "payroll"), "42501"),
    );
    await expectPgError(insert(s.tenantA, "payroll"), "23514"); // anche da superuser
  });
});
