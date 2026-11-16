#!/usr/bin/env node
// Rende utilizzabili dall'app gli utenti DEMO del seed di sviluppo, SOLO sullo
// stack Auth locale: completa le righe di auth.users create dal seed e imposta
// una password casuale (mostrata a schermo, mai salvata nel repository).
// Si rifiuta di lavorare su host diversi da localhost o su aziende non demo.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pg = createRequire(path.join(root, "packages/db/package.json"))("pg");
const readEnv = (file) =>
  Object.fromEntries(
    readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
const web = readEnv("apps/web/.env.local");
const auth = readEnv(".env.local-auth");
for (const u of [web.DATABASE_URL, web.SUPABASE_URL]) {
  if (!["127.0.0.1", "localhost"].includes(new URL(u).hostname)) {
    throw new Error("local-demo-login lavora solo sullo stack locale");
  }
}

const client = new pg.Client({ connectionString: web.DATABASE_URL });
await client.connect();
let users;
try {
  const real = await client.query(
    "select count(*)::int as n from public.tenants where not is_demo",
  );
  if (real.rows[0].n > 0) throw new Error("Il database contiene aziende non demo: rifiutato.");
  // Le righe inserite dal seed hanno solo id ed email: GoTrue richiede questi campi.
  ({ rows: users } = await client.query(
    `update auth.users
        set instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated',
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            confirmation_token = coalesce(confirmation_token, ''), recovery_token = coalesce(recovery_token, ''),
            email_change_token_new = coalesce(email_change_token_new, ''), email_change = coalesce(email_change, ''),
            phone_change_token = coalesce(phone_change_token, ''),
            email_change_token_current = coalesce(email_change_token_current, ''),
            reauthentication_token = coalesce(reauthentication_token, ''),
            raw_app_meta_data = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'),
            raw_user_meta_data = coalesce(raw_user_meta_data, '{}'),
            created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now()),
            is_sso_user = coalesce(is_sso_user, false), is_anonymous = coalesce(is_anonymous, false)
      where email like '%@demo.cantiereos.invalid'
      returning id, email`,
  ));
} finally {
  await client.end();
}

const password = `Demo-${randomBytes(9).toString("base64url")}`;
for (const u of users) {
  const res = await fetch(`${web.SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
    method: "PUT",
    headers: {
      apikey: auth.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${auth.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`${u.email}: ${res.status} ${await res.text()}`);
}
console.log(`Utenti DEMO attivati (${users.length}). Password locale: ${password}`);
for (const u of users) console.log(`  ${u.email}`);
