import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/**
 * Moduli compilabili (ADR-013) contro lo stack reale: dal modello pronto
 * "Ispezione linea vita" alla pubblicazione, compilazione con dati
 * automatici, obbligatori, firma, chiusura definitiva, CSV e scheda cliente.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Moduli ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };

async function pick(page: Page, groupName: string, option: string) {
  await page
    .getByRole("radiogroup", { name: groupName, exact: true })
    .getByText(option, { exact: true })
    .click();
}

test("dal modello pronto al modulo chiuso e firmato", async ({ page }) => {
  // percorso completo (account con MFA, modello, compilazione, firma, chiusura): sui runner
  // lenti supera i 90 s predefiniti senza essere bloccato
  test.setTimeout(180_000);
  owner = await createOwner(page, "mod", company);
  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  await page.getByRole("button", { name: "Nuovo cliente" }).click();
  const newCustomer = page.getByRole("dialog", { name: "Nuovo cliente" });
  await newCustomer.getByLabel("Nome o ragione sociale").fill("Condominio Aurora");
  await newCustomer.getByRole("button", { name: "Crea cliente" }).click();
  await expect(newCustomer).toHaveCount(0);

  // Modello pronto → copia → pubblicazione
  await page.getByRole("link", { name: "Moduli", exact: true }).click();
  await page.getByRole("link", { name: "Modelli" }).click();
  await page
    .getByTestId("library-entry")
    .filter({ hasText: "Ispezione linea vita" })
    .getByRole("button", { name: "Usa questo modello" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Crea la copia" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/modelli\/[0-9a-f-]{36}\?nuovo=1$/);
  await expect(page.getByTestId("template-version")).toHaveText("Mai pubblicato");
  await page.getByRole("button", { name: "Pubblica", exact: true }).click();
  await expect(page.getByTestId("template-version")).toHaveText("Versione 1 in uso");

  // Nuovo modulo collegato al cliente
  await page.goto("/app/moduli");
  await page.getByRole("button", { name: "Compila un modulo" }).click();
  const start = page.getByRole("dialog", { name: "Nuovo modulo" });
  await start.getByLabel("Cliente").selectOption({ label: "Condominio Aurora" });
  await start.getByLabel("Titolo").fill("Ispezione copertura scala B");
  await start.getByRole("button", { name: "Inizia la compilazione" }).click();
  await expect(page).toHaveURL(/\/app\/moduli\/[0-9a-f-]{36}\?nuovo=1$/);
  await expect(page.getByTestId("form-title")).toHaveText("Ispezione copertura scala B");
  await expect(page.getByTestId("form-status")).toHaveText("In compilazione");
  await expect(page.locator("#f-committente")).toHaveText(/Condominio Aurora/);
  await expect(page.locator("#f-installatore")).toHaveText(new RegExp(company));

  // Compilazione parziale: la chiusura segnala gli obbligatori mancanti
  await page.getByLabel("N. impianto").fill("LV-07");
  await page
    .getByRole("group", { name: "Tipologia di ispezione", exact: true })
    .getByText("Ispezione periodica (IP)")
    .click();
  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect(page.getByText("Bozza salvata.")).toBeVisible();
  await page.getByRole("button", { name: "Chiudi modulo" }).click();
  await page
    .getByRole("dialog", { name: "Chiudere il modulo?" })
    .getByRole("button", { name: "Chiudi modulo" })
    .click();
  await expect(page.getByText("Mancano dei campi obbligatori")).toBeVisible();
  await expect(page.locator("#f-firma_tecnico-error")).toBeVisible();

  // Tabelle di controlli, tipo di controllo, esito
  for (const row of [
    "Elaborato grafico rappresentativo del sistema",
    "Relazione tecnica generale",
    "Relazione di calcolo strutturale",
    "Documentazione fotografica",
    "Dichiarazione di corretta posa del sistema",
    "Manuali di installazione, uso e manutenzione degli ancoraggi",
    "Dichiarazione di conformità/rispondenza degli ancoraggi",
    "Indicazione d'uso dei DPI da utilizzare",
    "Programma di manutenzione del sistema",
    "Registro delle ispezioni/manutenzioni del sistema",
  ]) {
    await pick(page, row, "Sì");
  }
  await pick(page, "Registro degli accessi al sistema", "No");
  await page.getByLabel("Nota: Registro degli accessi al sistema").fill("Da istituire");
  const tipo = page.getByRole("group", { name: "Tipo di controllo dei dispositivi", exact: true });
  await tipo.getByText("Visivo", { exact: true }).click();
  await tipo.getByText("Funzionale", { exact: true }).click();
  for (const row of [
    "Impermeabilizzazione",
    "Usura",
    "Ossidazione/corrosione",
    "Deformazioni dei componenti",
    "Deformazioni anomale della fune",
    "Tensionamento della fune",
    "Serraggio dei dadi e dei bulloni dei dispositivi a vista",
    "Stato delle eventuali parti mobili",
    "Pulizia",
  ]) {
    await pick(page, row, "Positivo");
  }
  await pick(page, "Esito dell'ispezione", "Sistema idoneo all'uso");

  // Firma sul display
  const pad = page.locator("canvas#f-firma_tecnico");
  await pad.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -15 : 15));
  }
  await page.mouse.up();
  await page.locator("#f-firma_tecnico-name").fill("Mario Rossi");
  await page.getByRole("button", { name: "Conferma firma" }).first().click();
  await expect(page.getByRole("img", { name: "Firma di Mario Rossi" })).toBeVisible();

  await page.getByRole("button", { name: "Chiudi modulo" }).click();
  await page
    .getByRole("dialog", { name: "Chiudere il modulo?" })
    .getByRole("button", { name: "Chiudi modulo" })
    .click();
  await expect(page.getByTestId("form-status")).toHaveText("Chiuso");
  const doc = page.getByTestId("form-document");
  await expect(doc).toContainText("LV-07");
  await expect(doc).toContainText("Da istituire");
  await expect(doc).toContainText("Nessuna precedente");
  await expect(doc.getByRole("img", { name: "Firma di Mario Rossi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salva bozza" })).toHaveCount(0);
  await expect(page.getByTestId("timeline")).toContainText("ha completato");
});

test("elenco, CSV, ricerca e scheda cliente; il titolare può riaprire", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.getByRole("link", { name: "Moduli", exact: true }).click();
  await page.getByLabel("Stato").selectOption("completed");
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByTestId("form-link")).toHaveText(["Ispezione copertura scala B"]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^moduli-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Ispezione copertura scala B");
  expect(csv).toContain("LV-07");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("lv-07");
  await page.getByTestId("search-result").first().click();
  await expect(page.getByTestId("form-title")).toHaveText("Ispezione copertura scala B");

  await page.getByRole("button", { name: "Riapri" }).click();
  await page
    .getByRole("dialog", { name: "Riaprire il modulo?" })
    .getByRole("button", { name: "Riapri" })
    .click();
  await expect(page.getByTestId("form-status")).toHaveText("In compilazione");
  await expect(page.getByRole("button", { name: "Salva bozza" })).toBeVisible();

  await page.getByRole("link", { name: "Condominio Aurora" }).first().click();
  await expect(page.getByTestId("form-mini-list")).toContainText("Ispezione copertura scala B");
});
