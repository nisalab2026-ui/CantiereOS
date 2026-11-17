import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, insertRow, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Moduli compilabili (ADR-013): modelli, versioni immutabili, compilazioni bloccate. */
let db: Db;
let s: Seed;
let tplA: string, verA: string, tplB: string, verB: string, subA: string;
const def = { sections: [{ id: "s1", title: "Controlli", fields: [] }] };

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  tplA = await insertRow(db, "form_templates", {
    tenant_id: s.tenantA,
    name: "Ispezione linea vita",
    category: "inspection",
    draft_definition: def,
    current_version: 1,
  });
  verA = await insertRow(db, "form_template_versions", {
    tenant_id: s.tenantA,
    template_id: tplA,
    version: 1,
    name: "Ispezione linea vita",
    definition: def,
  });
  tplB = await insertRow(db, "form_templates", { tenant_id: s.tenantB, name: "Verbale B" });
  verB = await insertRow(db, "form_template_versions", {
    tenant_id: s.tenantB,
    template_id: tplB,
    version: 1,
    name: "Verbale B",
    definition: def,
  });
  subA = await insertRow(db, "form_submissions", {
    tenant_id: s.tenantA,
    template_id: tplA,
    template_version_id: verA,
    title: "Ispezione copertura",
    subject_code: "LV-001",
    customer_id: s.a.customer,
    site_id: s.a.site,
  });
});
afterAll(async () => {
  await db.end();
});

const insertSub = (tenant: string, tpl: string, ver: string, extra = "", params: unknown[] = []) =>
  db.query(
    `insert into public.form_submissions (tenant_id, template_id, template_version_id, title${extra ? `, ${extra.split("=")[0]}` : ""})
     values ($1, $2, $3, 'x'${extra ? ", $4" : ""}) returning id, created_by`,
    [tenant, tpl, ver, ...params],
  );

describe("Modelli e versioni", () => {
  it("una versione pubblicata non si modifica né si elimina, nemmeno dal titolare", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await db.query("savepoint p");
      await expectPgError(
        db.query("update public.form_template_versions set definition = '{}' where id = $1", [
          verA,
        ]),
        "42501",
      );
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query("delete from public.form_template_versions where id = $1", [verA]),
        "42501",
      );
    });
  });

  it("i modelli li gestisce chi ha forms.manage (con MFA); il tecnico no", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const r = await db.query(
        "update public.form_templates set description = 'Appendice C' where id = $1",
        [tplA],
      );
      expect(r.rowCount).toBe(1);
    });
    await asUser(
      db,
      s.users.carolOfficeA,
      async () => {
        const r = await db.query(
          "update public.form_templates set description = 'x' where id = $1",
          [tplA],
        );
        expect(r.rowCount).toBe(0);
      },
      "aal1",
    );
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query("select id from public.form_templates");
      expect(rows.map((r) => r.id)).toEqual([tplA]);
      await expectPgError(
        db.query("insert into public.form_templates (tenant_id, name) values ($1, 'Mio')", [
          s.tenantA,
        ]),
        "42501",
      );
    });
  });

  it("definizione: solo oggetti JSON; nome unico nell'azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await db.query("savepoint p");
      await expectPgError(
        db.query(
          "insert into public.form_templates (tenant_id, name, draft_definition) values ($1, 'Altro', '[]')",
          [s.tenantA],
        ),
        "23514",
      );
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query(
          "insert into public.form_templates (tenant_id, name) values ($1, 'ispezione LINEA vita')",
          [s.tenantA],
        ),
        "23505",
      );
    });
  });
});

describe("Compilazioni", () => {
  it("il tecnico compila e chiude; chi e quando lo decide il database", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const ins = await insertSub(s.tenantA, tplA, verA);
      expect(ins.rows[0].created_by).toBe(s.users.bobTechA);
      const { rows } = await db.query(
        `update public.form_submissions set status = 'completed', completed_by = $2,
           data = '{"esito": "positivo"}' where id = $1 returning completed_by, completed_at`,
        [ins.rows[0].id, s.users.aliceOwnerA],
      );
      expect(rows[0].completed_by).toBe(s.users.bobTechA);
      expect(rows[0].completed_at).toBeInstanceOf(Date);
    });
  });

  it("modulo chiuso: niente modifiche; riapre solo chi ha forms.manage", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query(
        "update public.form_submissions set status = 'completed' where id = $1 returning status",
        [subA],
      );
      expect(rows[0].status).toBe("completed");
      await db.query("savepoint p");
      await expectPgError(
        db.query("update public.form_submissions set data = '{\"a\": 1}' where id = $1", [subA]),
        "42501",
      );
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query("update public.form_submissions set status = 'draft' where id = $1", [subA]),
        "42501",
      );
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      await db.query("update public.form_submissions set status = 'completed' where id = $1", [
        subA,
      ]);
      const { rows } = await db.query(
        "update public.form_submissions set status = 'draft' where id = $1 returning completed_at",
        [subA],
      );
      expect(rows[0].completed_at).toBeNull();
    });
  });

  it("versione dello stesso modello, sede dello stesso cliente, modello non sostituibile", async () => {
    const other = await insertRow(db, "customers", {
      tenant_id: s.tenantA,
      display_name: "Altro cliente",
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      const tpl2 = await db.query(
        "insert into public.form_templates (tenant_id, name) values ($1, 'Secondo') returning id",
        [s.tenantA],
      );
      await db.query("savepoint p");
      await expectPgError(insertSub(s.tenantA, tpl2.rows[0].id, verA), "23514");
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query(
          `insert into public.form_submissions (tenant_id, template_id, template_version_id, title, customer_id, site_id)
           values ($1, $2, $3, 'x', $4, $5)`,
          [s.tenantA, tplA, verA, other, s.a.site],
        ),
        "23514",
      );
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query("update public.form_submissions set template_id = $2 where id = $1", [
          subA,
          tpl2.rows[0].id,
        ]),
        "42501",
      );
    });
  });

  it("isolamento: versioni e clienti di un'altra azienda non sono collegabili", async () => {
    await asUser(db, s.users.daveOwnerB, async () => {
      const { rows } = await db.query("select id from public.form_submissions");
      expect(rows).toHaveLength(0);
      const u = await db.query("update public.form_submissions set title = 'x' where id = $1", [
        subA,
      ]);
      expect(u.rowCount).toBe(0);
      await expectPgError(insertSub(s.tenantA, tplA, verA), "42501");
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      await db.query("savepoint p");
      // la versione deve essere della stessa azienda: rifiutata dal controllo del trigger
      await expectPgError(insertSub(s.tenantA, tplB, verB), "23514");
      await db.query("rollback to savepoint p");
      await expectPgError(insertSub(s.tenantA, tplA, verA, "customer_id", [s.b.customer]), "23503");
    });
  });

  it("il capocantiere legge; cronologia nella scheda del cliente", async () => {
    await asUser(db, s.users.victorViewerA, async () => {
      const { rows } = await db.query("select id from public.form_submissions where id = $1", [
        subA,
      ]);
      expect(rows).toHaveLength(1);
      const h = await db.query("select table_name from app.record_history('customers', $1)", [
        s.a.customer,
      ]);
      expect(h.rows.map((r) => r.table_name)).toContain("form_submissions");
    });
    const { rows } = await db.query("select app.export_section_permission('forms') p");
    expect(rows[0].p).toBe("forms.read");
  });
});
