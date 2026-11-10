-- Legacy wallet integers retain their value: 100 units become 1 product token.
-- Real payment amounts and revenue are recorded independently, in kopecks.
alter table kz_orgs add column if not exists token_value_kop bigint;
alter table kz_orgs add column if not exists plan_until timestamptz;
alter table kz_orgs add column if not exists plan_terms jsonb;
alter table kz_wallet_tx add column if not exists revenue_kop bigint;
alter table kz_wallet_tx add column if not exists nominal_units bigint not null default 0;
alter table kz_wallet_tx add column if not exists refunded_units bigint not null default 0;
alter table kz_wallet_tx add column if not exists refund_of uuid references kz_wallet_tx(id);
update kz_wallet_tx set revenue_kop=case when amount_kop<0 then amount_kop+bonus_part when reason like 'Возврат:%' then amount_kop+bonus_part else 0 end where revenue_kop is null;
update kz_orgs o set token_value_kop=greatest(0,balance_kop-greatest(0,coalesce((select sum(case when credit_kind in ('bonus','gift') then amount_kop else 0 end)-sum(bonus_part) from kz_wallet_tx w where w.org_id=o.id),0))) where token_value_kop is null;
alter table kz_orgs alter column token_value_kop set default 0;
alter table kz_orgs alter column token_value_kop set not null;
create table if not exists kz_payment_orders (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kz_orgs(id) on delete cascade,
 user_id uuid not null references kz_users(id),
 request_key uuid not null unique,
 provider_id text unique,
 shop_id text not null,
 test_mode boolean not null,
 amount_kop bigint not null check(amount_kop>0),
 plan_key text not null,
 terms jsonb not null,
 receipt_email text not null,
 request_body jsonb not null,
 status text not null default 'created' check(status in ('created','pending','waiting_for_capture','succeeded','canceled')),
 confirmation_url text,
 credited_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists kz_payment_orders_org_idx on kz_payment_orders(org_id,created_at desc);
