-- Аватарки пользователей: загруженная вручную или взятая у Яндекса/VK при входе. Хранится уже уменьшенной (webp 256×256), поэтому таблица лёгкая.
create table if not exists kz_user_avatars (
  user_id uuid primary key references kz_users(id) on delete cascade,
  mime text not null default 'image/webp',
  data bytea not null,
  source text not null default 'upload' check (source in ('upload','yandex','vk')),
  updated_at timestamptz not null default now()
);
