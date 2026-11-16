import type { Metadata } from "next";
import { AuthShell, TextLink } from "@/components/ui";

export const metadata: Metadata = { title: "Controlla la posta" };

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Controlla la posta"
      footer={<TextLink href="/accedi">Torna all&apos;accesso</TextLink>}
    >
      <p className="text-sm">
        Se l&apos;indirizzo è valido ti abbiamo inviato un&apos;email con il link di conferma.
        Aprilo da questo stesso browser per completare la registrazione.
      </p>
    </AuthShell>
  );
}
