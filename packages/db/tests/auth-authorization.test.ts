import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  become,
  becomeSuperuser,
  connect,
  createTenant,
  createUser,
  expectPgError,
  insertRow,
  roleId,
  tx,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/**
 * Autorizzazione a livello di database: MFA (aal2), ruoli richiesti, Super
 * Admin SaaS, cliente esterno, inviti, azienda attiva, revoca immediata.
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

const newToken = () => randomBytes(32).toString("base64url");
const hashToken = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

async function emailOf(userId: string): Promise<string> {
  const { rows } = await db.query<{ email: string }>("select email from auth.users where id = $1", [
    userId,
  ]);
  return rows[0]!.email;
}

/** Crea (come superuser) un invito e restituisce il token in chiaro. */
async function makeInvitation(opts: {
  tenantId: string;
  email: string;
  roleKey: string;
  customerId?: string;
  expiresInMs?: number;
  createdBy?: string;
}): Promise<{ token: string; id: string }> {
  const token = newToken();
  const id = await insertRow(db, "invitations", {
    tenant_id: opts.tenantId,
    email: opts.email,
    role_id: await roleId(db, opts.roleKey),
    customer_id: opts.customerId ?? null,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + (opts.expiresInMs ?? 86_400_000)),
  });
  if (opts.createdBy) {
    await db.query("update public.invitations set created_by = $1 where id = $2", [
      opts.createdBy,
      id,
    ]);
  }
  return { token, id };
}

describe("MFA imposta dal database", () => {
  it("con aal1 il titolare legge i dati ma non usa i permessi amministrativi", async () => {
    await asUser(
      db,
      s.users.aliceOwnerA,
      async () => {
        const customers = await db.query("select 1 from public.customers");
        expect(customers.rowCount).toBeGreaterThan(0);
        const audit = await db.query("select 1 from public.audit_log");
        expect(audit.rowCount).toBe(0);
        const subs = await db.query("select 1 from public.subscriptions");
        expect(subs.rowCount).toBe(0);
        const del = await db.query("delete from public.customers where id = $1", [s.a.customer]);
        expect(del.rowCount).toBe(0);
        const settings = await db.query(
          "update public.tenant_settings set brand_color = '#000000'",
        );
        expect(settings.rowCount).toBe(0);
      },
      "aal1",
    );
  });

  it("con aal1 non si invitano utenti; con aal2 sì", async () => {
    const insert = (email: string) =>
      db.query(
        "insert into public.invitations (tenant_id, email, role_id, token_hash, expires_at) select $1, $2, id, $3, now() + interval '7 days' from public.roles where tenant_id is null and key = 'technician'",
        [s.tenantA, email, hashToken(newToken())],
      );
    await asUser(
      db,
      s.users.graceAdminA,
      async () => {
        await expectPgError(insert("mfa1@test.invalid"), "42501");
      },
      "aal1",
    );
    await asUser(
      db,
      s.users.graceAdminA,
      async () => {
        const res = await insert("mfa2@test.invalid");
        expect(res.rowCount).toBe(1);
      },
      "aal2",
    );
  });

  it("my_permissions segnala i permessi che richiedono la verifica MFA", async () => {
    await asUser(
      db,
      s.users.aliceOwnerA,
      async () => {
        const { rows } = await db.query<{
          permission: string;
          requires_mfa: boolean;
          granted: boolean;
        }>("select * from app.my_permissions($1)", [s.tenantA]);
        const byKey = Object.fromEntries(rows.map((r) => [r.permission, r]));
        expect(byKey["customers.read"]).toMatchObject({ requires_mfa: false, granted: true });
        expect(byKey["members.manage"]).toMatchObject({ requires_mfa: true, granted: false });
      },
      "aal1",
    );
  });

  it("my_permissions non rivela nulla di un'altra azienda", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rowCount } = await db.query("select * from app.my_permissions($1)", [s.tenantB]);
      expect(rowCount).toBe(0);
    });
  });
});

