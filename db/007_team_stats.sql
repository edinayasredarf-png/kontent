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
