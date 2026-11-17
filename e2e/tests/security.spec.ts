import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/** Protezioni trasversali: limite ai tentativi, intestazioni di sicurezza. */

test("dopo troppi tentativi di accesso sulla stessa email l'accesso è sospeso", async ({ page }) => {
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
