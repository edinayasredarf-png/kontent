-- Студия (файлы вне заводов), банк идей, канал MAX, защита входа от перебора.
alter table kz_assets drop constraint if exists kz_assets_kind_check;
alter table kz_assets add constraint kz_assets_kind_check check (kind in ('logo','product','reference','generated','studio'));
alter table kz_channels drop constraint if exists kz_channels_kind_check;
alter table kz_channels add constraint kz_channels_kind_check check (kind in ('telegram','vk','dzen','site','webhook','wordpress','max'));

create table if not exists kz_bank (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete set null,
  title text not null,
  body text not null default '',
  source text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_bank_org on kz_bank(org_id, created_at desc);

create table if not exists kz_auth_attempts (
  id bigserial primary key,
  kind text not null check (kind in ('login','register')),
  email text not null default '',
  ip text not null default '',
  at timestamptz not null default now()
);
create index if not exists kz_auth_attempts_email on kz_auth_attempts(kind, email, at);
create index if not exists kz_auth_attempts_ip on kz_auth_attempts(kind, ip, at);
