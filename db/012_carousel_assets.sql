-- Карусели картинками: слайды хранятся как файлы, привязанные к материалу (удаляются вместе с ним).
alter table kz_assets add column if not exists item_id uuid references kz_content_items(id) on delete cascade;
alter table kz_assets add column if not exists position int not null default 0;   -- порядок слайдов; -1 — фон обложки (нейросетью)
create index if not exists kz_assets_item on kz_assets(item_id, position);
