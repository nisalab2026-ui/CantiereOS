import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { getAppContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Panoramica" };

const NOTICES: Record<string, string> = {
  "azienda=creata": "Azienda creata. Il periodo di prova di 30 giorni è iniziato.",
  "invito=accettato": "Invito accettato: ora fai parte dell'azienda.",
  "password=aggiornata": "Password aggiornata. Le altre sessioni sono state chiuse.",
};

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const notice = Object.entries(NOTICES).find(([k]) => {
    const [key, value] = k.split("=");
    return sp[key!] === value;
  })?.[1];
  const { company, access, session } = await getAppContext();
  const permissions = [...access.permissions].sort();
  return (
    <div className="space-y-6">
      {notice && <Notice>{notice}</Notice>}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="company-name">
          {company.name}
        </h1>
        <p className="text-sm text-muted">
          Ruolo: <span data-testid="role-name">{company.roleName}</span> · Sessione{" "}
          {session.aal === "aal2" ? "con verifica in due passaggi" : "con sola password"}
        </p>
      </div>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium">Cosa puoi fare in questa azienda</h2>
        <p className="mb-3 text-sm text-muted">
          Permessi verificati sul server e nel database a ogni richiesta. I moduli operativi
          arrivano nelle prossime fasi.
        </p>
        <ul className="flex flex-wrap gap-2" data-testid="permissions">
          {permissions.map((p) => (
            <li key={p} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs">
              {p}
            </li>
          ))}
        </ul>
        {access.permissionsRequiringMfa.size > 0 && (
          <p className="mt-3 text-sm text-muted">
            {access.permissionsRequiringMfa.size} permessi amministrativi richiedono la verifica in
            due passaggi.
          </p>
        )}
      </section>
    </div>
  );
}
