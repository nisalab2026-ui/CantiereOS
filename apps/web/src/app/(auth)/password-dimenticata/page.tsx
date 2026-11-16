import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field, TextLink } from "@/components/ui";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Recupera password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recupera la password"
      subtitle="Ti invieremo un link per sceglierne una nuova."
      footer={<TextLink href="/accedi">Torna all&apos;accesso</TextLink>}
    >
      <ActionForm action={requestPasswordReset}>
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <SubmitButton>Invia link</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
