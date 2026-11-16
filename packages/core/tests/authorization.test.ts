import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  isPlatformAdmin,
  isPlatformAdminAccount,
  listMyCompanies,
  registerCompany,
  requirePermission,
  requirePlatformAdmin,
  resolveActiveTenant,
  revokeInvitation,
  switchActiveTenant,
  withServiceTransaction,
  withUserTransaction,
  type VerifiedSession,
} from "../src/index";
import {
  addMember,
  createPool,
  createSession,
  createTenant,
  createUser,
  uniq,
} from "./helpers/fixtures";

let pool: pg.Pool;
type User = { id: string; email: string };
let owner: User, admin: User, tech: User, outsider: User, ownerB: User;
let tenantA: string, tenantB: string;

beforeAll(async () => {
  pool = createPool();
  owner = await createUser(pool, "titolare");
  admin = await createUser(pool, "admin");
  tech = await createUser(pool, "tecnico");
  outsider = await createUser(pool, "esterno");
  ownerB = await createUser(pool, "titolareb");
  tenantA = await createTenant(pool, "Azienda A", owner.id);
  tenantB = await createTenant(pool, "Azienda B", ownerB.id);
  await addMember(pool, tenantA, admin.id, "admin");
  await addMember(pool, tenantA, tech.id, "technician");
  await addMember(pool, tenantB, tech.id, "technician");
});

afterAll(async () => {
  await pool.end();
});

const asUser = <T>(s: VerifiedSession, fn: Parameters<typeof withUserTransaction<T>>[2]) =>
  withUserTransaction(pool, s, fn);

