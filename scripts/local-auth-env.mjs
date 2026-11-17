#!/usr/bin/env node
// Genera i segreti per lo stack Supabase Auth LOCALE (solo sviluppo/test):
//   .env.local-auth      variabili per docker compose (profilo "auth")
//   apps/web/.env.local  variabili per l'app Next.js in locale
// I valori sono casuali a ogni installazione e non vengono mai committati
// (.env.* è in .gitignore). Non sovrascrive file esistenti: usa --force.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const force = process.argv.includes("--force");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const AUTH_PUBLIC_URL = process.env.AUTH_PUBLIC_URL ?? "http://127.0.0.1:54321";

const secret = (bytes = 32) => randomBytes(bytes).toString("hex");
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function jwt(payload, key) {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}

const jwtSecret = secret(32);
const now = Math.floor(Date.now() / 1000);
const tenYears = now + 10 * 365 * 86400;
const issuer = `${AUTH_PUBLIC_URL}/auth/v1`;
const anonKey = jwt({ role: "anon", iss: issuer, iat: now, exp: tenYears }, jwtSecret);
const serviceKey = jwt({ role: "service_role", iss: issuer, iat: now, exp: tenYears }, jwtSecret);
const dbPassword = secret(16);

const files = {
  ".env.local-auth": [
    "# Generato da scripts/local-auth-env.mjs — SOLO SVILUPPO LOCALE, non committare.",
    `APP_URL=${APP_URL}`,
    `AUTH_PUBLIC_URL=${AUTH_PUBLIC_URL}`,
    `AUTH_JWT_SECRET=${jwtSecret}`,
    `AUTH_DB_PASSWORD=${dbPassword}`,
    `AUTH_ADMIN_DB_PASSWORD=${secret(16)}`,
    `SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "",
  ],
  "apps/web/.env.local": [
    "# Generato da scripts/local-auth-env.mjs — SOLO SVILUPPO LOCALE, non committare.",
    `APP_URL=${APP_URL}`,
    `SUPABASE_URL=${AUTH_PUBLIC_URL}`,
    `SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_JWT_ISSUER=${issuer}`,
    `SUPABASE_JWT_SECRET=${jwtSecret}`,
    `DATABASE_URL=postgresql://postgres:${dbPassword}@127.0.0.1:54330/postgres`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "DOCUMENTS_BUCKET=documents",
    "SMTP_URL=smtp://127.0.0.1:1025",
    'MAIL_FROM="CantiereOS (sviluppo) <no-reply@cantiereos.invalid>"',
    "",
  ],
};

for (const [rel, lines] of Object.entries(files)) {
  const file = path.join(root, rel);
  if (existsSync(file) && !force) {
    console.log(`${rel} esiste già: lasciato invariato (usa --force per rigenerare).`);
    continue;
  }
  writeFileSync(file, lines.join("\n"), { mode: 0o600 });
  console.log(`Scritto ${rel}`);
}