describe("Ruoli iniziali", () => {
  it("esistono esattamente i ruoli di sistema richiesti", async () => {
    const { rows } = await db.query<{ key: string; name: string }>(
      "select key, name from public.roles where tenant_id is null",
    );
    const names = Object.fromEntries(rows.map((r) => [r.key, r.name]));
    expect(names).toEqual({
      owner: "Proprietario azienda",
      admin: "Amministratore",
      operations_manager: "Responsabile operativo",
      site_manager: "Responsabile cantiere",
      back_office: "Amministrazione",
      technician: "Tecnico",
      external_client: "Cliente esterno",
    });
  });

  it("il responsabile cantiere gestisce le squadre ma non i clienti", async () => {
    await asUser(db, s.users.victorViewerA, async () => {
      const team = await db.query(
        "insert into public.teams (tenant_id, name) values ($1, 'Squadra cantiere') returning id",
        [s.tenantA],
      );
      expect(team.rowCount).toBe(1);
    });
    await asUser(db, s.users.victorViewerA, async () => {
      await expectPgError(
        db.query("insert into public.customers (tenant_id, display_name) values ($1, 'X')", [
          s.tenantA,
        ]),
        "42501",
      );
    });
  });
});

describe("Cliente esterno", () => {
  let client: string;
  let otherCustomer: string;

  beforeAll(async () => {
    client = await createUser(db, "cliente");
    otherCustomer = await insertRow(db, "customers", {
      tenant_id: s.tenantA,
      display_name: "Altro cliente di A",
    });
    await db.query(
      "insert into public.memberships (tenant_id, user_id, role_id, status, customer_id) values ($1, $2, $3, 'active', $4)",
      [s.tenantA, client, await roleId(db, "external_client"), s.a.customer],
    );
  });

  it("vede solo il proprio cliente e le sue sedi", async () => {
    await asUser(db, client, async () => {
      const customers = await db.query<{ id: string }>("select id from public.customers");
      expect(customers.rows.map((r) => r.id)).toEqual([s.a.customer]);
      const sites = await db.query<{ customer_id: string }>(
        "select distinct customer_id from public.customer_sites",
      );
      expect(sites.rows.map((r) => r.customer_id)).toEqual([s.a.customer]);
    });
    await asUser(db, client, async () => {
      const other = await db.query("select 1 from public.customers where id = $1", [otherCustomer]);
      expect(other.rowCount).toBe(0);
    });
  });

  it("non vede fornitori, dipendenti, squadre, membri né colleghi interni", async () => {
    await asUser(db, client, async () => {
      for (const t of ["suppliers", "employees", "teams", "contacts", "invitations"]) {
        const { rowCount } = await db.query(`select 1 from public.${t}`);
        expect(rowCount, t).toBe(0);
      }
      const users = await db.query<{ id: string }>("select id from public.users");
      expect(users.rows.map((r) => r.id)).toEqual([client]);
      const members = await db.query("select 1 from public.memberships where user_id <> $1", [
        client,
      ]);
      expect(members.rowCount).toBe(0);
    });
  });

  it("non può scrivere nulla", async () => {
    await asUser(db, client, async () => {
      await expectPgError(
        db.query(
          "insert into public.customer_sites (tenant_id, customer_id, name, address_line, city) values ($1, $2, 'X', 'Via X', 'Roma')",
          [s.tenantA, s.a.customer],
        ),
        "42501",
      );
    });
    await asUser(db, client, async () => {
      const upd = await db.query("update public.customers set notes = 'x' where id = $1", [
        s.a.customer,
      ]);
      expect(upd.rowCount).toBe(0);
    });
  });

  it("il ruolo cliente esterno richiede un cliente, e solo quel ruolo lo ammette", async () => {
    const u = await createUser(db, "cliente2");
    await expectPgError(
      db.query(
        "insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
        [s.tenantA, u, await roleId(db, "external_client")],
      ),
      "23514",
    );
    await expectPgError(
      db.query(
        "insert into public.memberships (tenant_id, user_id, role_id, status, customer_id) values ($1, $2, $3, 'active', $4)",
        [s.tenantA, u, await roleId(db, "technician"), s.a.customer],
      ),
      "23514",
    );
  });
});

