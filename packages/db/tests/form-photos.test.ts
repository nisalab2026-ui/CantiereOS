import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, insertRow, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Foto nei moduli (ADR-013): schede nel database, file nello storage privato. */
let db: Db;
let s: Seed;
let tplA: string, verA: string, subA: string;
const def = { sections: [{ id: "s1", title: "Foto", fields: [] }] };

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  tplA = await insertRow(db, "form_templates", {
    tenant_id: s.tenantA,
    name: "Rapportino",
    draft_definition: def,
    current_version: 1,
  });
  verA = await insertRow(db, "form_template_versions", {
    tenant_id: s.tenantA,
    template_id: tplA,
    version: 1,
    name: "Rapportino",
    definition: def,
  });
  subA = await insertRow(db, "form_submissions", {
    tenant_id: s.tenantA,
    template_id: tplA,
    template_version_id: verA,
    title: "Rapportino 17/11",
  });
});
afterAll(async () => {
  await db.end();
});

const addPhoto = (tenant: string, sub: string, extra = "") =>
  db.query(
    `insert into public.form_submission_files (tenant_id, submission_id, field_id, original_name${extra ? ", status, mime_type, size_bytes" : ""})
     values ($1, $2, 'foto', 'cantiere.jpg'${extra ? ", 'ready', 'image/jpeg', 1000" : ""})
     returning id, status, storage_key, created_by`,
    [tenant, sub],
  );

describe("Foto nei moduli", () => {
  it("chi compila aggiunge una foto: chiave e autore li decide il database, parte 'in attesa'", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await addPhoto(s.tenantA, subA, "forza ready");
      expect(rows[0].status).toBe("pending");
      expect(rows[0].created_by).toBe(s.users.bobTechA);
      expect(rows[0].storage_key).toBe(`${s.tenantA}/${subA}/${rows[0].id}`);
    });
  });

  it("verifica una sola volta: pending → ready con tipo e dimensione, poi immutabile", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await addPhoto(s.tenantA, subA);
      const id = rows[0].id;
      await db.query("savepoint p");
      await expectPgError(
        db.query("update public.form_submission_files set status = 'ready' where id = $1", [id]),
        "23514",
      );
      await db.query("rollback to savepoint p");
      await db.query(
        `update public.form_submission_files set status = 'ready', mime_type = 'image/jpeg', size_bytes = 2048
          where id = $1`,
        [id],
      );
      await db.query("savepoint q");
      await expectPgError(
        db.query("update public.form_submission_files set size_bytes = 1 where id = $1", [id]),
        "42501",
      );
      await db.query("rollback to savepoint q");
      await expectPgError(
        db.query("update public.form_submission_files set status = 'pending' where id = $1", [id]),
        "42501",
      );
    });
  });

  it("tipi ammessi solo immagini; niente eliminazione fisica", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await addPhoto(s.tenantA, subA);
      await db.query("savepoint p");
      await expectPgError(
        db.query(
          `update public.form_submission_files set status = 'ready', mime_type = 'application/pdf', size_bytes = 9
            where id = $1`,
          [rows[0].id],
        ),
        "23514",
      );
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query("delete from public.form_submission_files where id = $1", [rows[0].id]),
        "42501",
      );
    });
  });

  it("modulo chiuso: niente foto nuove né rimozioni", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await addPhoto(s.tenantA, subA);
      await db.query("update public.form_submissions set status = 'completed' where id = $1", [
        subA,
      ]);
      await db.query("savepoint p");
      await expectPgError(addPhoto(s.tenantA, subA), "42501");
      await db.query("rollback to savepoint p");
      await expectPgError(
        db.query("update public.form_submission_files set deleted_at = now() where id = $1", [
          rows[0].id,
        ]),
        "42501",
      );
    });
  });

  it("un'altra azienda non vede né aggiunge foto ai moduli di A", async () => {
    const photo = await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await addPhoto(s.tenantA, subA);
      return rows[0].id as string;
    });
    expect(photo).toBeTruthy();
    await insertRow(db, "form_submission_files", {
      tenant_id: s.tenantA,
      submission_id: subA,
      field_id: "foto",
      original_name: "visibile.jpg",
    });
    await asUser(db, s.users.daveOwnerB, async () => {
      const { rows } = await db.query("select id from public.form_submission_files");
      expect(rows).toHaveLength(0);
      await db.query("savepoint p");
      await expectPgError(addPhoto(s.tenantA, subA), "42501");
      await db.query("rollback to savepoint p");
      // con il proprio tenant ma il modulo di A: la FK composta lo impedisce
      await expectPgError(addPhoto(s.tenantB, subA), "23514");
    });
  });
});
