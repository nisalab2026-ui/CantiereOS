import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { ListOptions, Page } from "../directory/lists";
import type { UserTx } from "../db/transaction";
import { optional, parseInput, ValidationError } from "../validation";
import { likePattern } from "../workspace/search";

/**
 * Pagamenti attesi (ADR-012): da incassare dai clienti o da pagare ai fornitori.
 * Non è contabilità e non muove denaro: nessun provider è configurato. Importi
 * sempre in centesimi interi; "in ritardo" si ricava dalla data.
 */
export const PAYMENT_DIRECTIONS = ["incoming", "outgoing"] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];
export const PAYMENT_STATUSES = ["open", "paid", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_METHODS = [
  "bank_transfer",
  "riba",
  "card",
  "cash",
  "check",
  "direct_debit",
  "other",
] as const;

export const PAYMENT_DIRECTION_LABELS: Record<PaymentDirection, string> = {
  incoming: "Da incassare",
  outgoing: "Da pagare",
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  open: "Aperto",
  paid: "Pagato",
  cancelled: "Annullato",
};
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bonifico",
  riba: "Ri.Ba.",
  card: "Carta",
  cash: "Contanti",
  check: "Assegno",
  direct_debit: "Addebito diretto (SDD)",
  other: "Altro",
};

/** Stato mostrato: aperto, in ritardo, pagato, annullato. */
export type PaymentState = "open" | "overdue" | "paid" | "cancelled";

export interface PaymentRow {
  id: string;
  direction: PaymentDirection;
  description: string;
  referenceCode: string | null;
  amountCents: number;
  dueDate: string;
  status: PaymentStatus;
  state: PaymentState;
  paidOn: string | null;
  paidAmountCents: number | null;
  counterparty: { type: "customer" | "supplier"; id: string; name: string } | null;
  updatedAt: Date;
}

export interface PaymentDetail extends PaymentRow {
  method: string | null;
  notes: string | null;
  recordedAt: Date | null;
  recordedByName: string | null;
  createdAt: Date;
  createdByName: string | null;
}

