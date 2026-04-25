-- ClearWire Field Reporter — split services_affected from damage_type
--
-- Why: damage_type captures the physical observation (downed line, leaning
-- pole, etc). But a single physical issue can disrupt any combination of
-- services (internet, cable_tv, phone, electric, water). Until now the
-- map has been inferring services ad hoc from damage_type, which falls
-- apart as soon as we want to filter "show me everything affecting fiber".
-- Split the two: damage_type stays as the physical observation; a new
-- services_affected text[] is the multi-valued logical overlay. This
-- brings damage reports in line with outage_reports.service_type.
--
-- Column is nullable with no default: existing rows stay NULL (no silent
-- backfill), and "no services_affected set" is semantically distinct from
-- "all services affected".

-- ============================================================================
-- reports: add services_affected text[]
-- ============================================================================

alter table public.reports
  add column if not exists services_affected text[];

-- ============================================================================
-- insert_report: accept optional p_services_affected
-- ============================================================================

drop function if exists public.insert_report(
  text, text, text[], double precision, double precision, numeric, text, boolean, text
);

create or replace function public.insert_report(
  p_damage_type text,
  p_description text,
  p_photo_urls text[],
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters numeric,
  p_reporter_device_id text,
  p_is_test boolean,
  p_affected_company text default null,
  p_services_affected text[] default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if p_damage_type not in (
    'downed_line','leaning_pole','tree_on_wire',
    'transformer','vegetation','other'
  ) then
    raise exception 'invalid damage_type: %', p_damage_type;
  end if;

  if p_photo_urls is null or array_length(p_photo_urls, 1) is null then
    raise exception 'at least one photo_url required';
  end if;

  if array_length(p_photo_urls, 1) > 5 then
    raise exception 'at most 5 photos per report';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'latitude and longitude required';
  end if;

  -- Validate services_affected entries when provided.
  if p_services_affected is not null and exists (
    select 1
    from unnest(p_services_affected) as s
    where s not in ('internet','cable_tv','phone','electric','water','other')
  ) then
    raise exception 'invalid services_affected value in array';
  end if;

  insert into public.reports (
    reporter_id,
    reporter_device_id,
    damage_type,
    description,
    photo_urls,
    location,
    accuracy_meters,
    is_test,
    affected_company,
    services_affected
  ) values (
    auth.uid(),
    p_reporter_device_id,
    p_damage_type,
    p_description,
    p_photo_urls,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_accuracy_meters,
    coalesce(p_is_test, false),
    nullif(trim(p_affected_company), ''),
    p_services_affected
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_report(
  text, text, text[], double precision, double precision, numeric, text, boolean, text, text[]
) from public;

grant execute on function public.insert_report(
  text, text, text[], double precision, double precision, numeric, text, boolean, text, text[]
) to anon, authenticated;

-- ============================================================================
-- nearby_reports: return services_affected in the row shape
-- ============================================================================

drop function if exists public.nearby_reports(
  double precision, double precision, numeric, int
);

create or replace function public.nearby_reports(
  lat double precision,
  lng double precision,
  radius_miles numeric default 5,
  since_hours int default 72
)
returns table (
  id uuid,
  created_at timestamptz,
  damage_type text,
  description text,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  accuracy_meters numeric,
  status text,
  verified_by_pro boolean,
  affected_company text,
  reporter_display_name text,
  services_affected text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    r.id,
    r.created_at,
    r.damage_type,
    r.description,
    r.photo_urls,
    ST_Y(r.location::geometry) as latitude,
    ST_X(r.location::geometry) as longitude,
    r.accuracy_meters,
    r.status,
    r.verified_by_pro,
    r.affected_company,
    p.display_name as reporter_display_name,
    r.services_affected
  from public.reports r
  left join public.pro_profiles p on p.id = r.reporter_id
  where r.is_test = false
    and r.created_at > now() - make_interval(hours => since_hours)
    and ST_DWithin(
      r.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_miles * 1609.34
    )
  order by r.created_at desc
  limit 200;
$$;

revoke all on function public.nearby_reports(double precision, double precision, numeric, int) from public;
grant execute on function public.nearby_reports(double precision, double precision, numeric, int) to anon, authenticated;

-- ============================================================================
-- my_damage_reports: return services_affected so edit/view screens see it
-- ============================================================================

drop function if exists public.my_damage_reports();

create or replace function public.my_damage_reports()
returns table (
  id uuid,
  created_at timestamptz,
  damage_type text,
  description text,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  accuracy_meters numeric,
  status text,
  verified_by_pro boolean,
  affected_company text,
  reporter_display_name text,
  services_affected text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    r.id,
    r.created_at,
    r.damage_type,
    r.description,
    r.photo_urls,
    ST_Y(r.location::geometry) as latitude,
    ST_X(r.location::geometry) as longitude,
    r.accuracy_meters,
    r.status,
    r.verified_by_pro,
    r.affected_company,
    p.display_name as reporter_display_name,
    r.services_affected
  from public.reports r
  left join public.pro_profiles p on p.id = r.reporter_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit 200;
$$;

revoke all on function public.my_damage_reports() from public;
grant execute on function public.my_damage_reports() to authenticated;
