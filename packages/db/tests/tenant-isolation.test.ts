import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  become,
  becomeSuperuser,
  connect,
  expectPgError,
  tx,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed, type TenantData } from "./helpers/fixtures.js";

/**
 * Attacchi cross-tenant: l'owner dell'azienda A (che in A ha TUTTI i permessi)
 * prova a leggere, inserire, modificare, spostare e cancellare dati
 * dell'azienda B, tabella per tabella.
 */

let db: Db;
let s: Seed;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

interface TableCase {
  table: string;
  /** colonna modificabile da authenticated (null = nessun privilegio UPDATE) */
  updatable: { col: string; value: unknown } | null;
  /** l'utente può cancellare righe di questa tabella? (privilegio DELETE) */
  deletable: boolean;
  /** insert che prova a creare una riga nell'azienda indicata */
  insert: (tenantId: string, d: TenantData) => { sql: string; params: unknown[] };
}

const rnd = () => Math.random().toString(36).slice(2, 10);

const TABLES: TableCase[] = [
  {
    table: "customers",
    updatable: { col: "notes", value: "manomesso" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.customers (tenant_id, display_name) values ($1, 'Intruso')",
      params: [t],
    }),
  },
  {
    table: "suppliers",
    updatable: { col: "notes", value: "manomesso" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.suppliers (tenant_id, display_name) values ($1, 'Intruso')",
      params: [t],
    }),
  },
  {
    table: "contacts",
    updatable: { col: "notes", value: "manomesso" },
    deletable: true,
    insert: (t, d) => ({
      sql: "insert into public.contacts (tenant_id, customer_id, first_name) values ($1, $2, 'Intruso')",
      params: [t, d.customer],
    }),
  },
  {
    table: "customer_sites",
    updatable: { col: "access_notes", value: "manomesso" },
    deletable: true,
    insert: (t, d) => ({
      sql: "insert into public.customer_sites (tenant_id, customer_id, name, address_line, city) values ($1, $2, 'X', 'Via X', 'Roma')",
      params: [t, d.customer],
    }),
  },
  {
    table: "employees",
    updatable: { col: "notes", value: "manomesso" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.employees (tenant_id, first_name, last_name) values ($1, 'In', 'Truso')",
      params: [t],
    }),
  },
  {
    table: "teams",
    updatable: { col: "description", value: "manomesso" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.teams (tenant_id, name) values ($1, $2)",
      params: [t, `Intrusi ${rnd()}`],
    }),
  },
  {
    table: "team_members",
    updatable: { col: "joined_on", value: "2020-01-01" },
    deletable: true,
    insert: (t, d) => ({
      sql: "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
      params: [t, d.team, d.employee2],
    }),
  },
  {
    table: "roles",
    updatable: { col: "description", value: "manomesso" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.roles (tenant_id, key, name) values ($1, $2, 'Intruso')",
      params: [t, `custom_${rnd()}`],
    }),
  },
  {
    table: "role_permissions",
    updatable: null,
    deletable: true,
    insert: (_t, d) => ({
      sql: "insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where key = 'customers.write'",
      params: [d.customRole],
    }),
  },
  {
    table: "memberships",
    updatable: { col: "status", value: "suspended" },
    deletable: true,
    insert: (t) => ({
      sql: "insert into public.memberships (tenant_id, user_id, role_id, status) select $1, $2, id, 'active' from public.roles where tenant_id is null and key = 'technician'",
      params: [t, s.users.outsider],
    }),
  },
  {
    table: "invitations",
    updatable: { col: "revoked_at", value: "2026-01-01" },
    deletable: false,
    insert: (t) => ({
      sql: "insert into public.invitations (tenant_id, email, role_id, token_hash, expires_at) select $1, 'intruso@test.invalid', id, repeat('c', 64), now() + interval '1 day' from public.roles where tenant_id is null and key = 'technician'",
      params: [t],
    }),
  },
  {
    table: "tenant_settings",
    updatable: { col: "brand_color", value: "#FF0000" },
    deletable: false,
    insert: (t) => ({
      sql: "insert into public.tenant_settings (tenant_id) values ($1)",
      params: [t],
    }),
  },
  {
    table: "subscriptions",
    updatable: null,
    deletable: false,
    insert: (t) => ({
      sql: "insert into public.subscriptions (tenant_id, plan_code, seats) values ($1, 'free', 1000)",
      params: [t],
    }),
  },
];

