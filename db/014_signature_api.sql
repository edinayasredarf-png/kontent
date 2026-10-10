-- Подпись канала: фирменная концовка, добавляется к каждому посту в этот канал (ссылки, контакты, хештег бренда).
alter table kz_channels add column if not exists signature text not null default '';

-- Ключи публичного API. Сам ключ показывается один раз; в базе только хеш и первые символы для опознания.
create table if not exists kz_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  created_by uuid references kz_users(id) on delete set null,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  role text not null default 'editor' check (role in ('viewer','editor')),
  revoked boolean not null default false,
  last_used_at timestamptz,
  window_start timestamptz not null default now(),
  window_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists kz_api_keys_org on kz_api_keys(org_id);