/** Converte "1.250,50", "1250.5", "€ 80" in centesimi. null se non valido. */
export function parseEuroToCents(input: string): number | null {
  let t = input.replace(/[\s€]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // "1.250" = milleduecentocinquanta
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

/** 125050 → "1.250,50 €" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(cents / 100);
}

const SELECT = `
  x.id, x.direction, x.description, x.reference_code as "referenceCode",
  x.amount_cents::float8 as "amountCents", to_char(x.due_date, 'YYYY-MM-DD') as "dueDate",
  x.status,
  case when x.status = 'open' and x.due_date < current_date then 'overdue' else x.status end as state,
  to_char(x.paid_on, 'YYYY-MM-DD') as "paidOn", x.paid_amount_cents::float8 as "paidAmountCents",
  case when x.customer_id is not null then json_build_object('type','customer','id',x.customer_id,'name',c.display_name)
       when x.supplier_id is not null then json_build_object('type','supplier','id',x.supplier_id,'name',s.display_name)
  end as counterparty,
  x.updated_at as "updatedAt"`;

const FROM = `
  public.payments x
  left join public.customers c on c.tenant_id = x.tenant_id and c.id = x.customer_id
  left join public.suppliers s on s.tenant_id = x.tenant_id and s.id = x.supplier_id`;

export interface PaymentQuery {
  q?: string;
  /** open (default) | overdue | paid | cancelled | all */
  state?: string;
  direction?: string;
  customerId?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export const PAYMENT_SORTS = ["due", "amount", "description", "updated"] as const;
const SORTS: Record<string, string> = {
  due: "x.due_date",
  amount: "x.amount_cents",
  description: "lower(x.description)",
  updated: "x.updated_at",
};
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function listPayments(
  tx: UserTx,
  access: TenantAccess,
  q: PaymentQuery,
  opts: ListOptions = {},
): Promise<Page<PaymentRow> & { totals: { incomingCents: number; outgoingCents: number } }> {
  requirePermission(access, "payments.read");
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), opts.maxPageSize ?? 100);
  const page = Math.min(Math.max(q.page ?? 1, 1), 10_000);
  const params: unknown[] = [access.tenantId];
  const where = ["x.tenant_id = $1", "x.deleted_at is null"];
  const state = q.state ?? "open";
  if (state === "open") where.push("x.status = 'open'");
  else if (state === "overdue") where.push("x.status = 'open' and x.due_date < current_date");
  else if (state === "paid" || state === "cancelled") {
    params.push(state);
    where.push(`x.status = $${params.length}`);
  }
  if (q.direction && (PAYMENT_DIRECTIONS as readonly string[]).includes(q.direction)) {
    params.push(q.direction);
    where.push(`x.direction = $${params.length}`);
  }
  for (const [key, col] of [
    ["customerId", "customer_id"],
    ["supplierId", "supplier_id"],
  ] as const) {
    if (isUuid(q[key])) {
      params.push(q[key]);
      where.push(`x.${col} = $${params.length}`);
    }
  }
  if (q.from && isoDate.test(q.from)) {
    params.push(q.from);
    where.push(`x.due_date >= $${params.length}::date`);
  }
  if (q.to && isoDate.test(q.to)) {
    params.push(q.to);
    where.push(`x.due_date <= $${params.length}::date`);
  }
  const term = (q.q ?? "").trim().slice(0, 100);
  if (term) {
    params.push(likePattern(term.toLowerCase()));
    where.push(
      `lower(concat_ws(' ', x.description, x.reference_code, c.display_name, s.display_name)) like $${params.length}`,
    );
  }
  const sort = SORTS[q.sort ?? ""] ?? SORTS.due!;
  const dir = q.dir === "desc" ? "desc" : "asc";
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await tx.query<PaymentRow & { __total: number; __in: number; __out: number }>(
    `select ${SELECT}, count(*) over ()::int as "__total",
            coalesce(sum(x.amount_cents) filter (where x.direction = 'incoming') over (), 0)::float8 as "__in",
            coalesce(sum(x.amount_cents) filter (where x.direction = 'outgoing') over (), 0)::float8 as "__out"
       from ${FROM}
      where ${where.join(" and ")}
      order by ${sort} ${dir} nulls last, x.created_at desc, x.id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: rows.map(({ __total: _t, __in: _i, __out: _o, ...r }) => r as PaymentRow),
    total: rows[0]?.__total ?? 0,
    page,
    pageSize,
    totals: { incomingCents: rows[0]?.__in ?? 0, outgoingCents: rows[0]?.__out ?? 0 },
  };
}

export async function getPayment(
  tx: UserTx,
  access: TenantAccess,
  id: string,
): Promise<PaymentDetail | null> {
  requirePermission(access, "payments.read");
  if (!isUuid(id)) return null;
  const { rows } = await tx.query<PaymentDetail>(
    `select ${SELECT}, x.method, x.notes, x.recorded_at as "recordedAt",
            coalesce(ru.full_name, ru.email) as "recordedByName", x.created_at as "createdAt",
            coalesce(cb.full_name, cb.email) as "createdByName"
       from ${FROM}
       left join public.users ru on ru.id = x.recorded_by
       left join public.users cb on cb.id = x.created_by
      where x.tenant_id = $1 and x.id = $2 and x.deleted_at is null`,
    [access.tenantId, id],
  );
  return rows[0] ?? null;
}

// --- Scrittura -----------------------------------------------------------------

const euro = (message: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseEuroToCents(v);
      if (cents === null || cents > 100_000_000_000) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return cents;
    });

export const paymentInput = z.object({
  direction: z.enum(PAYMENT_DIRECTIONS, "Scegli se è da incassare o da pagare"),
  description: z
    .string()
    .trim()
    .min(1, "Inserisci una descrizione")
    .max(200, "Massimo 200 caratteri"),
  referenceCode: optional(z.string().trim().max(60, "Massimo 60 caratteri")),
  amount: euro("Importo non valido (es. 1.250,00)"),
  dueDate: z.string().regex(isoDate, "Inserisci la data prevista"),
  method: optional(z.enum(PAYMENT_METHODS, "Modalità non valida")),
  notes: optional(z.string().trim().max(4000, "Massimo 4000 caratteri")),
  counterpartyId: optional(z.uuid("Scegli una controparte valida")),
});
export type PaymentInput = z.input<typeof paymentInput>;

function counterpartyColumns(d: z.output<typeof paymentInput>) {
  return [
    d.direction === "incoming" ? (d.counterpartyId ?? null) : null,
    d.direction === "outgoing" ? (d.counterpartyId ?? null) : null,
  ];
}

function mapWriteError(error: unknown): never {
  const code = pgCode(error);
  if (code === "23503") throw new ValidationError({ counterpartyId: "Controparte non trovata" });
  if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
  throw error;
}

export async function createPayment(
  tx: UserTx,
  access: TenantAccess,
  input: PaymentInput,
): Promise<{ id: string }> {
  requirePermission(access, "payments.write");
  const d = parseInput(paymentInput, input);
  await tx.query("savepoint create_payment");
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.payments
         (tenant_id, direction, description, reference_code, amount_cents, due_date, method, notes,
          customer_id, supplier_id)
       values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10) returning id`,
      [
        access.tenantId,
        d.direction,
        d.description,
        d.referenceCode ?? null,
        d.amount,
        d.dueDate,
        d.method ?? null,
        d.notes ?? null,
        ...counterpartyColumns(d),
      ],
    );
    return { id: rows[0]!.id };
  } catch (error) {
    await tx.query("rollback to savepoint create_payment");
    mapWriteError(error);
  }
}

