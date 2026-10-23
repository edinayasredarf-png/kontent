-- Настройки платформы, которые задаёт администратор в кабинете (почта SMTP и т.п.). Секреты лежат зашифрованными.
create table if not exists kz_platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
