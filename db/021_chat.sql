-- Чат с ассистентом: история переписки пользователя в организации. blocks — ссылки на разделы и предложенные действия.
create table if not exists kz_chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  blocks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists kz_chat_user on kz_chat_messages(org_id, user_id, created_at desc);
