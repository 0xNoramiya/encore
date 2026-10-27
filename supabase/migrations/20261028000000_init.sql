-- Encore schema. All access is server-side with the service role key; RLS is
-- enabled with no policies so the anon key can read nothing.

create extension if not exists pgcrypto;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces (id) on delete cascade,
  first_name text not null,
  birth_year int not null check (birth_year between 1900 and 2020),
  hometown text not null,
  country_code text,
  country_name text,
  -- Full country name for filter.release_country (cultural heritage, may differ from hometown)
  film_country text,
  locality_id text,
  lat double precision,
  lon double precision,
  languages text[] not null default '{}',
  is_persona_template boolean not null default false,
  persona_key text unique,
  source_profile_id uuid references profiles (id) on delete set null,
  version int not null default 0,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_workspace_idx on profiles (workspace_id);

create table seeds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  raw_text text not null,
  kind text not null default 'entity' check (kind in ('entity', 'food')),
  entity_id text,
  entity_type text,
  name text,
  year int,
  image text,
  tag_id text,
  confirmed boolean not null default false,
  promoted_in_version int,
  created_at timestamptz not null default now()
);
create index seeds_profile_idx on seeds (profile_id);

create table avoid_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  raw_text text not null,
  entity_id text,
  tag_id text,
  source text not null default 'caregiver' check (source in ('caregiver', 'default', 'learned')),
  created_at timestamptz not null default now()
);
create index avoid_items_profile_idx on avoid_items (profile_id);

create table profile_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  entity_id text not null,
  entity_type text not null,
  domain text not null check (domain in ('music', 'film', 'tv', 'book', 'place', 'food')),
  name text not null,
  year int,
  weight double precision not null default 0,
  status text not null default 'active' check (status in ('active', 'promoted', 'excluded')),
  reason text,
  why jsonb not null default '[]',
  media jsonb,
  data jsonb not null default '{}',
  added_in_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (profile_id, entity_id)
);
create index profile_items_profile_idx on profile_items (profile_id);

-- Snapshot per profile version, for the v1 -> v2 diff.
create table profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  version int not null,
  summary text,
  seeds jsonb not null default '[]',
  excluded jsonb not null default '[]',
  item_ids jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (profile_id, version)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  profile_version int not null,
  plan jsonb not null,
  learned jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_profile_idx on sessions (profile_id);

create table reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  entity_id text not null,
  reaction text not null check (reaction in ('lit_up', 'sang_along', 'neutral', 'upset')),
  created_at timestamptz not null default now()
);
create index reactions_session_idx on reactions (session_id);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete cascade,
  kind text not null check (kind in ('profile', 'session', 'learn', 'generic')),
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  steps jsonb not null default '[]',
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_profile_idx on agent_runs (profile_id, created_at desc);

create table qloo_cache (
  hash text primary key,
  endpoint text not null,
  params jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create table media_cache (
  key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Fixed-window rate limiter: returns true when the call is allowed.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create or replace function hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  current_count int;
begin
  insert into rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;
  return current_count <= p_limit;
end;
$$;

alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table seeds enable row level security;
alter table avoid_items enable row level security;
alter table profile_items enable row level security;
alter table profile_versions enable row level security;
alter table sessions enable row level security;
alter table reactions enable row level security;
alter table agent_runs enable row level security;
alter table qloo_cache enable row level security;
alter table media_cache enable row level security;
alter table rate_limits enable row level security;