describe("Super Admin SaaS", () => {
  let superAdmin: string;

  beforeAll(async () => {
    superAdmin = await createUser(db, "superadmin");
    await db.query("insert into public.platform_admins (user_id) values ($1)", [superAdmin]);
  });

  it("con MFA vede i metadati di tutte le aziende e abbonamenti", async () => {
    await asUser(db, superAdmin, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.tenants");
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(s.tenantA);
      expect(ids).toContain(s.tenantB);
      const subs = await db.query("select 1 from public.subscriptions where tenant_id = $1", [
        s.tenantB,
      ]);
      expect(subs.rowCount).toBe(1);
    });
  });

  it("non vede i dati operativi delle aziende", async () => {
    await asUser(db, superAdmin, async () => {
      for (const t of ["customers", "suppliers", "employees", "audit_log", "invitations"]) {
        const { rowCount } = await db.query(`select 1 from public.${t}`);
        expect(rowCount, t).toBe(0);
      }
    });
  });

  it("senza MFA non ha alcun privilegio", async () => {
    await asUser(
      db,
      superAdmin,
      async () => {
        const { rowCount } = await db.query("select 1 from public.tenants");
        expect(rowCount).toBe(0);
      },
      "aal1",
    );
  });

  it("nessun utente può nominarsi Super Admin", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("insert into public.platform_admins (user_id) values ($1)", [s.users.aliceOwnerA]),
        "42501",
      );
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      const { rowCount } = await db.query("select 1 from public.platform_admins");
      expect(rowCount).toBe(0);
    });
  });
});

describe("Inviti", () => {
  it("le membership non si creano direttamente dal client", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.memberships (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'active')",
          [s.tenantA, s.users.outsider, await roleId(db, "technician")],
        ),
        "42501",
      );
    });
  });

  it("un admin non può invitare un proprietario; il proprietario sì", async () => {
    const sql =
      "insert into public.invitations (tenant_id, email, role_id, token_hash, expires_at) select $1, $2, id, $3, now() + interval '7 days' from public.roles where tenant_id is null and key = 'owner'";
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query(sql, [s.tenantA, "socio@test.invalid", hashToken(newToken())]),
        "42501",
      );
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      const res = await db.query(sql, [s.tenantA, "socio@test.invalid", hashToken(newToken())]);
      expect(res.rowCount).toBe(1);
    });
  });

  it("chi non gestisce i membri non vede gli inviti (né i token)", async () => {
    for (const u of [s.users.bobTechA, s.users.carolOfficeA, s.users.daveOwnerB]) {
      await asUser(db, u, async () => {
        const { rowCount } = await db.query(
          "select 1 from public.invitations where tenant_id = $1",
          [s.tenantA],
        );
        expect(rowCount).toBe(0);
      });
    }
  });

  it("accettazione valida: membership attiva, ruolo dell'invito, azienda attiva impostata", async () => {
    const invitee = await createUser(db, "nuovo");
    const { token } = await makeInvitation({
      tenantId: s.tenantA,
      email: await emailOf(invitee),
      roleKey: "technician",
      createdBy: s.users.graceAdminA,
    });
    await asUser(db, invitee, async () => {
      const { rows } = await db.query<{ t: string }>("select app.accept_invitation($1) as t", [
        token,
      ]);
      expect(rows[0]!.t).toBe(s.tenantA);
      const m = await db.query<{ status: string; invited_by: string; key: string }>(
        `select m.status, m.invited_by, r.key from public.memberships m
           join public.roles r on r.id = m.role_id where m.user_id = $1`,
        [invitee],
      );
      expect(m.rows[0]).toEqual({
        status: "active",
        invited_by: s.users.graceAdminA,
        key: "technician",
      });
      const u = await db.query<{ last_active_tenant_id: string }>(
        "select last_active_tenant_id from public.users where id = $1",
        [invitee],
      );
      expect(u.rows[0]!.last_active_tenant_id).toBe(s.tenantA);
      const customers = await db.query("select 1 from public.customers");
      expect(customers.rowCount).toBeGreaterThan(0);
    });
  });

  it("un token non può essere riutilizzato", async () => {
    const invitee = await createUser(db, "riuso");
    const { token } = await makeInvitation({
      tenantId: s.tenantA,
      email: await emailOf(invitee),
      roleKey: "technician",
    });
    await tx(db, async () => {
      await become(db, invitee);
      await db.query("select app.accept_invitation($1)", [token]);
      await db.query("savepoint again");
      await expectPgError(db.query("select app.accept_invitation($1)", [token]), "P0002");
    });
  });

  it("rifiuta email diversa, email non verificata, invito scaduto, revocato o inesistente", async () => {
    const other = await createUser(db, "altro");
    const unverified = await createUser(db, "nonverificato");
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [unverified]);

    const wrong = await makeInvitation({
      tenantId: s.tenantA,
      email: "qualcun.altro@test.invalid",
      roleKey: "technician",
    });
    await asUser(db, other, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [wrong.token]), "42501");
    });

    const unv = await makeInvitation({
      tenantId: s.tenantA,
      email: await emailOf(unverified),
      roleKey: "technician",
    });
    await asUser(db, unverified, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [unv.token]), "42501");
    });

    const expiredUser = await createUser(db, "scaduto");
    const expired = await makeInvitation({
      tenantId: s.tenantA,
      email: await emailOf(expiredUser),
      roleKey: "technician",
    });
    await db.query(
      "update public.invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '2 days' where id = $1",
      [expired.id],
    );
    await asUser(db, expiredUser, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [expired.token]), "P0002");
    });

    const revokedUser = await createUser(db, "revocato");
    const revoked = await makeInvitation({
      tenantId: s.tenantA,
      email: await emailOf(revokedUser),
      roleKey: "technician",
    });
    await asUser(db, s.users.graceAdminA, async () => {
      const r = await db.query("update public.invitations set revoked_at = now() where id = $1", [
        revoked.id,
      ]);
      expect(r.rowCount).toBe(1);
    });
    await db.query("update public.invitations set revoked_at = now() where id = $1", [revoked.id]);
    await asUser(db, revokedUser, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [revoked.token]), "P0002");
    });

    await asUser(db, other, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [newToken()]), "P0002");
    });
  });

  it("l'invito non si può modificare se non per revocarlo", async () => {
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query("update public.invitations set role_id = $1 where id = $2", [
          await roleId(db, "owner"),
          s.a.invitation,
        ]),
        "42501",
      );
    });
    await asUser(db, s.users.graceAdminA, async () => {
      await expectPgError(
        db.query("update public.invitations set accepted_at = now() where id = $1", [
          s.a.invitation,
        ]),
        "42501",
      );
    });
  });

  it("rispetta il limite di posti dell'abbonamento (clienti esterni esclusi)", async () => {
    const owner = await createUser(db, "piccola");
    const tenant = await createTenant(db, "Ditta Piccola Test", owner);
    await db.query("update public.subscriptions set seats = 1 where tenant_id = $1", [tenant]);
    const customer = await insertRow(db, "customers", {
      tenant_id: tenant,
      display_name: "Cliente piccolo",
    });

    const tech = await createUser(db, "tecnico-piccola");
    const techInv = await makeInvitation({
      tenantId: tenant,
      email: await emailOf(tech),
      roleKey: "technician",
    });
    await asUser(db, tech, async () => {
      await expectPgError(db.query("select app.accept_invitation($1)", [techInv.token]), "53400");
    });

    const cli = await createUser(db, "cliente-piccola");
    const cliInv = await makeInvitation({
      tenantId: tenant,
      email: await emailOf(cli),
      roleKey: "external_client",
      customerId: customer,
    });
    await asUser(db, cli, async () => {
      const { rows } = await db.query<{ t: string }>("select app.accept_invitation($1) as t", [
        cliInv.token,
      ]);
      expect(rows[0]!.t).toBe(tenant);
    });
  });
});

