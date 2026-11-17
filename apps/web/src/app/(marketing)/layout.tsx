import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/site/blocks";
import { MotionRoot, MOTION_BOOT_SCRIPT } from "@/components/site/motion/motion-root";
import { SiteHeader } from "@/components/site/site-header";
import { getVerifiedSession } from "@/lib/auth";
import { NAV } from "./content";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "CantiereOS · Gestionale per imprese edili", template: "%s · CantiereOS" },
  description:
    "Il gestionale per imprese edili e di servizi tecnici: scadenze, moduli compilabili dal telefono, documenti, attività, pagamenti e squadre in un solo posto.",
};

/**
 * Sito pubblico (docs/SITO_PUBBLICO.md): pagine aperte a tutti, separate dal gestionale (/app).
 * Chi ha già una sessione verificata vede "Apri il gestionale" al posto di "Prova gratis".
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const signedIn = await getVerifiedSession()
    .then(Boolean)
    .catch(() => false);
  const contactEmail = process.env.PUBLIC_CONTACT_EMAIL?.trim() || null;

  return (
    <div className="site relative overflow-x-clip">
      {/* Prima del primo disegno: i contenuti "in entrata" si nascondono solo se JavaScript gira. */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Vai al contenuto
      </a>
      <div aria-hidden className="scroll-line" />
      <SiteHeader nav={NAV} signedIn={signedIn} />
      <main id="contenuto">{children}</main>
      <SiteFooter contactEmail={contactEmail} />
      <MotionRoot />
    </div>
  );
}
