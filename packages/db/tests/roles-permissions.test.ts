import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  asUser,
  become,
  becomeSuperuser,
  connect,
  createUser,
  expectPgError,
  tx,
  type Db,
} from "./helpers/db.js";
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

type UserKey = keyof Seed["users"];

/** Matrice attesa (azienda A): può leggere / può creare. */
const MATRIX: { user: UserKey; table: string; read: boolean; write: boolean }[] = [
  { user: "martaManagerA", table: "customers", read: true, write: true },
  { user: "martaManagerA", table: "employees", read: true, write: true },
  { user: "martaManagerA", table: "teams", read: true, write: true },
  { user: "carolOfficeA", table: "customers", read: true, write: true },
  { user: "carolOfficeA", table: "suppliers", read: true, write: true },
  { user: "carolOfficeA", table: "employees", read: true, write: false },
  { user: "carolOfficeA", table: "teams", read: true, write: false },
  { user: "bobTechA", table: "customers", read: true, write: false },
  { user: "bobTechA", table: "suppliers", read: false, write: false },
  { user: "bobTechA", table: "employees", read: true, write: false },
  { user: "victorViewerA", table: "suppliers", read: true, write: false },
  { user: "victorViewerA", table: "customers", read: true, write: false },
];

const INSERTS: Record<string, string> = {
  customers: "insert into public.customers (tenant_id, display_name) values ($1, 'Nuovo')",
  suppliers: "insert into public.suppliers (tenant_id, display_name) values ($1, 'Nuovo')",
  employees:
    "insert into public.employees (tenant_id, first_name, last_name) values ($1, 'N', 'U')",
  teams: "insert into public.teams (tenant_id, name) values ($1, 'Squadra nuova')",
};

describe("Permessi per ruolo", () => {
  it.each(MATRIX)("$user su $table: lettura=$read scrittura=$write", async (m) => {
    await asUser(db, s.users[m.user], async () => {
      const { rowCount } = await db.query(`select 1 from public.${m.table}`);
      expect((rowCount ?? 0) > 0).toBe(m.read);
    });
    await asUser(db, s.users[m.user], async () => {
      const insert = db.query(INSERTS[m.table]!, [s.tenantA]);
      if (m.write) {
        await expect(insert).resolves.toBeTruthy();
      } else {
        await expectPgError(insert, "42501");
      }
    });
  });

  it("l'ufficio non può eliminare definitivamente un cliente", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      const res = await db.query("delete from public.customers where id = $1", [s.a.customer]);
      expect(res.rowCount).toBe(0);
    });
  });

  it("un tecnico vede i referenti dei clienti ma non quelli dei fornitori", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.contacts");
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(s.a.customerContact);
      expect(ids).not.toContain(s.a.supplierContact);
    });
  });
});

describe("Gestione membri e prevenzione dell'escalation", () => {
  it("nessuno può modificare il proprio ruolo", async () => {
    for (const u of [s.users.bobTechA, s.users.graceAdminA]) {
      await asUser(db, u, async () => {
        const res = await db.query(
          "update public.memberships set role_id = (select id from public.roles where tenant_id is null and key = 'owner') where user_id = $1",
          [u],
        );
        expect(res.rowCount).toBe(0);
      });
    }
  });

  it("un admin non può nominare titolari né modificare un titolare", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          "update public.memberships set role_id = (select id from public.roles where tenant_id is null and key = 'owner') where tenant_id = $1 and user_id = $2",
          [s.tenantA, s.users.bobTechA],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const res = await db.query(
        "update public.memberships set status = 'suspended' where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.aliceOwnerA],
      );
      expect(res.rowCount).toBe(0);
    });
  });

  it("i nuovi membri nascono solo come invitati e invited_by non è falsificabile", async () => {
    const viewerRole = "(select id from public.roles where tenant_id is null and key = 'viewer')";
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          `insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, ${viewerRole}, 'active')`,
          [s.tenantA, s.users.outsider],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const { rows } = await db.query<{ invited_by: string }>(
        `insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, ${viewerRole}, 'invited') returning invited_by`,
        [s.tenantA, s.users.outsider],
      );
      expect(rows[0]!.invited_by).toBe(s.users.graceAdminA);
    });
  });

  it("l'invitato accetta il proprio invito e ottiene accesso", async () => {
    await asUser(db, s.users.ivanInvitedA, async () => {
      await db.query("select app.accept_invitation($1)", [s.tenantA]);
      const { rowCount } = await db.query("select 1 from public.customers");
      expect(rowCount).toBeGreaterThan(0);
    });
  });

  it("non si accetta un invito inesistente", async () => {
    await asUser(db, s.users.outsider, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [s.tenantA]), "P0002");
    });
  });

  it("un'azienda non può restare senza titolare attivo", async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      await db.query(
        "update public.memberships set role_id = (select id from public.roles where tenant_id is null and key = 'admin') where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.aliceOwnerA],
      );
      await expectPgError(db.query("commit"), "23514"); // vincolo differito
    } finally {
      await db.query("rollback");
    }
  });

  it("solo il server (service_role) può creare aziende", async () => {
    await asUser(db, s.users.outsider, async () => {
      await expectPgError(
        db.query("select app.create_tenant('X', 'x-tenant', $1, 'test', 1, null)", [
          s.users.outsider,
        ]),
        "42501",
      );
    });
  });
});

