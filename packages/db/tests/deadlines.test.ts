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

/** Scadenziario, notifiche senza duplicati e cronologia per elemento. */
let db: Db;
let s: Seed;
let dueA: string; // scadenza di A collegata al cliente, responsabile Carol
let overdueA: string; // scadenza di A già superata, senza responsabile
let dueB: string;
let viewerA: string;

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
  viewerA = await createUser(db, "viewer");
  await addMember(db, s.tenantA, viewerA, "viewer");
  dueA = await insertRow(db, "deadlines", {
    tenant_id: s.tenantA,
    kind: "certification",
    title: "Patentino PLE",
    customer_id: s.a.customer,
    responsible_user_id: s.users.carolOfficeA,
    due_date: inDays(10),
  });
  overdueA = await insertRow(db, "deadlines", {
    tenant_id: s.tenantA,
    kind: "maintenance",
    title: "Revisione gru",
    due_date: inDays(-3),
  });
  dueB = await insertRow(db, "deadlines", {
    tenant_id: s.tenantB,
    kind: "inspection",
    title: "Verifica estintori",
    due_date: inDays(5),
  });
});

afterAll(async () => {
  await db.end();
});

describe("Scadenze: isolamento e permessi", () => {
  it("ogni azienda vede solo le proprie scadenze", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.deadlines");
      expect(rows.map((r) => r.id).sort()).toEqual([dueA, overdueA].sort());
    });
    await asUser(db, s.users.tomTechB, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.deadlines");
      expect(rows.map((r) => r.id)).toEqual([dueB]);
    });
    await asUser(db, s.users.outsider, async () => {
      const { rowCount } = await db.query("select 1 from public.deadlines");
      expect(rowCount).toBe(0);
    });
  });

  it("tecnico e sola consultazione leggono ma non scrivono", async () => {
    for (const u of [s.users.bobTechA, viewerA]) {
      await asUser(db, u, async () => {
        const { rowCount } = await db.query("select 1 from public.deadlines where id = $1", [dueA]);
        expect(rowCount).toBe(1);
      });
      await asUser(db, u, () =>
        expectPgError(
          db.query(
            "insert into public.deadlines (tenant_id, kind, title, due_date) values ($1, 'other', 'x', current_date)",
            [s.tenantA],
          ),
          "42501",
        ),
      );
      await asUser(db, u, async () => {
        const r = await db.query("update public.deadlines set title = 'x' where id = $1", [dueA]);
        expect(r.rowCount).toBe(0);
      });
    }
  });

  it("l'ufficio crea e modifica, ma non può collegare un cliente di un'altra azienda", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const ok = await db.query(
        "insert into public.deadlines (tenant_id, kind, title, due_date, employee_id) values ($1, 'certification', 'Corso sicurezza', current_date + 60, $2)",
        [s.tenantA, s.a.employee],
      );
      expect(ok.rowCount).toBe(1);
      const up = await db.query(
        "update public.deadlines set title = 'Patentino PLE 2' where id = $1",
        [dueA],
      );
      expect(up.rowCount).toBe(1);
    });
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query(
          "insert into public.deadlines (tenant_id, kind, title, due_date, customer_id) values ($1, 'other', 'x', current_date, $2)",
          [s.tenantA, s.b.customer],
        ),
        "23503",
      ),
    );
    await asUser(db, s.users.carolOfficeA, () =>
      expectPgError(
        db.query(
          "insert into public.deadlines (tenant_id, kind, title, due_date) values ($1, 'other', 'x', current_date)",
          [s.tenantB],
        ),
        "42501",
      ),
    );
  });

  it("al massimo un soggetto collegato", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      await expectPgError(
        db.query(
          "insert into public.deadlines (tenant_id, kind, title, due_date, customer_id, employee_id) values ($1, 'other', 'x', current_date, $2, $3)",
          [s.tenantA, s.a.customer, s.a.employee],
        ),
        "23514",
      );
    });
  });

  it("chi completa e quando lo stabilisce il database", async () => {
    const id = await insertRow(db, "deadlines", {
      tenant_id: s.tenantA,
      kind: "other",
      title: "Da completare",
      due_date: today(),
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      await db.query(
        "update public.deadlines set status = 'done', completed_by = $2, completed_at = '2000-01-01' where id = $1",
        [id, s.users.aliceOwnerA],
      );
      const { rows } = await db.query<{ completed_by: string; completed_at: Date }>(
        "select completed_by, completed_at from public.deadlines where id = $1",
        [id],
      );
      expect(rows[0]!.completed_by).toBe(s.users.carolOfficeA);
      expect(rows[0]!.completed_at.getFullYear()).toBeGreaterThan(2020);
    });
  });

  it("eliminare richiede deadlines.delete con MFA", async () => {
    const id = await insertRow(db, "deadlines", {
      tenant_id: s.tenantA,
      kind: "other",
      title: "Da eliminare",
      due_date: today(),
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      const r = await db.query("delete from public.deadlines where id = $1", [id]);
      expect(r.rowCount).toBe(0);
    });
    await asUser(
      db,
      s.users.aliceOwnerA,
      async () => {
        const r = await db.query("delete from public.deadlines where id = $1", [id]);
        expect(r.rowCount).toBe(0);
      },
      "aal1",
    );
    await asUser(db, s.users.aliceOwnerA, async () => {
      const r = await db.query("update public.deadlines set deleted_at = now() where id = $1", [
        id,
      ]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("Notifiche delle scadenze", () => {
  it("assegnare un responsabile lo avvisa", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ kind: string; link: string }>(
        "select kind, link from public.notifications where kind = 'deadlines.assigned'",
      );
      expect(rows).toContainEqual({ kind: "deadlines.assigned", link: `/app/scadenze/${dueA}` });
    });
  });

  it("generazione idempotente: responsabile per la sua, chi scrive per quelle senza responsabile", async () => {
    // un membro può avviare la generazione; ripeterla non crea duplicati
    await asUser(db, s.users.bobTechA, async () => {
      const first = await db.query<{ n: number }>(
        "select app.generate_deadline_notifications($1) as n",
        [s.tenantA],
      );
      expect(first.rows[0]!.n).toBeGreaterThan(0);
      const second = await db.query<{ n: number }>(
        "select app.generate_deadline_notifications($1) as n",
        [s.tenantA],
      );
      expect(second.rows[0]!.n).toBe(0);
    });
    // come farebbe il job di sistema (committato)
    const sys = await db.query<{ n: number }>(
      "select app.generate_deadline_notifications($1) as n",
      [s.tenantA],
    );
    expect(sys.rows[0]!.n).toBeGreaterThan(0);
    const again = await db.query<{ n: number }>(
      "select app.generate_deadline_notifications($1) as n",
      [s.tenantA],
    );
    expect(again.rows[0]!.n).toBe(0);

    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ kind: string; link: string }>(
        "select kind, link from public.notifications where kind in ('deadlines.upcoming','deadlines.overdue')",
      );
      expect(rows).toContainEqual({ kind: "deadlines.upcoming", link: `/app/scadenze/${dueA}` });
      expect(rows).toContainEqual({ kind: "deadlines.overdue", link: `/app/scadenze/${overdueA}` });
    });
    // l'admin non è responsabile di dueA: riceve solo quella senza responsabile
    await asUser(db, s.users.graceAdminA, async () => {
      const { rows } = await db.query<{ link: string }>(
        "select link from public.notifications where kind in ('deadlines.upcoming','deadlines.overdue')",
      );
      const links = rows.map((r) => r.link);
      expect(links).toContain(`/app/scadenze/${overdueA}`);
      expect(links).not.toContain(`/app/scadenze/${dueA}`);
    });
    // il tecnico non può scrivere scadenze: nessun avviso
    await asUser(db, s.users.bobTechA, async () => {
      const { rowCount } = await db.query(
        "select 1 from public.notifications where kind like 'deadlines.%'",
      );
      expect(rowCount).toBe(0);
    });
  });

  it("non si possono generare avvisi per un'altra azienda", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("select app.generate_deadline_notifications($1)", [s.tenantB]),
        "42501",
      );
    });
  });
});

