alter table kz_factories add column if not exists channel_ids uuid[] not null default '{}';

alter table kz_content_items add column if not exists updated_at timestamptz not null default now();

alter table kz_publications drop constraint if exists kz_publications_status_check;
alter table kz_publications add constraint kz_publications_status_check check (status in ('queued','sending','published','failed'));
alter table kz_publications add column if not exists attempts int not null default 0;
alter table kz_publications add column if not exists next_attempt_at timestamptz not null default now();
alter table kz_publications add column if not exists updated_at timestamptz not null default now();
-- один материал в один канал — одна публикация: защита от двойной отправки при гонке воркеров
create unique index if not exists pubs_item_channel on kz_publications(item_id, channel_id);
create index if not exists pubs_queue on kz_publications(status, next_attempt_at);

-- Какая модель шлюза какую задачу делает. Глобально для платформы (редактирует админ платформы).
create table if not exists kz_ai_routes (
  task text primary key,
  model text not null,
  updated_at timestamptz not null default now()
);
