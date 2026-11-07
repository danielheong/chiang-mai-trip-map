-- Chiang Mai Trip Map: cloud sync setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.
--
-- How it's protected: the table itself is closed to the public key. The map
-- talks to it only through the two functions below, and both need your secret
-- trip code (20 random characters). Without the code nobody can read or change
-- your pins, even though the public key sits in the website's code.

create table if not exists public.trip_places (
  trip       text    not null,
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,            -- milliseconds since 1970, set by the device
  primary key (trip, id)
);
alter table public.trip_places enable row level security;
revoke all on public.trip_places from anon, authenticated;

-- Read every pin for one trip.
create or replace function public.trip_get(p_trip text)
returns table(id text, data jsonb, deleted boolean, updated_at bigint)
language sql security definer set search_path = public as $$
  select tp.id, tp.data, tp.deleted, tp.updated_at
  from public.trip_places tp
  where tp.trip = p_trip and length(p_trip) >= 16;
$$;

-- Save changed pins. A row only replaces the stored one if it's newer.
create or replace function public.trip_put(p_trip text, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_trip is null or length(p_trip) < 16 then raise exception 'trip code too short'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad rows'; end if;
  insert into public.trip_places as tp (trip, id, data, deleted, updated_at)
  select p_trip, r->>'id', r->'data', coalesce((r->>'deleted')::boolean, false), (r->>'updated_at')::bigint
  from jsonb_array_elements(p_rows) r
  where r->>'id' is not null and length(r->>'id') <= 64 and octet_length(coalesce(r->>'data', '')) <= 20000
  on conflict (trip, id) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at
    where tp.updated_at <= excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.trip_get(text) from public;
revoke all on function public.trip_put(text, jsonb) from public;
grant execute on function public.trip_get(text) to anon, authenticated;
grant execute on function public.trip_put(text, jsonb) to anon, authenticated;
