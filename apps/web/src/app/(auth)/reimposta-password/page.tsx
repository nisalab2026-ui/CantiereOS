import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field } from "@/components/ui";
import { getVerifiedSession } from "@/lib/auth";
import { updatePassword } from "../actions";

export const metadata: Metadata = { title: "Nuova password" };

export default async function ResetPasswordPage() {
  if (!(await getVerifiedSession())) redirect("/accedi?motivo=link-non-valido");
  return (
    <AuthShell
      title="Scegli una nuova password"
      subtitle="Le altre sessioni aperte verranno chiuse."
    >
      <ActionForm action={updatePassword}>
        <Field
          label="Nuova password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Almeno 10 caratteri."
        />
        <Field
          label="Ripeti la password"
          name="confirm"
          type="password"
          autoComplete="new-password"
        />
        <SubmitButton>Salva password</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
