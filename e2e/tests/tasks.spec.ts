import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/**
 * Attività assegnabili, commenti interni e calendario (ADR-011), contro lo
 * stack reale: creazione dalla scheda del dipendente con validazione,
 * cambi di stato con storico, commenti, calendario, ricerca ed esportazione.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Attivita ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const due = inDays(2);

test("attività dalla scheda, commenti e completamento con storico", async ({ page }) => {
  owner = await createOwner(page, "att", company);
  await page.getByRole("link", { name: "Personale", exact: true }).click();
  await page.getByRole("button", { name: "Nuova persona" }).click();
  const person = page.getByRole("dialog", { name: "Nuova persona" });
  await person.getByRole("textbox", { name: "Nome", exact: true }).fill("Luca");
  await person.getByLabel("Cognome").fill("Verdi");
  await person.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.getByTestId("employee-title")).toHaveText("Luca Verdi");

  await page.getByRole("button", { name: "Nuova attività" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuova attività" });
  await expect(dialog.getByText("Verdi Luca")).toBeVisible(); // collegamento già deciso
  await dialog.getByRole("button", { name: "Crea attività" }).click();
  await expect(dialog.getByText("Inserisci un titolo")).toBeVisible();
  await dialog.getByLabel("Cosa c'è da fare").fill("Consegnare DPI nuovi");
  await dialog.getByLabel("Assegnata a").selectOption({ index: 1 });
  await dialog.getByLabel("Entro il").fill(due);
  await dialog.getByLabel("Priorità").selectOption("high");
  await dialog.getByRole("button", { name: "Crea attività" }).click();

  await expect(page).toHaveURL(/\/app\/attivita\/[0-9a-f-]{36}\?creata=1$/);
  await expect(page.getByTestId("task-title")).toHaveText("Consegnare DPI nuovi");
  await expect(page.getByTestId("task-status")).toHaveText("Da fare");
  await expect(page.getByText("Alta").first()).toBeVisible();

  // Chi assegna a sé stesso non riceve notifiche (quella all'assegnatario è nei test del core).
  await expect(page.getByTestId("notifications-unread")).toHaveCount(0);

  // Commenti: pubblica, modifica il proprio.
  const comments = page.getByTestId("comments");
  await comments.getByLabel("Nuovo commento").fill("Taglie: 42 e 44");
  await comments.getByRole("button", { name: "Pubblica commento" }).click();
  await expect(comments.getByTestId("comment")).toHaveCount(1);
  await expect(comments.getByLabel("Nuovo commento")).toHaveValue("");
  await comments.getByRole("button", { name: "Modifica" }).click();
  await comments.getByLabel("Modifica commento").fill("Taglie: 42, 44 e 46");
  await comments.getByRole("button", { name: "Salva" }).click();
  await expect(comments.getByTestId("comment")).toContainText("Taglie: 42, 44 e 46");
  await expect(comments.getByTestId("comment")).toContainText("modificato");

  await page.getByRole("button", { name: "Inizia" }).click();
  await expect(page.getByTestId("task-status")).toHaveText("In corso");
  await page.getByRole("button", { name: "Segna come completata" }).click();
  const complete = page.getByRole("dialog", { name: "Completare l'attività?" });
  await complete.getByLabel("Note (facoltative)").fill("Consegnati in magazzino");
  await complete.getByRole("button", { name: "Completa" }).click();
  await expect(complete).toHaveCount(0);
  await expect(page.getByTestId("task-status")).toHaveText("Completata");
  await expect(page.getByText("Consegnati in magazzino").first()).toBeVisible();

  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("ha completato");
  await expect(timeline).toContainText("Commento");
});

test("elenco con filtri, ricerca globale, calendario ed esportazione", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await expect(page.getByTestId("my-tasks")).toBeVisible();

  await page.getByRole("link", { name: "Attività", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/attivita$/);
  await expect(page.getByTestId("data-table")).not.toContainText("Consegnare DPI nuovi");
  await page.getByLabel("Stato").selectOption("done");
  await expect(page).toHaveURL(/state=done/);
  await expect(page.getByTestId("task-link")).toHaveText(["Consegnare DPI nuovi"]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("Consegnare DPI nuovi");
  expect(csv).toContain("Completata");

  await page.goto(`/app/calendario?mese=${due.slice(0, 7)}`);
  const item = page.getByTestId("calendar-grid").getByTestId("calendar-item");
  await expect(item.filter({ hasText: "Consegnare DPI nuovi" })).toBeVisible();
  await item.filter({ hasText: "Consegnare DPI nuovi" }).click();
  await expect(page).toHaveURL(/\/app\/attivita\/[0-9a-f-]{36}$/);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("dpi nuovi");
  await page.getByTestId("search-result").first().click();
  await expect(page.getByTestId("task-title")).toHaveText("Consegnare DPI nuovi");
});
