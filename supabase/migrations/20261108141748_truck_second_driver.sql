-- CLI-created candidate: supabase migration new truck_second_driver.
-- Additive nullable field: existing drivers, assignments, row versions, RLS,
-- plans and financial records are not rewritten. No applied migration changes.
alter table public.trucks add column co_driver_id uuid default null;
alter table public.trucks
  add constraint trucks_co_driver_organization_fk
  foreign key (organization_id, co_driver_id)
  references public.drivers(organization_id, id) on delete restrict;
alter table public.trucks
  add constraint trucks_distinct_driver_team
  check (co_driver_id is null or co_driver_id is distinct from driver_id);
create unique index trucks_co_driver_unique
  on public.trucks(organization_id, co_driver_id)
  where co_driver_id is not null;

-- Extend the existing allocation rule to both seats. Lock the same driver
-- rows used by check_truck_driver, in a deterministic order, before inspecting
-- other trucks. Under the application's READ COMMITTED transactions a waiting
-- writer then sees the committed assignment, including the opposite seat.
-- RLS remains in force: no new SECURITY DEFINER function or public RPC.
create function private.tc_check_truck_driver_team() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  team uuid[] := array_remove(array[new.driver_id,new.co_driver_id],null);
  selected_driver record;
  co_driver_found boolean := new.co_driver_id is null;
begin
  if new.co_driver_id is not null and new.co_driver_id = new.driver_id then
    raise exception 'El conductor principal y el segundo conductor deben ser distintos'
      using errcode='23514';
  end if;
  if cardinality(team)=0 then return new;end if;
  for selected_driver in
    select d.id,d.status from public.drivers d
    where d.organization_id=new.organization_id and d.id=any(team)
    order by d.id for update of d
  loop
    if selected_driver.id=new.co_driver_id then
      co_driver_found := true;
      if selected_driver.status<>'active' then
        raise exception 'Desasigna al conductor antes de ponerlo de permiso'
          using errcode='23514';
      end if;
    end if;
  end loop;
  -- The original check_truck_driver still owns principal validation and its
  -- existing error contract; this trigger adds the second seat without replacing it.
  if not co_driver_found then
    raise exception 'El conductor asignado debe pertenecer a esta empresa'
      using errcode='23503';
  end if;
  if exists (
    select 1 from public.trucks t
    where t.organization_id=new.organization_id and t.id<>new.id
      and ((new.co_driver_id is not null and
            (t.driver_id=new.co_driver_id or t.co_driver_id=new.co_driver_id))
           or (new.driver_id is not null and t.co_driver_id=new.driver_id))
  ) then
    raise exception 'El conductor ya está asignado a otro camión'
      using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function private.tc_check_truck_driver_team() from public,anon,authenticated;
-- Runs before check_truck_driver so all seat locks share the same order.
create trigger aa_tc_check_truck_driver_team
before insert or update of driver_id,co_driver_id,organization_id on public.trucks
for each row execute function private.tc_check_truck_driver_team();

create function private.tc_check_second_driver_leave() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status='leave' and exists (
    select 1 from public.trucks t
    where t.organization_id=new.organization_id and t.co_driver_id=new.id
  ) then
    raise exception 'Desasigna al segundo conductor antes de ponerlo de permiso'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.tc_check_second_driver_leave() from public,anon,authenticated;
create trigger check_second_driver_leave
before update of status on public.drivers
for each row execute function private.tc_check_second_driver_leave();

comment on column public.trucks.co_driver_id is
  'Optional second driver in the same organization. Omitted UPDATE fields preserve this assignment; explicit NULL unassigns.';
