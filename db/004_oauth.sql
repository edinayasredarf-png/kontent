-- Вход через Яндекс / VK. Один внешний аккаунт — один пользователь.
create table if not exists kz_oauth_identities (
  provider text not null check (provider in ('yandex','vk')),
  provider_id text not null,
  user_id uuid not null references kz_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, provider_id)
);
create index if not exists kz_oauth_user on kz_oauth_identities(user_id);
