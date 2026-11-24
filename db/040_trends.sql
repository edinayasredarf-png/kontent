create table if not exists kz_trend_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  factory_id uuid not null references kz_factories(id) on delete cascade,
  query text not null,
  days int not null check (days in (7,30)),
  result jsonb not null,
  context_hash text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists trend_runs_scope on kz_trend_runs(org_id,factory_id,created_at desc);
create table if not exists kz_trend_materials (
  org_id uuid not null references kz_orgs(id) on delete cascade,
  run_id uuid not null references kz_trend_runs(id) on delete cascade,
  idea_id text not null,
  item_id uuid not null references kz_content_items(id) on delete cascade,
  primary key (org_id,run_id,idea_id)
);

create table if not exists kz_trend_topics (
  org_id uuid not null references kz_orgs(id) on delete cascade,
  factory_id uuid not null references kz_factories(id) on delete cascade,
  context_hash text not null,
  topics jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id,factory_id)
);
