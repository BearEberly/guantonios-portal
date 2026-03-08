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
