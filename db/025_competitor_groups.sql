-- Конкурент — это компания с несколькими площадками (Telegram, VK, сайт). Раньше площадка и была конкурентом,
-- поэтому каждой существующей строке создаём собственную группу с тем же названием.
create table if not exists kz_competitor_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references kz_orgs(id) on delete cascade,
  brand_id uuid references kz_brands(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists kz_competitor_groups_org on kz_competitor_groups(org_id, created_at);
alter table kz_competitors add column if not exists group_id uuid references kz_competitor_groups(id) on delete cascade;
do $$
declare r record; g uuid;
begin
  for r in select id, org_id, brand_id, title, ref from kz_competitors where group_id is null loop
    insert into kz_competitor_groups(org_id, brand_id, name) values (r.org_id, r.brand_id, coalesce(nullif(r.title, ''), r.ref)) returning id into g;
    update kz_competitors set group_id = g where id = r.id;
  end loop;
end $$;
create index if not exists kz_competitors_group on kz_competitors(group_id);
