import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, insertRow, type Db } from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Attività assegnabili e commenti interni (ADR-011). */
let db: Db;
let s: Seed;
let taskBob: string, taskCarol: string, confidentialDoc: string;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  taskBob = await insertRow(db, "tasks", {
    tenant_id: s.tenantA,
    title: "Sopralluogo caldaia",
    assignee_user_id: s.users.bobTechA,
    customer_id: s.a.customer,
    due_date: "2026-12-01",
  });
  taskCarol = await insertRow(db, "tasks", {
    tenant_id: s.tenantA,
    title: "Preparare preventivo",
    assignee_user_id: s.users.carolOfficeA,
  });
  confidentialDoc = await insertRow(db, "documents", {
    tenant_id: s.tenantA,
    title: "Busta paga",
    category: "other",
    is_confidential: true,
  });
});
afterAll(async () => {
  await db.end();
});

describe("Attività", () => {
  it("l'assegnatario riceve una notifica, una sola volta", async () => {
    const { rows } = await db.query(
      "select kind, link from public.notifications where user_id = $1 and dedupe_key like 'task.assigned:%'",
      [s.users.bobTechA],
    );
    expect(rows).toEqual([{ kind: "tasks.assigned", link: `/app/attivita/${taskBob}` }]);
  });

  it("il tecnico completa la propria attività; chi e quando lo decide il database", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const r = await db.query(
        "update public.tasks set status = 'done', completion_notes = 'fatto', completed_by = $2 where id = $1 returning completed_by, completed_at",
        [taskBob, s.users.aliceOwnerA],
      );
      expect(r.rows[0].completed_by).toBe(s.users.bobTechA);
      expect(r.rows[0].completed_at).toBeInstanceOf(Date);
    });
  });

  it("il tecnico non cambia altro che stato e note, e non tocca le attività altrui", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("update public.tasks set title = 'altro' where id = $1", [taskBob]),
        "42501",
      );
    });
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("update public.tasks set assignee_user_id = $2 where id = $1", [
          taskBob,
          s.users.carolOfficeA,
        ]),
        "42501",
      );
    });
    await asUser(db, s.users.bobTechA, async () => {
      const r = await db.query("update public.tasks set status = 'done' where id = $1", [
        taskCarol,
      ]);
      expect(r.rowCount).toBe(0);
    });
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("insert into public.tasks (tenant_id, title) values ($1, 'x')", [s.tenantA]),
        "42501",
      );
    });
  });

  it("chi ha tasks.write crea e riassegna; un'altra azienda non vede nulla", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      await db.query(
        "insert into public.tasks (tenant_id, title, assignee_user_id) values ($1, 'Ordine materiale', $2)",
        [s.tenantA, s.users.bobTechA],
      );
      const r = await db.query("update public.tasks set title = 'Preventivo v2' where id = $1", [
        taskCarol,
      ]);
      expect(r.rowCount).toBe(1);
    });
    await asUser(db, s.users.daveOwnerB, async () => {
      const r = await db.query("select 1 from public.tasks where tenant_id = $1", [s.tenantA]);
      expect(r.rowCount).toBe(0);
      await expectPgError(
        db.query("insert into public.tasks (tenant_id, title) values ($1, 'x')", [s.tenantA]),
        "42501",
      );
    });
  });

  it("l'assegnatario deve essere membro della stessa azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.tasks (tenant_id, title, assignee_user_id) values ($1, 'x', $2)",
          [s.tenantA, s.users.daveOwnerB],
        ),
        "23503",
      );
    });
  });
});

describe("Commenti", () => {
  it("chi vede l'elemento commenta e legge; l'altra azienda no", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await db.query(
        "insert into public.comments (tenant_id, subject_table, subject_id, body) values ($1, 'tasks', $2, 'Serve la scala lunga')",
        [s.tenantA, taskBob],
      );
      const r = await db.query("select created_by from public.comments where subject_id = $1", [
        taskBob,
      ]);
      expect(r.rows).toEqual([{ created_by: s.users.bobTechA }]);
    });
    await asUser(db, s.users.daveOwnerB, async () => {
      const r = await db.query("select 1 from public.comments where tenant_id = $1", [s.tenantA]);
      expect(r.rowCount).toBe(0);
      await expectPgError(
        db.query(
          "insert into public.comments (tenant_id, subject_table, subject_id, body) values ($1, 'tasks', $2, 'x')",
          [s.tenantA, taskBob],
        ),
        "42501",
      );
    });
  });

  it("un commento su un elemento inesistente o di un'altra azienda è rifiutato", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.comments (tenant_id, subject_table, subject_id, body) values ($1, 'customers', $2, 'x')",
          [s.tenantA, s.b.customer],
        ),
        "42501",
      );
    });
  });

  it("i commenti di un documento riservato restano nascosti a chi non lo vede", async () => {
    await db.query(
      "insert into public.comments (tenant_id, subject_table, subject_id, body, created_by) values ($1, 'documents', $2, 'Importo da verificare', $3)",
      [s.tenantA, confidentialDoc, s.users.aliceOwnerA],
    );
    await asUser(db, s.users.martaManagerA, async () => {
      const r = await db.query("select 1 from public.comments where subject_id = $1", [
        confidentialDoc,
      ]);
      expect(r.rowCount).toBe(0);
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      const r = await db.query("select 1 from public.comments where subject_id = $1", [
        confidentialDoc,
      ]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("solo l'autore modifica il testo; cancellazione solo logica", async () => {
    // inserito "a nome di" Carol (autore dichiarato come farebbe il server)
    await db.query("begin");
    await db.query("select set_config('app.actor_user_id', $1, true)", [s.users.carolOfficeA]);
    const id = await insertRow(db, "comments", {
      tenant_id: s.tenantA,
      subject_table: "customers",
      subject_id: s.a.customer,
      body: "Cliente richiama lunedì",
    });
    await db.query("commit");
    await asUser(db, s.users.martaManagerA, async () => {
      const r = await db.query("update public.comments set body = 'cambiato' where id = $1", [id]);
      expect(r.rowCount).toBe(0); // non è l'autore e non ha comments.delete
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      const r = await db.query(
        "update public.comments set body = 'Cliente richiama martedì' where id = $1 returning edited_at",
        [id],
      );
      expect(r.rows[0].edited_at).toBeInstanceOf(Date);
      await expectPgError(db.query("delete from public.comments where id = $1", [id]), "42501");
    });
    // l'amministratore (comments.delete, MFA) può nascondere un commento ma non riscriverlo
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query("update public.comments set body = 'riscritto' where id = $1", [id]),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const r = await db.query(
        "update public.comments set deleted_at = now() where id = $1 returning deleted_by",
        [id],
      );
      expect(r.rows[0].deleted_by).toBe(s.users.graceAdminA);
    });
    await asUser(
      db,
      s.users.graceAdminA,
      async () => {
        const r = await db.query("update public.comments set deleted_at = now() where id = $1", [
          id,
        ]);
        expect(r.rowCount).toBe(0); // senza MFA niente moderazione
      },
      "aal1",
    );
  });

  it("la cronologia del cliente include attività e commenti collegati", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rows } = await db.query<{ table_name: string }>(
        "select distinct table_name from app.record_history('customers', $1)",
        [s.a.customer],
      );
      const tables = rows.map((r) => r.table_name);
      expect(tables).toContain("tasks");
      expect(tables).toContain("comments");
    });
  });
});
