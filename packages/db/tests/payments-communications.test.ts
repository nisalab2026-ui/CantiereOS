import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, insertRow, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Pagamenti attesi e registro comunicazioni (ADR-012). */
let db: Db;
let s: Seed;
let payA: string, payB: string, commA: string;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  payA = await insertRow(db, "payments", {
    tenant_id: s.tenantA,
    direction: "incoming",
    description: "SAL 1 condominio",
    reference_code: "FT 12/2026",
    amount_cents: 1_250_000,
    due_date: "2026-11-10",
    customer_id: s.a.customer,
  });
  payB = await insertRow(db, "payments", {
    tenant_id: s.tenantB,
    direction: "outgoing",
    description: "Noleggio ponteggi",
    amount_cents: 80_000,
    due_date: "2026-12-01",
    supplier_id: s.b.supplier,
  });
  commA = await insertRow(db, "communications", {
    tenant_id: s.tenantA,
    channel: "phone",
    direction: "inbound",
    subject: "Richiesta preventivo",
    customer_id: s.a.customer,
    follow_up_date: "2026-11-20",
  });
});
afterAll(async () => {
  await db.end();
});

describe("Pagamenti attesi", () => {
  it("registrare il pagamento: data, importo, chi e quando li decide il database", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query(
        `update public.payments set status = 'paid', recorded_by = $2 where id = $1
         returning paid_on, paid_amount_cents, recorded_by, recorded_at`,
        [payA, s.users.aliceOwnerA],
      );
      expect(rows[0].paid_amount_cents).toBe("1250000");
      expect(rows[0].paid_on).toBeInstanceOf(Date);
      expect(rows[0].recorded_by).toBe(s.users.carolOfficeA);
      expect(rows[0].recorded_at).toBeInstanceOf(Date);
      const back = await db.query(
        "update public.payments set status = 'open' where id = $1 returning paid_on, recorded_by",
        [payA],
      );
      expect(back.rows[0]).toEqual({ paid_on: null, recorded_by: null });
    });
  });

  it("importo intero positivo, solo EUR, controparte coerente con la direzione", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      for (const [sql, params] of [
        [
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date) values ($1, 'incoming', 'x', 0, current_date)",
          [s.tenantA],
        ],
        [
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date, currency) values ($1, 'incoming', 'x', 100, current_date, 'USD')",
          [s.tenantA],
        ],
        [
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date, supplier_id) values ($1, 'incoming', 'x', 100, current_date, $2)",
          [s.tenantA, s.a.supplier],
        ],
      ] as const) {
        await db.query("savepoint p");
        await expectPgError(db.query(sql, [...params]), "23514");
        await db.query("rollback to savepoint p");
      }
    });
  });

  it("dati economici: solo titolare, amministrazione, ufficio e responsabile operativo", async () => {
    for (const user of [
      s.users.aliceOwnerA,
      s.users.graceAdminA,
      s.users.carolOfficeA,
      s.users.martaManagerA,
    ]) {
      await asUser(db, user, async () => {
        const { rows } = await db.query("select id from public.payments");
        expect(rows.map((r) => r.id)).toEqual([payA]);
      });
    }
    for (const user of [s.users.bobTechA, s.users.victorViewerA]) {
      await asUser(db, user, async () => {
        const { rows } = await db.query("select id from public.payments");
        expect(rows).toHaveLength(0);
      });
    }
    await asUser(db, s.users.martaManagerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date) values ($1, 'incoming', 'x', 100, current_date)",
          [s.tenantA],
        ),
        "42501",
      );
    });
  });

  it("isolamento: un'altra azienda non legge né modifica", async () => {
    await asUser(db, s.users.daveOwnerB, async () => {
      const { rows } = await db.query("select id from public.payments");
      expect(rows.map((r) => r.id)).toEqual([payB]);
      const u = await db.query("update public.payments set description = 'x' where id = $1", [
        payA,
      ]);
      expect(u.rowCount).toBe(0);
      await expectPgError(
        db.query(
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date) values ($1, 'incoming', 'x', 100, current_date)",
          [s.tenantA],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      await expectPgError(
        db.query(
          "insert into public.payments (tenant_id, direction, description, amount_cents, due_date, customer_id) values ($1, 'incoming', 'x', 100, current_date, $2)",
          [s.tenantA, s.b.customer],
        ),
        "23503",
      );
    });
  });

  it("cronologia del cliente: il pagamento compare solo a chi può vederlo", async () => {
    const q = "select table_name from app.record_history('customers', $1)";
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query(q, [s.a.customer]);
      expect(rows.map((r) => r.table_name)).toContain("payments");
    });
    await asUser(db, s.users.victorViewerA, async () => {
      const { rows } = await db.query(q, [s.a.customer]);
      expect(rows.map((r) => r.table_name)).not.toContain("payments");
    });
  });
});

describe("Registro comunicazioni", () => {
  it("ufficio e capocantiere scrivono, il tecnico non vede", async () => {
    await asUser(db, s.users.victorViewerA, async () => {
      const id = await db.query(
        "insert into public.communications (tenant_id, channel, direction, subject) values ($1, 'meeting', 'outbound', 'Riunione di cantiere') returning id, created_by",
        [s.tenantA],
      );
      expect(id.rows[0].created_by).toBe(s.users.victorViewerA);
    });
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query("select id from public.communications");
      expect(rows).toHaveLength(0);
      await expectPgError(
        db.query(
          "insert into public.communications (tenant_id, channel, direction, subject) values ($1, 'phone', 'inbound', 'x')",
          [s.tenantA],
        ),
        "42501",
      );
    });
  });

  it("un solo soggetto; richiamo fatto solo se previsto; isolamento", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      await expectPgError(
        db.query(
          "insert into public.communications (tenant_id, channel, direction, subject, customer_id, supplier_id) values ($1, 'email', 'inbound', 'x', $2, $3)",
          [s.tenantA, s.a.customer, s.a.supplier],
        ),
        "23514",
      );
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      await expectPgError(
        db.query(
          "insert into public.communications (tenant_id, channel, direction, subject, follow_up_done) values ($1, 'email', 'inbound', 'x', true)",
          [s.tenantA],
        ),
        "23514",
      );
    });
    await asUser(db, s.users.daveOwnerB, async () => {
      const { rows } = await db.query("select id from public.communications where id = $1", [
        commA,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it("eliminazione fisica solo con communications.delete (MFA)", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const r = await db.query("delete from public.communications where id = $1", [commA]);
      expect(r.rowCount).toBe(0);
    });
    await asUser(
      db,
      s.users.aliceOwnerA,
      async () => {
        const r = await db.query("delete from public.communications where id = $1", [commA]);
        expect(r.rowCount).toBe(0);
      },
      "aal1",
    );
  });

  it("esportazioni: sezioni nuove con il permesso della tabella", async () => {
    const { rows } = await db.query(
      "select app.export_section_permission('payments') p, app.export_section_permission('communications') c",
    );
    expect(rows[0]).toEqual({ p: "payments.read", c: "communications.read" });
  });
});
