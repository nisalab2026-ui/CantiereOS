import {
  CalendarClock,
  ClipboardCheck,
  Download,
  FolderOpen,
  ListTodo,
  type LucideIcon,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import type { FeatureIcon } from "@/app/(marketing)/content";

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