describe("Ruoli personalizzati", () => {
  it("un admin crea un ruolo personalizzato nella propria azienda", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.roles (tenant_id, key, name) values ($1, 'custom_magazziniere', 'Magazziniere') returning id",
        [s.tenantA],
      );
      const res = await db.query(
        "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key = 'suppliers.read'",
        [rows[0]!.id],
      );
      expect(res.rowCount).toBe(1);
    });
  });

  it("senza roles.manage non si creano ruoli", async () => {
    await asUser(db, s.users.martaManagerA, async () => {
      await expectPgError(
        db.query("insert into public.roles (tenant_id, key, name) values ($1, 'custom_x', 'X')", [
          s.tenantA,
        ]),
        "42501",
      );
    });
  });

  it("un ruolo personalizzato non può usare chiavi di sistema", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          "insert into public.roles (tenant_id, key, name) values ($1, 'owner', 'Finto titolare')",
          [s.tenantA],
        ),
        "23514",
      );
    });
  });

  it("i ruoli di sistema non si modificano dalle aziende", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const res = await db.query(
        "update public.roles set description = 'X' where tenant_id is null",
      );
      expect(res.rowCount).toBe(0);
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.role_permissions (role_id, permission_id) select r.id, p.id from public.roles r, public.permissions p where r.tenant_id is null and r.key = 'viewer' and p.key = 'customers.delete'",
        ),
        "42501",
      );
    });
  });

  it("non si concede a un ruolo un permesso che non si possiede", async () => {
    // Utente con un ruolo personalizzato che ha roles.manage ma non suppliers.write
    const rolemgr = await createUser(db, "rolemgr");
    const { rows } = await db.query<{ id: string }>(
      "insert into public.roles (tenant_id, key, name) values ($1, 'custom_rolemgr', 'Gestore ruoli') returning id",
      [s.tenantA],
    );
    await db.query(
      "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key in ('roles.manage', 'customers.read')",
      [rows[0]!.id],
    );
    await db.query(
      "insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
      [s.tenantA, rolemgr, rows[0]!.id],
    );

    await asUser(db, rolemgr, async () => {
      await expectPgError(
        db.query(
          "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key = 'suppliers.write'",
          [s.a.customRole],
        ),
        "42501",
      );
    });
    await asUser(db, rolemgr, async () => {
      const ok = await db.query(
        "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key = 'roles.manage'",
        [s.a.customRole],
      );
      expect(ok.rowCount).toBe(1);
    });
  });

  it("un ruolo personalizzato concede esattamente i suoi permessi", async () => {
    const custom = await createUser(db, "custom");
    await db.query(
      "insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
      [s.tenantA, custom, s.a.customRole],
    );
    await asUser(db, custom, async () => {
      const customers = await db.query("select 1 from public.customers");
      expect(customers.rowCount).toBeGreaterThan(0);
      const suppliers = await db.query("select 1 from public.suppliers");
      expect(suppliers.rowCount).toBe(0);
    });
  });

  it("i ruoli personalizzati di B non sono visibili ad A", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rowCount } = await db.query("select 1 from public.roles where id = $1", [
        s.b.customRole,
      ]);
      expect(rowCount).toBe(0);
    });
  });
});

describe("Abbonamenti e impostazioni", () => {
  it("il titolare vede l'abbonamento, il tecnico no", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rows } = await db.query<{ tenant_id: string }>(
        "select tenant_id from public.subscriptions",
      );
      expect(rows.map((r) => r.tenant_id)).toEqual([s.tenantA]);
    });
    await asUser(db, s.users.bobTechA, async () => {
      const { rowCount } = await db.query("select 1 from public.subscriptions");
      expect(rowCount).toBe(0);
    });
  });

  it("nessun utente può modificare l'abbonamento o lo stato dell'azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(db.query("update public.subscriptions set seats = 1000"), "42501");
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("update public.tenants set status = 'active' where id = $1", [s.tenantA]),
        "42501",
      );
    });
  });

  it("le impostazioni vengono create con l'azienda", async () => {
    const { rows } = await db.query<{ timezone: string; currency: string }>(
      "select timezone, currency from public.tenant_settings where tenant_id = $1",
      [s.tenantA],
    );
    expect(rows[0]).toEqual({ timezone: "Europe/Rome", currency: "EUR" });
  });

  it("solo chi ha tenant.manage modifica le impostazioni", async () => {
    await tx(db, async () => {
      await become(db, s.users.carolOfficeA);
      const office = await db.query("update public.tenant_settings set brand_color = '#000000'");
      expect(office.rowCount).toBe(0);
      await becomeSuperuser(db);
      await become(db, s.users.aliceOwnerA);
      const owner = await db.query("update public.tenant_settings set brand_color = '#0F172A'");
      expect(owner.rowCount).toBe(1);
    });
  });
});

describe("Utenti", () => {
  it("si vedono i colleghi, non gli utenti di altre aziende", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.users");
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(s.users.aliceOwnerA);
      expect(ids).not.toContain(s.users.daveOwnerB);
      expect(ids).not.toContain(s.users.outsider);
    });
  });

  it("si modifica solo il proprio profilo, e non l'email", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const res = await db.query("update public.users set full_name = 'X' where id = $1", [
        s.users.aliceOwnerA,
      ]);
      expect(res.rowCount).toBe(0);
    });
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(
        db.query("update public.users set email = 'x@y.invalid' where id = $1", [s.users.bobTechA]),
        "42501",
      );
    });
  });

  it("un dipendente può collegarsi solo a un membro della stessa azienda", async () => {
    const newcomer = await createUser(db, "newcomer");
    await addMember(db, s.tenantA, newcomer, "technician");
    await asUser(db, s.users.martaManagerA, async () => {
      const res = await db.query(
        "insert into public.employees (tenant_id, user_id, first_name, last_name) values ($1, $2, 'N', 'C')",
        [s.tenantA, newcomer],
      );
      expect(res.rowCount).toBe(1);
    });
  });
});
