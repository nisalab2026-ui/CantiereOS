import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/**
 * Navigazione e comandi (blocco 3): «+ Nuovo» apre la finestra giusta, i
 * Recenti ricordano le schede aperte, ⌘K esegue azioni, la barra in alto si
 * compatta e sul telefono c'è la barra in basso.
 */
test("+ Nuovo, Recenti, azioni da ⌘K e barra compatta", async ({ page }) => {
  await createOwner(page, "nav", `E2E Navigazione ${Date.now().toString(36)}`);

  // La barra in alto si compatta scorrendo la panoramica.
  const header = page.getByTestId("app-header");
  await expect(header).not.toHaveAttribute("data-compact");
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(header).toHaveAttribute("data-compact", "");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).not.toHaveAttribute("data-compact");
  await page.setViewportSize({ width: 1280, height: 720 });

  // «+ Nuovo» → Cliente: si apre la finestra e l'indirizzo torna pulito.
  await page.getByTestId("new-menu").click();
  await page.getByRole("menuitem", { name: /Cliente/ }).click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/app\/clienti$/);
  await dialog.getByLabel("Nome o ragione sociale").fill("Verdi Impianti Srl");
  await dialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page).toHaveURL(/\/app\/clienti\?id=[0-9a-f-]{36}&creato=1$/);

  // Pannello laterale dall'azione rapida della riga: anteprima senza lasciare l'elenco.
  await page.goto("/app/clienti");
  await page.getByTestId("row-preview").first().click();
  const drawer = page.getByTestId("drawer");
  await expect(drawer.getByRole("heading", { name: "Verdi Impianti Srl" })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/clienti\?anteprima=[0-9a-f-]{36}$/);
  await expect(page.locator("[data-testid=data-table] tbody tr[data-selected]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/clienti$/);

  // Apro la scheda: finisce nei Recenti di ⌘K.
  await page.getByRole("link", { name: "Verdi Impianti Srl" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Verdi Impianti Srl" })).toBeVisible();
  await page.goto("/app");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Ricerca globale" });
  await expect(palette.getByTestId("recent-item")).toContainText("Verdi Impianti Srl");

  // Un comando scritto: «nuovo scad» → finestra «Nuova scadenza».
  await palette.getByRole("combobox").fill("nuovo scad");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/scadenze$/);
  const deadline = page.getByRole("dialog", { name: "Nuova scadenza" });
  await expect(deadline).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(deadline).toHaveCount(0);

  // Tasto N (fuori dai campi) apre «+ Nuovo».
  await page.keyboard.press("n");
  await expect(page.getByRole("menuitem", { name: /Intervento/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Telefono: barra in basso con Cerca e «+ Nuovo».
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const bar = page.getByTestId("bottom-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Cerca" }).click();
  await expect(page.getByRole("dialog", { name: "Ricerca globale" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("bottom-new").click();
  await expect(page.getByRole("menuitem", { name: /Rapportino/ })).toBeVisible();
});
