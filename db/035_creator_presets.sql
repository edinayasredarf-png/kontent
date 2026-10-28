-- Пресеты студии контента: сохранённый стиль серии, модель, качество и структура слайдов, чтобы повторять подачу на новую тему.
create table if not exists kz_creator_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete set null,
  kind text not null default 'carousel',
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  sample_asset_id uuid references kz_assets(id) on delete set null,
  created_by uuid references kz_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists creator_presets_org on kz_creator_presets(org_id, kind, created_at desc);
