-- =============================================================================
-- CantiereOS — Posizioni sulla mappa (ADR-016)
-- Coordinate per clienti (indirizzo di fatturazione), sedi dei clienti e cantieri
-- con indirizzo proprio. Nessuna nuova tabella: le colonne si aggiungono a tabelle
-- che hanno già RLS, trigger standard e audit; scrivere una posizione richiede gli
-- stessi permessi della scheda (customers.write / projects.write).
--
-- location_source: 'geocoded' = trovata dall'indirizzo con il servizio di
-- geocodifica (OpenStreetMap Nominatim), 'manual' = puntina messa a mano.
-- Se l'indirizzo cambia, la posizione si azzera: non resta una puntina sbagliata.
-- =============================================================================

-- --- Clienti -----------------------------------------------------------------
alter table public.customers
  add column latitude        numeric(9,6) check (latitude is null or latitude between -90 and 90),
  add column longitude       numeric(9,6) check (longitude is null or longitude between -180 and 180),
  add column location_source text check (location_source is null or location_source in ('geocoded', 'manual')),
  add column located_at      timestamptz,
  add constraint customers_location_chk check (
    (latitude is null) = (longitude is null)
    and (latitude is null) = (location_source is null));

-- --- Sedi dei clienti (latitude/longitude esistono già) ---------------------
alter table public.customer_sites
  add column location_source text check (location_source is null or location_source in ('geocoded', 'manual')),
  add column located_at      timestamptz;
-- Le coordinate già presenti (dati importati) contano come inserite a mano.
update public.customer_sites
   set location_source = 'manual', located_at = updated_at
 where latitude is not null and location_source is null;
alter table public.customer_sites
  add constraint customer_sites_location_source_chk check ((latitude is null) = (location_source is null));

-- --- Cantieri con indirizzo proprio -------------------------------------------
alter table public.project_sites
  add column latitude        numeric(9,6) check (latitude is null or latitude between -90 and 90),
  add column longitude       numeric(9,6) check (longitude is null or longitude between -180 and 180),
  add column location_source text check (location_source is null or location_source in ('geocoded', 'manual')),
  add column located_at      timestamptz,
  add constraint project_sites_location_chk check (
    (latitude is null) = (longitude is null)
    and (latitude is null) = (location_source is null)),
  -- un cantiere su una sede del cliente usa la posizione della sede
  add constraint project_sites_location_own_address_chk check (
    latitude is null or customer_site_id is null);

-- --- Azzeramento quando cambia l'indirizzo ----------------------------------
create or replace function app.reset_location_on_address_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_addr text;
  new_addr text;
begin
  if tg_table_name = 'customers' then
    old_addr := concat_ws('|', old.billing_address_line, old.billing_postal_code, old.billing_city,
                          old.billing_province, old.billing_country_code);
    new_addr := concat_ws('|', new.billing_address_line, new.billing_postal_code, new.billing_city,
                          new.billing_province, new.billing_country_code);
  elsif tg_table_name = 'customer_sites' then
    old_addr := concat_ws('|', old.address_line, old.postal_code, old.city, old.province, old.country_code);
    new_addr := concat_ws('|', new.address_line, new.postal_code, new.city, new.province, new.country_code);
  else
    old_addr := concat_ws('|', old.address_line, old.postal_code, old.city, old.province, old.customer_site_id);
    new_addr := concat_ws('|', new.address_line, new.postal_code, new.city, new.province, new.customer_site_id);
  end if;
  -- se nello stesso aggiornamento arriva una nuova posizione, vale quella
  if old_addr is distinct from new_addr
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    new.latitude := null;
    new.longitude := null;
    new.location_source := null;
    new.located_at := null;
  end if;
  return new;
end;
$$;

create trigger customers_reset_location
  before update on public.customers
  for each row execute function app.reset_location_on_address_change();
create trigger customer_sites_reset_location
  before update on public.customer_sites
  for each row execute function app.reset_location_on_address_change();
create trigger project_sites_reset_location
  before update on public.project_sites
  for each row execute function app.reset_location_on_address_change();

-- Indici parziali per caricare in fretta i punti della mappa.
create index customers_located_idx on public.customers (tenant_id)
  where latitude is not null and deleted_at is null;
create index customer_sites_located_idx on public.customer_sites (tenant_id)
  where latitude is not null and deleted_at is null;
create index project_sites_located_idx on public.project_sites (tenant_id)
  where latitude is not null and deleted_at is null;

-- --- Privilegi sulle nuove colonne (le policy RLS esistenti restano valide) ----
grant insert (latitude, longitude, location_source, located_at),
      update (latitude, longitude, location_source, located_at)
   on public.customers, public.project_sites to authenticated;
grant insert (location_source, located_at), update (location_source, located_at)
   on public.customer_sites to authenticated;

revoke execute on all functions in schema app from public;
