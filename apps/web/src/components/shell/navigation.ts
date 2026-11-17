import {
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  Building2,
  CalendarClock,
  CalendarDays,
  FolderOpen,
  History,
  LifeBuoy,
  HardHat,
  LayoutDashboard,
  MessagesSquare,
  ListTodo,
  ShieldCheck,
  Truck,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** La voce compare solo se il server conferma questo permesso. */
  permission?: string;
  group: "lavoro" | "anagrafiche" | "azienda" | "account";
}

/** Solo voci con una pagina reale dietro (niente voci "in arrivo"). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Panoramica", icon: LayoutDashboard, group: "lavoro" },
  {
    href: "/app/commesse",
    label: "Commesse",
    icon: Briefcase,
    permission: "projects.read",
    group: "lavoro",
  },
  {
    href: "/app/rapportini",
    label: "Rapportini",
    icon: ClipboardList,
    permission: "work_reports.read",
    group: "lavoro",
  },
  {
    href: "/app/attivita",
    label: "Attività",
    icon: ListTodo,
    permission: "tasks.read",
    group: "lavoro",
  },
  {
    href: "/app/calendario",
    label: "Calendario",
    icon: CalendarDays,
    permission: "tasks.read",
    group: "lavoro",
  },
  {
    href: "/app/scadenze",
    label: "Scadenze",
    icon: CalendarClock,
    permission: "deadlines.read",
    group: "lavoro",
  },
  {
    href: "/app/documenti",
    label: "Documenti",
    icon: FolderOpen,
    permission: "documents.read",
    group: "lavoro",
  },
  {
    href: "/app/pagamenti",
    label: "Pagamenti",
    icon: Wallet,
    permission: "payments.read",
    group: "lavoro",
  },
  {
    href: "/app/comunicazioni",
    label: "Comunicazioni",
    icon: MessagesSquare,
    permission: "communications.read",
    group: "lavoro",
  },
  {
    href: "/app/moduli",
    label: "Moduli",
    icon: ClipboardCheck,
    permission: "forms.read",
    group: "lavoro",
  },
  {
    href: "/app/clienti",
    label: "Clienti",
    icon: Building2,
    permission: "customers.read",
    group: "anagrafiche",
  },
  {
    href: "/app/fornitori",
    label: "Fornitori",
    icon: Truck,
    permission: "suppliers.read",
    group: "anagrafiche",
  },
  {
    href: "/app/personale",
    label: "Personale",
    icon: HardHat,
    permission: "employees.read",
    group: "anagrafiche",
  },
  {
    href: "/app/squadre",
    label: "Squadre",
    icon: UsersRound,
    permission: "teams.read",
    group: "anagrafiche",
  },
  {
    href: "/app/membri",
    label: "Utenti e accessi",
    icon: Users,
    permission: "members.read",
    group: "azienda",
  },
  {
    href: "/app/registro",
    label: "Registro attività",
    icon: History,
    permission: "audit.read",
    group: "azienda",
  },
  { href: "/account/sicurezza", label: "Sicurezza", icon: ShieldCheck, group: "account" },
  { href: "/app/guida", label: "Guida", icon: LifeBuoy, group: "account" },
];

export const NAV_GROUPS: Record<NavItem["group"], string> = {
  lavoro: "Lavoro",
  anagrafiche: "Anagrafiche",
  azienda: "Azienda",
  account: "Account",
};

export function visibleNav(permissions: readonly string[]): NavItem[] {
  const set = new Set(permissions);
  return NAV_ITEMS.filter((i) => !i.permission || set.has(i.permission));
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function titleFor(pathname: string): string {
  return NAV_ITEMS.find((i) => isActive(pathname, i.href))?.label ?? "CantiereOS";
}
