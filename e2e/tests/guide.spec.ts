import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/** Guida all'uso: raggiungibile dal menu, ricerca senza accenti, link alle sezioni. */
test("la guida si apre dal menu, cerca e porta alla sezione", async ({ page }) => {
  await createOwner(page, "gui", `E2E Guida ${Date.now().toString(36)}`);
  await page.getByRole("link", { name: "Guida", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/guida$/);
  await expect(page.getByRole("heading", { name: "Guida", level: 1 })).toBeVisible();
  // il titolare vede anche le voci riservate (utenti, registro)
  await expect(page.getByRole("heading", { name: "Utenti e ruoli" })).toBeVisible();

  const search = page.getByLabel("Cerca nella guida");
  await search.fill("firma");
  const entries = page.getByTestId("guide-entry");
  await expect(entries.filter({ hasText: "Conferma firma" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pagamenti" })).toHaveCount(0);

  // senza accenti: "attivita" trova "Attività"
  await search.fill("attivita assegnata");
  await expect(page.getByTestId("guide-topic").first()).toBeVisible();

  await search.fill("parolachenonesiste");
  await expect(page.getByText("Nessuna risposta trovata")).toBeVisible();

  await search.fill("");
  await page.locator("#moduli").getByRole("link", { name: /Apri/ }).first().click();
  await expect(page).toHaveURL(/\/app\/moduli$/);
});
