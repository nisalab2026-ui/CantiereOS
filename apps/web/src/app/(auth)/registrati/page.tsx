import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field, TextLink } from "@/components/ui";
import { safeNext } from "@/lib/redirects";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Registrati" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const next = safeNext((await searchParams).next, "/benvenuto");
  const invited = next.startsWith("/invito");
  return (
    <AuthShell
      title={invited ? "Crea il tuo account" : "Registra la tua azienda"}
      subtitle={
        invited
          ? "Usa lo stesso indirizzo email a cui è arrivato l'invito."
          : "Prova gratuita di 30 giorni. Dopo la conferma dell'email creerai l'azienda."
      }
      footer={
        <>
          Hai già un account?{" "}
          <TextLink href={`/accedi?next=${encodeURIComponent(next)}`}>Accedi</TextLink>
        </>
      }
    >
      <ActionForm action={signUp}>
        <input type="hidden" name="next" value={next} />
        <Field label="Nome e cognome" name="fullName" autoComplete="name" maxLength={120} />
        <Field label="Email di lavoro" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Almeno 10 caratteri. Meglio una frase lunga e unica."
        />
        {!invited && (
          <Field
            label="Nome dell'azienda"
            name="companyName"
            autoComplete="organization"
            required={false}
            maxLength={200}
          />
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="privacy" className="mt-1" required />
          <span>
            Ho preso visione dell&apos;informativa sul trattamento dei dati personali.
            <span className="block text-xs text-muted">
              Il testo dell&apos;informativa va fornito dal titolare del trattamento prima del
              lancio.
            </span>
          </span>
        </label>
        <SubmitButton>Crea account</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
