-- Поддержка (обращения клиентов и ответы) и уведомления в колокольчике.
create table if not exists kz_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  subject text not null,
  category text not null default 'other',
  status text not null default 'open' check (status in ('open','answered','closed')),
  page text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staff_replied_at timestamptz,      -- когда поддержка отвечала в последний раз
  client_replied_at timestamptz,     -- когда клиент писал в последний раз
  client_read_at timestamptz,        -- когда клиент в последний раз открывал обращение
  staff_read_at timestamptz          -- когда поддержка в последний раз открывала обращение
);
create index if not exists kz_tickets_org on kz_tickets(org_id, updated_at desc);
create index if not exists kz_tickets_user on kz_tickets(user_id, updated_at desc);
create index if not exists kz_tickets_status on kz_tickets(status, updated_at desc);

create table if not exists kz_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references kz_tickets(id) on delete cascade,
  author_id uuid references kz_users(id) on delete set null,
  staff boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists kz_ticket_messages_ticket on kz_ticket_messages(ticket_id, created_at);

create table if not exists kz_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  user_id uuid not null references kz_users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text not null default '',
  dedupe text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists kz_notifications_user on kz_notifications(user_id, created_at desc);
create unique index if not exists kz_notifications_dedupe on kz_notifications(user_id, dedupe) where dedupe is not null;