/** Modifica completa con controllo di concorrenza; non cambia lo stato. */
export async function updatePayment(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: PaymentInput,
  expectedUpdatedAt: string,
): Promise<void> {
  requirePermission(access, "payments.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Pagamento non trovato" });
  const d = parseInput(paymentInput, input);
  await tx.query("savepoint update_payment");
  try {
    const { rowCount } = await tx.query(
      `update public.payments set
         direction = $3, description = $4, reference_code = $5, amount_cents = $6,
         due_date = $7::date, method = $8, notes = $9, customer_id = $10, supplier_id = $11
       where tenant_id = $1 and id = $2 and deleted_at is null
         and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $12::timestamptz)`,
      [
        access.tenantId,
        id,
        d.direction,
        d.description,
        d.referenceCode ?? null,
        d.amount,
        d.dueDate,
        d.method ?? null,
        d.notes ?? null,
        ...counterpartyColumns(d),
        expectedUpdatedAt,
      ],
    );
    if (rowCount === 0) {
      throw new ValidationError({
        form: "Il pagamento è stato modificato da un altro utente o non esiste più. Ricarica la pagina.",
      });
    }
  } catch (error) {
    await tx.query("rollback to savepoint update_payment");
    if (error instanceof ValidationError) throw error;
    mapWriteError(error);
  }
}

const markPaidInput = z.object({
  paidOn: z.string().regex(isoDate, "Inserisci la data del pagamento"),
  paidAmount: optional(euro("Importo non valido (es. 1.250,00)")),
  method: optional(z.enum(PAYMENT_METHODS, "Modalità non valida")),
});

/** Registra l'incasso o il pagamento. Chi e quando lo stabilisce il database. */
export async function markPaymentPaid(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  input: { paidOn: string; paidAmount?: string | undefined; method?: string | undefined },
): Promise<void> {
  requirePermission(access, "payments.write");
  if (!isUuid(id)) throw new ValidationError({ form: "Pagamento non trovato" });
  const d = parseInput(markPaidInput, input);
  // "oggi" in ora italiana, come il campo data del gestionale (non in UTC:
  // tra mezzanotte e l'una il giorno italiano è già quello dopo)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  if (d.paidOn > today) {
    throw new ValidationError({ paidOn: "La data non può essere nel futuro" });
  }
  const { rowCount } = await tx.query(
    `update public.payments
        set status = 'paid', paid_on = $3::date, paid_amount_cents = $4, method = coalesce($5, method)
      where tenant_id = $1 and id = $2 and deleted_at is null and status = 'open'`,
    [access.tenantId, id, d.paidOn, d.paidAmount ?? null, d.method ?? null],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Il pagamento non è più aperto." });
}

/** Riapre (annulla la registrazione) o annulla un pagamento atteso. */
export async function setPaymentStatus(
  tx: UserTx,
  access: TenantAccess,
  id: string,
  status: "open" | "cancelled",
): Promise<void> {
  requirePermission(access, "payments.write");
  if (!isUuid(id) || (status !== "open" && status !== "cancelled")) {
    throw new ValidationError({ form: "Operazione non valida" });
  }
  const { rowCount } = await tx.query(
    `update public.payments set status = $3
      where tenant_id = $1 and id = $2 and deleted_at is null and status <> $3`,
    [access.tenantId, id, status],
  );
  if (rowCount === 0) throw new ValidationError({ form: "Il pagamento è già in questo stato." });
}

/** Eliminazione logica (payments.delete, MFA): la cronologia resta. */
export async function deletePayment(tx: UserTx, access: TenantAccess, id: string): Promise<void> {
  requirePermission(access, "payments.delete");
  if (!isUuid(id)) return;
  await tx.query(
    "update public.payments set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null",
    [access.tenantId, id],
  );
}

export interface PaymentSummary {
  incomingOpenCents: number;
  incomingOverdueCents: number;
  incomingOverdue: number;
  outgoingOpenCents: number;
  outgoingDueSoonCents: number;
  outgoingOverdue: number;
}

/** Totali per la panoramica: da incassare, scaduti, da pagare nei prossimi 30 giorni. */
export async function getPaymentSummary(tx: UserTx, access: TenantAccess): Promise<PaymentSummary> {
  requirePermission(access, "payments.read");
  const { rows } = await tx.query<PaymentSummary>(
    `select
       coalesce(sum(amount_cents) filter (where direction = 'incoming'), 0)::float8 as "incomingOpenCents",
       coalesce(sum(amount_cents) filter (where direction = 'incoming' and due_date < current_date), 0)::float8 as "incomingOverdueCents",
       count(*) filter (where direction = 'incoming' and due_date < current_date)::int as "incomingOverdue",
       coalesce(sum(amount_cents) filter (where direction = 'outgoing'), 0)::float8 as "outgoingOpenCents",
       coalesce(sum(amount_cents) filter (where direction = 'outgoing' and due_date <= current_date + 30), 0)::float8 as "outgoingDueSoonCents",
       count(*) filter (where direction = 'outgoing' and due_date < current_date)::int as "outgoingOverdue"
     from public.payments
     where tenant_id = $1 and deleted_at is null and status = 'open'`,
    [access.tenantId],
  );
  return rows[0]!;
}
