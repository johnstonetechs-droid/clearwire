-- ClearWire Field Reporter — insert_report RPC
--
-- Why SECURITY DEFINER:
-- Anonymous users submit reports via the app using the anon key. Rather than
-- punch a permissive "with check (true)" hole in the reports table's RLS, the
-- RPC is the single gatekeeper for report creation. It runs as the function
-- owner (postgres), bypassing table RLS. All validation (damage_type check,
-- geometry construction, test flag, device ID) lives here.

create or replace function public.insert_report(
  p_damage_type text,
  p_description text,
  p_photo_url text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters numeric,
  p_reporter_device_id text,
  p_is_test boolean
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

  if p_photo_url is null or length(p_photo_url) = 0 then
    raise exception 'photo_url required';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'latitude and longitude required';
  end if;

  insert into public.reports (
    reporter_device_id,
    damage_type,
    description,
    photo_url,
    location,
    accuracy_meters,
    is_test
  ) values (
    p_reporter_device_id,
    p_damage_type,
    p_description,
    p_photo_url,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_accuracy_meters,
    coalesce(p_is_test, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Lock down who can call it. anon + authenticated only — not public.
revoke all on function public.insert_report(
  text, text, text, double precision, double precision, numeric, text, boolean
) from public;

grant execute on function public.insert_report(
  text, text, text, double precision, double precision, numeric, text, boolean
) to anon, authenticated;
