import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal";
import { LEGAL_DOCS } from "../legal-content";

const doc = LEGAL_DOCS["privacy"];

export const metadata: Metadata = { title: "Informativa privacy", description: doc.description };

export default function Page() {
  return <LegalPage doc={doc} />;
}
