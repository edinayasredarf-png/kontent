-- База знаний бренда: исходные материалы (статьи, документы, сравнения с конкурентами) и результат анализа нейросетью.
create table if not exists kz_brand_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  kind text not null default 'other' check (kind in ('article','company','competitors','cases','faq','other')),
  title text not null,
  url text,
  text text not null,
  chars int not null default 0,
  use_style boolean not null default false,   -- образец стиля письма (наши статьи и посты)
  digest jsonb,                                -- выжимка нейросети по документу
  digest_error text,
  digested_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kz_brand_docs_brand on kz_brand_docs(brand_id, created_at desc);

create table if not exists kz_brand_kb (
  brand_id uuid primary key references kz_brands(id) on delete cascade,
  org_id uuid not null references kz_orgs(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,   -- чем занимаемся, продукты, УТП, преимущества, факты, возражения, термины
  style jsonb not null default '{}'::jsonb,     -- стиль письма бренда
  style_hash text,
  analyzed_at timestamptz,
  docs_count int not null default 0,
  updated_at timestamptz not null default now()
);
