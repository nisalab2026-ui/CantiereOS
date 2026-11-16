import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier, sessionClaims, type TokenVerifier } from "../src/index.js";

/**
 * Verifica dei token di accesso: è ciò che impedisce a un client di
 * presentarsi come un altro utente, alzare il livello MFA o cambiare ruolo
 * modificando cookie o token nel browser.
 */
const ISSUER = "http://auth.test.invalid/auth/v1";
const SECRET = randomBytes(32).toString("hex"); // generato a ogni run, mai nel codice

function claims(overrides: JWTPayload = {}): JWTPayload {
  return {
    sub: randomUUID(),
    role: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    email: "Utente@Test.invalid",
    ...overrides,
  };
}

async function hsToken(payload: JWTPayload, opts: { secret?: string; exp?: string | number } = {}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("Verifica JWT con chiave HS256", () => {
  const verify = createTokenVerifier({ issuer: ISSUER, hs256Secret: SECRET });

  it("accetta un token valido e normalizza i campi", async () => {
    const payload = claims({ aal: "aal2" });
    const session = await verify(await hsToken(payload));
    expect(session).toMatchObject({
      userId: payload.sub,
      sessionId: payload.session_id,
      aal: "aal2",
      email: "utente@test.invalid",
    });
    expect(Object.isFrozen(session)).toBe(true);
    expect(JSON.parse(sessionClaims(session))).toEqual({
      sub: payload.sub,
      role: "authenticated",
      aal: "aal2",
      session_id: payload.session_id,
      email: "utente@test.invalid",
    });
  });

  it("rifiuta token assente o malformato", async () => {
    for (const t of [undefined, null, "", "abc", "a.b.c"]) {
      await expect(verify(t)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("rifiuta un payload manomesso (cambio utente o aal1 → aal2)", async () => {
    const token = await hsToken(claims());
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString());
    for (const forged of [
      { ...decoded, aal: "aal2" },
      { ...decoded, sub: randomUUID() },
      { ...decoded, role: "service_role" },
    ]) {
      await expect(verify(`${header}.${b64url(forged)}.${signature}`)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
  });

  it("rifiuta firma con un'altra chiave e token senza firma (alg none)", async () => {
    await expect(
      verify(await hsToken(claims(), { secret: randomBytes(32).toString("hex") })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const unsigned = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
      ...claims(),
      iss: ISSUER,
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
    await expect(verify(unsigned)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rifiuta token scaduto, emittente o audience diversi", async () => {
    await expect(
      verify(await hsToken(claims(), { exp: Math.floor(Date.now() / 1000) - 60 })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const otherIssuer = await new SignJWT(claims())
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("http://evil.invalid/auth/v1")
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verify(otherIssuer)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const otherAudience = await new SignJWT(claims())
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience("anon")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verify(otherAudience)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rifiuta ruoli diversi da authenticated, sessioni anonime e claim mancanti", async () => {
    for (const payload of [
      claims({ role: "anon" }),
      claims({ role: "service_role" }),
      claims({ is_anonymous: true }),
      claims({ aal: "aal3" }),
      claims({ sub: "non-un-uuid" }),
      { ...claims(), session_id: undefined },
    ]) {
      await expect(verify(await hsToken(payload))).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
  });

  it("configurazione: una sola chiave, segreto non troppo corto, emittente obbligatorio", () => {
    expect(() => createTokenVerifier({ issuer: ISSUER })).toThrow();
    expect(() =>
      createTokenVerifier({ issuer: ISSUER, hs256Secret: SECRET, jwksUrl: "http://x.invalid" }),
    ).toThrow();
    expect(() => createTokenVerifier({ issuer: ISSUER, hs256Secret: "corto" })).toThrow();
    expect(() => createTokenVerifier({ issuer: "", hs256Secret: SECRET })).toThrow();
  });
});

describe("Verifica JWT con chiavi asimmetriche (JWKS)", () => {
  let server: Server;
  let verify: TokenVerifier;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  const kid = "test-key";

  beforeAll(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid, alg: "ES256", use: "sig" };
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    verify = createTokenVerifier({
      issuer: ISSUER,
      jwksUrl: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    });
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("accetta un token ES256 firmato dalla chiave pubblicata", async () => {
    const payload = claims();
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(privateKey);
    await expect(verify(token)).resolves.toMatchObject({ userId: payload.sub });
  });

  it("rifiuta un token HS256 (confusione di algoritmi) e uno firmato da un'altra chiave", async () => {
    await expect(verify(await hsToken(claims()))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const other = await generateKeyPair("ES256");
    const token = await new SignJWT(claims())
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(other.privateKey);
    await expect(verify(token)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
