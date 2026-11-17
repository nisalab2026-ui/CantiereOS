import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/**
 * Operatività: scadenziario, schede di dettaglio con modifica e storico,
 * registro attività, dashboard "Richiede attenzione". Stack reale.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Operativa ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };

const isoInDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("persona: creazione, scheda, modifica con storico prima/dopo", async ({ page }) => {
  owner = await createOwner(page, "op", company);
  await page.getByRole("link", { name: "Personale", exact: true }).click();
  await page.getByRole("button", { name: "Nuova persona" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuova persona" });
  await dialog.getByRole("textbox", { name: "Nome", exact: true }).fill("Mario");
  await dialog.getByLabel("Cognome").fill("Rossi");
  await dialog.getByLabel("Mansione").fill("Elettricista");
  await dialog.getByLabel("Assunzione").fill("2024-03-01");
  await dialog.getByLabel("Cessazione").fill("2023-01-01");
  await dialog.getByRole("button", { name: "Aggiungi" }).click();
  await expect(dialog.getByText("La cessazione non può precedere l'assunzione")).toBeVisible();
  await dialog.getByLabel("Cessazione").fill("");
  await dialog.getByRole("button", { name: "Aggiungi" }).click();

  await expect(page).toHaveURL(/\/app\/personale\/[0-9a-f-]{36}\?creato=1$/);
  await expect(page.getByTestId("employee-title")).toHaveText("Mario Rossi");
  await expect(page.getByRole("navigation", { name: "Percorso" })).toContainText("Personale");

  await page.getByRole("button", { name: "Modifica" }).click();
  const edit = page.getByRole("dialog", { name: "Modifica persona" });
  await edit.getByLabel("Mansione").fill("Capocantiere");
  await edit.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByText("Capocantiere").first()).toBeVisible();

  await page.getByRole("link", { name: "Storico" }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("ha modificato");
  await expect(timeline).toContainText("Mansione");
  await expect(timeline).toContainText("Elettricista");
  await expect(timeline).toContainText("Capocantiere");
});

test("scadenza ricorrente: creazione dalla scheda, completamento e successiva", async ({
  page,
}) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/personale");
  await page.getByTestId("employee-link").filter({ hasText: "Rossi" }).click();
  await page.getByRole("button", { name: "Nuova scadenza" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuova scadenza" });
  await expect(dialog.getByText("Rossi Mario")).toBeVisible(); // collegamento già deciso
  await dialog.getByLabel("Titolo").fill("Patentino PLE");
  await dialog.getByLabel("Data di scadenza").fill(isoInDays(-2));
  await dialog.getByLabel("Ricorrenza").selectOption("12");
  await dialog.getByRole("button", { name: "Crea scadenza" }).click();

  await expect(page).toHaveURL(/\/app\/scadenze\/[0-9a-f-]{36}\?creata=1$/);
  await expect(page.getByTestId("deadline-title")).toHaveText("Patentino PLE");
  await expect(page.getByTestId("deadline-state").first()).toHaveText("In ritardo");

  await page.getByRole("button", { name: "Segna come completata" }).click();
  const complete = page.getByRole("dialog", { name: "Completare la scadenza?" });
  await complete.getByLabel("Note (facoltative)").fill("Rinnovato, nuovo numero 1234");
  await complete.getByRole("button", { name: "Completa" }).click();

  await expect(page).toHaveURL(/\/app\/scadenze\/[0-9a-f-]{36}\?successiva=1$/);
  await expect(page.getByTestId("deadline-state").first()).toHaveText("Programmata");
  await page.getByRole("link", { name: "Scadenza precedente" }).click();
  await expect(page.getByTestId("deadline-state").first()).toHaveText("Completata");
  await expect(page.getByText("Rinnovato, nuovo numero 1234").first()).toBeVisible();
  await expect(page.getByTestId("next-deadline")).toBeVisible();
});

test("scadenziario: filtri nell'URL e ricerca globale delle scadenze", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.getByRole("link", { name: "Scadenze", exact: true }).click();
  await expect(page.getByTestId("data-table")).toContainText("Patentino PLE");
  await page.getByLabel("Stato").selectOption("done");
  await expect(page).toHaveURL(/state=done/);
  await expect(page.getByTestId("data-table")).toContainText("Patentino PLE");
  await expect(page.getByTestId("deadline-state").first()).toHaveText("Completata");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("patentino");
  await page.getByTestId("search-result").first().click();
  await expect(page).toHaveURL(/\/app\/scadenze\/[0-9a-f-]{36}$/);
});

test("dashboard: priorità collegate alle liste e ultime modifiche leggibili", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/scadenze");
  await page.getByRole("button", { name: "Nuova scadenza" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuova scadenza" });
  await dialog.getByLabel("Titolo").fill("Revisione gru");
  await dialog.getByLabel("Tipo").selectOption("maintenance");
  await dialog.getByLabel("Data di scadenza").fill(isoInDays(-1));
  await dialog.getByRole("button", { name: "Crea scadenza" }).click();
  await expect(page.getByTestId("deadline-title")).toHaveText("Revisione gru");

  await page.goto("/app");
  const overdue = page.getByTestId("priority-overdue");
  await expect(overdue.getByTestId("priority-value")).toHaveText("1");
  await expect(page.getByTestId("urgent-list")).toContainText("Revisione gru");
  await expect(page.getByTestId("recent-activity")).toContainText("ha creato scadenza");
  await overdue.click();
  await expect(page).toHaveURL(/\/app\/scadenze\?state=overdue$/);
  await expect(page.getByTestId("data-table")).toContainText("Revisione gru");
});

test("registro attività: filtri per sezione e avvisi di scadenza nelle notifiche", async ({
  page,
}) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.getByRole("link", { name: "Registro attività" }).click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.getByLabel("Sezione").selectOption("employees");
  await expect(page).toHaveURL(/sezione=employees/);
  await expect(page.getByTestId("timeline-event").first()).toContainText("Dipendente");
  await expect(page.getByTestId("timeline")).not.toContainText(/scadenza/i);

  // la scadenza in ritardo senza responsabile genera un avviso per chi gestisce le scadenze
  await page.getByRole("button", { name: /Notifiche/ }).click();
  await expect(page.getByText("Scadenza superata").first()).toBeVisible();
});
