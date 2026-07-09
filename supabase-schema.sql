create extension if not exists pgcrypto;

create table if not exists public.bp_readings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_at timestamptz not null,
  slot text not null check (slot in ('Morning', 'Evening', 'Night')),
  systolic int not null check (systolic between 60 and 260),
  diastolic int not null check (diastolic between 30 and 180),
  raw_readings jsonb not null default '[]'::jsonb,
  pulse int check (pulse is null or pulse between 30 and 220),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bp_readings
  add column if not exists raw_readings jsonb not null default '[]'::jsonb;

alter table public.bp_readings enable row level security;

create policy "Users can read their own BP readings"
  on public.bp_readings
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own BP readings"
  on public.bp_readings
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own BP readings"
  on public.bp_readings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own BP readings"
  on public.bp_readings
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bp_readings_set_updated_at on public.bp_readings;

create trigger bp_readings_set_updated_at
before update on public.bp_readings
for each row
execute function public.set_updated_at();

create index if not exists bp_readings_user_taken_at_idx
  on public.bp_readings (user_id, taken_at desc);
