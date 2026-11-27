import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/** Blocco 5: profilo personale e dati dell'azienda. */
test("profilo e dati azienda: modifica, validazione, aggiornamento del menu", async ({ page }) => {
  const company = `E2E Profilo ${Date.now().toString(36)}`;
  await createOwner(page, "profilo", company);

  // Profilo dal menu utente.
  await page.getByRole("button", { name: "Menu utente" }).click();
  await page.getByRole("menuitem", { name: "Profilo" }).click();
  await expect(page.getByTestId("profile-title")).toHaveText("Profilo");
  await expect(page.getByTestId("my-companies")).toContainText(company);
  await page.getByLabel("Telefono").fill("chiamami");
  await page.getByRole("button", { name: "Salva profilo" }).click();
  await expect(page.locator("#pf-phone-error")).toBeVisible();
  await page.getByLabel("Nome e cognome").fill("Giulia Neri");
  await page.getByLabel("Telefono").fill("+39 333 0000000");
  await page.getByRole("button", { name: "Salva profilo" }).click();
  await expect(page.getByTestId("toast")).toContainText("Profilo aggiornato.");
  await page.reload();
  await expect(page.getByLabel("Nome e cognome")).toHaveValue("Giulia Neri");

  // Dati azienda dal menu laterale.
  await page.getByRole("link", { name: "Dati azienda" }).click();
  await expect(page.getByTestId("company-title")).toHaveText("Dati azienda");
  await page.getByLabel("Partita IVA").fill("??");
  await page.getByRole("button", { name: "Salva dati azienda" }).click();
  await expect(page.locator("#co-vatNumber-error")).toBeVisible();
  await page.getByLabel("Nome dell'azienda").fill(`${company} Srl`);
  await page.getByLabel("Partita IVA").fill("it09876543210");
  await page.getByRole("button", { name: "Salva dati azienda" }).click();
  await expect(page.getByTestId("toast")).toContainText("Dati dell'azienda salvati.");
  await page.reload();
  await expect(page.getByLabel("Partita IVA")).toHaveValue("IT09876543210");
  // il nuovo nome compare nel selettore azienda
  await expect(page.getByRole("complementary")).toContainText(`${company} Srl`);
});