async function countForTenant(table: string, tenantId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*) as n from public.${table} where tenant_id = $1`,
    [tenantId],
  );
  return Number(rows[0]!.n);
}

describe.each(TABLES)("Isolamento della tabella $table", (c) => {
  it("non legge righe dell'altra azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      expect(await countForTenant(c.table, s.tenantB)).toBe(0);
      const { rows } = await db.query<{ tenant_id: string | null }>(
        `select distinct tenant_id from public.${c.table}`,
      );
      for (const r of rows) {
        // NULL ammesso solo per righe globali (ruoli di sistema)
        expect([s.tenantA, null]).toContain(r.tenant_id);
      }
    });
  });

  it("non inserisce righe nell'altra azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const q = c.insert(s.tenantB, s.b);
      await expectPgError(db.query(q.sql, q.params), "42501");
    });
  });

  it("non modifica righe dell'altra azienda", async () => {
    await tx(db, async () => {
      const before = await countForTenant(c.table, s.tenantB);
      await become(db, s.users.aliceOwnerA);
      if (c.updatable) {
        const res = await db.query(
          `update public.${c.table} set ${c.updatable.col} = $1 where tenant_id = $2`,
          [c.updatable.value, s.tenantB],
        );
        expect(res.rowCount).toBe(0);
      } else {
        await db.query("savepoint attempt");
        await expectPgError(
          db.query(`update public.${c.table} set tenant_id = tenant_id where tenant_id = $1`, [
            s.tenantB,
          ]),
          "42501",
        );
        await db.query("rollback to savepoint attempt");
      }
      await becomeSuperuser(db);
      expect(await countForTenant(c.table, s.tenantB)).toBe(before);
    });
  });

  it("non cancella righe dell'altra azienda", async () => {
    await tx(db, async () => {
      const before = await countForTenant(c.table, s.tenantB);
      expect(before).toBeGreaterThan(0);
      await become(db, s.users.aliceOwnerA);
      if (c.deletable) {
        const res = await db.query(`delete from public.${c.table} where tenant_id = $1`, [
          s.tenantB,
        ]);
        expect(res.rowCount).toBe(0);
      } else {
        await db.query("savepoint attempt");
        await expectPgError(
          db.query(`delete from public.${c.table} where tenant_id = $1`, [s.tenantB]),
          "42501",
        );
        await db.query("rollback to savepoint attempt");
      }
      await becomeSuperuser(db);
      expect(await countForTenant(c.table, s.tenantB)).toBe(before);
    });
  });

  it("non sposta le proprie righe nell'altra azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(`update public.${c.table} set tenant_id = $1 where tenant_id = $2`, [
          s.tenantB,
          s.tenantA,
        ]),
        "42501",
      );
    });
  });
});

describe("Riferimenti incrociati tra aziende (FK composte)", () => {
  const cases: { name: string; sql: (a: Seed) => { sql: string; params: unknown[] } }[] = [
    {
      name: "contatto di A collegato a un cliente di B",
      sql: (x) => ({
        sql: "insert into public.contacts (tenant_id, customer_id, first_name) values ($1, $2, 'X')",
        params: [x.tenantA, x.b.customer],
      }),
    },
    {
      name: "contatto di A collegato a un fornitore di B",
      sql: (x) => ({
        sql: "insert into public.contacts (tenant_id, supplier_id, first_name) values ($1, $2, 'X')",
        params: [x.tenantA, x.b.supplier],
      }),
    },
    {
      name: "sede di A collegata a un cliente di B",
      sql: (x) => ({
        sql: "insert into public.customer_sites (tenant_id, customer_id, name, address_line, city) values ($1, $2, 'X', 'Via X', 'Roma')",
        params: [x.tenantA, x.b.customer],
      }),
    },
    {
      name: "membro di squadra di A con un dipendente di B",
      sql: (x) => ({
        sql: "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
        params: [x.tenantA, x.a.team, x.b.employee2],
      }),
    },
    {
      name: "membro di squadra di A in una squadra di B",
      sql: (x) => ({
        sql: "insert into public.team_members (tenant_id, team_id, employee_id) values ($1, $2, $3)",
        params: [x.tenantA, x.b.team, x.a.employee2],
      }),
    },
    {
      name: "squadra di A con caposquadra di B",
      sql: (x) => ({
        sql: "insert into public.teams (tenant_id, name, leader_employee_id) values ($1, 'X-team', $2)",
        params: [x.tenantA, x.b.employee],
      }),
    },
    {
      name: "dipendente di A collegato a un utente che è solo in B",
      sql: (x) => ({
        sql: "insert into public.employees (tenant_id, user_id, first_name, last_name) values ($1, $2, 'X', 'Y')",
        params: [x.tenantA, x.users.daveOwnerB],
      }),
    },
    {
      name: "invito di A con un ruolo personalizzato di B",
      sql: (x) => ({
        sql: "insert into public.invitations (tenant_id, email, role_id, token_hash, expires_at) values ($1, 'x@test.invalid', $2, repeat('a', 64), now() + interval '1 day')",
        params: [x.tenantA, x.b.customRole],
      }),
    },
    {
      name: "invito di A per un cliente esterno di B",
      sql: (x) => ({
        sql: "insert into public.invitations (tenant_id, email, role_id, customer_id, token_hash, expires_at) select $1, 'y@test.invalid', id, $2, repeat('b', 64), now() + interval '1 day' from public.roles where tenant_id is null and key = 'external_client'",
        params: [x.tenantA, x.b.customer],
      }),
    },
  ];

  it.each(cases)("rifiutato: $name", async (c) => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const q = c.sql(s);
      await expectPgError(db.query(q.sql, q.params), "23503");
    });
  });

  it("aggiornare un riferimento verso un record di B è rifiutato", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("update public.teams set leader_employee_id = $1 where id = $2", [
          s.b.employee,
          s.a.team,
        ]),
        "23503",
      );
    });
  });
});

describe("Chi può vedere qualcosa", () => {
  it("un utente senza aziende non vede nulla", async () => {
    await asUser(db, s.users.outsider, async () => {
      for (const t of [
        "tenants",
        "tenant_settings",
        "memberships",
        "subscriptions",
        "customers",
        "suppliers",
        "contacts",
        "customer_sites",
        "employees",
        "teams",
        "team_members",
        "audit_log",
      ]) {
        const { rowCount } = await db.query(`select 1 from public.${t}`);
        expect(rowCount, t).toBe(0);
      }
      const roles = await db.query("select 1 from public.roles where tenant_id is not null");
      expect(roles.rowCount).toBe(0);
    });
  });

  it("anon non ha alcun privilegio", async () => {
    for (const t of ["customers", "employees", "tenants", "users", "roles"]) {
      await asUser(db, null, async () => {
        await expectPgError(db.query(`select 1 from public.${t}`), "42501");
      });
    }
  });

  it("un membro sospeso o solo invitato non vede i dati", async () => {
    for (const u of [s.users.frankSuspendedA, s.users.ivanInvitedA]) {
      await asUser(db, u, async () => {
        const { rowCount } = await db.query("select 1 from public.customers");
        expect(rowCount).toBe(0);
      });
    }
  });

  it("un'azienda sospesa perde l'accesso ai dati operativi", async () => {
    await tx(db, async () => {
      await db.query("update public.tenants set status = 'suspended' where id = $1", [s.tenantB]);
      await become(db, s.users.daveOwnerB);
      const { rowCount } = await db.query("select 1 from public.customers");
      expect(rowCount).toBe(0);
    });
  });

  it("un utente in due aziende vede entrambe con i permessi di ciascuna", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      // fornitori: viewer in A (suppliers.read) e office in B (suppliers.read)
      const { rows } = await db.query<{ tenant_id: string }>(
        "select distinct tenant_id from public.suppliers order by 1",
      );
      expect(rows.map((r) => r.tenant_id)).toEqual([s.tenantA, s.tenantB].sort());
    });
    await asUser(db, s.users.eveMulti, async () => {
      // ma scrive solo in B
      await expectPgError(
        db.query("insert into public.customers (tenant_id, display_name) values ($1, 'X')", [
          s.tenantA,
        ]),
        "42501",
      );
    });
  });

  it("tenant_id è immutabile anche per il service_role", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(
        db.query("update public.customers set tenant_id = $1 where id = $2", [
          s.tenantB,
          s.a.customer,
        ]),
        "42501",
      );
    });
  });

  it("created_by non è falsificabile dal client", async () => {
    await asUser(db, s.users.carolOfficeA, async () => {
      await expectPgError(
        db.query(
          "insert into public.customers (tenant_id, display_name, created_by) values ($1, 'X', $2)",
          [s.tenantA, s.users.daveOwnerB],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.carolOfficeA, async () => {
      const { rows } = await db.query<{ created_by: string }>(
        "insert into public.customers (tenant_id, display_name) values ($1, 'X') returning created_by",
        [s.tenantA],
      );
      expect(rows[0]!.created_by).toBe(s.users.carolOfficeA);
    });
  });
});
