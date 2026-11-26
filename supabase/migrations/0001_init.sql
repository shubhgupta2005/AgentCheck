-- AgentCheck schema. Mirrors src/lib/types.ts; the crawler currently writes to data/store.json
-- and will switch to these tables once a Supabase project is connected.

create extension if not exists vector;

-- ── Companies (joined across sources by a normalised key) ──
create table companies (
  key          text primary key,
  name         text not null,
  website      text,
  team_size    int,
  location     text,
  stage        text,
  yc_batch     text,
  yc_url       text,
  is_hiring    boolean default false,
  one_liner    text,
  sources      text[] not null default '{}',
  updated_at   timestamptz not null default now()
);

create table funding_events (
  id           text primary key,            -- inc42:<article url>
  company_key  text not null,
  company      text not null,
  headline     text not null,
  amount_text  text,
  amount_usd   bigint,
  round        text,
  announced_at timestamptz not null,
  url          text not null,
  source       text not null
);
create index funding_company_idx on funding_events (company_key, announced_at desc);

-- ── Jobs + history ──
create table jobs (
  id            text primary key,           -- <source>:<external id>
  source        text not null,
  company_key   text not null,
  company       text not null,
  title         text not null,
  url           text not null,
  apply_url     text,
  apply_email   text,
  location      text not null default '',
  remote        boolean not null default false,
  posted_at     timestamptz,
  salary        text,
  description   text not null default '',
  tags          text[] not null default '{}',
  direct_post   boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  closed_at     timestamptz,
  repost_count  int not null default 0,
  embedding     vector(768)                 -- for resume ↔ job matching (next milestone)
);
create index jobs_open_idx on jobs (closed_at) where closed_at is null;
create index jobs_company_idx on jobs (company_key);

-- Every crawl appends a row per job seen: lets us prove how long a job has *really* been open.
create table job_sightings (
  job_id    text not null references jobs (id) on delete cascade,
  seen_on   date not null,
  primary key (job_id, seen_on)
);

-- company|normalised title -> every job id that used it (repost detection)
create table title_history (
  title_key text not null,
  job_id    text not null,
  first_seen_at timestamptz not null default now(),
  primary key (title_key, job_id)
);

create table crawl_runs (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  counts  jsonb not null default '{}',
  errors  text[] not null default '{}'
);

-- ── Users, tracker and the outcome loop (community reply-rate data) ──
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  resume_text text,
  resume_embedding vector(768),
  created_at  timestamptz not null default now()
);

create type application_status as enum ('saved', 'applied', 'oa', 'interview', 'offer', 'rejected', 'ghosted');

create table applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  job_id      text references jobs (id) on delete set null,
  company_key text not null,
  channel     text,                          -- email | ashby | workday | ...
  status      application_status not null default 'saved',
  applied_at  timestamptz,
  replied_at  timestamptz,                   -- first human reply of any kind
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index applications_user_idx on applications (user_id, status);

-- Aggregate, anonymous: "X% of AgentCheck users heard back from this company".
create view company_reply_rates as
select
  company_key,
  count(*) filter (where applied_at is not null)                       as applied,
  count(*) filter (where replied_at is not null)                       as replied,
  round(100.0 * count(*) filter (where replied_at is not null)
        / nullif(count(*) filter (where applied_at is not null), 0), 1) as reply_rate_pct,
  percentile_cont(0.5) within group (order by extract(epoch from replied_at - applied_at) / 86400)
    filter (where replied_at is not null)                              as median_days_to_reply
from applications
group by company_key;

-- ── Row level security ──
alter table profiles enable row level security;
alter table applications enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own applications" on applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public, read-only job data.
alter table jobs enable row level security;
alter table companies enable row level security;
alter table funding_events enable row level security;
create policy "public read" on jobs for select using (true);
create policy "public read" on companies for select using (true);
create policy "public read" on funding_events for select using (true);
