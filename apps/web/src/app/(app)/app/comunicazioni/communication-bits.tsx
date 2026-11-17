import { COMMUNICATION_CHANNEL_LABELS, type CommunicationChannel } from "@cantiereos/core";
import {
  Building,
  Mail,
  MailCheck,
  MessageSquare,
  MoreHorizontal,
  PhoneIncoming,
  PhoneOutgoing,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<CommunicationChannel, LucideIcon> = {
  phone: PhoneIncoming,
  email: Mail,
  pec: MailCheck,
  meeting: Building,
  letter: ScrollText,
  message: MessageSquare,
  other: MoreHorizontal,
};

/** Canale e direzione con icona e testo: "Telefonata ricevuta". */
export function ChannelLabel({
  channel,
  direction,
}: {
  channel: CommunicationChannel;
  direction: "inbound" | "outbound";
}) {
  const Icon = channel === "phone" && direction === "outbound" ? PhoneOutgoing : ICONS[channel];
  const label = COMMUNICATION_CHANNEL_LABELS[channel];
  const feminine = ["phone", "email", "pec", "letter"].includes(channel);
  const dir =
    channel === "meeting" || channel === "other"
      ? ""
      : direction === "inbound"
        ? feminine
          ? " ricevuta"
          : " ricevuto"
        : feminine
          ? " inviata"
          : " inviato";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {label}
      {dir}
    </span>
  );
}

export const RELATED_HREF: Record<string, string | null> = {
  customer: "/app/clienti",
  employee: "/app/personale",
  supplier: null,
};
