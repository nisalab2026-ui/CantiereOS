import { z } from "zod";
import { requirePermission, type TenantAccess } from "../auth/access";
import { AuthError, pgCode } from "../auth/errors";
import type { UserTx } from "../db/transaction";
import { parseInput, ValidationError } from "../validation";

/**
 * Mappa di clienti, sedi e cantieri (ADR-016). Le coordinate stanno sulle righe
 * stesse (RLS e audit già presenti); qui si leggono i punti e si salvano le
 * posizioni, trovate dall'indirizzo (geocodifica) o messe a mano.
 */
export const MAP_KINDS = ["customer", "customer_site", "project_site"] as const;
export type MapKind = (typeof MAP_KINDS)[number];
export const MAP_KIND_LABELS: Record<MapKind, string> = {
  customer: "Cliente",
  customer_site: "Sede del cliente",
  project_site: "Cantiere",
};
export type LocationSource = "geocoded" | "manual";

export interface MapPoint {
  kind: MapKind;
  id: string;
  name: string;
  /** cliente (per sedi e cantieri) o codice commessa */
  subtitle: string | null;
  address: string;
  /** testo da cercare con la geocodifica */
  query: string;
  customerId: string;
  href: string;
  lat: number | null;
  lng: number | null;
  source: LocationSource | null;
  /** attivo / stato del cantiere */
  status: string | null;
  /** posizione modificabile dall'utente corrente */
  canEdit: boolean;
}

export interface MapData {
  points: MapPoint[];
  /** quanti punti non hanno ancora una posizione */
  missing: number;
  canSeeSites: boolean;
}

const POINTS_LIMIT = 2000;

/**
 * Tutti i punti visibili all'utente, con o senza posizione. I cantieri compaiono
 * solo con projects.read; un cantiere su una sede del cliente usa la posizione
 * della sede (e si modifica lì).
 */
export async function listMapPoints(
  tx: UserTx,
  access: TenantAccess,
  opts: { customerId?: string } = {},
): Promise<MapData> {
  requirePermission(access, "customers.read");
  const canWriteCustomers = access.permissions.has("customers.write");
  const canSeeSites = access.permissions.has("projects.read");
  const canWriteSites = access.permissions.has("projects.write");
  const customerId =
    opts.customerId && z.uuid().safeParse(opts.customerId).success ? opts.customerId : null;

  type Row = Omit<MapPoint, "canEdit" | "lat" | "lng"> & { lat: string | null; lng: string | null };
  const params: unknown[] = [access.tenantId, customerId, POINTS_LIMIT];
  const parts = [
    `select 'customer' as kind, c.id, c.display_name as name, c.code as subtitle,
            concat_ws(', ', c.billing_address_line, concat_ws(' ', c.billing_postal_code, c.billing_city), c.billing_province) as address,
            concat_ws(', ', c.billing_address_line, c.billing_postal_code, c.billing_city, c.billing_province, c.billing_country_code) as query,
            c.id as "customerId", '/app/clienti/' || c.id as href,
            c.latitude::text as lat, c.longitude::text as lng, c.location_source as source,
            case when c.is_active then 'active' else 'inactive' end as status
       from public.customers c
      where c.tenant_id = $1 and c.deleted_at is null and ($2::uuid is null or c.id = $2)`,
    `select 'customer_site', s.id, s.name, c.display_name,
            concat_ws(', ', s.address_line, concat_ws(' ', s.postal_code, s.city), s.province),
            concat_ws(', ', s.address_line, s.postal_code, s.city, s.province, s.country_code),
            c.id, '/app/clienti/' || c.id,
            s.latitude::text, s.longitude::text, s.location_source,
            case when s.is_active then 'active' else 'inactive' end
       from public.customer_sites s
       join public.customers c on c.tenant_id = s.tenant_id and c.id = s.customer_id and c.deleted_at is null
      where s.tenant_id = $1 and s.deleted_at is null and ($2::uuid is null or c.id = $2)`,
  ];
  if (canSeeSites) {
    // i cantieri su una sede del cliente compaiono già come sede: qui solo quelli con indirizzo proprio
    parts.push(
      `select 'project_site', ps.id, ps.name, coalesce(p.code || ' · ', '') || p.name,
              concat_ws(', ', ps.address_line, concat_ws(' ', ps.postal_code, ps.city), ps.province),
              concat_ws(', ', ps.address_line, ps.postal_code, ps.city, ps.province, 'IT'),
              p.customer_id, '/app/commesse/' || p.id,
              ps.latitude::text, ps.longitude::text, ps.location_source, ps.status
         from public.project_sites ps
         join public.projects p on p.tenant_id = ps.tenant_id and p.id = ps.project_id and p.deleted_at is null
        where ps.tenant_id = $1 and ps.deleted_at is null and ps.customer_site_id is null
          and p.status not in ('cancelled') and ($2::uuid is null or p.customer_id = $2)`,
    );
  }
  const { rows } = await tx.query<Row>(
    `select * from (${parts.join("\nunion all\n")}) x order by x.name limit $3`,
    params,
  );
  const points: MapPoint[] = rows.map((r) => ({
    ...r,
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
    canEdit: r.kind === "project_site" ? canWriteSites : canWriteCustomers,
  }));
  return {
    points,
    missing: points.filter((p) => p.lat === null).length,
    canSeeSites,
  };
}

