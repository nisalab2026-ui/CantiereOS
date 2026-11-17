import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, expectPgError, type Db } from "./helpers/db.js";

/** Codici di recupero MFA: solo hash, usa e getta, generazione solo con MFA verificata. */
let db: Db;
let mario: string, luigi: string;
const h = (user: string, code: string) => createHash("sha256").update(`${user}:${code}`).digest();
const codes = (user: string, prefix: string) =>
  Array.from({ length: 10 }, (_, i) => h(user, `${prefix}-${i}`));

beforeAll(async () => {
  db = await connect();
  mario = await createUser(db, "mario-mfa");
  luigi = await createUser(db, "luigi-mfa");
});
afterAll(async () => {
  await db.end();
});

/** Come asUser ma con commit (i passi si vedono tra una transazione e l'altra, come nell'app). */
async function committed<T>(user: string, aal: "aal1" | "aal2", fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user, role: "authenticated", aal }),
    ]);
    const r = await fn();
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

const status = async () =>
  (await db.query<{ remaining: number }>("select * from app.mfa_recovery_status()")).rows[0]!
    .remaining;

describe("Codici di recupero MFA", () => {
  it("generare richiede una sessione verificata con MFA", async () => {
    await asUser(
      db,
      mario,
      async () => {
        await expectPgError(
          db.query("select app.mfa_recovery_generate($1)", [codes(mario, "a")]),
          "42501",
        );
      },
      "aal1",
    );
  });

  it("un codice si usa una sola volta; una nuova serie annulla la precedente", async () => {
    const use = async (c: Buffer) =>
      committed(
        mario,
        "aal1",
        async () =>
          (await db.query<{ ok: boolean }>("select app.mfa_recovery_consume($1) ok", [c])).rows[0]!
            .ok,
      );
    await committed(mario, "aal2", () =>
      db.query("select app.mfa_recovery_generate($1)", [codes(mario, "a")]),
    );
    expect(await committed(mario, "aal1", status)).toBe(10);
    expect(await use(h(mario, "a-3"))).toBe(true);
    expect(await use(h(mario, "a-3"))).toBe(false); // già usato
    expect(await use(h(mario, "sbagliato"))).toBe(false);
    expect(await committed(mario, "aal1", status)).toBe(9);

    await committed(mario, "aal2", () =>
      db.query("select app.mfa_recovery_generate($1)", [codes(mario, "b")]),
    );
    expect(await use(h(mario, "a-1"))).toBe(false); // serie precedente annullata
    expect(await committed(mario, "aal1", status)).toBe(10);
  });

  it("i codici di un utente non valgono per un altro", async () => {
    await asUser(
      db,
      luigi,
      async () => {
        const r = await db.query<{ ok: boolean }>("select app.mfa_recovery_consume($1) ok", [
          h(mario, "b-1"),
        ]);
        expect(r.rows[0]!.ok).toBe(false);
        expect(await status()).toBe(0);
      },
      "aal1",
    );
  });

  it("nessun accesso diretto alla tabella; anonimi esclusi", async () => {
    await asUser(db, mario, async () => {
      await expectPgError(db.query("select * from app.mfa_recovery_codes"), "42501");
    });
    await asUser(db, null, async () => {
      await expectPgError(
        db.query("select app.mfa_recovery_consume($1)", [h(mario, "b-1")]),
        "42501",
      );
    });
  });

  it("serie troppo corte o lunghe vengono rifiutate", async () => {
    await asUser(db, mario, async () => {
      await expectPgError(
        db.query("select app.mfa_recovery_generate($1)", [codes(mario, "c").slice(0, 2)]),
        "22023",
      );
    });
  });
});
