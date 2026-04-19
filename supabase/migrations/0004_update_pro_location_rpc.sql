-- ClearWire Field Reporter — update_pro_location RPC
--
-- Why: pro_profiles.last_known_location is a geography(point, 4326).
-- Same serialization problem as reports — PostgREST doesn't accept a
-- GeoJSON object when writing. This RPC takes plain doubles and builds
-- the geometry server-side, so the client never touches PostGIS types.
-- security definer lets us update the caller's own row safely — we
-- double-check auth.uid() inside the function.

create or replace function public.update_pro_location(
  p_latitude double precision,
  p_longitude double precision
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'latitude and longitude required';
  end if;

  update public.pro_profiles
  set
    last_known_location =
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    last_location_update = now()
  where id = v_uid;

  if not found then
    raise exception 'pro_profile row not found for current user — save the profile first';
  end if;
end;
$$;

revoke all on function public.update_pro_location(double precision, double precision) from public;
grant execute on function public.update_pro_location(double precision, double precision) to authenticated;
