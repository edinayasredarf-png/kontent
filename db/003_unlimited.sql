-- Организации владельцев-админов платформы: без лимитов тарифа и без списаний. Флаг синхронизируется при входе (requireCtx).
alter table kz_orgs add column if not exists unlimited boolean not null default false;
