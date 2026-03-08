-- SOP upload enhancements and policy tightening.

insert into storage.buckets (id, name, public)
values ('staff-sops', 'staff-sops', false)
on conflict (id) do nothing;

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

alter table public.sops
  drop constraint if exists sops_file_reference_required;

alter table public.sops
  add constraint sops_file_reference_required
  check (
    coalesce(nullif(file_url, ''), nullif(storage_path, '')) is not null
  );

drop policy if exists "managers add sops" on public.sops;
create policy "managers add sops" on public.sops
for insert to authenticated
with check (public.is_manager_or_admin() and uploaded_by = auth.uid());
