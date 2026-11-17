import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/** Protezioni trasversali: limite ai tentativi, intestazioni di sicurezza. */

test("dopo troppi tentativi di accesso sulla stessa email l'accesso è sospeso", async ({
  page,
}) => {
  const email = `forza-bruta-${Date.now().toString(36)}@example.invalid`;
  for (let i = 0; i < 8; i++) {
    await signIn(page, email, "password-sbagliata");
    await expect(page.getByText("Email o password non corretti.")).toBeVisible();
  }
  await signIn(page, email, "password-sbagliata");
  await expect(page.getByText(/Troppi tentativi\. Riprova tra \d+ minut/)).toBeVisible();
});

test("un accesso riuscito azzera il contatore dell'account", async ({ page }) => {
  const owner = await createOwner(page, "rl", `E2E Limiti ${Date.now().toString(36)}`);
  await page.context().clearCookies();
  for (let i = 0; i < 7; i++) {
    await signIn(page, owner.email, "password-sbagliata");
    await expect(page.getByText("Email o password non corretti.")).toBeVisible();
  }
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await expect(page).toHaveURL(/\/app$/);
  await page.context().clearCookies();
  await signIn(page, owner.email, "password-sbagliata");
  await expect(page.getByText("Email o password non corretti.")).toBeVisible();
});

test("intestazioni di sicurezza e CSP con nonce, senza violazioni nelle pagine principali", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text()))
      violations.push(m.text());
  });
  const res = await page.goto("/accedi");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age=");
  // il nonce cambia a ogni richiesta
  const again = (await page.request.get("/accedi")).headers()["content-security-policy"];
  expect(again).not.toBe(h["content-security-policy"]);

  await createOwner(page, "csp", `E2E CSP ${Date.now().toString(36)}`);
  for (const path of ["/app", "/app/clienti", "/app/scadenze", "/app/documenti", "/app/registro"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
  // la palette comandi (script client) funziona con la CSP
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/Cerca clienti/)).toBeVisible();
  expect(violations).toEqual([]);
});
