import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";

/**
 * Registro delle comunicazioni (ADR-012): telefonate, email, PEC, incontri,
 * lettere e messaggi. Registra ciò che è avvenuto: non invia nulla (nessun
 * servizio di posta è configurato).
 */
export const COMMUNICATION_CHANNELS = [
  "phone",
  "email",
  "pec",
  "meeting",
  "letter",
  "message",
  "other",
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];
export const COMMUNICATION_CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  phone: "Telefonata",
  email: "Email",
  pec: "PEC",
  meeting: "Incontro",
  letter: "Lettera",
  message: "Messaggio",
  other: "Altro",
};
export const COMMUNICATION_DIRECTION_LABELS = { inbound: "Ricevuta", outbound: "Inviata" } as const;

type Subject = { type: "customer" | "supplier" | "employee"; id: string; name: string };

export interface CommunicationRow {
  id: string;
  channel: CommunicationChannel;
  direction: "inbound" | "outbound";
  occurredAt: Date;
  subject: string;
  contactName: string | null;
  related: Subject | null;
  followUpDate: string | null;
  followUpDone: boolean;
  /** richiamo previsto, non fatto, con data passata */
  followUpOverdue: boolean;
  createdByName: string | null;
}

export interface CommunicationDetail extends CommunicationRow {
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = `
  x.id, x.channel, x.direction, x.occurred_at as "occurredAt", x.subject,
  x.contact_name as "contactName",
  case when x.customer_id is not null then json_build_object('type','customer','id',x.customer_id,'name',c.display_name)
       when x.supplier_id is not null then json_build_object('type','supplier','id',x.supplier_id,'name',s.display_name)
       when x.employee_id is not null then json_build_object('type','employee','id',x.employee_id,'name',concat_ws(' ', e.first_name, e.last_name))
  end as related,
  to_char(x.follow_up_date, 'YYYY-MM-DD') as "followUpDate", x.follow_up_done as "followUpDone",
  (x.follow_up_date is not null and not x.follow_up_done and x.follow_up_date < current_date) as "followUpOverdue",
  coalesce(cb.full_name, cb.email) as "createdByName"`;

const FROM = `
  public.communications x
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.suppliers s on s.tenant_id = x.tenant_id and s.id = x.supplier_id
  left join public.employees e on e.tenant_id = x.tenant_id and e.id = x.employee_id
  left join public.users cb on cb.id = x.created_by`;

export interface CommunicationQuery {
  q?: string;
  channel?: string;
  direction?: string;
  /** pending = richiami da fare */
  followUp?: string;
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Elenco dal più recente; filtri per canale, direzione, soggetto, periodo, richiami. */
export async function listCommunications(
  tx: UserTx,
  access: TenantAccess,
  q: CommunicationQuery,
  opts: ListOptions = {},
): Promise<Page<CommunicationRow>> {
  requirePermission(access, "communications.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  if (q.channel && (COMMUNICATION_CHANNELS as readonly string[]).includes(q.channel)) {
    params.push(q.channel);
    where.push(`x.channel = $${params.length}`);
  }
  if (q.direction === "inbound" || q.direction === "outbound") {
    params.push(q.direction);
    where.push(`x.direction = $${params.length}`);
  }
  if (q.followUp === "pending") where.push("x.follow_up_date is not null and not x.follow_up_done");
  for (const [key, col] of [
    ["customerId", "customer_id"],
    ["supplierId", "supplier_id"],
    ["employeeId", "employee_id"],
  ] as const) {
    if (isUuid(q[key])) {
      params.push(q[key]);
      where.push(`x.${col} = $${params.length}`);
    }
  }
  // periodo sul giorno italiano della comunicazione
  if (q.from && isoDate.test(q.from)) {
    params.push(q.from);
    where.push(`(x.occurred_at at time zone 'Europe/Rome')::date >= $${params.length}::date`);
  }
  if (q.to && isoDate.test(q.to)) {
    params.push(q.to);
    where.push(`(x.occurred_at at time zone 'Europe/Rome')::date <= $${params.length}::date`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', x.subject, x.body, x.contact_name, c.display_name, s.display_name, e.first_name, e.last_name)) like $${params.length}`,
    );
  }
  const order =
    q.followUp === "pending"
      ? "x.follow_up_date asc, x.occurred_at desc"
      : `x.occurred_at ${q.dir === "asc" ? "asc" : "desc"}`;
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<CommunicationRow & { __total: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${order}, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _, ...r }) => r as CommunicationRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
  };
}

