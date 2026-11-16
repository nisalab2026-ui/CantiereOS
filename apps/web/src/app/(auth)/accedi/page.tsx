import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field, Notice, TextLink } from "@/components/ui";
import { safeNext } from "@/lib/redirects";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Accedi" };

const REASONS: Record<string, string> = {
  revocata: "La sessione è stata chiusa (logout da un altro dispositivo o accesso revocato).",
  uscito: "Sei uscito da CantiereOS.",
  confermata: "Email confermata. Accedi per continuare.",
  "link-non-valido": "Il link non è valido o è scaduto.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/app");
  const reason = sp.motivo ? REASONS[sp.motivo] : undefined;
  return (
    <AuthShell
      title="Accedi"
      subtitle="Entra nel gestionale della tua azienda."
      footer={
        <>
          Nuova azienda?{" "}
          <TextLink href={`/registrati?next=${encodeURIComponent(next)}`}>Registrati</TextLink>
        </>
      }
    >
      {reason && (
        <div className="mb-4">
          <Notice>{reason}</Notice>
        </div>
      )}
      <ActionForm action={signIn}>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <div className="flex items-center justify-between">
          <SubmitButton>Accedi</SubmitButton>
          <TextLink href="/password-dimenticata">Password dimenticata?</TextLink>
        </div>
      </ActionForm>
    </AuthShell>
  );
}
