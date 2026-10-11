-- Автолента: поток «источники → отбор → пересказ → публикация в каналы».
create table if not exists kz_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  name text not null,
  status text not null default 'paused' check (status in ('active','paused')),
  source_ids uuid[] not null default '{}',
  channel_ids uuid[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_flows_org on kz_flows(org_id);

-- Каждая новость источника проходит поток один раз; статус и причина отбраковки видны в интерфейсе.
create table if not exists kz_flow_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  flow_id uuid not null references kz_flows(id) on delete cascade,
  feed_item_id uuid not null references kz_feed_items(id) on delete cascade,
  status text not null check (status in ('rejected','pending','ready','queued','failed')),
  reject_code text,
  reject_note text,
  classification jsonb,
  text text not null default '',
  content_item_id uuid references kz_content_items(id) on delete set null,
  cost_kop int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, feed_item_id)
);
create index if not exists kz_flow_items_flow on kz_flow_items(flow_id, status, created_at desc);
