-- ClearWire Field Reporter — "My submissions" RPCs for the profile page
--
-- Returns rows the caller personally submitted (reporter_id = auth.uid()).
-- Shape mirrors nearby_reports / nearby_outages so the client can share
-- list-rendering components.

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
  reporter_display_name text
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
    p.display_name as reporter_display_name
  from public.reports r
  left join public.pro_profiles p on p.id = r.reporter_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit 200;
$$;

revoke all on function public.my_damage_reports() from public;
grant execute on function public.my_damage_reports() to authenticated;

create or replace function public.my_outage_reports()
returns table (
  id uuid,
  created_at timestamptz,
  resolved_at timestamptz,
  service_type text,
  provider_company text,
  description text,
  latitude double precision,
  longitude double precision,
  status text,
  external_ticket text,
  reporter_display_name text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    o.id,
    o.created_at,
    o.resolved_at,
    o.service_type,
    o.provider_company,
    o.description,
    ST_Y(o.service_location::geometry) as latitude,
    ST_X(o.service_location::geometry) as longitude,
    o.status,
    o.external_ticket,
    p.display_name as reporter_display_name
  from public.outage_reports o
  left join public.pro_profiles p on p.id = o.reporter_id
  where o.reporter_id = auth.uid()
  order by o.created_at desc
  limit 200;
$$;

revoke all on function public.my_outage_reports() from public;
grant execute on function public.my_outage_reports() to authenticated;
