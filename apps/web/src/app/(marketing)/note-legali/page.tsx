import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal";
import { LEGAL_DOCS } from "../legal-content";

const doc = LEGAL_DOCS["note-legali"];

export const metadata: Metadata = { title: "Note legali", description: doc.description };

export default function Page() {
  return <LegalPage doc={doc} />;
}
