import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  become,
  connect,
  createUser,
  expectPgError,
  insertRow,
  roleId,
  tx,
  type Db,
} from "./helpers/db.js";
import { seedTwoTenants, type Seed } from "./helpers/fixtures.js";

/** Notifiche: ognuno vede e segna come lette solo le proprie; solo il sistema le crea. */
let db: Db;
let s: Seed;

beforeAll(async () => {
  db = await connect();
  s = await seedTwoTenants(db);
});

afterAll(async () => {
  await db.end();
});

describe("Notifiche", () => {
  it("il destinatario vede la propria notifica, i colleghi no", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const { rows } = await db.query<{ id: string }>("select id from public.notifications");
      expect(rows.map((r) => r.id)).toEqual([s.a.notification]);
    });
    for (const u of [
      s.users.aliceOwnerA,
      s.users.graceAdminA,
      s.users.tomTechB,
      s.users.outsider,
    ]) {
      await asUser(db, u, async () => {
        const { rowCount } = await db.query("select 1 from public.notifications where id = $1", [
          s.a.notification,
        ]);
        expect(rowCount).toBe(0);
      });
    }
  });

  it("si può solo segnare come letta, non riscrivere il contenuto", async () => {
    await asUser(db, s.users.bobTechA, async () => {
      const ok = await db.query("update public.notifications set read_at = now() where id = $1", [
        s.a.notification,
      ]);
      expect(ok.rowCount).toBe(1);
      await expectPgError(
        db.query("update public.notifications set title = 'x' where id = $1", [s.a.notification]),
        "42501",
      );
    });
    await asUser(db, s.users.aliceOwnerA, async () => {
      const r = await db.query("update public.notifications set read_at = now() where id = $1", [
        s.a.notification,
      ]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("nessun utente può creare o cancellare notifiche", async () => {
    await asUser(db, s.users.aliceOwnerA, async () => {
      await expectPgError(
        db.query(
          "insert into public.notifications (tenant_id, user_id, kind, title) values ($1, $2, 'x.y', 'Falsa')",
          [s.tenantA, s.users.bobTechA],
        ),
        "42501",
      );
    });
    await asUser(db, s.users.bobTechA, async () => {
      await expectPgError(db.query("delete from public.notifications"), "42501");
    });
  });

  it("membro sospeso: le notifiche dell'azienda non sono più visibili", async () => {
    await tx(db, async () => {
      await db.query(
        "update public.memberships set status = 'suspended' where tenant_id = $1 and user_id = $2",
        [s.tenantA, s.users.bobTechA],
      );
      await become(db, s.users.bobTechA);
      const { rowCount } = await db.query("select 1 from public.notifications");
      expect(rowCount).toBe(0);
    });
  });

  it("link solo interni e destinatario membro dell'azienda", async () => {
    await expectPgError(
      insertRow(db, "notifications", {
        tenant_id: s.tenantA,
        user_id: s.users.bobTechA,
        kind: "x.y",
        title: "Esterno",
        link: "https://evil.invalid",
      }),
      "23514",
    );
    await expectPgError(
      insertRow(db, "notifications", {
        tenant_id: s.tenantA,
        user_id: s.users.tomTechB,
        kind: "x.y",
        title: "Fuori azienda",
      }),
      "23503",
    );
  });

  it("invito accettato: chi ha invitato riceve una notifica", async () => {
    const invitee = await createUser(db, "notificato");
    const { rows } = await db.query<{ email: string }>(
      "select email from auth.users where id = $1",
      [invitee],
    );
    const token = randomBytes(32).toString("base64url");
    await tx(db, async () => {
      // l'invito lo crea l'amministratrice (attore dichiarato, come farebbe il server)
      await db.query("select set_config('app.actor_user_id', $1, true)", [s.users.graceAdminA]);
      await insertRow(db, "invitations", {
        tenant_id: s.tenantA,
        email: rows[0]!.email,
        role_id: await roleId(db, "technician"),
        token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
        expires_at: new Date(Date.now() + 86_400_000),
      });
      await db.query("select set_config('app.actor_user_id', '', true)");
      await become(db, invitee);
      await db.query("select app.accept_invitation($1)", [token]);
      await become(db, s.users.graceAdminA);
      const n = await db.query<{ kind: string; link: string }>(
        "select kind, link from public.notifications where tenant_id = $1",
        [s.tenantA],
      );
      expect(n.rows).toEqual([{ kind: "members.invitation_accepted", link: "/app/membri" }]);
    });
  });
});
