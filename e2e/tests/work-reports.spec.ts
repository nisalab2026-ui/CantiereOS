import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

// PNG 8×8 valido
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4UaGBFTEMLQkAUtVaAV8W4QQAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Rapportini (ADR-015): compilazione con ore calcolate e materiali, firma del
 * cliente, invio e approvazione, costo orario della persona e costi reali
 * nella commessa, stampa per il cliente senza prezzi.
 */
test("rapportino: compilazione, firma, approvazione e costi reali della commessa", async ({
  page,
}) => {
  await createOwner(page, "rap", `E2E Rapportini ${Date.now().toString(36)}`);

  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  const newCustomer = page.getByRole("dialog", { name: "Nuovo cliente" });
  await newCustomer.getByLabel("Nome o ragione sociale").fill("Condominio Aurora");
  await newCustomer.getByRole("button", { name: "Crea cliente" }).click();
  await expect(newCustomer).toHaveCount(0);

  await page.getByRole("link", { name: "Personale", exact: true }).click();
  await page.getByRole("button", { name: "Nuova persona" }).click();
  const person = page.getByRole("dialog", { name: "Nuova persona" });
  await person.getByRole("textbox", { name: "Nome", exact: true }).fill("Mario");
  await person.getByLabel("Cognome").fill("Rossi");
  await person.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page).toHaveURL(/\/app\/personale\/[0-9a-f-]{36}\?creato=1$/);
  const personUrl = page.url().replace(/\?.*$/, "");

  await page.getByRole("link", { name: "Commesse", exact: true }).click();
  await page.getByRole("button", { name: "Nuova commessa" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuova commessa" });
  await dlg.getByLabel("Nome della commessa").fill("Copertura scala B");
  await dlg.getByLabel("Cliente").selectOption({ label: "Condominio Aurora" });
  await dlg.getByLabel("Tipo").selectOption({ label: "A corpo" });
  await dlg.getByLabel("Importo del contratto (€)").fill("1.000,00");
  await dlg.getByRole("button", { name: "Crea commessa" }).click();
  await expect(page).toHaveURL(/\/app\/commesse\/[0-9a-f-]{36}\?creata=1$/);
  const projectUrl = page.url().replace(/\?.*$/, "");

  // Nuovo rapportino dalla sezione Rapportini
  await page.getByRole("link", { name: "Rapportini", exact: true }).click();
  await expect(page.getByText("Nessun rapportino da completare")).toBeVisible();
  await page.getByTestId("new-report").click();
  const nr = page.getByRole("dialog", { name: "Nuovo rapportino" });
  await nr.getByLabel("Giorno").fill("2026-11-17");
  await nr.getByRole("button", { name: "Crea e compila" }).click();
  await expect(page).toHaveURL(/\/app\/rapportini\/[0-9a-f-]{36}\?nuovo=1$/);
  await expect(page.getByTestId("report-title")).toHaveText("Rapportino 2026-0001");

  // invio senza ore: bloccato
  await page.getByTestId("submit-report").click();
  await expect(page.getByText("Aggiungi almeno una riga di ore prima di inviare.")).toBeVisible();

  const editor = page.getByTestId("report-editor");
  await editor.getByLabel("Lavori eseguiti").fill("Sostituzione coppi lato nord");
  await page.getByTestId("add-labor").click();
  const row = page.getByTestId("labor-row").first();
  // validazione per riga: persona mancante
  await page.getByTestId("save-report").click();
  await expect(row.getByRole("alert")).toContainText("Scegli la persona");
  await row.getByLabel("Persona, riga 1").selectOption({ label: "Mario Rossi" });
  await expect(row).toContainText("= 8 h"); // 07:30–16:30 con 60 minuti di pausa
  await page.getByTestId("add-item").click();
  const item = page.getByTestId("item-row").first();
  await item.getByLabel("Descrizione, voce 1").fill("Coppi in laterizio");
  await item.getByLabel("Quantità, voce 1").fill("100");
  await item.getByLabel("Unità, voce 1").fill("pz");
  await item.getByLabel("Prezzo unitario in euro, voce 1").fill("1,50");
  await page.getByTestId("save-report").click();
  await expect(page.getByText("Rapportino salvato.")).toBeVisible();
  await expect(page.getByTestId("report-costs")).toContainText("150,00");

  // foto: una vera, una finta (rifiutata dal server)
  const input = page.getByTestId("report-photo-input");
  await input.setInputFiles({ name: "cantiere.png", mimeType: "image/png", buffer: PNG });
  const photos = page.getByTestId("report-photos");
  await expect(photos.getByRole("img", { name: "Foto 1" })).toBeVisible();
  await input.setInputFiles({
    name: "finta.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("questo non è un JPEG"),
  });
  await expect(page.getByText(/non è una foto/)).toBeVisible();
  await expect(photos.getByRole("img")).toHaveCount(1);

  // firma del cliente
  const pad = page.locator("canvas#report-signature");
  await pad.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -15 : 15));
  }
  await page.mouse.up();
  await page.locator("#report-signature-name").fill("Anna Bianchi");
  await page.getByRole("button", { name: "Conferma firma" }).click();
  await expect(page.getByRole("img", { name: "Firma di Anna Bianchi" })).toBeVisible();

  // invio e approvazione
  await page.getByTestId("submit-report").click();
  await expect(page.getByTestId("report-status")).toHaveText("Inviato");
  await expect(page.getByTestId("report-editor")).toHaveCount(0);
  await page.getByTestId("approve-report").click();
  await expect(page.getByTestId("report-status")).toHaveText("Approvato");
  await expect(page.getByTestId("report-labor")).toContainText("07:30–16:30");
  await expect(page.getByTestId("report-costs")).toContainText("1 persona senza costo orario");

  // stampa per il cliente: niente prezzi
  const printUrl = `${page.url().replace(/\?.*$/, "")}/stampa`;
  await page.goto(printUrl);
  const doc = page.getByTestId("report-print");
  await expect(doc).toContainText("N. 2026-0001");
  await expect(doc).toContainText("Sostituzione coppi lato nord");
  await expect(doc).toContainText("Mario Rossi");
  await expect(doc).toContainText("Anna Bianchi");
  await expect(doc).not.toContainText("1,50");

  // costo orario della persona → costi reali della commessa
  await page.goto(personUrl);
  await page.getByLabel("Costo orario (€)").fill("30,00");
  await page.getByLabel("Valido dal").fill("2026-01-01");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByTestId("cost-rates")).toContainText("30,00");

  await page.goto(projectUrl);
  const work = page.getByTestId("project-work");
  await expect(work).toContainText("8 h");
  await expect(work).toContainText("390,00"); // 8 h × 30 € + 100 × 1,50 €
  await expect(work).toContainText("610,00"); // 1.000 − 390
  await expect(page.getByRole("link", { name: /2026-0001/ }).first()).toBeVisible();
});
