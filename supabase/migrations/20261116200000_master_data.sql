-- =============================================================================
-- CantiereOS — Migrazione 0002: anagrafiche
-- customers, suppliers, contacts, customer_sites
-- Ogni tabella segue il modello aziendale: tenant_id NOT NULL, unique
-- (tenant_id, id), FK composte, RLS per permesso, trigger standard, audit.
-- =============================================================================

create type public.party_type as enum ('company', 'individual', 'public_entity');

-- -----------------------------------------------------------------------------
-- Clienti
-- -----------------------------------------------------------------------------
create table public.customers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete restrict,
  code                  text check (code is null or code ~ '^[A-Za-z0-9._/-]{1,30}$'),
  party_type            public.party_type not null default 'company',
  display_name          text not null check (char_length(display_name) between 1 and 300),
  legal_name            text check (legal_name is null or char_length(legal_name) <= 300),
  first_name            text check (first_name is null or char_length(first_name) <= 100),
  last_name             text check (last_name is null or char_length(last_name) <= 100),
  vat_number            text check (vat_number is null or vat_number ~ '^[A-Z0-9]{5,20}$'),
  tax_code              text check (tax_code is null or tax_code ~ '^[A-Z0-9]{11,16}$'),
  sdi_code              text check (sdi_code is null or sdi_code ~ '^[A-Z0-9]{6,7}$'),
  pec_email             text check (pec_email is null or pec_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                 text check (phone is null or char_length(phone) <= 40),
  billing_address_line  text check (billing_address_line is null or char_length(billing_address_line) <= 300),
  billing_postal_code   text check (billing_postal_code is null or char_length(billing_postal_code) <= 12),
  billing_city          text check (billing_city is null or char_length(billing_city) <= 120),
  billing_province      text check (billing_province is null or billing_province ~ '^[A-Z]{2}$'),
  billing_country_code  text not null default 'IT' check (billing_country_code ~ '^[A-Z]{2}$'),
  payment_terms_days    smallint check (payment_terms_days is null or payment_terms_days between 0 and 365),
  notes                 text check (notes is null or char_length(notes) <= 10000),
  is_active             boolean not null default true,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint customers_it_postal_code_chk check (
    billing_country_code <> 'IT' or billing_postal_code is null or billing_postal_code ~ '^[0-9]{5}$'
  ),
  constraint customers_tenant_id_id_key unique (tenant_id, id)
);
create unique index customers_tenant_code_key
  on public.customers (tenant_id, code) where code is not null and deleted_at is null;
create unique index customers_tenant_vat_key
  on public.customers (tenant_id, vat_number) where vat_number is not null and deleted_at is null;
create index customers_tenant_tax_code_idx
  on public.customers (tenant_id, tax_code) where tax_code is not null;
create index customers_tenant_name_idx
  on public.customers (tenant_id, lower(display_name)) where deleted_at is null;
