import { listComments, type CommentSubject } from "@cantiereos/core";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { CommentThread } from "./comment-thread";

/**
 * Commenti interni su un elemento (cliente, dipendente, scadenza, documento,
 * attività...). Compare solo con comments.read; il database mostra i commenti
 * solo a chi può vedere l'elemento.
 */
export async function CommentsPanel({ table, id }: { table: CommentSubject; id: string }) {
  const { access } = await getAppContext();
  if (!access.permissions.has("comments.read")) return null;
  const comments = await asCurrentUser((tx) => listComments(tx, access, { table, id }));
  return (
    <Card data-testid="comments">
      <CardHeader
        title={comments.length > 0 ? `Commenti (${comments.length})` : "Commenti"}
        description="Note interne del team, visibili solo a chi può vedere questo elemento."
      />
      <CardBody>
        <CommentThread
          table={table}
          subjectId={id}
          canWrite={access.permissions.has("comments.write")}
          canModerate={access.permissions.has("comments.delete")}
          comments={comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorName: c.authorName ?? "Utente rimosso",
            when: formatDateTime(c.createdAt),
            edited: c.editedAt ? formatDateTime(c.editedAt) : null,
            mine: c.mine,
          }))}
        />
      </CardBody>
    </Card>
  );
}
