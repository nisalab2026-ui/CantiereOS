import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  asUser,
  connect,
  createUser,
  expectPgError,
  insertRow,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Archivio documentale: isolamento, riservatezza, versioni immutabili, download tracciati. */
let db: Db;
let s: Seed;
let viewerA: string;
let docA: string; // contratto del cliente di A, con una versione pronta
let readyA: string;
let secretA: string; // documento riservato (identità) del dipendente di A
let docB: string;
let folderA: string;

async function readyVersion(tenantId: string, documentId: string, name: string): Promise<string> {
  const id = await insertRow(db, "document_versions", {
    tenant_id: tenantId,
    document_id: documentId,
    original_name: name,
  });
  await db.query(
    "update public.document_versions set status = 'ready', mime_type = 'application/pdf', size_bytes = 1234 where id = $1",
    [id],
  );
  await db.query("update public.documents set current_version_id = $1 where id = $2", [
    id,
    documentId,
  ]);
  return id;
}

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  viewerA = await createUser(db, "doc-viewer");
  await addMember(db, s.tenantA, viewerA, "viewer");
  folderA = await insertRow(db, "document_folders", { tenant_id: s.tenantA, name: "Contratti" });
  docA = await insertRow(db, "documents", {
    tenant_id: s.tenantA,
    folder_id: folderA,
    title: "Contratto manutenzione",
    category: "contract",
    customer_id: s.a.customer,
  });
  readyA = await readyVersion(s.tenantA, docA, "contratto.pdf");
  secretA = await insertRow(db, "documents", {
    tenant_id: s.tenantA,
    title: "Carta d'identità",
    category: "identity",
    is_confidential: true,
    employee_id: s.a.employee,
  });
  docB = await insertRow(db, "documents", {
    tenant_id: s.tenantB,
    title: "Verbale B",
    category: "report",
  });
  await readyVersion(s.tenantB, docB, "verbale.pdf");
});

afterAll(async () => {
  await db.end();
});

const ids = async (sql: string) =>
  (await db.query<{ id: string }>(sql)).rows.map((r) => r.id).sort();

describe("Documenti: isolamento e permessi", () => {
  it("ogni azienda vede solo i propri documenti e le proprie versioni", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      expect(await ids("select id from public.documents")).toEqual([docA, secretA].sort());
      expect(await ids("select document_id as id from public.document_versions")).toEqual([docA]);
    });
    await asUser(db, s.users.tomTechB, async () => {
      expect(await ids("select id from public.documents")).toEqual([docB]);
    });
    await asUser(db, s.users.outsider, async () => {
      expect(await ids("select id from public.documents")).toEqual([]);
      expect(await ids("select id from public.document_versions")).toEqual([]);
      expect(await ids("select id from public.document_folders")).toEqual([]);
    });
  });

  it("tecnico e sola consultazione leggono ma non caricano", async () => {
    for (const u of [s.users.bobTechA, viewerA]) {
      await asUser(db, u, async () => {
        expect(await ids("select id from public.documents")).toEqual([docA]);
      });
      await asUser(db, u, () =>
        expectPgError(
          db.query("insert into public.documents (tenant_id, title) values ($1, 'x')", [s.tenantA]),
          "42501",
        ),
      );
      await asUser(db, u, () =>
        expectPgError(
          db.query(
            "insert into public.document_versions (tenant_id, document_id, original_name) values ($1, $2, 'x.pdf')",
            [s.tenantA, docA],
          ),
          "42501",
        ),
      );
    }
  });

  it("i documenti riservati richiedono il permesso dedicato con MFA", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      expect(await ids("select id from public.documents")).toContain(secretA);
    });
    await asUser(db, s.users.martaManagerA, async () => {
      expect(await ids("select id from public.documents")).not.toContain(secretA);
      // non può nemmeno crearne uno riservato
      await expectPgError(
        db.query(
          "insert into public.documents (tenant_id, title, is_confidential) values ($1, 'x', true)",
          [s.tenantA],
        ),
        "42501",
      );
    });
    await asUser(
      db,
      s.users.aliceOwnerA,
      async () => {
        expect(await ids("select id from public.documents")).not.toContain(secretA);
      },
      "aal1",
    );
  });

  it("il collegamento a un soggetto di un'altra azienda è rifiutato", async () => {
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query(
          "insert into public.documents (tenant_id, title, customer_id) values ($1, 'x', $2)",
          [s.tenantA, s.b.customer],
        ),
        "23503",
      ),
    );
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query(
          "insert into public.documents (tenant_id, title, customer_id, employee_id) values ($1, 'x', $2, $3)",
          [s.tenantA, s.a.customer, s.a.employee],
        ),
        "23514",
      ),
    );
  });
});

