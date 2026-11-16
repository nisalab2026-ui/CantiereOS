"use client";

import { LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setTheme } from "@/app/(app)/shell-actions";
import type { ThemePreference } from "@/lib/theme";

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu({
  email,
  fullName,
  theme,
}: {
  email: string | null;
  fullName: string | null;
  theme: ThemePreference;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const logout = useRef<HTMLFormElement>(null);
  const label = fullName ?? email ?? "Utente";

  const applyTheme = (value: string) => {
    const t = value as ThemePreference;
    const root = document.documentElement;
    root.classList.remove("light", "dark", "system");
    root.classList.add(t);
    start(async () => {
      await setTheme(t);
      router.refresh();
    });
  };

  return (
    <>
      <form ref={logout} action="/esci" method="post" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15"
          aria-label="Menu utente"
          data-testid="user-menu"
        >
          {initials(label)}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-medium text-foreground">{label}</span>
            {fullName && email && (
              <span className="block truncate" data-testid="current-user">
                {email}
              </span>
            )}
            {!fullName && (
              <span className="sr-only" data-testid="current-user">
                {email}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account/sicurezza">
              <ShieldCheck aria-hidden /> Sicurezza e accesso
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={applyTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden /> Chiaro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden /> Scuro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden /> Sistema
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout.current?.requestSubmit()}>
            <LogOut aria-hidden /> Esci
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
