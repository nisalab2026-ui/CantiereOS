import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CantiereOS", template: "%s · CantiereOS" },
  description: "Gestionale per imprese edili e servizi tecnici",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
