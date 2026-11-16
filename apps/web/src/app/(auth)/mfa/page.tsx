import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field } from "@/components/ui";
import { getMfaStatus, requireSession } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import { verifyMfa } from "../actions";

export const metadata: Metadata = { title: "Verifica in due passaggi" };

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const next = safeNext((await searchParams).next, "/app");
  if (session.aal === "aal2") redirect(next);
  const status = await getMfaStatus(session);
  if (status.verifiedFactors.length === 0) redirect("/account/sicurezza?obbligatoria=1");
  return (
    <AuthShell
      title="Verifica in due passaggi"
      subtitle="Inserisci il codice a 6 cifre dell'app di autenticazione."
      footer={
        <form action="/esci" method="post">
          <button className="text-sm text-muted hover:underline">Esci</button>
        </form>
      }
    >
      <ActionForm action={verifyMfa}>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Codice"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
        />
        <SubmitButton>Verifica</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
