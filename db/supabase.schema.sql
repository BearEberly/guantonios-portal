-- Run as project owner in Supabase SQL editor.

create type public.app_role as enum ('employee', 'manager', 'admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'employee',
  station text,
  phone text,
  street_address text,
  city text,
  state text,
  zip_code text,
  address text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  published_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  station text,
  created_at timestamptz not null default now()
);

create table if not exists public.tip_statements (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  net_tips numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.training_assignments (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  message text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DENIED')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.requests
  add column if not exists reviewed_by uuid references public.profiles(id);

alter table public.requests
  add column if not exists reviewed_at timestamptz;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists street_address text;

alter table public.profiles
  add column if not exists city text;

alter table public.profiles
  add column if not exists state text;

alter table public.profiles
  add column if not exists zip_code text;

alter table public.profiles
  add column if not exists address text;

alter table public.profiles
  add column if not exists avatar_url text;

create table if not exists public.sops (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  file_url text,
  storage_path text,
  original_name text,
  mime_type text,
  file_size bigint,
  visibility text not null default 'all' check (visibility in ('all', 'manager', 'admin')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.sops
  add column if not exists storage_path text;

alter table public.sops
  add column if not exists original_name text;

alter table public.sops
  add column if not exists mime_type text;

alter table public.sops
  add column if not exists file_size bigint;

alter table public.sops
  alter column file_url drop not null;

create unique index if not exists sops_storage_path_unique
on public.sops (storage_path)
where storage_path is not null;

insert into storage.buckets (id, name, public)
values ('staff-sops', 'staff-sops', false)
on conflict (id) do nothing;

alter table public.sops
  drop constraint if exists sops_file_reference_required;

alter table public.sops
  add constraint sops_file_reference_required
  check (
    coalesce(nullif(file_url, ''), nullif(storage_path, '')) is not null
  );

create table if not exists public.checklist_submissions (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'SUBMITTED',
  submitted_at timestamptz not null default now()
);

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

create table if not exists public.portal_state (
  state_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create or replace function public.current_role()
returns public.app_role
language sql
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'employee'::public.app_role);
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_role() in ('manager', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_role() = 'admin';
$$;

alter table public.profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.shifts enable row level security;
alter table public.tip_statements enable row level security;
alter table public.training_assignments enable row level security;
alter table public.requests enable row level security;
alter table public.sops enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.integration_square_connections enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.portal_state enable row level security;

create policy "profiles self read" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_manager_or_admin());

create policy "profiles self update" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "admin manage profiles" on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees view announcements" on public.announcements
for select to authenticated
using (true);

create policy "manager add announcements" on public.announcements
for insert to authenticated
with check (public.is_manager_or_admin() and published_by = auth.uid());

create policy "employees own shifts" on public.shifts
for select to authenticated
using (employee_id = auth.uid() or public.is_manager_or_admin());

create policy "managers manage shifts" on public.shifts
for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "employees own tips" on public.tip_statements
for select to authenticated
using (employee_id = auth.uid() or public.is_manager_or_admin());

create policy "managers manage tips" on public.tip_statements
for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "employees own training" on public.training_assignments
for select to authenticated
using (employee_id = auth.uid() or public.is_manager_or_admin());

create policy "employees update own training" on public.training_assignments
for update to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

create policy "managers manage training" on public.training_assignments
for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "employees own requests" on public.requests
for select to authenticated
using (employee_id = auth.uid() or public.is_manager_or_admin());

create policy "employees create requests" on public.requests
for insert to authenticated
with check (employee_id = auth.uid() and status = 'PENDING');

create policy "employees edit pending requests" on public.requests
for update to authenticated
using (employee_id = auth.uid() and status = 'PENDING')
with check (employee_id = auth.uid() and status = 'PENDING');

create policy "managers manage requests" on public.requests
for all to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "employees view sops" on public.sops
for select to authenticated
using (
  visibility = 'all'
  or (visibility = 'manager' and public.is_manager_or_admin())
  or (visibility = 'admin' and public.is_admin())
);

create policy "managers add sops" on public.sops
for insert to authenticated
with check (public.is_manager_or_admin() and uploaded_by = auth.uid());

create policy "employees own checklists" on public.checklist_submissions
for select to authenticated
using (employee_id = auth.uid() or public.is_manager_or_admin());

create policy "employees create checklists" on public.checklist_submissions
for insert to authenticated
with check (employee_id = auth.uid());

create policy "admins view square integrations" on public.integration_square_connections
for select to authenticated
using (public.is_admin());

create policy "admins manage square integrations" on public.integration_square_connections
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins manage oauth states" on public.integration_oauth_states
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees view portal state" on public.portal_state
for select to authenticated
using (true);

create policy "managers update portal state" on public.portal_state
for insert to authenticated
with check (public.is_manager_or_admin());

create policy "managers edit portal state" on public.portal_state
for update to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());
