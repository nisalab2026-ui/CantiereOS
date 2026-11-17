import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal";
import { LEGAL_DOCS } from "../legal-content";

const doc = LEGAL_DOCS["cookie"];

export const metadata: Metadata = { title: "Cookie policy", description: doc.description };

export default function Page() {
  return <LegalPage doc={doc} />;
}
