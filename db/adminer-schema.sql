-- 001_init.sql
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

-- 002_pipeline.sql
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

-- 003_unlimited.sql
-- Организации владельцев-админов платформы: без лимитов тарифа и без списаний. Флаг синхронизируется при входе (requireCtx).
alter table kz_orgs add column if not exists unlimited boolean not null default false;

-- 004_oauth.sql
-- Вход через Яндекс / VK. Один внешний аккаунт — один пользователь.
create table if not exists kz_oauth_identities (
  provider text not null check (provider in ('yandex','vk')),
  provider_id text not null,
  user_id uuid not null references kz_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, provider_id)
);
create index if not exists kz_oauth_user on kz_oauth_identities(user_id);

-- 005_monitoring.sql
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

-- 006_brandkit_images.sql
-- Брендбук и картинки. Файлы лежат в БД (bytea): доступ только через /api/assets/<id> с проверкой организации.
alter table kz_brands add column if not exists kit jsonb not null default '{}'::jsonb;

create table if not exists kz_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete cascade,
  kind text not null check (kind in ('logo','product','reference','generated')),
  name text not null default '',
  mime text not null,
  width int not null,
  height int not null,
  size int not null,
  data bytea not null,
  note text not null default '',          -- описание картинки моделью (для референсов и продукта)
  created_at timestamptz not null default now()
);
create index if not exists kz_assets_brand on kz_assets(org_id, brand_id, kind);

alter table kz_content_items add column if not exists image_id uuid references kz_assets(id) on delete set null;

-- 007_team_stats.sql
-- Безопасность аккаунта, команда, партнёрка, статистика публикаций и входящие.
alter table kz_users add column if not exists session_ver int not null default 0;     -- смена пароля обнуляет все прежние сессии
alter table kz_users add column if not exists has_password boolean not null default true;
alter table kz_users add column if not exists ref_code text unique;
alter table kz_users add column if not exists referred_by uuid references kz_users(id) on delete set null;

create table if not exists kz_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  email text,
  role text not null check (role in ('admin','editor','viewer')),
  token_hash text not null unique,
  invited_by uuid references kz_users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kz_invites_org on kz_invites(org_id);

-- Начисления партнёрам. Сейчас пишется только факт регистрации; суммы появятся вместе с оплатой.
create table if not exists kz_referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references kz_users(id) on delete cascade,
  referred_id uuid not null references kz_users(id) on delete cascade,
  kind text not null default 'signup',
  amount_kop bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (referrer_id, referred_id, kind)
);

-- Показатели опубликованных постов (просмотры, реакции) по данным площадок.
create table if not exists kz_post_stats (
  publication_id uuid primary key references kz_publications(id) on delete cascade,
  org_id uuid not null references kz_orgs(id) on delete cascade,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  reposts int not null default 0,
  fetched_at timestamptz not null default now()
);
create index if not exists kz_post_stats_org on kz_post_stats(org_id);

-- Входящие: комментарии под постами.
create table if not exists kz_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  publication_id uuid references kz_publications(id) on delete cascade,
  channel_id uuid not null references kz_channels(id) on delete cascade,
  ext_id text not null,
  author text not null default '',
  body text not null,
  posted_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','done','hidden')),
  reply text,
  created_at timestamptz not null default now(),
  unique (channel_id, ext_id)
);
create index if not exists kz_comments_org on kz_comments(org_id, status, posted_at desc);

-- 008_seo.sql
-- SEO-статьи для сайтов; каналы WordPress и webhook.
alter table kz_content_items drop constraint if exists kz_content_items_kind_check;
alter table kz_content_items add constraint kz_content_items_kind_check check (kind in ('post','carousel','reels','article','story','seo'));
alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in ('telegram','vk','dzen','site','webhook','wordpress'));

-- 009_studio_max_security.sql
-- Студия (файлы вне заводов), банк идей, канал MAX, защита входа от перебора.
alter table kz_assets drop constraint if exists kz_assets_kind_check;
alter table kz_assets add constraint kz_assets_kind_check check (kind in ('logo','product','reference','generated','studio'));
alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in ('telegram','vk','dzen','site','webhook','wordpress','max'));

