-- Прибыль и потери: прочие расходы бизнеса и пометка вызовов нейросети, которые не принесли денег.

-- Дополнительные расходы (сервер, домены, подписки…): разовые или ежемесячные (тогда считаются по дням, пока не указана дата окончания).
create table if not exists kz_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other',
  amount_kop bigint not null check (amount_kop >= 0),
  spent_on date not null,
  recurring text not null default 'once' check (recurring in ('once','monthly')),
  end_on date,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kz_expenses_date on kz_expenses(spent_on);

-- Вызов нейросети, за который мы ничего не получили: 'free' — безлимит или пробный доступ, 'refunded' — генерация не удалась и деньги вернулись клиенту.
alter table kz_ai_usage add column if not exists no_revenue text;