create index customers_name_trgm_idx
  on public.customers using gin (lower(display_name) extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Fornitori
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete restrict,
  code                  text check (code is null or code ~ '^[A-Za-z0-9._/-]{1,30}$'),
  party_type            public.party_type not null default 'company',
  display_name          text not null check (char_length(display_name) between 1 and 300),
  legal_name            text check (legal_name is null or char_length(legal_name) <= 300),
  category              text check (category is null or char_length(category) <= 100),
  vat_number            text check (vat_number is null or vat_number ~ '^[A-Z0-9]{5,20}$'),
  tax_code              text check (tax_code is null or tax_code ~ '^[A-Z0-9]{11,16}$'),
  sdi_code              text check (sdi_code is null or sdi_code ~ '^[A-Z0-9]{6,7}$'),
  pec_email             text check (pec_email is null or pec_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                 text check (phone is null or char_length(phone) <= 40),
  iban                  text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  address_line          text check (address_line is null or char_length(address_line) <= 300),
  postal_code           text check (postal_code is null or char_length(postal_code) <= 12),
  city                  text check (city is null or char_length(city) <= 120),
  province              text check (province is null or province ~ '^[A-Z]{2}$'),
  country_code          text not null default 'IT' check (country_code ~ '^[A-Z]{2}$'),
  payment_terms_days    smallint check (payment_terms_days is null or payment_terms_days between 0 and 365),
  notes                 text check (notes is null or char_length(notes) <= 10000),
  is_active             boolean not null default true,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint suppliers_it_postal_code_chk check (
    country_code <> 'IT' or postal_code is null or postal_code ~ '^[0-9]{5}$'
  ),
  constraint suppliers_tenant_id_id_key unique (tenant_id, id)
);
create unique index suppliers_tenant_code_key
  on public.suppliers (tenant_id, code) where code is not null and deleted_at is null;
create unique index suppliers_tenant_vat_key
  on public.suppliers (tenant_id, vat_number) where vat_number is not null and deleted_at is null;
create index suppliers_tenant_name_idx
  on public.suppliers (tenant_id, lower(display_name)) where deleted_at is null;
create index suppliers_name_trgm_idx
  on public.suppliers using gin (lower(display_name) extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Contatti (referenti) di un cliente OPPURE di un fornitore
-- -----------------------------------------------------------------------------
create table public.contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete restrict,
  customer_id  uuid,
  supplier_id  uuid,
  first_name   text check (first_name is null or char_length(first_name) <= 100),
  last_name    text check (last_name is null or char_length(last_name) <= 100),
  role_title   text check (role_title is null or char_length(role_title) <= 100),
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text check (phone is null or char_length(phone) <= 40),
  mobile       text check (mobile is null or char_length(mobile) <= 40),
  is_primary   boolean not null default false,
  notes        text check (notes is null or char_length(notes) <= 2000),
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint contacts_owner_chk check (num_nonnulls(customer_id, supplier_id) = 1),
  constraint contacts_name_chk check (coalesce(first_name, last_name) is not null),
  constraint contacts_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint contacts_supplier_fk foreign key (tenant_id, supplier_id)
    references public.suppliers (tenant_id, id) on delete cascade,
  constraint contacts_tenant_id_id_key unique (tenant_id, id)
);
create index contacts_customer_idx on public.contacts (tenant_id, customer_id) where customer_id is not null;
create index contacts_supplier_idx on public.contacts (tenant_id, supplier_id) where supplier_id is not null;
create unique index contacts_one_primary_per_customer
  on public.contacts (customer_id) where is_primary and customer_id is not null and deleted_at is null;
create unique index contacts_one_primary_per_supplier
  on public.contacts (supplier_id) where is_primary and supplier_id is not null and deleted_at is null;

-- -----------------------------------------------------------------------------
-- Sedi d'intervento dei clienti
-- -----------------------------------------------------------------------------
create table public.customer_sites (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  customer_id   uuid not null,
  name          text not null check (char_length(name) between 1 and 200),
  address_line  text not null check (char_length(address_line) between 1 and 300),
  postal_code   text check (postal_code is null or char_length(postal_code) <= 12),
  city          text not null check (char_length(city) between 1 and 120),
  province      text check (province is null or province ~ '^[A-Z]{2}$'),
  country_code  text not null default 'IT' check (country_code ~ '^[A-Z]{2}$'),
  latitude      numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude     numeric(9,6) check (longitude is null or longitude between -180 and 180),
  access_notes  text check (access_notes is null or char_length(access_notes) <= 2000),
  is_active     boolean not null default true,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint customer_sites_coords_chk check ((latitude is null) = (longitude is null)),
  constraint customer_sites_it_postal_code_chk check (
    country_code <> 'IT' or postal_code is null or postal_code ~ '^[0-9]{5}$'
  ),
  -- restrict: una sede non sparisce con il cliente (in futuro avrà interventi)
  constraint customer_sites_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint customer_sites_tenant_id_id_key unique (tenant_id, id)
);
create index customer_sites_customer_idx
  on public.customer_sites (tenant_id, customer_id) where deleted_at is null;
create index customer_sites_city_idx
  on public.customer_sites (tenant_id, lower(city)) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('customers.read',   'Vedere clienti, contatti e sedi'),
  ('customers.write',  'Creare e modificare clienti, contatti e sedi'),
  ('customers.delete', 'Eliminare definitivamente clienti e sedi'),
  ('suppliers.read',   'Vedere fornitori e relativi contatti'),
  ('suppliers.write',  'Creare e modificare fornitori e relativi contatti'),
  ('suppliers.delete', 'Eliminare definitivamente fornitori');

select app.grant_system_permissions('owner',      array['customers.read','customers.write','customers.delete','suppliers.read','suppliers.write','suppliers.delete']);
select app.grant_system_permissions('admin',      array['customers.read','customers.write','customers.delete','suppliers.read','suppliers.write','suppliers.delete']);
select app.grant_system_permissions('manager',    array['customers.read','customers.write','suppliers.read','suppliers.write']);
select app.grant_system_permissions('office',     array['customers.read','customers.write','suppliers.read','suppliers.write']);
select app.grant_system_permissions('technician', array['customers.read']);
select app.grant_system_permissions('viewer',     array['customers.read','suppliers.read']);

-- -----------------------------------------------------------------------------
-- Trigger, privilegi, RLS
-- -----------------------------------------------------------------------------
select app.attach_tenant_table_triggers('public.customers');
select app.attach_tenant_table_triggers('public.suppliers');
select app.attach_tenant_table_triggers('public.contacts');
select app.attach_tenant_table_triggers('public.customer_sites');

select app.grant_tenant_table('public.customers');
select app.grant_tenant_table('public.suppliers');
select app.grant_tenant_table('public.contacts');
select app.grant_tenant_table('public.customer_sites');

select app.create_tenant_policies('public.customers', 'customers.read', 'customers.write', 'customers.delete');
select app.create_tenant_policies('public.suppliers', 'suppliers.read', 'suppliers.write', 'suppliers.delete');
select app.create_tenant_policies('public.customer_sites', 'customers.read', 'customers.write', 'customers.delete');

-- contacts: i permessi dipendono dal "proprietario" del contatto
alter table public.contacts enable row level security;

create policy contacts_select on public.contacts
  for select to authenticated
  using (
    (customer_id is not null and tenant_id in (select app.tenant_ids_with_permission('customers.read')))
    or (supplier_id is not null and tenant_id in (select app.tenant_ids_with_permission('suppliers.read')))
  );
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (
    (customer_id is not null and tenant_id in (select app.tenant_ids_with_permission('customers.write')))
    or (supplier_id is not null and tenant_id in (select app.tenant_ids_with_permission('suppliers.write')))
  );
create policy contacts_update on public.contacts
  for update to authenticated
  using (
    (customer_id is not null and tenant_id in (select app.tenant_ids_with_permission('customers.write')))
    or (supplier_id is not null and tenant_id in (select app.tenant_ids_with_permission('suppliers.write')))
  )
  with check (
    (customer_id is not null and tenant_id in (select app.tenant_ids_with_permission('customers.write')))
    or (supplier_id is not null and tenant_id in (select app.tenant_ids_with_permission('suppliers.write')))
  );
create policy contacts_delete on public.contacts
  for delete to authenticated
  using (
    (customer_id is not null and tenant_id in (select app.tenant_ids_with_permission('customers.write')))
    or (supplier_id is not null and tenant_id in (select app.tenant_ids_with_permission('suppliers.write')))
  );

revoke execute on all functions in schema app from public;
