import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createOwner, signIn, verifyMfa } from "./helpers";

/**
 * Archivio documentale contro Supabase Storage reale (bucket privato locale):
 * cartelle, caricamento multiplo, verifica del tipo reale, versioni, download
 * tracciato, scadenza con promemoria, storico.
 */
test.describe.configure({ mode: "serial" });

const company = `E2E Documenti ${Date.now().toString(36)}`;
let owner: { email: string; secret: string };

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("cartella, caricamento con scadenza e promemoria, anteprima e download", async ({ page }) => {
  owner = await createOwner(page, "doc", company);
  await page.getByRole("link", { name: "Documenti", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/documenti$/);

  await page.getByRole("button", { name: "Nuova cartella" }).click();
  const folder = page.getByRole("dialog", { name: "Nuova cartella" });
  await folder.getByLabel("Nome").fill("Contratti");
  await folder.getByRole("button", { name: "Crea cartella" }).click();
  await expect(page).toHaveURL(/\/app\/documenti\?folder=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("folder-tree")).toContainText("Contratti");

  await page.getByRole("button", { name: "Carica documenti" }).click();
  const dialog = page.getByRole("dialog", { name: "Carica documenti" });
  await dialog
    .getByTestId("upload-input")
    .setInputFiles({ name: "contratto-2026.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(dialog.getByTestId("upload-list")).toContainText("contratto-2026.pdf");
  await dialog.getByLabel("Titolo").fill("Contratto manutenzione 2026");
  await dialog.getByLabel("Categoria").selectOption("contract");
  await dialog.getByLabel("Scadenza del documento").fill(inDays(20));
  await dialog.getByLabel(/Crea un promemoria/).check();
  await dialog.getByRole("button", { name: /^Carica/ }).click();

  await expect(page).toHaveURL(/\/app\/documenti\/[0-9a-f-]{36}\?caricato=1$/);
  await expect(page.getByTestId("document-title")).toHaveText("Contratto manutenzione 2026");
  await expect(page.getByRole("navigation", { name: "Percorso" })).toContainText("Contratti");
  await expect(page.getByTestId("version-list")).toContainText("Corrente");
  await expect(page.getByTestId("document-preview")).toBeVisible();
  await expect(page.getByRole("link", { name: /Nello scadenziario/ })).toBeVisible();

  // Chromium headless scarica i PDF dell'anteprima invece di mostrarli: si attende il download
  // del pulsante «Scarica» (URL firmato con il nome originale).
  const downloadPromise = page.waitForEvent("download", (d) => d.url().includes("download="));
  await page.getByTestId("download-current").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("contratto-2026.pdf");
  expect((await readFile((await download.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("un file finto viene rifiutato; una versione valida diventa corrente; storico completo", async ({
  page,
}) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/documenti");
  await page.getByTestId("document-link").filter({ hasText: "Contratto manutenzione" }).click();

  await page.getByRole("button", { name: "Nuova versione" }).click();
  let dialog = page.getByRole("dialog", { name: "Carica una nuova versione" });
  await dialog.getByLabel("File").setInputFiles({
    name: "contratto-firmato.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("MZ\x90\x00 questo non è un PDF"),
  });
  await dialog.getByRole("button", { name: "Carica versione" }).click();
  await expect(dialog.getByText(/non corrisponde al tipo dichiarato/)).toBeVisible();
  await dialog.getByRole("button", { name: "Annulla" }).click();

  await page.getByRole("button", { name: "Nuova versione" }).click();
  dialog = page.getByRole("dialog", { name: "Carica una nuova versione" });
  await dialog
    .getByLabel("File")
    .setInputFiles({ name: "contratto-firmato.pdf", mimeType: "application/pdf", buffer: PDF });
  await dialog.getByLabel("Cosa cambia").fill("Versione firmata dal cliente");
  await dialog.getByRole("button", { name: "Carica versione" }).click();
  await expect(dialog).toHaveCount(0);
  const versions = page.getByTestId("version-list");
  await expect(versions.locator("li").first()).toContainText("contratto-firmato.pdf");
  await expect(versions.locator("li").first()).toContainText("Corrente");
  await expect(versions).toContainText("Rifiutato");

  await page.getByRole("link", { name: "Storico" }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("ha caricato");
  await expect(timeline).toContainText("file rifiutato");
  await expect(timeline).toContainText("ha scaricato");
});

test("caricamento multiplo, ricerca per nome del file ed esportazione", async ({ page }) => {
  await signIn(page, owner.email);
  await verifyMfa(page, owner.secret);
  await page.goto("/app/documenti");
  await page.getByRole("button", { name: "Carica documenti" }).click();
  const dialog = page.getByRole("dialog", { name: "Carica documenti" });
  await dialog.getByTestId("upload-input").setInputFiles([
    { name: "foto-cantiere.png", mimeType: "image/png", buffer: PNG },
    { name: "verbale-sopralluogo.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await expect(dialog.getByLabel("Titolo")).toHaveCount(0); // con più file il titolo è il nome
  await dialog.getByRole("button", { name: /^Carica 2/ }).click();
  await expect(dialog.getByTestId("upload-list").getByText("Caricato")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.goto("/app/documenti?q=sopralluogo");
  await expect(page.getByTestId("document-link")).toHaveText(["verbale-sopralluogo"]);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Cerca clienti/).fill("foto-cantiere");
  await page.getByTestId("search-result").first().click();
  await expect(page).toHaveURL(/\/app\/documenti\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("document-preview")).toBeVisible();

  await page.goto("/app/documenti");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("Contratto manutenzione 2026");
  expect(csv).toContain("foto-cantiere");
});
