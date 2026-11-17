import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, expectPgError, tx, type Db } from "./helpers/db.js";

/** Limite ai tentativi: solo il server (service_role) lo usa; nessun client vede i contatori. */
let db: Db;
const key = (s: string) => createHash("sha256").update(s).digest();

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

const hit = (k: Buffer, limit = 3, windowSec = 60) =>
  db.query<{ allowed: boolean; hits: number; retry_after: number }>(
    "select * from app.rate_limit_hit('login_email', $1, $2, $3)",
    [k, limit, windowSec],
  );

describe("Limite ai tentativi", () => {
  it("consente fino al limite, poi blocca con il tempo di attesa", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      const k = key("email:mario@example.invalid");
      for (let i = 1; i <= 3; i++)
        expect((await hit(k)).rows[0]).toMatchObject({ allowed: true, hits: i });
      const blocked = (await hit(k)).rows[0]!;
      expect(blocked.allowed).toBe(false);
      expect(blocked.retry_after).toBeGreaterThan(0);
      expect(blocked.retry_after).toBeLessThanOrEqual(60);
      // chiavi diverse non si influenzano
      expect((await hit(key("email:altro@example.invalid"))).rows[0]!.allowed).toBe(true);
      // reset dopo un accesso riuscito
      await db.query("select app.rate_limit_reset('login_email', $1)", [k]);
      expect((await hit(k)).rows[0]).toMatchObject({ allowed: true, hits: 1 });
    });
  });

  it("una finestra scaduta riparte da zero", async () => {
    await tx(db, async () => {
      const k = key("ip:203.0.113.9");
      await db.query(
        "insert into app.rate_limits values ('login_email', $1, now() - interval '2 minutes', 99)",
        [k],
      );
      await db.query("set local role service_role");
      expect((await hit(k)).rows[0]).toMatchObject({ allowed: true, hits: 1 });
    });
  });

  it("i client non possono usare né leggere i contatori", async () => {
    for (const user of [null, "00000000-0000-4000-8000-000000000001"]) {
      await asUser(db, user, async () => {
        await expectPgError(hit(key("x")), "42501");
      });
      await asUser(db, user, async () => {
        await expectPgError(db.query("select * from app.rate_limits"), "42501");
      });
    }
  });

  it("parametri non validi vengono rifiutati", async () => {
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(hit(key("x"), 0), "22023");
    });
    await tx(db, async () => {
      await db.query("set local role service_role");
      await expectPgError(
        db.query("select * from app.rate_limit_hit('LOGIN', $1, 3, 60)", [key("x")]),
        "23514",
      );
    });
  });
});
