-- Конкуренты: помимо Telegram и VK можно следить за сайтом (лента RSS или список материалов на странице).
alter table kz_competitors drop constraint if exists kz_competitors_kind_check;
alter table kz_competitors add constraint kz_competitors_kind_check check (kind in ('telegram','vk','site'));
