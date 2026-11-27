import {
  CalendarRange,
  Briefcase,
  Building,
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
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CREATE_PARAM } from "@/lib/open-from-url";

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
    href: "/app/interventi",
    label: "Interventi",
    icon: CalendarRange,
    permission: "work_orders.read",
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
    href: "/app/azienda",
    label: "Dati azienda",
    icon: Building,
    permission: "tenant.manage",
    group: "azienda",
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
  { href: "/account/profilo", label: "Profilo", icon: UserRound, group: "account" },
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

export interface CreateAction {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Servono entrambi: leggere l'elenco e scriverci. Il server li ricontrolla. */
  permissions: string[];
  /** Tasto rapido nel menu «+ Nuovo». */
  key: string;
}

const create = (path: string) => `${path}?${CREATE_PARAM}=1`;

/** Voci di «+ Nuovo» e delle azioni di ⌘K: aprono la finestra di creazione dell'elenco. */
export const CREATE_ACTIONS: CreateAction[] = [
  {
    href: "/app/interventi/nuovo",
    label: "Intervento",
    icon: CalendarRange,
    permissions: ["work_orders.read", "work_orders.write"],
    key: "i",
  },
  {
    href: create("/app/rapportini"),
    label: "Rapportino",
    icon: ClipboardList,
    permissions: ["work_reports.read", "work_reports.write"],
    key: "r",
  },
  {
    href: create("/app/attivita"),
    label: "Attività",
    icon: ListTodo,
    permissions: ["tasks.read", "tasks.write"],
    key: "a",
  },
  {
    href: create("/app/commesse"),
    label: "Commessa",
    icon: Briefcase,
    permissions: ["projects.read", "projects.write"],
    key: "m",
  },
  {
    href: create("/app/clienti"),
    label: "Cliente",
    icon: Building2,
    permissions: ["customers.read", "customers.write"],
    key: "c",
  },
  {
    href: create("/app/scadenze"),
    label: "Scadenza",
    icon: CalendarClock,
    permissions: ["deadlines.read", "deadlines.write"],
    key: "s",
  },
  {
    href: create("/app/pagamenti"),
    label: "Pagamento",
    icon: Wallet,
    permissions: ["payments.read", "payments.write"],
    key: "p",
  },
  {
    href: create("/app/comunicazioni"),
    label: "Comunicazione",
    icon: MessagesSquare,
    permissions: ["communications.read", "communications.write"],
    key: "o",
  },
  {
    href: create("/app/moduli"),
    label: "Modulo da compilare",
    icon: ClipboardCheck,
    permissions: ["forms.read", "forms.write"],
    key: "f",
  },
  {
    href: create("/app/documenti"),
    label: "Documento",
    icon: FolderOpen,
    permissions: ["documents.read", "documents.write"],
    key: "d",
  },
  {
    href: create("/app/personale"),
    label: "Persona",
    icon: HardHat,
    permissions: ["employees.read", "employees.write"],
    key: "e",
  },
];

export function visibleCreateActions(permissions: readonly string[]): CreateAction[] {
  const set = new Set(permissions);
  return CREATE_ACTIONS.filter((a) => a.permissions.every((p) => set.has(p)));
}