describe("Versioni", () => {
  it("numero progressivo e chiave dello storage decisi dal database", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{
        id: string;
        version_no: number;
        storage_key: string;
        status: string;
      }>(
        `insert into public.document_versions (tenant_id, document_id, original_name)
         values ($1, $2, 'contratto-v2.pdf') returning id, version_no, storage_key, status`,
        [s.tenantA, docA],
      );
      expect(rows[0]!.version_no).toBe(2);
      expect(rows[0]!.status).toBe("pending");
      expect(rows[0]!.storage_key).toBe(`${s.tenantA}/${docA}/${rows[0]!.id}`);
    });
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query(
          "insert into public.document_versions (tenant_id, document_id, original_name, storage_key) values ($1, $2, 'x', 'altra/chiave')",
          [s.tenantA, docA],
        ),
        "428C9" /* colonna generata: non si sceglie */,
      ),
    );
    // stato "pronto" non si può dichiarare all'inserimento
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ status: string }>(
        `insert into public.document_versions (tenant_id, document_id, original_name)
         values ($1, $2, 'x.pdf') returning status`,
        [s.tenantA, docA],
      );
      expect(rows[0]!.status).toBe("pending");
    });
  });

  it("una versione verificata è immutabile e non si cancella", async () => {
    await asUser(db, s.users.aliceOwnerA, () =>
      expectPgError(
        db.query("update public.document_versions set notes = 'x' where id = $1", [readyA]),
        "42501",
      ),
    );
    await asUser(db, s.users.aliceOwnerA, () =>
      expectPgError(
        db.query("delete from public.document_versions where id = $1", [readyA]),
        "42501",
      ),
    );
  });

  it("la versione corrente deve essere verificata", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.document_versions (tenant_id, document_id, original_name) values ($1, $2, 'y.pdf') returning id",
        [s.tenantA, docA],
      );
      await expectPgError(
        db.query("update public.documents set current_version_id = $1 where id = $2", [
          rows[0]!.id,
          docA,
        ]),
        "23514",
      );
    });
  });

  it("le cartelle non formano cicli", async () => {
    const child = await insertRow(db, "document_folders", {
      tenant_id: s.tenantA,
      parent_id: folderA,
      name: "2026",
    });
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query("update public.document_folders set parent_id = $1 where id = $2", [
          child,
          folderA,
        ]),
        "23514",
      ),
    );
  });
});

describe("Download e storico", () => {
  it("si registra il download solo di versioni pronte e visibili", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await db.query(
        "insert into public.document_downloads (tenant_id, document_id, version_id) values ($1, $2, $3)",
        [s.tenantA, docA, readyA],
      );
      // il tecnico non legge il registro dei download
      expect(await ids("select id from public.document_downloads")).toEqual([]);
    });
    await asUser(db, s.users.tomTechB, () =>
      expectPgError(
        db.query(
          "insert into public.document_downloads (tenant_id, document_id, version_id) values ($1, $2, $3)",
          [s.tenantA, docA, readyA],
        ),
        "42501",
      ),
    );
    await asUser(db, s.users.aliceOwnerA, () =>
      expectPgError(
        db.query("update public.document_downloads set disposition = 'preview'"),
        "42501",
      ),
    );
  });

  it("lo storico del documento include le versioni; quello riservato resta nascosto", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ table_name: string }>(
        "select table_name from app.record_history('documents', $1)",
        [docA],
      );
      expect(new Set(rows.map((r) => r.table_name))).toEqual(
        new Set(["documents", "document_versions"]),
      );
      const secret = await db.query("select 1 from app.record_history('documents', $1)", [secretA]);
      expect(secret.rowCount).toBe(0);
      // nello storico del dipendente non compare il documento riservato
      const emp = await db.query<{ record_id: string }>(
        "select record_id from app.record_history('employees', $1) where table_name = 'documents'",
        [s.a.employee],
      );
      expect(emp.rows.map((r) => r.record_id)).not.toContain(secretA);
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      const emp = await db.query<{ record_id: string }>(
        "select record_id from app.record_history('employees', $1) where table_name = 'documents'",
        [s.a.employee],
      );
      expect(emp.rows.map((r) => r.record_id)).toContain(secretA);
    });
  });
});
