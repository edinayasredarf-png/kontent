-- Новые форматы: рассылка и гайд.
alter table kz_content_items drop constraint if exists kz_content_items_kind_check;
alter table kz_content_items add constraint kz_content_items_kind_check check (kind in ('post','carousel','reels','article','story','seo','poll','contest','infographic','email','guide'));

-- Белая метка: оформление клиентского портала и отчёта от имени агентства.
alter table kz_orgs add column if not exists wl_name text not null default '';
alter table kz_orgs add column if not exists wl_footer text not null default '';
alter table kz_orgs add column if not exists wl_hide boolean not null default false;
