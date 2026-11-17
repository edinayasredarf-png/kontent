alter table kz_competitors add column if not exists avatar text;
alter table kz_competitor_posts add column if not exists images text[] not null default '{}';
