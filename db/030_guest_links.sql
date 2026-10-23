-- Гостевые ссылки: просмотр кабинета без регистрации. За каждой ссылкой стоит служебный пользователь с ролью «наблюдатель»,
-- поэтому все ограничения для этой роли работают без отдельного кода. Удаление ссылки удаляет и служебного пользователя.
create table if not exists kz_guest_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  label text not null default '',
  token_hash text not null unique,
  expires_at timestamptz,
  created_by uuid references kz_users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists kz_guest_links_org on kz_guest_links(org_id);
create index if not exists kz_guest_links_user on kz_guest_links(user_id);
