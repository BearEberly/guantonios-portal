-- Apply this migration if you already ran previous schema versions.

alter table public.requests
  add column if not exists reviewed_by uuid references public.profiles(id);

alter table public.requests
  add column if not exists reviewed_at timestamptz;

drop policy if exists "employees create requests" on public.requests;
create policy "employees create requests" on public.requests
for insert to authenticated
with check (employee_id = auth.uid() and status = 'PENDING');

drop policy if exists "employees edit pending requests" on public.requests;
create policy "employees edit pending requests" on public.requests
for update to authenticated
using (employee_id = auth.uid() and status = 'PENDING')
with check (employee_id = auth.uid() and status = 'PENDING');

drop policy if exists "manager add announcements" on public.announcements;
create policy "manager add announcements" on public.announcements
for insert to authenticated
with check (public.is_manager_or_admin() and published_by = auth.uid());
