-- Chiang Mai Trip Map: view-only share links.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run more than once.
-- A view code is a separate random code that can only READ one trip's pins.
-- Anyone with your trip code (the one in Sync) can still edit; the view code can't.

create table if not exists public.trip_views (
  view_code text primary key,
  trip      text not null unique
);
alter table public.trip_views enable row level security;
revoke all on public.trip_views from anon, authenticated;

-- Get (or create) the view-only code for a trip. Needs the real trip code.
create or replace function public.trip_view_code(p_trip text)
returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if p_trip is null or length(p_trip) < 16 then raise exception 'trip code too short'; end if;
  select view_code into c from public.trip_views where trip = p_trip;
  if c is null then
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
    insert into public.trip_views (view_code, trip) values (c, p_trip);
  end if;
  return c;
end $$;

-- Read a trip's current pins with a view-only code.
create or replace function public.trip_view_get(p_view text)
returns table(id text, data jsonb, updated_at bigint)
language sql security definer set search_path = public as $$
  select tp.id, tp.data, tp.updated_at
  from public.trip_places tp
  join public.trip_views v on v.trip = tp.trip
  where v.view_code = p_view and length(p_view) >= 16 and not tp.deleted;
$$;

revoke all on function public.trip_view_code(text) from public;
revoke all on function public.trip_view_get(text) from public;
grant execute on function public.trip_view_code(text) to anon, authenticated;
grant execute on function public.trip_view_get(text) to anon, authenticated;
