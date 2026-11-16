"use client";

import * as Popover from "@radix-ui/react-popover";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { NotificationItem } from "@cantiereos/core";
import { loadNotifications, markNotificationsReadAction } from "@/app/(app)/shell-actions";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

/** Notifiche dell'utente nell'azienda attiva: caricate dal server all'apertura. */
export function NotificationsButton({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const refresh = () =>
    start(async () => {
      try {
        const data = await loadNotifications();
        setItems(data.items);
        setUnread(data.unread);
        setError(false);
      } catch {
        setError(true);
      }
    });

  const markAll = () =>
    start(async () => {
      await markNotificationsReadAction([]);
      setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })) ?? null);
      setUnread(0);
    });

  return (
    <Popover.Root onOpenChange={(o) => o && refresh()}>
      <Popover.Trigger
        className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={unread > 0 ? `Notifiche, ${unread} non lette` : "Notifiche"}
        data-testid="notifications"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
            data-testid="notifications-unread"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifiche</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={pending}
                className="text-xs font-medium text-primary hover:underline"
              >
                Segna tutte come lette
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error && (
              <p className="px-4 py-6 text-center text-sm text-danger">
                Impossibile caricare le notifiche.
              </p>
            )}
            {!error && items === null && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Caricamento…</p>
            )}
            {!error && items?.length === 0 && (
              <div className="flex flex-col items-center px-4 py-8 text-center text-sm text-muted-foreground">
                <BellOff className="mb-2 size-5" aria-hidden />
                Nessuna notifica.
              </div>
            )}
            <ul>
              {items?.map((n) => {
                const content = (
                  <>
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.readAt ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && (
                        <span className="block text-sm text-muted-foreground">{n.body}</span>
                      )}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatRelative(n.createdAt)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    className="border-b border-border last:border-0"
                    data-testid="notification-item"
                  >
                    {n.link ? (
                      <Popover.Close asChild>
                        <Link
                          href={n.link}
                          onClick={() =>
                            !n.readAt && start(() => markNotificationsReadAction([n.id]))
                          }
                          className="flex gap-3 px-4 py-3 hover:bg-accent/60"
                        >
                          {content}
                        </Link>
                      </Popover.Close>
                    ) : (
                      <div className="flex gap-3 px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
