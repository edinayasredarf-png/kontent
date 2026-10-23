-- Экономика платформы: что мы тратим на нейросети (по факту вызовов) и что списываем с клиентов; редактируемые цены; безлимит на срок.

-- Себестоимость моделей (по прайсу AI Gateway Timeweb): рублей в копейках за 1 млн токенов и за картинку / вызов. Заполняется администратором.
create table if not exists kz_ai_models (
  model text primary key,
  in_per_m_kop numeric(14,2) not null default 0,
  out_per_m_kop numeric(14,2) not null default 0,
  per_image_kop numeric(14,2) not null default 0,
  per_call_kop numeric(14,2) not null default 0,
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- Каждый вызов нейросети: чей, на что, сколько токенов и во сколько обошёлся нам (по прайсу на момент вызова).
create table if not exists kz_ai_usage (
  id bigserial primary key,
  org_id uuid references kz_orgs(id) on delete set null,
  user_id uuid references kz_users(id) on delete set null,
  action text not null default 'other',
  reason text not null default '',
  ref uuid,
  kind text not null default 'chat',
  task text not null default '',
  model text not null default '',
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  images int not null default 0,
  cost_kop numeric(14,4) not null default 0,
  priced boolean not null default false,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists kz_ai_usage_org on kz_ai_usage(org_id, created_at desc);
create index if not exists kz_ai_usage_time on kz_ai_usage(created_at desc);

-- Цены списания, изменённые администратором (поверх значений по умолчанию из кода).
create table if not exists kz_price_overrides (
  key text primary key,
  kop int not null check (kop >= 0 and kop <= 10000000),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

-- Что именно списано: код действия (для разбора «действие → выручка и затраты»).
alter table kz_wallet_tx add column if not exists action text;

-- Безлимит на срок (для тестирования): до этого момента списаний нет.
alter table kz_orgs add column if not exists unlimited_until timestamptz;
