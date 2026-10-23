-- Диалоги чата, стоимость ответов, версии материалов.
create table if not exists kz_chat_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  title text not null default 'Новый диалог',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kz_chat_threads_user on kz_chat_threads(org_id, user_id, updated_at desc);

alter table kz_chat_messages add column if not exists thread_id uuid references kz_chat_threads(id) on delete cascade;
alter table kz_chat_messages add column if not exists cost_kop int not null default 0;
create index if not exists kz_chat_thread on kz_chat_messages(thread_id, created_at);

-- Прежняя общая лента каждого пользователя становится одним диалогом.
insert into kz_chat_threads(org_id,user_id,title,created_at,updated_at)
  select org_id,user_id,'Прежний диалог',min(created_at),max(created_at) from kz_chat_messages where thread_id is null group by org_id,user_id;
update kz_chat_messages m set thread_id=t.id from kz_chat_threads t where m.thread_id is null and t.org_id=m.org_id and t.user_id=m.user_id and t.title='Прежний диалог';

-- Версии материала: текст и картинка до очередной правки; вернуть можно любую.
create table if not exists kz_item_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  item_id uuid not null references kz_content_items(id) on delete cascade,
  body text not null default '',
  image_id uuid references kz_assets(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_item_versions_item on kz_item_versions(item_id, created_at desc);
