import { listMyCompanies } from "@cantiereos/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AuthShell, Field } from "@/components/ui";
import { asCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase";
import { createCompany } from "./actions";

export const metadata: Metadata = { title: "Benvenuto" };

export default async function WelcomePage() {
  const companies = await asCurrentUser((tx) => listMyCompanies(tx));
  if (companies.length > 0) redirect("/app");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as { full_name?: string; company_name?: string };
  return (
    <AuthShell
      title="Crea la tua azienda"
      subtitle="Prova gratuita di 30 giorni con 5 utenti. Se invece hai ricevuto un invito, apri il link dall'email."
      footer={
        <form action="/esci" method="post">
          <button className="text-sm text-muted hover:underline">Esci</button>
        </form>
      }
    >
      <ActionForm action={createCompany}>
        <Field
          label="Il tuo nome e cognome"
          name="fullName"
          autoComplete="name"
          defaultValue={meta.full_name ?? ""}
        />
        <Field
          label="Nome dell'azienda"
          name="companyName"
          autoComplete="organization"
          defaultValue={meta.company_name ?? ""}
        />
        <SubmitButton>Crea azienda</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
