import {
  listAssignableMembers,
  listSubjectOptions,
  type DeadlineSubject,
  type TenantAccess,
  type UserTx,
} from "@cantiereos/core";

/**
 * Opzioni per il modulo scadenze. Se l'elemento collegato non è più tra gli
 * attivi viene aggiunto comunque: modificare una scadenza non deve mai
 * scollegarla in silenzio.
 */
export async function loadDeadlineOptions(
  tx: UserTx,
  access: TenantAccess,
  current?: DeadlineSubject | null,
) {
  const [subjects, members] = [
    await listSubjectOptions(tx, access),
    await listAssignableMembers(tx, access),
  ];
  if (current) {
    const list = subjects[current.type] ?? [];
    if (!list.some((o) => o.id === current.id)) {
      subjects[current.type] = [...list, { id: current.id, name: current.name }];
    }
  }
  return { subjects, members };
}
