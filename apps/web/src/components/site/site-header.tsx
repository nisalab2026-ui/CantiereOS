"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string };

/**
 * Intestazione del sito pubblico: un'isola di vetro che si riempie appena si scorre, menu a tutto schermo
 * sul telefono, marchio animato e accesso al gestionale. Il sito è sempre chiaro (palette bianca e verde).
 */
export function SiteHeader({ nav, signedIn }: { nav: readonly NavItem[]; signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const cta = signedIn
    ? { href: "/app", label: "Apri il gestionale" }
    : { href: "/registrati", label: "Prova gratis" };

  return (
    <header
      className="site-header fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
      data-scrolled={scrolled || undefined}
      data-open={open || undefined}
    >
      <div className="site-header-bar mx-auto flex h-14 max-w-6xl items-center gap-2 rounded-2xl pr-2 pl-3 sm:pl-4">
        <Link href="/" aria-label="CantiereOS, pagina iniziale" className="text-[1.05rem]">
          <BrandLogo />
        </Link>

        <nav aria-label="Principale" className="ml-6 hidden md:block">
          <ul className="flex items-center">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="site-nav-link flex h-10 items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {!signedIn && (
            <Link
              href="/accedi"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent sm:inline-flex"
            >
              Accedi
            </Link>
          )}
          <Link
            href={cta.href}
            data-magnetic
            className="cos-primary hidden h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground sm:inline-flex"
          >
            {cta.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-md hover:bg-accent md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Chiudi il menu" : "Apri il menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id="site-menu"
        hidden={!open}
        className="site-menu-sheet cos-glass mx-auto mt-2 max-w-6xl rounded-2xl border border-border p-3 md:hidden"
      >
        <nav aria-label="Menu">
          <ul className="grid">
            {nav.map((item, i) => (
              <li
                key={item.href}
                className="site-menu-link"
                style={{ "--i": i } as React.CSSProperties}
              >
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="flex h-14 items-center justify-between border-b border-border px-2 text-2xl font-semibold tracking-tight aria-[current=page]:text-primary"
                >
                  {item.label}
                  <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div
          className="site-menu-link mt-4 grid grid-cols-2 gap-2"
          style={{ "--i": nav.length } as React.CSSProperties}
        >
          {!signedIn && (
            <Link
              href="/accedi"
              className="flex h-12 items-center justify-center rounded-md border border-border bg-card text-sm font-medium"
            >
              Accedi
            </Link>
          )}
          <Link
            href={cta.href}
            className={cn(
              "cos-primary flex h-12 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground",
              signedIn && "col-span-2",
            )}
          >
            {cta.label}
          </Link>
        </div>
      </div>
    </header>
  );
}
