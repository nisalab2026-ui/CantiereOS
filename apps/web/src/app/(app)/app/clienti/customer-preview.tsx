import type { CustomerDetail } from "@cantiereos/core";
import { ExternalLink, Mail, MapPin, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DetailList } from "@/components/ui/detail-list";
import { Drawer } from "@/components/ui/drawer";
import { EditCustomerDialog } from "./[id]/customer-edit";

const PARTY: Record<CustomerDetail["partyType"], string> = {
  company: "Azienda",
  individual: "Privato",
  public_entity: "Ente pubblico",
};

/**
 * Anteprima di un cliente nel pannello laterale dell'elenco: dati principali,
 * contatti e sedi, con «Modifica» per chi può scrivere e il link alla scheda
 * completa (documenti, scadenze, storico…). I dati li legge il server con RLS.
 */
export function CustomerPreview({
  c,
  closeHref,
  canWrite,
}: {
  c: CustomerDetail;
  closeHref: string;
  canWrite: boolean;
}) {
  const address = [c.addressLine, [c.postalCode, c.city].filter(Boolean).join(" "), c.province]
    .filter(Boolean)
    .join(", ");
  return (
    <Drawer
      title={c.displayName}
      closeHref={closeHref}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {PARTY[c.partyType]}
          {c.code && <span className="font-mono text-xs">{c.code}</span>}
          {c.isActive ? <Badge tone="success">Attivo</Badge> : <Badge>Non attivo</Badge>}
        </span>
      }
      footer={
        <>
          {canWrite && (
            <EditCustomerDialog
              customer={{
                id: c.id,
                code: c.code,
                partyType: c.partyType,
                displayName: c.displayName,
                legalName: c.legalName,
                vatNumber: c.vatNumber,
                taxCode: c.taxCode,
                sdiCode: c.sdiCode,
                pecEmail: c.pecEmail,
                email: c.email,
                phone: c.phone,
                addressLine: c.addressLine,
                postalCode: c.postalCode,
                city: c.city,
                province: c.province,
                paymentTermsDays: c.paymentTermsDays,
                notes: c.notes,
                isActive: c.isActive,
                version: new Date(c.updatedAt).toISOString(),
              }}
            />
          )}
          <Link href={`/app/clienti/${c.id}`} className={buttonVariants()}>
            <ExternalLink aria-hidden /> Apri la scheda
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {(c.email || c.phone) && (
          <div className="flex flex-wrap gap-2">
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <Phone aria-hidden /> {c.phone}
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <Mail aria-hidden /> Scrivi
              </a>
            )}
          </div>
        )}
        <section>
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Dati
          </h3>
          <DetailList
            items={filled([
              { label: "Ragione sociale", value: c.legalName, wide: true },
              { label: "Partita IVA", value: c.vatNumber && <Mono>{c.vatNumber}</Mono> },
              { label: "Codice fiscale", value: c.taxCode && <Mono>{c.taxCode}</Mono> },
              { label: "Codice SDI", value: c.sdiCode && <Mono>{c.sdiCode}</Mono> },
              { label: "PEC", value: c.pecEmail },
              { label: "Email", value: c.email },
              { label: "Telefono", value: c.phone },
              { label: "Indirizzo", value: address, wide: true },
              {
                label: "Termini di pagamento",
                value: c.paymentTermsDays != null ? `${c.paymentTermsDays} giorni` : null,
              },
            ])}
          />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Contatti ({c.contacts.length})
          </h3>
          {c.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun contatto.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name ?? "Senza nome"}</span>
                    {p.role && (
                      <span className="block truncate text-xs text-muted-foreground">{p.role}</span>
                    )}
                  </span>
                  {p.phone && (
                    <a
                      href={`tel:${p.phone}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Chiama ${p.name ?? ""}`}
                    >
                      <Phone className="size-4" />
                    </a>
                  )}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Scrivi a ${p.name ?? ""}`}
                    >
                      <Mail className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Sedi ({c.sites.length})
          </h3>
          {c.sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna sede.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {c.sites.map((site) => (
                <li key={site.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{site.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[site.address, site.city].filter(Boolean).join(", ") || "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {c.notes && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Note
            </h3>
            <p className="text-sm whitespace-pre-line">{c.notes}</p>
          </section>
        )}
      </div>
    </Drawer>
  );
}

/** Solo i dati compilati: l'anteprima resta corta; la scheda completa mostra tutto. */
type Item = { label: string; value: React.ReactNode; wide?: boolean };
function filled(items: Item[]): Item[] {
  const list = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  return list.length > 0
    ? list
    : [{ label: "Dati", value: "Nessun dato fiscale o di contatto inserito.", wide: true }];
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px] tabular-nums">{children}</span>;
}
