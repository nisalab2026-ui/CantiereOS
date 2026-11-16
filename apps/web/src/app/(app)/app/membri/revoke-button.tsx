"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { revokeInviteById } from "../../actions";

export function RevokeInvitationButton({ id, email }: { id: string; email: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger-outline" size="sm">
          Revoca
        </Button>
      }
      title="Revocare l'invito?"
      description={`Il link inviato a ${email} smetterà subito di funzionare. Potrai invitare di nuovo questa persona in seguito.`}
      confirmLabel="Revoca invito"
      action={() => revokeInviteById(id)}
    />
  );
}
