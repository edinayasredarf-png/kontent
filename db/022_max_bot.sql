-- Общий бот сервиса в MAX: каналы, куда его добавили, и одноразовые ключи привязки (владелец канала отправляет ключ боту в личные сообщения).
create table if not exists kz_max_chats (
  chat_id bigint primary key,
  title text not null default '',
  is_channel boolean not null default true,
  added_by bigint,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists kz_max_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','linked','used')),
  max_user_id bigint,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists max_links_org on kz_max_links(org_id);
