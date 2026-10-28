-- Индексы под тяжёлые выборки: список плана завода, счётчики «что горит», лента новостей.
create index if not exists items_factory_planned on kz_content_items(factory_id, planned_for);
create index if not exists pubs_org_status on kz_publications(org_id, status, created_at desc);
create index if not exists kz_feed_org_published on kz_feed_items(org_id, published_at desc);
