-- Бонусные и подарочные деньги: списания за них — не выручка. Подарочный остаток считается по журналу: подарки (бонус при регистрации, подарки администратора) минус уже потраченные из них.

alter table kz_wallet_tx add column if not exists credit_kind text;                   -- у пополнений: bonus (регистрация), gift (подарок администратора), paid (оплата)
alter table kz_wallet_tx add column if not exists bonus_part bigint not null default 0; -- у списания и возврата: какая часть суммы — подарочные деньги (у возврата со знаком минус)
alter table kz_ai_usage add column if not exists bonus_share real not null default 0;  -- доля вызова, оплаченная подарочными деньгами (0..1)

-- Разметка уже сделанных пополнений.
update kz_wallet_tx set credit_kind='bonus' where credit_kind is null and amount_kop>0 and reason='Бонус при регистрации';
update kz_wallet_tx set credit_kind='paid' where credit_kind is null and amount_kop>0 and reason like 'Пополнение администратором%';

-- История: подарочные деньги тратятся первыми, по порядку списаний (с учётом возвратов).
with t as (
  select id, org_id, -amount_kop s,
         sum(-amount_kop) over (partition by org_id order by created_at, id rows between unbounded preceding and current row) cum
    from kz_wallet_tx
   where (amount_kop<0 and reason not like '%администратором%') or (amount_kop>0 and reason like 'Возврат:%')
), b as (
  select org_id, sum(amount_kop) b from kz_wallet_tx where credit_kind in ('bonus','gift') group by org_id
)
update kz_wallet_tx w set bonus_part = least(b.b, greatest(0, t.cum)) - least(b.b, greatest(0, t.cum - t.s))
  from t join b on b.org_id=t.org_id where w.id=t.id;

-- Расходы: помимо «разовый» и «каждый месяц» добавлены «каждую неделю», «каждый квартал» и «каждый год».
alter table kz_expenses drop constraint if exists kz_expenses_recurring_check;
alter table kz_expenses add constraint kz_expenses_recurring_check check (recurring in ('once','weekly','monthly','quarterly','yearly'));
