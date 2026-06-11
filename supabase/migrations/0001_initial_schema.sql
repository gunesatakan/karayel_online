create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id text primary key,
  display_name text not null,
  max_hp integer not null default 100,
  speed numeric not null default 1,
  abilities jsonb not null default '[]'::jsonb
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

insert into public.characters (id, display_name, max_hp, speed, abilities)
values ('karayel', 'Karayel', 100, 1, '["dash"]'::jsonb)
on conflict (id) do nothing;
