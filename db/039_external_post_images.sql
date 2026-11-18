alter table kz_external_posts add column if not exists images text[] not null default '{}';
alter table kz_external_posts add column if not exists media_checked_at timestamptz;
