alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in (
  'telegram','vk','dzen','site','webhook','wordpress','max',
  'discord','telegraph','facebook','instagram','threads','pinterest',
  'tiktok','youtube','reddit','ok','rutube','x','tumblr','linkedin'
));
