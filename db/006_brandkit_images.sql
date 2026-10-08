-- Брендбук и картинки. Файлы лежат в БД (bytea): доступ только через /api/assets/<id> с проверкой организации.
alter table kz_brands add column if not exists kit jsonb not null default '{}'::jsonb;

create table if not exists kz_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete cascade,
  kind text not null check (kind in ('logo','product','reference','generated')),
  name text not null default '',
  mime text not null,
  width int not null,
  height int not null,
  size int not null,
  data bytea not null,
  note text not null default '',          -- описание картинки моделью (для референсов и продукта)
  created_at timestamptz not null default now()
);
create index if not exists kz_assets_brand on kz_assets(org_id, brand_id, kind);

alter table kz_content_items add column if not exists image_id uuid references kz_assets(id) on delete set null;
