-- ClearWire Field Reporter — initial schema
-- Run this in Supabase SQL editor for project gumgyvmtquiupuifokhx
-- (or via `supabase db push` once the CLI is wired up)

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists postgis;

-- ============================================================================
-- Tables
-- ============================================================================

-- Reports: the core submission table. Can be anonymous (reporter_id null).
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_device_id text,
  damage_type text not null check (damage_type in (
    'downed_line','leaning_pole','tree_on_wire',
    'transformer','vegetation','other'
  )),
  description text,
  photo_url text not null,
  location geography(point, 4326) not null,
  accuracy_meters numeric,
  status text not null default 'reported' check (status in (
    'reported','acknowledged','dispatched','resolved','invalid'
  )),
  is_test boolean not null default false,
  verified_by_pro boolean not null default false
);

create index if not exists reports_location_idx
  on public.reports using gist(location);
create index if not exists reports_created_at_idx
  on public.reports(created_at desc);
create index if not exists reports_status_idx
  on public.reports(status) where status = 'reported';

-- Pro user profiles (extends auth.users)
create table if not exists public.pro_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text,
  company text,
  role text check (role in (
    'contractor','building_manager','clearwire_crew','municipality'
  )),
  expo_push_token text,
  alert_radius_miles numeric not null default 5,
  last_known_location geography(point, 4326),
  last_location_update timestamptz
);

create index if not exists pro_profiles_location_idx
  on public.pro_profiles using gist(last_known_location);

-- ============================================================================
-- RLS Policies
-- ============================================================================
alter table public.reports enable row level security;
alter table public.pro_profiles enable row level security;

-- Reports: anyone can read non-test reports; pros can also see test reports.
drop policy if exists "reports_read" on public.reports;
create policy "reports_read" on public.reports for select
  using (
    is_test = false
    or auth.uid() is not null
  );

-- Reports: anyone (including anon) can insert.
-- Anon abuse is mitigated by rate-limiting at the edge and the device_id column.
drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports for insert
  with check (true);

-- Reports: only pros can update status. Anon/authenticated non-pros cannot.
drop policy if exists "reports_update_pro" on public.reports;
create policy "reports_update_pro" on public.reports for update
  using (
    exists (select 1 from public.pro_profiles where id = auth.uid())
  );

-- Pro profiles: users can read their own. Extend later for crew leaderboards.
drop policy if exists "pro_read_own" on public.pro_profiles;
create policy "pro_read_own" on public.pro_profiles for select
  using (auth.uid() = id);

drop policy if exists "pro_insert_own" on public.pro_profiles;
create policy "pro_insert_own" on public.pro_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "pro_update_own" on public.pro_profiles;
create policy "pro_update_own" on public.pro_profiles for update
  using (auth.uid() = id);

-- ============================================================================
-- Storage bucket for photos
-- ============================================================================
-- Run the following in the Supabase dashboard Storage UI, OR uncomment
-- if your role has insert permission on storage.buckets:
--
-- insert into storage.buckets (id, name, public)
--   values ('report-photos', 'report-photos', true)
--   on conflict (id) do nothing;

-- Storage RLS: anyone can upload to report-photos
drop policy if exists "report_photos_insert" on storage.objects;
create policy "report_photos_insert" on storage.objects for insert
  with check (bucket_id = 'report-photos');

-- Storage RLS: anyone can read (bucket is public anyway, but be explicit)
drop policy if exists "report_photos_read" on storage.objects;
create policy "report_photos_read" on storage.objects for select
  using (bucket_id = 'report-photos');

-- ============================================================================
-- Helper RPC: nearby_reports
-- Used by the map view and by proximity alert logic.
-- ============================================================================
create or replace function public.nearby_reports(
  lat double precision,
  lng double precision,
  radius_miles numeric default 5,
  since_hours int default 72
)
returns setof public.reports
language sql
stable
as $$
  select *
  from public.reports
  where is_test = false
    and created_at > now() - make_interval(hours => since_hours)
    and ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_miles * 1609.34
    )
  order by created_at desc
  limit 200;
$$;
