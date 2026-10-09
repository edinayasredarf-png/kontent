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
