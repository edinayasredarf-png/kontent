-- Новые форматы: опрос, конкурс, инфографика.
alter table kz_content_items drop constraint if exists kz_content_items_kind_check;
alter table kz_content_items add constraint kz_content_items_kind_check check (kind in ('post','carousel','reels','article','story','seo','poll','contest','infographic'));

-- Входящие: тон комментария (определяется при сборе) и черновик ответа от ИИ.
alter table kz_comments add column if not exists tone text check (tone in ('neutral','positive','question','negative','spam'));
alter table kz_comments add column if not exists draft text;
create index if not exists kz_comments_tone on kz_comments(org_id, tone, status);

-- Короткие ссылки со счётчиком переходов: считаем клики по ссылкам из постов.
create table if not exists kz_links (
  code text primary key,
  org_id uuid not null references kz_orgs(id) on delete cascade,
  item_id uuid references kz_content_items(id) on delete set null,
  channel_id uuid references kz_channels(id) on delete set null,
  url text not null,
  clicks int not null default 0,
  last_click_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists kz_links_uniq on kz_links(item_id, channel_id, url) where item_id is not null;
create index if not exists kz_links_org on kz_links(org_id, created_at desc);

-- Конкуренты: публичные каналы Telegram и сообщества VK, посты и просмотры для сравнения.
create table if not exists kz_competitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete cascade,
  kind text not null check (kind in ('telegram','vk')),
  ref text not null,
  title text not null default '',
  members int,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, kind, ref)
);
create table if not exists kz_competitor_posts (
  competitor_id uuid not null references kz_competitors(id) on delete cascade,
  ext_id text not null,
  url text not null default '',
  body text not null default '',
  views int not null default 0,
  likes int not null default 0,
  posted_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key (competitor_id, ext_id)
);
create index if not exists kz_competitor_posts_time on kz_competitor_posts(competitor_id, posted_at desc);