describe("Cronologia per elemento", () => {
  it("chi legge il cliente vede la sua storia e quella delle scadenze collegate", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ table_name: string; record_id: string }>(
        "select table_name, record_id from app.record_history('customers', $1)",
        [s.a.customer],
      );
      expect(rows.some((r) => r.table_name === "customers" && r.record_id === s.a.customer)).toBe(
        true,
      );
      expect(rows.some((r) => r.table_name === "deadlines" && r.record_id === dueA)).toBe(true);
    });
  });

  it("chi non legge le scadenze non le vede nella cronologia del cliente", async () => {
    // ruolo personalizzato con il solo permesso customers.read
    const role = await insertRow(db, "roles", {
      tenant_id: s.tenantA,
      key: "custom_solo_clienti",
      name: "Solo clienti",
    });
    await db.query(
      "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key = 'customers.read'",
      [role],
    );
    const reader = await createUser(db, "reader");
    await db.query(
      "insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
      [s.tenantA, reader, role],
    );
    await asUser(db, reader, async () => {
      const { rows } = await db.query<{ table_name: string }>(
        "select table_name from app.record_history('customers', $1)",
        [s.a.customer],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.table_name === "customers")).toBe(true);
    });
  });

  it("la cronologia di un'altra azienda è vuota e le tabelle non previste sono rifiutate", async () => {
    await asUser(db, s.users.tomTechB, async () => {
      const { rowCount } = await db.query("select 1 from app.record_history('customers', $1)", [
        s.a.customer,
      ]);
      expect(rowCount).toBe(0);
    });
    await asUser(db, s.users.tomTechB, () =>
      expectPgError(
        db.query("select 1 from app.record_history('memberships', $1)", [s.a.customer]),
        "22023",
      ),
    );
  });

  it("il ruolo Sola consultazione esiste e non ha permessi di scrittura", async () => {
    const { rows } = await db.query<{ key: string }>(
      `select p.key from public.role_permissions rp
         join public.roles r on r.id = rp.role_id and r.tenant_id is null and r.key = 'viewer'
         join public.permissions p on p.id = rp.permission_id`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.key.endsWith(".read"))).toBe(true);
  });
});
