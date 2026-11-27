-- Preserve existing external OK workflows, with a distinct kind for the new native API.
alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in (
  'telegram','vk','dzen','site','webhook','wordpress','max',
  'discord','telegraph','facebook','instagram','threads','pinterest','ok','ok_connector',
  'tiktok','youtube','reddit','rutube','x','tumblr','linkedin'
));
create table if not exists kz_migrations(name text primary key, at timestamptz default now());
update kz_channels set kind='ok_connector' where kind='ok' and not exists(select 1 from kz_migrations where name='042_social_oauth.sql');
alter table kz_channel_connections drop constraint if exists kz_channel_connections_provider_check;
alter table kz_channel_connections add constraint kz_channel_connections_provider_check check (provider in ('vk','telegram','pinterest','ok','facebook','instagram','threads'));
