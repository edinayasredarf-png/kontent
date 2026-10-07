
create table if not exists kz_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Организация = аккаунт и биллинг. Агентство держит много брендов в одной организации.
create table if not exists kz_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  balance_kop bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists kz_memberships (
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  primary key (org_id, user_id)
);

-- Бренд (компания клиента): профиль, тон, запреты. Один бренд — много заводов.
create table if not exists kz_brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  name text not null,
  description text not null default '',
  audience text not null default '',
  tone text not null default 'professional',
  rules jsonb not null default '{}'::jsonb,   -- {forbidden:[], competitors:[], sensitive:[], colors:[]}
  created_at timestamptz not null default now()
);
create index if not exists brands_org on kz_brands(org_id);

-- Завод = автоматический конвейер под один продукт/направление бренда.
create table if not exists kz_factories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
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
create index if not exists factories_org on kz_factories(org_id);

create table if not exists kz_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  kind text not null check (kind in ('telegram','vk','dzen','site','webhook')),
  title text not null,
  credentials jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists channels_org on kz_channels(org_id);

create table if not exists kz_content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  factory_id uuid references kz_factories(id) on delete set null,
  brand_id uuid not null references kz_brands(id) on delete cascade,
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
create index if not exists items_org_status on kz_content_items(org_id, status);
create index if not exists items_factory on kz_content_items(factory_id);

create table if not exists kz_publications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  item_id uuid not null references kz_content_items(id) on delete cascade,
  channel_id uuid not null references kz_channels(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','published','failed')),
  external_url text,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pubs_org on kz_publications(org_id, created_at desc);

-- Журнал баланса: единственный источник правды. Баланс в orgs — денормализация, меняется в той же транзакции.
create table if not exists kz_wallet_tx (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  amount_kop bigint not null,
  reason text not null,
  ref uuid,
  created_at timestamptz not null default now()
);
create index if not exists wallet_org on kz_wallet_tx(org_id, created_at desc);

alter table kz_factories add column if not exists channel_ids uuid[] not null default '{}';

alter table kz_content_items add column if not exists updated_at timestamptz not null default now();

alter table kz_publications drop constraint if exists kz_publications_status_check;
alter table kz_publications add constraint kz_publications_status_check check (status in ('queued','sending','published','failed'));
alter table kz_publications add column if not exists attempts int not null default 0;
alter table kz_publications add column if not exists next_attempt_at timestamptz not null default now();
alter table kz_publications add column if not exists updated_at timestamptz not null default now();
-- один материал в один канал — одна публикация: защита от двойной отправки при гонке воркеров
create unique index if not exists pubs_item_channel on kz_publications(item_id, channel_id);
create index if not exists pubs_queue on kz_publications(status, next_attempt_at);

-- Какая модель шлюза какую задачу делает. Глобально для платформы (редактирует админ платформы).
create table if not exists kz_ai_routes (
  task text primary key,
  model text not null,
  updated_at timestamptz not null default now()
);

-- Организации владельцев-админов платформы: без лимитов тарифа и без списаний. Флаг синхронизируется при входе (requireCtx).
alter table kz_orgs add column if not exists unlimited boolean not null default false;

create table if not exists kz_migrations(name text primary key, at timestamptz default now());
insert into kz_migrations(name) values ('001_init.sql'),('002_pipeline.sql'),('003_unlimited.sql') on conflict do nothing;
