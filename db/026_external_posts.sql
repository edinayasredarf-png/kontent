-- Материалы, опубликованные не через сервис: добавляются по ссылке (VK, MAX, Telegram) и попадают в аналитику.
create table if not exists kz_external_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete set null,
  kind text not null check (kind in ('telegram','vk','max')),
  url text not null,
  ext_ref text not null,
  channel_id uuid references kz_channels(id) on delete set null,
  author text not null default '',
  body text not null default '',
  posted_at timestamptz,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, kind, ext_ref)
);
create index if not exists kz_external_posts_org on kz_external_posts(org_id, created_at desc);
-- Снимки показателей во времени: из них строится рост просмотров и реакций.
create table if not exists kz_external_stats (
  post_id uuid not null references kz_external_posts(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  reposts int not null default 0,
  extra jsonb not null default '{}'::jsonb,
  primary key (post_id, fetched_at)
);
