-- SEO-статьи для сайтов; каналы WordPress и webhook.
alter table kz_content_items drop constraint if exists kz_content_items_kind_check;
alter table kz_content_items add constraint kz_content_items_kind_check check (kind in ('post','carousel','reels','article','story','seo'));
alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in ('telegram','vk','dzen','site','webhook','wordpress'));
