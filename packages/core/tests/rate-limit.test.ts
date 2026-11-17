import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hitRateLimit, RATE_LIMITS, rateLimitMessage, resetRateLimit } from "../src/index";
import { createPool } from "./helpers/fixtures";

let pool: pg.Pool;
beforeAll(() => {
  pool = createPool();
});
afterAll(async () => {
  await pool.end();
});

describe("Limite ai tentativi", () => {
  it("blocca oltre il limite per la stessa email, senza toccare le altre", async () => {
    const email = `rl-${Date.now()}@example.invalid`;
    const { limit } = RATE_LIMITS.login_email;
    for (let i = 0; i < limit; i++) {
      expect((await hitRateLimit(pool, "login_email", email)).allowed).toBe(true);
    }
    const blocked = await hitRateLimit(pool, "login_email", email.toUpperCase()); // stessa chiave
    expect(blocked.allowed).toBe(false);
    expect(rateLimitMessage(blocked.retryAfterSeconds)).toMatch(
      /^Troppi tentativi\. Riprova tra \d+ minut/,
    );
    expect((await hitRateLimit(pool, "login_email", `altro-${email}`)).allowed).toBe(true);
    await resetRateLimit(pool, "login_email", email);
    expect((await hitRateLimit(pool, "login_email", email)).allowed).toBe(true);
  });

  it("i contatori salvano solo hash", async () => {
    const { rows } = await pool.query(
      "select count(*)::int n from app.rate_limits where encode(key_hash, 'escape') like '%example.invalid%'",
    );
    expect(rows[0].n).toBe(0);
  });

  it("senza chiave il controllo non blocca", async () => {
    expect(await hitRateLimit(pool, "login_ip", null)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});
