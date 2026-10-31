-- Phase 1 schema foundation. Not applied to a remote project by the demo.
-- EUR only; amounts are integer cents, reported by accrual date.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index organizations_owner_idx on public.organizations(owner_id);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  email text not null default '',
  phone text not null default '' check (char_length(phone) <= 24),
  license text not null check (char_length(btrim(license)) between 1 and 30),
  license_expires_on date not null,
  status text not null default 'active' check (status in ('active', 'leave')),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plate text not null check (plate ~ '^[A-Za-z0-9 -]{3,16}$'),
  brand text not null check (char_length(btrim(brand)) between 1 and 50),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  year integer not null check (year between 1980 and 2100),
  odometer_km integer not null default 0 check (odometer_km between 0 and 10000000),
  status text not null default 'available' check (status in ('on_route', 'available', 'maintenance')),
  driver_id uuid,
  inspection_due_on date not null,
  route text not null default '' check (char_length(route) <= 120),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, driver_id) references public.drivers(organization_id, id) on delete restrict
);
create unique index trucks_plate_unique on public.trucks(organization_id, upper(regexp_replace(plate, '[ -]', '', 'g')));
create unique index trucks_driver_unique on public.trucks(organization_id, driver_id) where driver_id is not null;
create index trucks_org_status_idx on public.trucks(organization_id, status);

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  truck_id uuid not null,
  kind text not null check (kind in ('income', 'expense')),
  concept text not null check (char_length(btrim(concept)) between 2 and 160),
  date date not null,
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  category text not null check (category in ('transport', 'fuel', 'maintenance', 'payroll', 'tolls', 'insurance', 'other')),
  payment_status text not null default 'pending' check (payment_status in ('paid', 'pending')),
  distance_km integer not null default 0 check (distance_km between 0 and 1000000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, truck_id) references public.trucks(organization_id, id) on delete restrict,
  check (kind = 'income' or distance_km = 0),
  check ((kind = 'income' and category in ('transport', 'other')) or (kind = 'expense' and category <> 'transport'))
);
create index finance_entries_org_date_idx on public.finance_entries(organization_id, date desc);
create index finance_entries_org_truck_date_idx on public.finance_entries(organization_id, truck_id, date desc);

-- Invoker triggers keep assignment rules on the server as well as in the demo.
create schema if not exists private;
revoke all on schema private from public;
create function private.check_truck_driver() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare driver_status text;
begin
  if new.driver_id is not null then
    select status into driver_status from public.drivers
      where organization_id = new.organization_id and id = new.driver_id for update;
    if driver_status is distinct from 'active' then
      raise exception 'Driver must exist in this organization and be active';
    end if;
  end if;
  return new;
end;
$$;
create trigger check_truck_driver before insert or update of driver_id, organization_id
on public.trucks for each row execute function private.check_truck_driver();

create function private.check_driver_leave() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'leave' and exists (
    select 1 from public.trucks where organization_id = new.organization_id and driver_id = new.id
  ) then raise exception 'Unassign driver before marking leave'; end if;
  return new;
end;
$$;
create trigger check_driver_leave before update of status on public.drivers
for each row execute function private.check_driver_leave();
revoke all on function private.check_truck_driver() from public;
revoke all on function private.check_driver_leave() from public;

-- Owner-scoped authorization, never user-editable JWT metadata.
alter table public.organizations enable row level security;
alter table public.drivers enable row level security;
alter table public.trucks enable row level security;
alter table public.finance_entries enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (owner_id = (select auth.uid()));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy organizations_update on public.organizations for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy organizations_delete on public.organizations for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy drivers_owner on public.drivers for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())))
  with check (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));
create policy trucks_owner on public.trucks for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())))
  with check (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));
create policy entries_owner on public.finance_entries for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())))
  with check (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));

revoke all on public.organizations, public.drivers, public.trucks, public.finance_entries from public, anon, authenticated;
grant select, insert, update, delete on public.organizations, public.drivers, public.trucks, public.finance_entries to authenticated;
