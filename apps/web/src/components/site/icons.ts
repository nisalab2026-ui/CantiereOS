import {
  Building,
  CalendarClock,
  ClipboardCheck,
  DoorOpen,
  Download,
  Droplets,
  FireExtinguisher,
  FolderOpen,
  HardHat,
  House,
  ListTodo,
  type LucideIcon,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import type { FeatureIcon } from "@/app/(marketing)/content";
import type { TradeIcon } from "@/app/(marketing)/trades-content";

export const FEATURE_ICONS: Record<FeatureIcon, LucideIcon> = {
  deadlines: CalendarClock,
  forms: ClipboardCheck,
  documents: FolderOpen,
  tasks: ListTodo,
  payments: Wallet,
  directory: Users,
  security: ShieldCheck,
  export: Download,
  search: Search,
  phone: Smartphone,
};

export const TRADE_ICONS: Record<TradeIcon, LucideIcon> = {
  edili: HardHat,
  elettrici: Zap,
  idraulici: Droplets,
  coperture: House,
  manutenzioni: Wrench,
  antincendio: FireExtinguisher,
  serramenti: DoorOpen,
  facility: Building,
};
