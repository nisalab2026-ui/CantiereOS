import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Notice, TextLink } from "@/components/ui";
import { getVerifiedSession } from "@/lib/auth";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Invito" };

export default async function InvitePage() {
  const hasToken = Boolean((await cookies()).get("cos_invite")?.value);
  const session = await getVerifiedSession();
  const next = encodeURIComponent("/invito/conferma");

  if (!hasToken) {
    return (
      <AuthShell title="Invito non trovato">
        <Notice tone="warning">
          Il link d&apos;invito non è valido o è scaduto. Chiedi un nuovo invito all&apos;azienda.
        </Notice>
      </AuthShell>
    );
  }
  if (!session) {
    return (
      <AuthShell
        title="Sei stato invitato in CantiereOS"
        subtitle="Accedi o crea un account con l'email a cui è arrivato l'invito."
      >
        <div className="flex gap-3">
          <TextLink href={`/accedi?next=${next}`}>Accedi</TextLink>
          <span className="text-muted">oppure</span>
          <TextLink href={`/registrati?next=${next}`}>Crea un account</TextLink>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Accetta l'invito" subtitle={`Accesso come ${session.email ?? "utente"}.`}>
      <ActionForm action={acceptInvite}>
        <p className="text-sm">
          Entrerai a far parte dell&apos;azienda con il ruolo indicato nell&apos;invito.
        </p>
        <SubmitButton>Accetta invito</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