describe("Sessione verificata nel database", () => {
  it("una sessione attiva passa; logout (sessione eliminata) blocca subito", async () => {
    const s = await createSession(pool, tech);
    await expect(asUser(s, async () => "ok")).resolves.toBe("ok");
    await pool.query("delete from auth.sessions where id = $1", [s.sessionId]);
    await expect(asUser(s, async () => "ok")).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  });

  it("sessione scaduta (not_after) o appartenente a un altro utente è rifiutata", async () => {
    const s = await createSession(pool, tech);
    await pool.query(
      "update auth.sessions set not_after = now() - interval '1 second' where id = $1",
      [s.sessionId],
    );
    await expect(asUser(s, async () => "ok")).rejects.toMatchObject({ code: "SESSION_REVOKED" });

    const other = await createSession(pool, owner);
    const forged: VerifiedSession = { ...other, userId: tech.id };
    await expect(asUser(forged, async () => "ok")).rejects.toMatchObject({
      code: "SESSION_REVOKED",
    });
  });

  it("le query girano come authenticated con RLS e request_id nell'audit", async () => {
    const s = await createSession(pool, admin);
    const requestId = uniq("req");
    const id = await withUserTransaction(
      pool,
      s,
      async (tx) => {
        const role = await tx.query<{ r: string }>("select current_user as r");
        expect(role.rows[0]!.r).toBe("authenticated");
        const access = await resolveActiveTenant(tx);
        const { rows } = await tx.query<{ id: string }>(
          "insert into public.customers (tenant_id, display_name) values ($1, 'Cliente audit') returning id",
          [access.tenantId],
        );
        return rows[0]!.id;
      },
      { requestId },
    );
    const audit = await pool.query(
      "select actor_user_id, request_id from public.audit_log where record_id = $1",
      [id],
    );
    expect(audit.rows[0]).toEqual({ actor_user_id: admin.id, request_id: requestId });
  });

  it("un errore annulla tutta la transazione", async () => {
    const s = await createSession(pool, admin);
    const name = uniq("rollback");
    await expect(
      asUser(s, async (tx) => {
        await tx.query("insert into public.customers (tenant_id, display_name) values ($1, $2)", [
          tenantA,
          name,
        ]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const { rowCount } = await pool.query(
      "select 1 from public.customers where display_name = $1",
      [name],
    );
    expect(rowCount).toBe(0);
  });
});

describe("Azienda attiva", () => {
  it("elenca solo le aziende di cui l'utente è membro attivo", async () => {
    const s = await createSession(pool, tech);
    const companies = await asUser(s, (tx) => listMyCompanies(tx));
    expect(companies.map((c) => c.tenantId).sort()).toEqual([tenantA, tenantB].sort());
    expect(companies.every((c) => c.roleKey === "technician")).toBe(true);
  });

  it("cambio azienda: verso un'azienda propria sì, verso altre no", async () => {
    const s = await createSession(pool, tech);
    const access = await asUser(s, (tx) => switchActiveTenant(tx, tenantB));
    expect(access.tenantId).toBe(tenantB);
    expect((await asUser(s, (tx) => resolveActiveTenant(tx))).tenantId).toBe(tenantB);

    const sa = await createSession(pool, admin);
    for (const target of [tenantB, "00000000-0000-4000-8000-000000000000", "'; drop table x; --"]) {
      await expect(asUser(sa, (tx) => switchActiveTenant(tx, target))).rejects.toMatchObject({
        code: "NOT_A_MEMBER",
      });
    }
  });

  it("una preferenza salvata non più valida (membro sospeso) viene ignorata", async () => {
    const u = await createUser(pool, "sospeso");
    await addMember(pool, tenantA, u.id, "technician");
    await addMember(pool, tenantB, u.id, "technician");
    const s = await createSession(pool, u);
    await asUser(s, (tx) => switchActiveTenant(tx, tenantB));
    await pool.query(
      "update public.memberships set status = 'suspended' where tenant_id = $1 and user_id = $2",
      [tenantB, u.id],
    );
    expect((await asUser(s, (tx) => resolveActiveTenant(tx))).tenantId).toBe(tenantA);
  });

  it("utente senza aziende: NO_ACTIVE_TENANT", async () => {
    const s = await createSession(pool, outsider);
    await expect(asUser(s, (tx) => resolveActiveTenant(tx))).rejects.toMatchObject({
      code: "NO_ACTIVE_TENANT",
    });
  });

  it("anche con un tenant_id forgiato, il database rifiuta scritture in un'altra azienda", async () => {
    const s = await createSession(pool, admin);
    await expect(
      asUser(s, (tx) =>
        tx.query("insert into public.customers (tenant_id, display_name) values ($1, 'Intruso')", [
          tenantB,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Permessi e MFA lato server", () => {
  it("tecnico: niente gestione membri", async () => {
    const s = await createSession(pool, tech);
    const access = await asUser(s, (tx) => switchActiveTenant(tx, tenantA));
    expect(() => requirePermission(access, "members.manage")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => requirePermission(access, "customers.read")).not.toThrow();
  });

  it("titolare con sessione aal1: i permessi amministrativi chiedono la MFA", async () => {
    const s1 = await createSession(pool, owner, "aal1");
    const a1 = await asUser(s1, (tx) => resolveActiveTenant(tx));
    expect(() => requirePermission(a1, "members.manage")).toThrow(
      expect.objectContaining({ code: "MFA_REQUIRED" }),
    );
    expect(() => requirePermission(a1, "customers.write")).not.toThrow();
    expect(a1.permissionsRequiringMfa.has("tenant.manage")).toBe(true);

    const s2 = await createSession(pool, owner, "aal2");
    const a2 = await asUser(s2, (tx) => resolveActiveTenant(tx));
    expect(() => requirePermission(a2, "members.manage")).not.toThrow();
    expect(a2.permissionsRequiringMfa.size).toBe(0);
  });

  it("Super Admin SaaS: solo se in platform_admins e con MFA", async () => {
    const sa = await createUser(pool, "superadmin");
    await pool.query("insert into public.platform_admins (user_id) values ($1)", [sa.id]);
    const s1 = await createSession(pool, sa, "aal1");
    expect(await asUser(s1, (tx) => isPlatformAdmin(tx))).toBe(false);
    expect(await asUser(s1, (tx) => isPlatformAdminAccount(tx))).toBe(true);
    await expect(asUser(s1, (tx) => requirePlatformAdmin(tx))).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });
    const s2 = await createSession(pool, sa, "aal2");
    await expect(asUser(s2, (tx) => requirePlatformAdmin(tx))).resolves.toBeUndefined();
    const so = await createSession(pool, owner, "aal2");
    expect(await asUser(so, (tx) => isPlatformAdmin(tx))).toBe(false);
    await expect(asUser(so, (tx) => requirePlatformAdmin(tx))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Inviti", () => {
  it("flusso completo: invito, accettazione, token non riutilizzabile", async () => {
    const invitee = await createUser(pool, "invitato");
    const sAdmin = await createSession(pool, admin);
    const inv = await asUser(sAdmin, async (tx) => {
      const access = await switchActiveTenant(tx, tenantA);
      return createInvitation(tx, access, {
        email: invitee.email.toUpperCase(),
        roleKey: "technician",
      });
    });
    expect(inv.email).toBe(invitee.email);
    const stored = await pool.query("select token_hash from public.invitations where id = $1", [
      inv.invitationId,
    ]);
    expect(stored.rows[0]!.token_hash).toBe(hashInvitationToken(inv.token));
    expect(stored.rows[0]!.token_hash).not.toContain(inv.token);

    const sInv = await createSession(pool, invitee);
    expect(await asUser(sInv, (tx) => acceptInvitation(tx, inv.token))).toBe(tenantA);
    const access = await asUser(sInv, (tx) => resolveActiveTenant(tx));
    expect(access).toMatchObject({ tenantId: tenantA, roleKey: "technician" });

    await expect(asUser(sInv, (tx) => acceptInvitation(tx, inv.token))).rejects.toMatchObject({
      code: "INVALID_INVITATION",
    });
  });

  it("l'invito è legato all'email: un altro utente non può usarlo", async () => {
    const sAdmin = await createSession(pool, admin);
    const inv = await asUser(sAdmin, async (tx) =>
      createInvitation(tx, await resolveActiveTenant(tx), {
        email: `${uniq("x")}@test.invalid`,
        roleKey: "technician",
      }),
    );
    const s = await createSession(pool, outsider);
    await expect(asUser(s, (tx) => acceptInvitation(tx, inv.token))).rejects.toMatchObject({
      code: "INVITATION_EMAIL_MISMATCH",
    });
    await expect(asUser(s, (tx) => acceptInvitation(tx, "x".repeat(10)))).rejects.toMatchObject({
      code: "INVALID_INVITATION",
    });
  });

  it("chi non gestisce i membri non invita; un amministratore non invita titolari", async () => {
    const sTech = await createSession(pool, tech);
    await expect(
      asUser(sTech, async (tx) =>
        createInvitation(tx, await switchActiveTenant(tx, tenantA), {
          email: "a@test.invalid",
          roleKey: "technician",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const sAdmin = await createSession(pool, admin);
    await expect(
      asUser(sAdmin, async (tx) =>
        createInvitation(tx, await resolveActiveTenant(tx), {
          email: "b@test.invalid",
          roleKey: "owner",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      asUser(sAdmin, async (tx) =>
        createInvitation(tx, await resolveActiveTenant(tx), {
          email: "non-una-email",
          roleKey: "technician",
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("titolare con sessione aal1 non può invitare (serve MFA)", async () => {
    const s = await createSession(pool, owner, "aal1");
    await expect(
      asUser(s, async (tx) =>
        createInvitation(tx, await resolveActiveTenant(tx), {
          email: "c@test.invalid",
          roleKey: "technician",
        }),
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });

  it("un invito revocato non è più accettabile", async () => {
    const invitee = await createUser(pool, "revocato");
    const sAdmin = await createSession(pool, admin);
    const inv = await asUser(sAdmin, async (tx) =>
      createInvitation(tx, await resolveActiveTenant(tx), {
        email: invitee.email,
        roleKey: "back_office",
      }),
    );
    await asUser(sAdmin, async (tx) =>
      revokeInvitation(tx, await resolveActiveTenant(tx), inv.invitationId),
    );
    await expect(
      asUser(sAdmin, async (tx) =>
        revokeInvitation(tx, await resolveActiveTenant(tx), inv.invitationId),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    const s = await createSession(pool, invitee);
    await expect(asUser(s, (tx) => acceptInvitation(tx, inv.token))).rejects.toMatchObject({
      code: "INVALID_INVITATION",
    });
  });
});

describe("Registrazione azienda", () => {
  it("crea l'azienda in prova con l'utente della sessione come titolare", async () => {
    const u = await createUser(pool, "fondatore");
    const s = await createSession(pool, u, "aal1");
    const { tenantId, slug } = await asUser(s, (tx) =>
      registerCompany(tx, { name: "  Edilizia Àlfa & Figli  " }),
    );
    expect(slug).toMatch(/^edilizia-alfa-figli-[a-z0-9]{6}$/);
    const access = await asUser(s, (tx) => resolveActiveTenant(tx));
    expect(access).toMatchObject({ tenantId, roleKey: "owner" });
    const sub = await pool.query(
      "select plan_code, status, seats from public.subscriptions where tenant_id = $1",
      [tenantId],
    );
    expect(sub.rows[0]).toEqual({ plan_code: "trial", status: "trialing", seats: 5 });
  });

  it("email non confermata: rifiutata", async () => {
    const u = await createUser(pool, "nonconfermato", { confirmed: false });
    const s = await createSession(pool, u);
    await expect(
      asUser(s, (tx) => registerCompany(tx, { name: "Azienda X" })),
    ).rejects.toMatchObject({
      code: "EMAIL_NOT_CONFIRMED",
    });
  });

  it("limite di 3 aziende per titolare", async () => {
    const u = await createUser(pool, "seriale");
    const s = await createSession(pool, u);
    for (let i = 0; i < 3; i++) {
      await asUser(s, (tx) => registerCompany(tx, { name: `Azienda ${i}` }));
    }
    await expect(
      asUser(s, (tx) => registerCompany(tx, { name: "Azienda 4" })),
    ).rejects.toMatchObject({
      code: "COMPANY_LIMIT_REACHED",
    });
  });

  it("nome non valido: rifiutato", async () => {
    const u = await createUser(pool, "nome");
    const s = await createSession(pool, u);
    await expect(asUser(s, (tx) => registerCompany(tx, { name: " " }))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("anon non può registrare aziende direttamente nel database", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      await expect(
        client.query("select app.register_company('X Y', 'x-y-abcdef')"),
      ).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});

describe("Transazioni di servizio", () => {
  it("registrano l'attore dichiarato nell'audit", async () => {
    const id = await withServiceTransaction(pool, admin.id, async (tx) => {
      const role = await tx.query<{ r: string }>("select current_user as r");
      expect(role.rows[0]!.r).toBe("service_role");
      const { rows } = await tx.query<{ id: string }>(
        "insert into public.suppliers (tenant_id, display_name) values ($1, 'Fornitore worker') returning id",
        [tenantA],
      );
      return rows[0]!.id;
    });
    const audit = await pool.query(
      "select actor_user_id from public.audit_log where record_id = $1",
      [id],
    );
    expect(audit.rows[0]!.actor_user_id).toBe(admin.id);
  });
});
