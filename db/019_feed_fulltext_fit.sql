-- Мониторинг: полный текст статьи (RSS обычно отдаёт только заголовок и анонс) и оценка «подходит ли это вам».
alter table kz_feed_items add column if not exists full_text text;
alter table kz_feed_items add column if not exists full_status text not null default '';   -- '', ok, short, failed, unsupported
alter table kz_feed_items add column if not exists fit_score int;
alter table kz_feed_items add column if not exists fit_reason text not null default '';
alter table kz_feed_items add column if not exists fit_at timestamptz;
create index if not exists kz_feed_items_fit on kz_feed_items(org_id, fit_score desc) where fit_score is not null;