create table if not exists kz_bank (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete set null,
  title text not null,
  body text not null default '',
  source text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_bank_org on kz_bank(org_id, created_at desc);

create table if not exists kz_auth_attempts (
  id bigserial primary key,
  kind text not null check (kind in ('login','register')),
  email text not null default '',
  ip text not null default '',
  at timestamptz not null default now()
);
create index if not exists kz_auth_attempts_email on kz_auth_attempts(kind, email, at);
create index if not exists kz_auth_attempts_ip on kz_auth_attempts(kind, ip, at);

-- 010_admin_reset_legal.sql
-- Админка платформы, сброс пароля, согласие с условиями.
alter table kz_users add column if not exists disabled boolean not null default false;      -- заблокирован администратором
alter table kz_users add column if not exists consent_at timestamptz;                       -- когда принял условия и политику
alter table kz_users add column if not exists consent_version text;
alter table kz_orgs add column if not exists suspended boolean not null default false;      -- организация приостановлена администратором

create table if not exists kz_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kz_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kz_password_resets_user on kz_password_resets(user_id);

-- Журнал действий администраторов платформы.
create table if not exists kz_audit (
  id bigserial primary key,
  actor_id uuid references kz_users(id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_type text not null default '',
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists kz_audit_at on kz_audit(at desc);

-- Мелкое служебное хранилище (последний проход воркера и т. п.).
create table if not exists kz_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table kz_auth_attempts drop constraint if exists kz_auth_attempts_kind_check;
alter table kz_auth_attempts add constraint kz_auth_attempts_kind_check check (kind in ('login','register','reset'));

-- 011_theme.sql
-- Тема оформления пользователя: светлая, тёмная или как в системе.
alter table kz_users add column if not exists theme text not null default 'system';
alter table kz_users drop constraint if exists kz_users_theme_check;
alter table kz_users add constraint kz_users_theme_check check (theme in ('light','dark','system'));

-- 012_carousel_assets.sql
-- Карусели картинками: слайды хранятся как файлы, привязанные к материалу (удаляются вместе с ним).
alter table kz_assets add column if not exists item_id uuid references kz_content_items(id) on delete cascade;
alter table kz_assets add column if not exists position int not null default 0;   -- порядок слайдов; -1 — фон обложки (нейросетью)
create index if not exists kz_assets_item on kz_assets(item_id, position);

-- 013_share_learning.sql
-- Клиентский портал: ссылка для согласования материалов и просмотра отчёта без регистрации.
-- Сама ссылка хранится зашифрованной (чтобы владелец мог скопировать её снова), по хешу ищем.
create table if not exists kz_share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  token_hash text not null unique,
  token_enc jsonb not null,
  label text not null default '',
  can_approve boolean not null default true,
  show_report boolean not null default true,
  auto_publish boolean not null default false,
  expires_at timestamptz,
  revoked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kz_share_links_brand on kz_share_links(org_id, brand_id);

-- Ответы клиента по материалу: одобрено или нужны правки, с комментарием.
create table if not exists kz_item_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  item_id uuid not null references kz_content_items(id) on delete cascade,
  link_id uuid references kz_share_links(id) on delete set null,
  author text not null default '',
  verdict text not null check (verdict in ('approved','changes','comment')),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_item_feedback_item on kz_item_feedback(item_id, created_at desc);

-- Число подписчиков каналов по дням (Telegram, VK) — рост аудитории в аналитике.
create table if not exists kz_channel_stats (
  channel_id uuid not null references kz_channels(id) on delete cascade,
  org_id uuid not null references kz_orgs(id) on delete cascade,
  day date not null,
  members int not null,
  primary key (channel_id, day)
);

create table if not exists kz_migrations(name text primary key, at timestamptz default now());
insert into kz_migrations(name) values ('001_init.sql'),('002_pipeline.sql'),('003_unlimited.sql'),('004_oauth.sql'),('005_monitoring.sql'),('006_brandkit_images.sql'),('007_team_stats.sql'),('008_seo.sql'),('009_studio_max_security.sql'),('010_admin_reset_legal.sql'),('011_theme.sql'),('012_carousel_assets.sql'),('013_share_learning.sql') on conflict do nothing;
