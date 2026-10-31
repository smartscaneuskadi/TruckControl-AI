-- Optional recurring billing. No provider, payment, registration or plan is enabled.
-- Keep the one-month payment API intact for backwards compatibility.
create table private.tc_subscription_orders (
  user_id uuid primary key references private.tc_customers(user_id),
  request_id uuid not null unique references private.tc_payment_requests(id),
  checkout_id text unique,
  terms_version text not null check(char_length(terms_version) between 3 and 80),
  terms_accepted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '23 hours',
  created_at timestamptz not null default now()
);
create table private.tc_billing_subscriptions (
  provider_id text primary key check(provider_id ~ '^sub_[A-Za-z0-9]{1,200}$'),
  user_id uuid not null references private.tc_customers(user_id),
  request_id uuid not null unique references private.tc_payment_requests(id),
  customer_id text not null check(customer_id ~ '^cus_[A-Za-z0-9]{1,200}$'),
  plan_id text not null references private.tc_plans(id),
  monthly_cents integer not null check(monthly_cents between 100 and 100000000),
  currency text not null default 'EUR' check(currency='EUR'),
  state text not null check(state in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  cancel_at_period_end boolean not null default false,
  period_end timestamptz not null,
  event_created bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tc_subscription_one_open on private.tc_billing_subscriptions(user_id)
  where state not in ('canceled','incomplete_expired');
create index tc_subscription_user_idx on private.tc_billing_subscriptions(user_id,created_at desc);
create index tc_subscription_plan_idx on private.tc_billing_subscriptions(plan_id);
create table private.tc_subscription_events (
  event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
  subscription_id text not null references private.tc_billing_subscriptions(provider_id),
  event_type text not null,
  created_at timestamptz not null default now()
);
create index tc_subscription_event_subscription_idx on private.tc_subscription_events(subscription_id);
create table private.tc_subscription_invoices (
  invoice_id text primary key check(invoice_id ~ '^in_[A-Za-z0-9]{1,200}$'),
  subscription_id text not null references private.tc_billing_subscriptions(provider_id),
  user_id uuid not null references private.tc_customers(user_id),
  amount_cents integer not null check(amount_cents between 100 and 100000000),
  currency text not null check(currency='EUR'),
  period_start timestamptz not null,
  period_end timestamptz not null check(period_end>period_start),
  created_at timestamptz not null default now()
);
create index tc_subscription_invoice_user_idx on private.tc_subscription_invoices(user_id,created_at desc);
create index tc_subscription_invoice_subscription_idx on private.tc_subscription_invoices(subscription_id);
alter table private.tc_subscription_orders enable row level security;
alter table private.tc_billing_subscriptions enable row level security;
alter table private.tc_subscription_events enable row level security;
alter table private.tc_subscription_invoices enable row level security;
revoke all on private.tc_subscription_orders,private.tc_billing_subscriptions,
  private.tc_subscription_events,private.tc_subscription_invoices from public,anon,authenticated;

-- Server-only, invoker: the Edge Function authenticates getUser() before supplying
-- user_id. Never callable by a browser, even with a genuine company JWT.
create function public.tc_recurring_billing(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  account uuid := nullif(p_data->>'user_id','')::uuid;
  c private.tc_customers; r private.tc_payment_requests; s private.tc_billing_subscriptions;
  reservation private.tc_subscription_orders; options private.tc_settings;
  subscription_id text := p_data->>'subscription_id';
  ending timestamptz; beginning timestamptz; stamp bigint;
begin
  select * into c from private.tc_customers where user_id=account for update;
  if not found then raise exception 'Cuenta no disponible'; end if;
  if p_action='status' then
    return jsonb_build_object('subscription',(
      select jsonb_build_object('state',b.state,'plan_id',b.plan_id,'monthly_cents',b.monthly_cents,
        'currency',b.currency,'period_end',b.period_end,'cancel_at_period_end',b.cancel_at_period_end)
      from private.tc_billing_subscriptions b where b.user_id=account
      order by (b.state not in ('canceled','incomplete_expired')) desc,b.created_at desc limit 1),
      'invoices',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (
        select invoice_id,amount_cents,currency,period_start,period_end,created_at
        from private.tc_subscription_invoices where user_id=account order by created_at desc limit 24
      ) x));
  elsif p_action='manage' then
    if p_data->>'operation'='resume' then
      select * into options from private.tc_settings where id=true;
      if not options.payments_enabled or options.prices_are_examples or c.status='suspended'
        then raise exception 'Las renovaciones nuevas están desactivadas';end if;
    end if;
    select * into s from private.tc_billing_subscriptions where user_id=account
      and state not in ('canceled','incomplete_expired') order by created_at desc limit 1;
    if not found then raise exception 'No hay suscripción que gestionar';end if;
    return to_jsonb(s);
  elsif p_action='prepare' then
    if p_data->>'terms_accepted' is distinct from 'true' or coalesce(p_data->>'terms_version','') !~ '^[A-Za-z0-9._-]{3,80}$'
      then raise exception 'Es necesaria la aceptación de las condiciones mensuales';end if;
    select * into options from private.tc_settings where id=true;
    if not options.payments_enabled or options.prices_are_examples or c.status='suspended'
      then raise exception 'Cobros desactivados o cuenta suspendida';end if;
    if exists(select 1 from private.tc_billing_subscriptions where user_id=account and state not in ('canceled','incomplete_expired'))
      then raise exception 'Gestiona la suscripción existente antes de crear otra';end if;
    select * into r from private.tc_payment_requests where id=(p_data->>'request_id')::uuid and user_id=account for update;
    if not found or r.status not in ('requested','checkout') or r.created_at<now()-interval '1 day'
      or not exists(select 1 from private.tc_plans where id=r.plan_id and revision=r.plan_revision and published)
      then raise exception 'Vuelve a solicitar el plan para obtener un precio vigente';end if;
    select * into reservation from private.tc_subscription_orders where user_id=account for update;
    if found and exists(select 1 from private.tc_billing_subscriptions where user_id=account
      and request_id=reservation.request_id and state in ('canceled','incomplete_expired')) then
      delete from private.tc_subscription_orders where user_id=account;
    elsif found and reservation.expires_at<=now() then
      -- A completed Checkout can have a delayed webhook. Never release a lease
      -- using only the local clock; wait for provider-confirmed expiration.
      return jsonb_build_object('available',false);
    elsif found and reservation.request_id<>r.id then
      raise exception 'Ya existe un proceso de suscripción pendiente';
    elsif found and reservation.terms_version<>p_data->>'terms_version' then
      raise exception 'El checkout pendiente conserva sus condiciones originales';
    end if;
    insert into private.tc_subscription_orders(user_id,request_id,terms_version) values(account,r.id,p_data->>'terms_version') on conflict(user_id) do nothing;
    select * into reservation from private.tc_subscription_orders where user_id=account;
    return to_jsonb(r)||jsonb_build_object('available',true,'expires_at',reservation.expires_at,
      'trial_end',greatest(c.trial_ends_at,coalesce(c.paid_until,c.trial_ends_at)),
      'customer_id',(select customer_id from private.tc_billing_subscriptions where user_id=account order by created_at desc limit 1));
  elsif p_action='saved' then
    if coalesce(p_data->>'checkout_id','') !~ '^cs_[A-Za-z0-9_]{1,200}$' then raise exception 'Checkout no válido';end if;
    update private.tc_subscription_orders set checkout_id=p_data->>'checkout_id'
      where user_id=account and request_id=(p_data->>'request_id')::uuid and expires_at>now()
      and (checkout_id is null or checkout_id=p_data->>'checkout_id');
    if not found then raise exception 'Reserva no disponible';end if;
    update private.tc_payment_requests set status='checkout',checkout_id=p_data->>'checkout_id'
      where id=(p_data->>'request_id')::uuid and user_id=account and status in ('requested','checkout');
    return '{}'::jsonb;
  elsif p_action='checkout_expired' then
    if coalesce(p_data->>'checkout_id','') !~ '^cs_[A-Za-z0-9_]{1,200}$' then raise exception 'Checkout no válido';end if;
    select * into reservation from private.tc_subscription_orders where user_id=account
      and request_id=(p_data->>'request_id')::uuid for update;
    if not found then return jsonb_build_object('received',true);end if;
    if (reservation.checkout_id is not null and reservation.checkout_id<>p_data->>'checkout_id')
      or exists(select 1 from private.tc_billing_subscriptions where request_id=reservation.request_id)
      then raise exception 'El checkout no puede liberarse como caducado';end if;
    update private.tc_payment_requests set status='cancelled' where id=reservation.request_id and status in ('requested','checkout');
    delete from private.tc_subscription_orders where user_id=account and request_id=reservation.request_id;
    return jsonb_build_object('received',true);
  elsif p_action='event' then
    if coalesce(p_data->>'event_id','') !~ '^evt_[A-Za-z0-9]{1,200}$'
      or coalesce(subscription_id,'') !~ '^sub_[A-Za-z0-9]{1,200}$'
      or coalesce(p_data->>'customer_id','') !~ '^cus_[A-Za-z0-9]{1,200}$'
      or p_data->>'state' not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
      or p_data->>'currency'<>'EUR' then raise exception 'Evento no válido';end if;
    if exists(select 1 from private.tc_subscription_events where event_id=p_data->>'event_id') then return jsonb_build_object('duplicate',true);end if;
    select * into r from private.tc_payment_requests where id=(p_data->>'request_id')::uuid and user_id=account for update;
    if not found or r.quoted_cents is distinct from (p_data->>'unit_amount')::integer then raise exception 'El precio no corresponde a la solicitud';end if;
    select * into s from private.tc_billing_subscriptions where provider_id=subscription_id for update;
    if found and (s.user_id<>account or s.request_id<>r.id or s.customer_id<>p_data->>'customer_id')
      then raise exception 'Suscripción de otra cuenta o solicitud';end if;
    if s.provider_id is null and not exists(select 1 from private.tc_subscription_orders where user_id=account and request_id=r.id)
      then raise exception 'No existe una reserva de suscripción';end if;
    stamp := (p_data->>'event_created')::bigint;
    if stamp<1 or stamp>extract(epoch from now())+300 then raise exception 'Fecha de evento no válida';end if;
    ending := to_timestamp((p_data->>'period_end')::bigint);
    if ending>now()+interval '62 days' or ending<now()-interval '2 years' then raise exception 'Periodo no válido';end if;
    insert into private.tc_billing_subscriptions(provider_id,user_id,request_id,customer_id,plan_id,monthly_cents,state,
        cancel_at_period_end,period_end,event_created)
      values(subscription_id,account,r.id,p_data->>'customer_id',r.plan_id,r.quoted_cents,p_data->>'state',
        coalesce((p_data->>'cancel_at_period_end')::boolean,false),ending,stamp)
      on conflict(provider_id) do update set state=excluded.state,cancel_at_period_end=excluded.cancel_at_period_end,
        period_end=excluded.period_end,event_created=excluded.event_created,updated_at=now()
      where private.tc_billing_subscriptions.event_created<=excluded.event_created;
    insert into private.tc_subscription_events(event_id,subscription_id,event_type)
      values(p_data->>'event_id',subscription_id,p_data->>'event_type') on conflict do nothing;
    if not found then return jsonb_build_object('duplicate',true);end if;
    if coalesce((p_data->>'invoice_paid')::boolean,false) then
      beginning := to_timestamp((p_data->>'invoice_period_start')::bigint);
      ending := to_timestamp((p_data->>'invoice_period_end')::bigint);
      if coalesce(p_data->>'invoice_id','') !~ '^in_[A-Za-z0-9]{1,200}$'
        or (p_data->>'invoice_amount')::integer is distinct from r.quoted_cents
        or ending<=beginning or ending>beginning+interval '32 days'
        or ending<beginning+interval '27 days' or ending>now()+interval '62 days'
        then raise exception 'Factura o periodo de renovación no válido';end if;
      if exists(select 1 from private.tc_subscription_invoices i where i.invoice_id=p_data->>'invoice_id'
        and (i.user_id<>account or i.subscription_id<>p_data->>'subscription_id')) then raise exception 'Factura de otra cuenta';end if;
      insert into private.tc_subscription_invoices(invoice_id,subscription_id,user_id,amount_cents,currency,period_start,period_end)
        values(p_data->>'invoice_id',subscription_id,account,r.quoted_cents,'EUR',beginning,ending) on conflict do nothing;
      if found then
        update private.tc_payment_requests set status='paid' where id=r.id;
        update private.tc_customers set paid_plan=r.plan_id,paid_until=greatest(coalesce(paid_until,ending),ending),
          stripe_subscription_id=subscription_id,status=case when status='suspended' then 'suspended' else 'active' end,
          updated_at=now() where user_id=account;
        insert into private.tc_admin_audit(actor_id,action,target_id,details)
          values(account,'subscription_invoice_paid',subscription_id,jsonb_build_object('invoice_id',p_data->>'invoice_id','amount_cents',r.quoted_cents,'period_end',ending));
      end if;
    end if;
    return jsonb_build_object('received',true);
  end if;
  raise exception 'Operación no válida';
end;
$$;
revoke all on function public.tc_recurring_billing(text,jsonb) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select,insert,update,delete on private.tc_subscription_orders,private.tc_billing_subscriptions,
      private.tc_subscription_events,private.tc_subscription_invoices to service_role;
    grant execute on function public.tc_recurring_billing(text,jsonb) to service_role;
  end if;
end $$;
