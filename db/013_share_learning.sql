-- Клиентский портал: ссылка для согласования материалов и просмотра отчёта без регистрации.
-- Сама ссылка хранится зашифрованной (чтобы владелец мог скопировать её снова), по хешу ищем.
create table if not exists kz_share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid not null references kz_brands(id) on delete cascade,
  token_hash text not null unique,
  token_enc jsonb not null,
  label text not null default '',
  can_approve boolean not null default true,
  show_report boolean not null default true,
  auto_publish boolean not null default false,
  expires_at timestamptz,
  revoked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kz_share_links_brand on kz_share_links(org_id, brand_id);

-- Ответы клиента по материалу: одобрено или нужны правки, с комментарием.
create table if not exists kz_item_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  item_id uuid not null references kz_content_items(id) on delete cascade,
  link_id uuid references kz_share_links(id) on delete set null,
  author text not null default '',
  verdict text not null check (verdict in ('approved','changes','comment')),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_item_feedback_item on kz_item_feedback(item_id, created_at desc);

-- Число подписчиков каналов по дням (Telegram, VK) — рост аудитории в аналитике.
create table if not exists kz_channel_stats (
  channel_id uuid not null references kz_channels(id) on delete cascade,
  org_id uuid not null references kz_orgs(id) on delete cascade,
  day date not null,
  members int not null,
  primary key (channel_id, day)
);
