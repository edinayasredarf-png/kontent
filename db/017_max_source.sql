-- MAX как источник: чтение постов своего канала, где бот — администратор.
alter table kz_sources drop constraint if exists kz_sources_kind_check;
alter table kz_sources add constraint kz_sources_kind_check check (kind in ('site','telegram','vk','news','manual','max'));
-- Вложения поста источника (картинки, видео, файлы) — для автоленты и показа в мониторинге.
alter table kz_feed_items add column if not exists media jsonb not null default '[]'::jsonb;
