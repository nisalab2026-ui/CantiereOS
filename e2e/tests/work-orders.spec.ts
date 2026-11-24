import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

/**
 * Interventi (ADR-017): l'ufficio pianifica dal gestionale, la persona
 * collegata al proprio account lo trova nella web app /campo sul telefono,
 * lo avvia, lascia una nota e lo completa; l'ufficio vede lo stato aggiornato.
 */
test("intervento: pianificato in ufficio, svolto dal telefono", async ({ page }) => {
  await createOwner(page, "int", `E2E Interventi ${Date.now().toString(36)}`);

  // La persona che andrà sul posto (qui è il titolare stesso).
  await page.getByRole("link", { name: "Personale", exact: true }).click();
  await page.getByRole("button", { name: "Nuova persona" }).click();
  const person = page.getByRole("dialog", { name: "Nuova persona" });
  await person.getByRole("textbox", { name: "Nome", exact: true }).fill("Mario");
  await person.getByLabel("Cognome").fill("Rossi");
  await person.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page).toHaveURL(/\/app\/personale\/[0-9a-f-]{36}\?creato=1$/);
  const personUrl = page.url().replace(/\?.*$/, "");

  // Intervento di oggi con indirizzo, assegnato a Mario.
  await page.getByRole("link", { name: "Interventi", exact: true }).click();
  await page.getByRole("link", { name: "Nuovo intervento" }).first().click();
  await page.locator("#wo-title").fill("Sostituzione grondaia");
  await page.locator("#wo-priority").selectOption({ label: "Alta" });
  await page.locator("#wo-description").fill("Portare scala da 7 m.");
  await page.locator("#wo-date").fill(today);
  await page.locator("#wo-startTime").fill("08:00");
  await page.locator("#wo-endTime").fill("23:30");
  await page.getByText("Indirizzo diverso").click();
  await page.locator("#wo-addressLine").fill("Via Verdi 3");
  await page.locator("#wo-city").fill("Bergamo");
  await page.getByRole("checkbox", { name: "Mario Rossi" }).check();
  await page.getByRole("button", { name: "Crea intervento" }).click();
  await expect(page).toHaveURL(/\/app\/interventi\/[0-9a-f-]{36}\?creato=1$/);
  const orderUrl = page.url().replace(/\?.*$/, "");
  await expect(page.getByRole("heading", { name: "Sostituzione grondaia" })).toBeVisible();

  // Senza account collegato, la web app non mostra nulla.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campo");
  await expect(page.getByText("Nessun intervento oggi")).toBeVisible();

  // L'ufficio collega l'account alla persona.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(personUrl);
  await page.getByLabel("Account collegato").selectOption({ label: "E2E int" });
  await page.getByRole("button", { name: "Aggiorna collegamento" }).click();
  await expect(page.getByText("Account collegato.")).toBeVisible();

  // Sul telefono: l'intervento è il prossimo, con Naviga verso l'indirizzo.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campo");
  const next = page.getByTestId("field-next");
  await expect(next).toContainText("Sostituzione grondaia");
  await expect(next).toContainText("Via Verdi 3");
  await next.click();
  await expect(page.getByTestId("field-order-title")).toHaveText("Sostituzione grondaia");
  await expect(page.getByText("Portare scala da 7 m.")).toBeVisible();
  await expect(page.getByTestId("field-navigate")).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir\/.*Via(\+|%20)Verdi/,
  );

  await page.getByTestId("wo-start").click();
  await expect(page.getByTestId("wo-complete")).toBeVisible();
  await page.getByPlaceholder(/Cosa hai trovato/).fill("Grondaia sostituita, tubo ok.");
  await page.getByRole("button", { name: "Salva note" }).click();
  await expect(page.getByText("Note salvate.")).toBeVisible();
  await page.getByTestId("wo-complete").click();
  await expect(page.getByTestId("wo-complete")).toHaveCount(0);

  await page.goto("/campo");
  await expect(page.getByText("Hai chiuso tutto per oggi")).toBeVisible();
  await page.goto("/campo/storico");
  await expect(page.getByText("Sostituzione grondaia")).toBeVisible();

  // In ufficio: stato e note aggiornati.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(orderUrl);
  await expect(page.getByText("Completato").first()).toBeVisible();
  await expect(page.getByPlaceholder(/Cosa hai trovato/)).toHaveValue(
    "Grondaia sostituita, tubo ok.",
  );
});