export async function getCommunication(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<CommunicationDetail | null> {
  requirePermission(access, "communications.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<CommunicationDetail>(
    `select ${SELECT}, x.body, x.created_at as "createdAt", x.updated_at as "updatedAt"
       from ${FROM}
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

// --- Scrittura -----------------------------------------------------------------

/** "2026-11-17T09:30" (ora italiana, dal campo datetime-local) */
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const communicationInput = z
  .object({
    channel: z.enum(COMMUNICATION_CHANNELS, "Scegli il canale"),
    direction: z.enum(["inbound", "outbound"], "Indica se ricevuta o inviata"),
    occurredAt: z.string().regex(localDateTime, "Inserisci data e ora"),
    subject: z.string().trim().min(1, "Inserisci l'oggetto").max(200, "Massimo 200 caratteri"),
    body: optional(z.string().trim().max(8000, "Massimo 8000 caratteri")),
    contactName: optional(z.string().trim().max(120, "Massimo 120 caratteri")),
    relatedType: optional(z.enum(["customer", "supplier", "employee"])),
    relatedId: optional(z.uuid("Scegli un elemento valido")),
    followUpDate: optional(z.string().regex(isoDate, "Data non valida")),
  })
  .refine((d) => !d.relatedType === !d.relatedId, {
    path: ["relatedId"],
    message: "Scegli con chi è avvenuta la comunicazione",
  });
export type CommunicationInput = z.input<typeof communicationInput>;

function relatedColumns(d: z.output<typeof communicationInput>) {
  return [
    d.relatedType === "customer" ? d.relatedId! : null,
    d.relatedType === "supplier" ? d.relatedId! : null,
    d.relatedType === "employee" ? d.relatedId! : null,
  ];
}

function mapWriteError(error: unknown): never {
  const code = pgCode(error);
  if (code === "23503") throw new ValidationError({ relatedId: "Elemento collegato non trovato" });
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  throw error;
}

export async function createCommunication(
  tx: UserTx,
  access: TenantAccess,
  input: CommunicationInput,
): Promise<{ id: string }> {
  requirePermission(access, "communications.write");
  const d = parseInput(communicationInput, input);
  await tx.query("savepoint create_communication");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.communications
         (tenant_id, channel, direction, occurred_at, subject, body, contact_name,
          customer_id, supplier_id, employee_id, follow_up_date)
       values ($1, $2, $3, ($4::timestamp at time zone 'Europe/Rome'), $5, $6, $7, $8, $9, $10, $11::date)
       returning id`,
      [
        access.tenantId,
        d.channel,
        d.direction,
        d.occurredAt,
        d.subject,
        d.body ?? null,
        d.contactName ?? null,
        ...relatedColumns(d),
        d.followUpDate ?? null,
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_communication");
    mapWriteError(error);
  }
}

export async function updateCommunication(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: CommunicationInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "communications.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Comunicazione non trovata" });
  const d = parseInput(communicationInput, input);
  await tx.query("savepoint update_communication");
  try {
    const { rowCount } = await tx.query(
      `update public.communications set
         channel = $3, direction = $4, occurred_at = ($5::timestamp at time zone 'Europe/Rome'),
         subject = $6, body = $7, contact_name = $8, customer_id = $9, supplier_id = $10,
         employee_id = $11, follow_up_date = $12::date,
         follow_up_done = follow_up_done and $12::date is not null
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $13::timestamptz)`,
      [
        access.tenantId,
        id,
        d.channel,
        d.direction,
        d.occurredAt,
        d.subject,
        d.body ?? null,
        d.contactName ?? null,
        ...relatedColumns(d),
        d.followUpDate ?? null,
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "La comunicazione è stata modificata da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint update_communication");
    if (error instanceof ValidationError) throw error;
    mapWriteError(error);
  }
}

/** Segna il richiamo come fatto (o di nuovo da fare). */
export async function setFollowUpDone(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  done: boolean,
): Promise<void> {
  requirePermission(access, "communications.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Comunicazione non trovata" });
  const { rowCount } = await tx.query(
    `update public.communications set follow_up_done = $3
      where tenant_id = $1 and id = $2 and deleted_at is null and follow_up_date is not null
        and follow_up_done <> $3`,
    [access.tenantId, id, done],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Nessun richiamo da aggiornare." });
}

export async function deleteCommunication(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<void> {
  requirePermission(access, "communications.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.communications set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}
