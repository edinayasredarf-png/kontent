-- Short lived, account-bound connections. Provider credentials and PKCE are encrypted.
create table if not exists kz_channel_connections (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kz_orgs(id) on delete cascade,
 user_id uuid not null references kz_users(id) on delete cascade,
 brand_id uuid not null references kz_brands(id) on delete cascade,
 factory_id uuid references kz_factories(id) on delete cascade,
 provider text not null check(provider in ('vk','telegram')),
 external_user_id bigint,
 request_id integer,
 state_hash text not null unique,
 status text not null default 'pending' check(status in ('pending','exchanging','ready','used','failed')),
 payload jsonb not null default '{}',
 error text,
 expires_at timestamptz not null default now() + interval '15 minutes',
 created_at timestamptz not null default now()
);
create index if not exists channel_connections_owner on kz_channel_connections(org_id,user_id);
