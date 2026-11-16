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

describe("Permessi per ruolo", () => {
  it("il tecnico legge i clienti ma non può crearli", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rowCount } = await db.query("select 1 from public.business_partners");
      expect(rowCount).toBe(2);
      await expectPgError(
        db.query(
          "insert into public.business_partners (tenant_id, display_name) values ($1, 'X')",
          [s.tenantA],
        ),
        "42501",
      );
    });
  });

  it("l'ufficio crea clienti ma non può eliminarli definitivamente", async () => {
    await tx(db, async () => {
      await become(db, s.users.carolOfficeA);
      const ins = await db.query(
        "insert into public.business_partners (tenant_id, display_name) values ($1, 'Nuovo cliente') returning id",
        [s.tenantA],
      );
      expect(ins.rowCount).toBe(1);
      const del = await db.query("delete from public.business_partners where id = $1", [
        s.partners.a1,
      ]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("il viewer in A non può scrivere in A anche se è office in B", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      await expectPgError(
        db.query(
          "insert into public.business_partners (tenant_id, display_name) values ($1, 'X')",
          [s.tenantA],
        ),
        "42501",
      );
    });
  });
});

describe("Gestione membri e prevenzione dell'escalation", () => {
  it("nessuno può modificare il proprio ruolo", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const res = await db.query(
        "update public.tenant_memberships set role = 'owner' where user_id = $1",
        [s.users.bobTechA],
      );
      expect(res.rowCount).toBe(0);
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const res = await db.query(
        "update public.tenant_memberships set role = 'owner' where user_id = $1",
        [s.users.graceAdminA],
      );
      expect(res.rowCount).toBe(0);
    });
  });

  it("un admin non può nominare owner né toccare un owner", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          "update public.tenant_memberships set role = 'owner' where tenant_id = $1 and user_id = $2",
          [s.tenantA, s.users.bobTechA],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const res = await db.query(
        "update public.tenant_memberships set status = 'suspended' where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.aliceOwnerA],
      );
      expect(res.rowCount).toBe(0);
    });
  });

  it("un admin può cambiare ruolo a un tecnico", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      const res = await db.query(
        "update public.tenant_memberships set role = 'manager' where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.bobTechA],
      );
      expect(res.rowCount).toBe(1);
    });
  });

  it("i nuovi membri nascono solo come invitati", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, 'technician', 'active')",
          [s.tenantA, s.users.outsider],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const res = await db.query(
        "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, 'technician', 'invited') returning invited_by",
        [s.tenantA, s.users.outsider],
      );
      expect(res.rows[0].invited_by).toBe(s.users.graceAdminA);
    });
  });

  it("un admin di A non può aggiungere membri in B", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(
          "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, 'admin', 'invited')",
          [s.tenantB, s.users.outsider],
        ),
        "42501",
      );
    });
  });

  it("l'invitato accetta il proprio invito e ottiene accesso", async () => {
    await asUser(db, s.users.ivanInvitedA, async () => {
      await db.query("select app.accept_invitation($1)", [s.tenantA]);
      const { rowCount } = await db.query("select 1 from public.business_partners");
      expect(rowCount).toBe(2);
    });
  });

  it("non si può accettare un invito inesistente", async () => {
    await asUser(db, s.users.outsider, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [s.tenantA]), "P0002");
    });
  });

  it("un'azienda non può restare senza owner attivo", async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      await db.query(
        "update public.tenant_memberships set role = 'admin' where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.aliceOwnerA],
      );
      // Vincolo differito: l'errore arriva al commit.
      await expectPgError(db.query("commit"), "23514");
    } finally {
      await db.query("rollback");
    }
  });

  it("l'owner non può cambiare lo stato di abbonamento dell'azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("update public.tenants set status = 'active' where id = $1", [s.tenantA]),
        "42501",
      );
    });
  });

  it("l'owner può aggiornare i dati anagrafici della propria azienda, non di altre", async () => {
    await tx(db, async () => {
      await become(db, s.users.aliceOwnerA);
      const own = await db.query(
        "update public.tenants set name = 'Edilizia Alfa Srl' where id = $1",
        [s.tenantA],
      );
      expect(own.rowCount).toBe(1);
      const other = await db.query("update public.tenants set name = 'Hack' where id = $1", [
        s.tenantB,
      ]);
      expect(other.rowCount).toBe(0);
      await becomeSuperuser(db);
    });
  });

  it("solo il server (service_role) può creare aziende", async () => {
    await asUser(db, s.users.outsider, async () => {
      await expectPgError(
        db.query("select app.create_tenant('X', 'x-tenant', $1)", [s.users.outsider]),
        "42501",
      );
    });
  });
});

describe("Profili", () => {
  it("si vedono i profili dei colleghi, non quelli di altre aziende", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ user_id: string }>("select user_id from public.profiles");
      const ids = rows.map((r) => r.user_id);
      expect(ids).toContain(s.users.aliceOwnerA);
      expect(ids).toContain(s.users.bobTechA);
      expect(ids).not.toContain(s.users.daveOwnerB);
      expect(ids).not.toContain(s.users.outsider);
    });
  });

  it("si può modificare solo il proprio profilo", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const res = await db.query("update public.profiles set full_name = 'X' where user_id = $1", [
        s.users.aliceOwnerA,
      ]);
      expect(res.rowCount).toBe(0);
    });
  });
});
