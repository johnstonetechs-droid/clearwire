-- ClearWire Field Reporter — match pros to an outage for proximity alerts
--
-- Mirror of pros_within_radius_of_report but for outage_reports. Called
-- from the notify-nearby-pros-outage Edge Function.

create or replace function public.pros_within_radius_of_outage(p_outage_id uuid)
returns table (
  id uuid,
  display_name text,
  expo_push_token text,
  distance_miles numeric
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with o as (
    select id, service_location, reporter_id
    from public.outage_reports
    where id = p_outage_id
  )
  select
    p.id,
    p.display_name,
    p.expo_push_token,
    (ST_Distance(p.last_known_location, (select service_location from o)) / 1609.34)::numeric(10, 2)
      as distance_miles
  from public.pro_profiles p
  where p.expo_push_token is not null
    and p.last_known_location is not null
    and ST_DWithin(
      p.last_known_location,
      (select service_location from o),
      p.alert_radius_miles * 1609.34
    )
    and p.id is distinct from (select reporter_id from o);
$$;

revoke all on function public.pros_within_radius_of_outage(uuid) from public;
grant execute on function public.pros_within_radius_of_outage(uuid) to service_role;
