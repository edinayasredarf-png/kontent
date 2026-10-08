-- Мониторинг: источники (сайты, Telegram, VK, новости по запросу), ключевые слова и лента постов.
create table if not exists kz_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  kind text not null check (kind in ('site','telegram','vk','news','manual')),
  ref text not null,                       -- нормализованный адрес / username / домен / запрос
  title text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused')),
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, kind, ref)
);
create index if not exists kz_sources_due on kz_sources(status, last_fetched_at);

create table if not exists kz_keywords (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  word text not null,
  kind text not null default 'include' check (kind in ('include','exclude')),
  created_at timestamptz not null default now(),
  unique (org_id, kind, word)
);

create table if not exists kz_feed_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  source_id uuid not null references kz_sources(id) on delete cascade,
  ext_id text not null,
  url text not null,
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  matched text[] not null default '{}',
  score int not null default 0,
  excluded boolean not null default false,
  status text not null default 'new' check (status in ('new','saved','dismissed','used')),
  content_item_id uuid references kz_content_items(id) on delete set null,
  unique (source_id, ext_id)
);
create index if not exists kz_feed_org on kz_feed_items(org_id, status, score desc, published_at desc);
