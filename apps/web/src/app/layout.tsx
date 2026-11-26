import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/toaster";
import { parseTheme, THEME_COOKIE, themeClass } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CantiereOS", template: "%s · CantiereOS" },
  description: "Gestionale per imprese edili e servizi tecnici",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#04140c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="it"
      className={[GeistSans.variable, GeistMono.variable, themeClass(theme)]
        .filter(Boolean)
        .join(" ")}
    >
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
