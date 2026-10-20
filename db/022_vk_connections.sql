-- Личное подключение ВКонтакте (VK ID, ключ пользователя): токены хранятся зашифрованно (kz_crypto seal), наружу не отдаются.
create table if not exists kz_vk_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  vk_user_id text not null,
  name text not null default '',
  scope text not null default '',
  secrets jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','reauth','error','disconnected')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, vk_user_id)
);
create index if not exists vk_connections_org on kz_vk_connections(org_id);
-- канал может публиковать от имени подключения (личный ключ), а не по ключу сообщества
alter table kz_channels add column if not exists connection_id uuid references kz_vk_connections(id) on delete set null;
