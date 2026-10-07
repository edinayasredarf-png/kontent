create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Организация = аккаунт и биллинг. Агентство держит много брендов в одной организации.
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  balance_kop bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  primary key (org_id, user_id)
);

-- Бренд (компания клиента): профиль, тон, запреты. Один бренд — много заводов.
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  description text not null default '',
  audience text not null default '',
  tone text not null default 'professional',
  rules jsonb not null default '{}'::jsonb,   -- {forbidden:[], competitors:[], sensitive:[], colors:[]}
  created_at timestamptz not null default now()
);
create index if not exists brands_org on brands(org_id);

-- Завод = автоматический конвейер под один продукт/направление бренда.
create table if not exists factories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  niche text not null default '',
  product text not null default '',
  formats text[] not null default '{post}',
  brief jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{"days":[1,2,3,4,5],"times":["10:00"],"tz":"Europe/Moscow"}'::jsonb,
  approval text not null default 'manual' check (approval in ('manual','auto')),
  autopublish boolean not null default false,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now()
);
create index if not exists factories_org on factories(org_id);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('telegram','vk','dzen','site','webhook')),
  title text not null,
  credentials jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists channels_org on channels(org_id);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  factory_id uuid references factories(id) on delete set null,
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null default 'post' check (kind in ('post','carousel','reels','article','story')),
  topic text not null,
  hook text not null default '',
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'idea' check (status in ('idea','approved','generating','ready','scheduled','published','failed','rejected')),
  planned_for date,
  scheduled_at timestamptz,
  cost_kop int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists items_org_status on content_items(org_id, status);
create index if not exists items_factory on content_items(factory_id);

create table if not exists publications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  item_id uuid not null references content_items(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','published','failed')),
  external_url text,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pubs_org on publications(org_id, created_at desc);

-- Журнал баланса: единственный источник правды. Баланс в orgs — денормализация, меняется в той же транзакции.
create table if not exists wallet_tx (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  amount_kop bigint not null,
  reason text not null,
  ref uuid,
  created_at timestamptz not null default now()
);
create index if not exists wallet_org on wallet_tx(org_id, created_at desc);