const TABLES: Record<MapKind, { table: string; permission: string }> = {
  customer: { table: "public.customers", permission: "customers.write" },
  customer_site: { table: "public.customer_sites", permission: "customers.write" },
  project_site: { table: "public.project_sites", permission: "projects.write" },
};

export const mapLocationInput = z
  .object({
    kind: z.enum(MAP_KINDS),
    id: z.uuid("Elemento non valido"),
    // null = togli la posizione
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    source: z.enum(["geocoded", "manual"]),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), { message: "Coordinate incomplete" });
export type MapLocationInput = z.input<typeof mapLocationInput>;

/** Salva (o toglie) la posizione. Restituisce false se la riga non esiste o non è visibile. */
export async function setMapLocation(
  tx: UserTx,
  access: TenantAccess,
  raw: MapLocationInput,
): Promise<boolean> {
  const v = parseInput(mapLocationInput, raw);
  const { table, permission } = TABLES[v.kind];
  requirePermission(access, permission);
  const round = (n: number | null) => (n === null ? null : Math.round(n * 1e6) / 1e6);
  try {
    const { rowCount } = await tx.query(
      `update ${table}
          set latitude = $3, longitude = $4,
              location_source = case when $3::numeric is null then null else $5 end,
              located_at = case when $3::numeric is null then null else now() end
        where tenant_id = $1 and id = $2 and deleted_at is null`,
      [access.tenantId, v.id, round(v.lat), round(v.lng), v.source],
    );
    return (rowCount ?? 0) > 0;
  } catch (error) {
    const code = pgCode(error);
    if (code === "23514")
      throw new ValidationError({
        form:
          v.kind === "project_site"
            ? "Il cantiere è su una sede del cliente: sposta la sede."
            : "Posizione non valida.",
      });
    if (code === "42501") throw new AuthError("FORBIDDEN", "permesso mancante", { cause: error });
    throw error;
  }
}

/** Testo dell'indirizzo da cercare per un punto (null se manca l'indirizzo). */
export async function getMapAddress(
  tx: UserTx,
  access: TenantAccess,
  kind: MapKind,
  id: string,
): Promise<string | null> {
  requirePermission(access, TABLES[kind].permission);
  if (!z.uuid().safeParse(id).success) return null;
  const sql: Record<MapKind, string> = {
    customer: `select billing_address_line as line, billing_postal_code as cap, billing_city as city,
                      billing_province as prov, billing_country_code as country
                 from public.customers where tenant_id = $1 and id = $2 and deleted_at is null`,
    customer_site: `select address_line as line, postal_code as cap, city, province as prov, country_code as country
                      from public.customer_sites where tenant_id = $1 and id = $2 and deleted_at is null`,
    project_site: `select address_line as line, postal_code as cap, city, province as prov, 'IT' as country
                     from public.project_sites
                    where tenant_id = $1 and id = $2 and deleted_at is null and customer_site_id is null`,
  };
  const { rows } = await tx.query<{
    line: string | null;
    cap: string | null;
    city: string | null;
    prov: string | null;
    country: string | null;
  }>(sql[kind], [access.tenantId, id]);
  const r = rows[0];
  if (!r || !r.city) return null;
  return [r.line, r.cap, r.city, r.prov, r.country].filter(Boolean).join(", ");
}
