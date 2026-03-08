create table if not exists public.integration_square_connections (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default true,
  merchant_id text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  location_id text,
  location_name text,
  last_sync_at timestamptz,
  last_sync_date date,
  last_sync_tip_amount numeric(12,2),
  connected_by uuid references public.profiles(id),
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_square_one_active_idx
on public.integration_square_connections ((active))
where active is true;

create index if not exists integration_square_updated_idx
on public.integration_square_connections (updated_at desc);

create table if not exists public.integration_oauth_states (
  state text primary key,
  provider text not null check (provider in ('square')),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  location_id text,
  location_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists integration_oauth_states_exp_idx
on public.integration_oauth_states (expires_at);

alter table public.integration_square_connections enable row level security;
alter table public.integration_oauth_states enable row level security;

drop policy if exists "admins view square integrations" on public.integration_square_connections;
create policy "admins view square integrations" on public.integration_square_connections
for select to authenticated
using (public.is_admin());

drop policy if exists "admins manage square integrations" on public.integration_square_connections;
create policy "admins manage square integrations" on public.integration_square_connections
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage oauth states" on public.integration_oauth_states;
create policy "admins manage oauth states" on public.integration_oauth_states
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
