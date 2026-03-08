-- Shared cross-device state for staff/schedule/tips/menu modules.

create table if not exists public.portal_state (
  state_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.portal_state enable row level security;

drop policy if exists "employees view portal state" on public.portal_state;
create policy "employees view portal state" on public.portal_state
for select to authenticated
using (true);

drop policy if exists "managers update portal state" on public.portal_state;
create policy "managers update portal state" on public.portal_state
for insert to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "managers edit portal state" on public.portal_state;
create policy "managers edit portal state" on public.portal_state
for update to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());
