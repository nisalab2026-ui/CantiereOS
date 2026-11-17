import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createOwner } from "./helpers";

/** Esportazione CSV con i filtri della pagina e traccia nel registro attività. */
test("esporta i clienti filtrati in CSV e l'esportazione compare nel registro", async ({
  page,
}) => {
  await createOwner(page, "exp", `E2E Export ${Date.now().toString(36)}`);
  await page.getByRole("link", { name: "Clienti", exact: true }).click();
  for (const name of ["Verdi Impianti Srl", "Neri Scavi Spa"]) {
    await page.getByRole("button", { name: "Nuovo cliente" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
    await dialog.getByLabel("Nome o ragione sociale").fill(name);
    await dialog.getByRole("button", { name: "Crea cliente" }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto("/app/clienti");
  }
  await page.goto("/app/clienti?q=verdi");
  await expect(page.getByTestId("data-table")).toContainText("Verdi Impianti Srl");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^clienti-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith("﻿Codice;Nome;Tipo")).toBe(true);
  expect(csv).toContain("Verdi Impianti Srl");
  expect(csv).not.toContain("Neri Scavi Spa"); // stesso filtro della pagina

  await page.goto("/app/registro?operazione=exported");
  const event = page.getByTestId("timeline-event").first();
  await expect(event).toContainText("ha esportato");
  await expect(event).toContainText("Clienti (1 riga)");
  await expect(event).toContainText("ricerca: verdi");
});
