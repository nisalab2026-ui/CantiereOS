import { createHmac, randomBytes } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
export const PASSWORD = `Pw-${randomBytes(9).toString("base64url")}`;

export function uniqueEmail(label: string): string {
  return `${label}.${randomBytes(4).toString("hex")}@e2e.cantiereos.invalid`;
}

// --- TOTP (RFC 6238), come un'app di autenticazione ----------------------------
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error("base32 non valido");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Codice TOTP valido per una nuova verifica (GoTrue rifiuta il riuso nello stesso intervallo). */
let lastCode = "";
export async function freshTotp(secret: string): Promise<string> {
  for (;;) {
    const code = totp(secret);
    const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (code !== lastCode && secondsLeft > 3) {
      lastCode = code;
      return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// --- Email catturate da mailpit -----------------------------------------------
interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
}

export async function waitForEmail(
  to: string,
  subjectIncludes: RegExp,
  since: Date,
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: MailSummary[] };
    const msg = messages.find(
      (m) => subjectIncludes.test(m.Subject) && new Date(m.Created) >= since,
    );
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      return `${full.Text}\n${full.HTML}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nessuna email "${subjectIncludes}" per ${to}`);
}

export function extractLink(body: string, includes: string): string {
  const links = [...body.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) =>
    m[0].replace(/&amp;/g, "&"),
  );
  const link = links.find((l) => l.includes(includes));
  if (!link) throw new Error(`Link "${includes}" non trovato nell'email`);
  return link;
}

// --- Flussi riutilizzabili -------------------------------------------------------
export async function signUpAndConfirm(
  page: Page,
  opts: { email: string; fullName: string; companyName?: string; next?: string },
): Promise<void> {
  const since = new Date(Date.now() - 1000);
  await page.goto(`/registrati${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  await page.getByLabel("Nome e cognome").fill(opts.fullName);
  await page.getByLabel("Email di lavoro").fill(opts.email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (opts.companyName) await page.getByLabel("Nome dell'azienda").fill(opts.companyName);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crea account" }).click();
  await expect(page).toHaveURL(/\/verifica-email$/);
  const mail = await waitForEmail(opts.email, /confirm/i, since);
  await page.goto(extractLink(mail, "/verify"));
}

/** Configura la MFA dalla pagina Sicurezza e restituisce il segreto TOTP. */
export async function enrollMfa(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Configura app di autenticazione" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Codice", { exact: true }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Attiva", exact: true }).click();
  await expect(page.getByTestId("mfa-active")).toContainText("Sessione corrente: verificata");
  return secret;
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/accedi");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

export async function verifyMfa(page: Page, secret: string): Promise<void> {
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel("Codice", { exact: true }).fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verifica" }).click();
  await expect(page).not.toHaveURL(/\/mfa/);
}

/** Owner completo: registrazione, conferma email, azienda, MFA obbligatoria. */
export async function createOwner(
  page: Page,
  label: string,
  companyName: string,
): Promise<{ email: string; secret: string }> {
  const email = uniqueEmail(label);
  await signUpAndConfirm(page, { email, fullName: `E2E ${label}`, companyName });
  await expect(page).toHaveURL(/\/benvenuto$/);
  await expect(page.getByLabel("Nome dell'azienda")).toHaveValue(companyName);
  await page.getByRole("button", { name: "Crea azienda" }).click();
  // Il titolare deve attivare la MFA prima di entrare.
  await expect(page).toHaveURL(/\/account\/sicurezza\?obbligatoria=1/);
  const secret = await enrollMfa(page);
  await page.goto("/app");
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
  return { email, secret };
}

export async function sessionCookies(context: BrowserContext) {
  return (await context.cookies()).filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );
}
