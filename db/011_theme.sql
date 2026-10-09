-- Тема оформления пользователя: светлая, тёмная или как в системе.
alter table kz_users add column if not exists theme text not null default 'system';
alter table kz_users drop constraint if exists kz_users_theme_check;
alter table kz_users add constraint kz_users_theme_check check (theme in ('light','dark','system'));