describe("Azienda attiva e sessioni", () => {
  it("si può scegliere solo un'azienda di cui si è membri attivi", async () => {
    await asUser(db, s.users.eveMulti, async () => {
      await db.query("select app.set_active_tenant($1)", [s.tenantB]);
      const { rows } = await db.query<{ last_active_tenant_id: string }>(
        "select last_active_tenant_id from public.users where id = $1",
        [s.users.eveMulti],
      );
      expect(rows[0]!.last_active_tenant_id).toBe(s.tenantB);
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(db.query("select app.set_active_tenant($1)", [s.tenantB]), "42501");
    });
    await asUser(db, s.users.frankSuspendedA, async () => {
      await expectPgError(db.query("select app.set_active_tenant($1)", [s.tenantA]), "42501");
    });
  });

  it("l'azienda attiva non si modifica scrivendo direttamente il profilo", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query("update public.users set last_active_tenant_id = $1 where id = $2", [
          s.tenantB,
          s.users.aliceOwnerA,
        ]),
        "42501",
      );
    });
  });

  it("sospendere un membro revoca l'accesso subito, anche con un token ancora valido", async () => {
    await tx(db, async () => {
      await become(db, s.users.bobTechA);
      const before = await db.query("select 1 from public.customers");
      expect(before.rowCount).toBeGreaterThan(0);
      await becomeSuperuser(db);
      await db.query("update public.memberships set status = 'suspended' where user_id = $1", [
        s.users.bobTechA,
      ]);
      await become(db, s.users.bobTechA);
      const after = await db.query("select 1 from public.customers");
      expect(after.rowCount).toBe(0);
    });
  });
});
