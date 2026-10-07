alter table factories add column if not exists channel_ids uuid[] not null default '{}';

alter table content_items add column if not exists updated_at timestamptz not null default now();

alter table publications drop constraint if exists publications_status_check;
alter table publications add constraint publications_status_check check (status in ('queued','sending','published','failed'));
alter table publications add column if not exists attempts int not null default 0;
alter table publications add column if not exists next_attempt_at timestamptz not null default now();
alter table publications add column if not exists updated_at timestamptz not null default now();
-- один материал в один канал — одна публикация: защита от двойной отправки при гонке воркеров
create unique index if not exists pubs_item_channel on publications(item_id, channel_id);
create index if not exists pubs_queue on publications(status, next_attempt_at);

-- Какая модель шлюза какую задачу делает. Глобально для платформы (редактирует админ платформы).
create table if not exists ai_routes (
  task text primary key,
  model text not null,
  updated_at timestamptz not null default now()
);
