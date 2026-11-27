import { expect, test } from "@playwright/test";

/**
 * Sito pubblico: aperto senza accesso, separato dal gestionale, con prezzi coerenti e la guida.
 * Non serve un account: questi test girano anche senza Supabase configurato.
 */
test("la home pubblica si apre senza accesso e porta alle pagine del sito", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Il cantiere in ordine");
  await expect(page.getByRole("link", { name: /Prova gratis 30 giorni/ })).toHaveAttribute(
    "href",
    "/registrati",
  );
  await expect(page.getByRole("link", { name: "Accedi" }).first()).toHaveAttribute(
    "href",
    "/accedi",
  );

  const nav = page.getByRole("navigation", { name: "Principale" });
  for (const [label, path, heading] of [
    ["Funzionalità", "/funzionalita", "Tutto quello che serve"],
    ["Mestieri", "/mestieri", "Un gestionale,"],
    ["Chi siamo", "/chi-siamo", "Software serio"],
    ["Prezzi", "/prezzi", "Paghi per l'impresa"],
    ["Guida", "/guida", "Come si usa"],
    ["Contatti", "/contatti", "Parliamo del tuo"],
  ] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
  // nessun errore di script (CSP con nonce compresa)
  expect(errors).toEqual([]);
});

test("i prezzi cambiano tra annuale e mensile e il calcolo indica il piano giusto", async ({
  page,
}) => {
  await page.goto("/prezzi");
  const impresa = page.locator("article", { hasText: "Il più scelto" });
  await expect(impresa).toContainText("89 €");
  await page.getByRole("radio", { name: "Mensile" }).click();
  await expect(impresa).toContainText("109 €");

  const users = page.getByLabel("Quante persone useranno CantiereOS?");
  await users.fill("4");
  await expect(page.getByText(/Per 4 utenti il piano giusto è Base/)).toBeVisible();
  await users.fill("12");
  await expect(page.getByText(/Per 12 utenti il piano giusto è Impresa/)).toBeVisible();
  await users.fill("120");
  await expect(page.getByText(/Oltre 80 utenti prepariamo/)).toBeVisible();
});

test("la guida pubblica cerca senza accedere e non rimanda a pagine riservate", async ({
  page,
}) => {
  await page.goto("/guida");
  await page.getByLabel("Cerca nella guida").fill("scadenza");
  await expect(page.getByTestId("guide-topic").first()).toBeVisible();
  await expect(page.locator('main a[href^="/app"]')).toHaveCount(0);
});

test("il menu del telefono si apre e si chiude", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Apri il menu" }).click();
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Prezzi" }).click();
  await expect(page).toHaveURL(/\/prezzi$/);
  await expect(menu).toBeHidden();
  await ctx.close();
});

test("WhatsApp e note legali sono raggiungibili da ogni pagina", async ({ page }) => {
  await page.goto("/");
  const whatsapp = page.getByRole("link", { name: /Scrivici su WhatsApp, \+39 327 392 8101/ });
  await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/393273928101\?text=/);
  await expect(whatsapp).toHaveAttribute("target", "_blank");

  const footer = page.getByRole("contentinfo");
  await expect(
    footer.getByRole("link", { name: /Sito realizzato da\s*Lume Studio/ }),
  ).toBeVisible();
  for (const [label, path, heading] of [
    ["Privacy", "/privacy", "Come trattiamo i tuoi dati"],
    ["Cookie", "/cookie", "Solo i cookie che servono"],
    ["Termini di servizio", "/termini", "Le regole del servizio"],
    ["Note legali", "/note-legali", "Chi c'è dietro CantiereOS"],
  ] as const) {
    await page.getByRole("contentinfo").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
  // i dati aziendali mancanti si vedono, non vengono inventati
  await expect(page.getByText(/ragione sociale \(da completare\)/).first()).toBeVisible();
});

test("home: tablet in apertura, sezione fissa con anteprime e griglia bento", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // il tablet c'è sempre: 2D come riserva, 3D se il browser lo regge (WebGL non garantito qui)
  await expect(page.getByTestId("tablet-hero")).toHaveAttribute("data-mode", /^(2d|3d)$/);

  const steps = page.getByTestId("sticky-step");
  expect(await steps.count()).toBeGreaterThan(2);
  const last = steps.last();
  await last.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const id = await last.getAttribute("data-id");
  await expect(page.getByTestId("sticky-preview-active")).toHaveAttribute("data-id", id ?? "");

  await expect(page.getByTestId("bento-cell")).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("home su telefono: tablet in 2D, niente 3D", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("tablet-hero")).toHaveAttribute("data-mode", "2d");
  await expect(page.locator("[data-testid=tablet-hero] canvas")).toHaveCount(0);
});
