import { one, q } from "../db";
import { pollSource } from "../monitor/service";
import { createFromNews, MAKE_KINDS } from "../monitor/news";
import { buildPlan } from "../pipeline";

export interface ToolCtx { orgId: string; role: string }
export type Args = Record<string, unknown>;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "");
const int = (v: unknown, d: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || d));
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Справочник для модели: что умеют инструменты. «read» выполняются сразу, «confirm» только предлагаются кнопкой и выполняются после нажатия пользователем. */
export const TOOLS: { name: string; kind: "read" | "auto" | "act" | "confirm"; desc: string; args: string }[] = [
  { name: "overview", kind: "read", desc: "Сводка по аккаунту: бренды, заводы, каналы, материалы по статусам, проблемы (ошибки публикации, идеи на одобрении, скорое окончание плана)", args: "{}" },
  { name: "news", kind: "read", desc: "Новости из мониторинга за период, лучшие по совпадению с ключевыми словами; также число новостей по источникам", args: '{"hours":48,"limit":12,"query":"необязательное слово в заголовке"}' },
  { name: "sources", kind: "read", desc: "Источники мониторинга: статус, когда обновлялись, ошибки, сколько новостей за сутки", args: "{}" },
  { name: "analytics", kind: "read", desc: "Аналитика публикаций за период: просмотры, реакции, по каналам и форматам, лучшие посты", args: '{"days":7}' },
  { name: "factories", kind: "read", desc: "Заводы: настройки (автопубликация, одобрение идей, картинки), каналы, запас плана, материалы", args: "{}" },
  { name: "items", kind: "read", desc: "Материалы (идеи, готовые, ошибки) по заводу или статусу", args: '{"status":"idea|approved|ready|scheduled|published|failed","factoryId":"uuid","limit":10}' },
  { name: "competitors", kind: "read", desc: "Конкуренты с итогами по их площадкам: подписчики, публикаций в неделю, просмотры, лучший пост", args: "{}" },
  { name: "brands", kind: "read", desc: "Бренды: название, описание, аудитория, тон, заводы и каналы бренда", args: "{}" },
  { name: "channels", kind: "read", desc: "Подключённые каналы публикации (VK, Telegram, MAX…): название, бренд, подпись", args: "{}" },
  { name: "plan", kind: "read", desc: "Контент-план завода: ближайшие материалы и до какой даты хватает запаса", args: '{"factoryId":"uuid"}' },
  { name: "write", kind: "act", desc: "НАПИСАТЬ материал прямо сейчас (платно, выполняется сразу, результат покажется в чате). Вызывай, когда пользователь просит написать, создать, сделать пост, статью, SEO-статью, карусель, сторис, а также когда просит сделать другой формат из уже написанного. Источник: newsId (новость из инструмента news), или url (ссылка, которую прислал пользователь), или topic (своя тема), или itemId (прежний материал)", args: '{"kind":"post|article|seo|carousel|story","newsId":"uuid","url":"https://…","topic":"тема","itemId":"uuid","instructions":"пожелания: тон, длина, акценты","factoryId":"uuid, если заводов несколько"}' },
  { name: "rewrite", kind: "act", desc: "ПЕРЕПИСАТЬ текст показанного материала по просьбе пользователя (платно, сразу): подлиннее, короче, проще, в другом тоне или по произвольному описанию", args: '{"itemId":"uuid","op":"shorten|expand|simple|friendly|formal|hook|polish|custom","instruction":"что изменить (для custom)"}' },
  { name: "image", kind: "act", desc: "КАРТИНКА материала (платно, сразу): new — создать, redo — создать заново (можно сменить формат или положение логотипа), rework — доработать саму картинку по описанию (НЕ для логотипа!), logo — изменить логотип на картинке: положение, размер (logoScale в % ширины, 4–40, обычно 14; «увеличить» = умножить текущий на 1.5), отступ (logoMargin 1–12). Логотип меняется кодом из брендбука, быстро и бесплатно; forBrand=true — запомнить размер и положение для всех будущих картинок бренда. Формат: square (квадрат), portrait (вертикальный), landscape (горизонтальный). Логотип: tl,tc,tr,ml,mc,mr,bl,bc,br или none (убрать)", args: '{"itemId":"uuid","op":"new|redo|rework|logo","prompt":"описание или правка","aspect":"square|portrait|landscape","logoPos":"br","logoScale":14,"logoMargin":4,"forBrand":false}' },
  { name: "site", kind: "read", desc: "Прочитать сайт по ссылке (главная и страницы «о компании», «услуги», «контакты»): чтобы предложить заполнение бренда и завода", args: '{"url":"https://…"}' },
  { name: "search", kind: "read", desc: "Поиск в интернете по запросу: когда нужно узнать о компании, нише или аудитории то, чего нет на сайте", args: '{"query":"…"}' },
  { name: "save_brand", kind: "act", desc: "СОХРАНИТЬ бренд (бесплатно, сразу): создать (без brandId, нужно name) или обновить переданные поля. Вызывай, когда пользователь сказал заполнить, сохранить, поменять, или согласился с твоим предложением. Не вызывай, пока ты только предлагаешь текст", args: '{"brandId":"uuid или пусто для нового","name":"","description":"чем занимается компания","audience":"кто клиенты","tone":"тон общения","forbidden":["что нельзя писать"],"competitors":["конкуренты"],"style":"minimal|futurism|corporate|popart|pastel|dark|photo|illustration","styleNotes":"описание стиля картинок","imageMust":"что всегда на картинках","imageNever":"чего не должно быть","colors":["#RRGGBB"]}' },
  { name: "save_factory", kind: "act", desc: "СОХРАНИТЬ контент-завод (бесплатно, сразу): создать (без factoryId, нужны brandId и name) или обновить переданные поля. Расписание: days — дни недели 0..6 (0 воскресенье), times — «ЧЧ:ММ»", args: '{"factoryId":"uuid или пусто для нового","brandId":"uuid","name":"","niche":"ниша","product":"что продаём, главные выгоды","formats":["post","carousel","story","article","seo"],"days":[1,3,5],"times":["10:00"]}' },
  { name: "refresh_news", kind: "auto", desc: "Обновить источники мониторинга прямо сейчас (бесплатно). Вызывай, когда просят обновить, проверить свежее или данные устарели", args: "{}" },
  { name: "set_source_status", kind: "confirm", desc: "Включить или поставить на паузу источник новостей", args: '{"sourceId":"uuid","status":"active|paused"}' },
  { name: "set_factory", kind: "confirm", desc: "Изменить настройки завода: автопубликация по расписанию, режим одобрения идей (manual — вручную, auto — сами), картинки к материалам", args: '{"factoryId":"uuid","autopublish":true,"approval":"manual|auto","images":true}' },
  { name: "create_from_news", kind: "confirm", desc: "Создать материалы из новости в заводе (платные: списываются деньги). mode now — написать сразу, ideas — только в план", args: '{"itemId":"uuid новости","factoryId":"uuid","kinds":["post"],"mode":"now|ideas"}' },
  { name: "extend_plan", kind: "confirm", desc: "Продлить контент-план завода с помощью ИИ (платно)", args: '{"factoryId":"uuid","days":7}' },
];
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

const SINCE = (h: number) => `now() - interval '${h} hours'`;

export async function runRead(ctx: ToolCtx, name: string, a: Args): Promise<unknown> {
  const o = ctx.orgId;
  if (name === "overview") {
    const k = await one<Record<string, string>>(
      `select (select count(*) from kz_brands where org_id=$1) brands, (select count(*) from kz_factories where org_id=$1) factories,
              (select count(*) from kz_channels where org_id=$1 and status='active') channels, (select count(*) from kz_sources where org_id=$1 and status='active' and kind<>'manual') sources,
              (select count(*) from kz_content_items where org_id=$1 and status='idea') ideas, (select count(*) from kz_content_items where org_id=$1 and status='approved') approved,
              (select count(*) from kz_content_items where org_id=$1 and status='ready') ready, (select count(*) from kz_content_items where org_id=$1 and status='scheduled') scheduled,
              (select count(*) from kz_content_items where org_id=$1 and status='failed') failed_items,
              (select count(*) from kz_publications where org_id=$1 and status='published' and published_at > now() - interval '7 days') published_week,
              (select count(*) from kz_publications where org_id=$1 and status='failed' and created_at > now() - interval '7 days') failed_pubs_week,
              (select count(*) from kz_sources where org_id=$1 and status='active' and last_error is not null) bad_sources,
              (select count(*) from kz_feed_items where org_id=$1 and fetched_at > now() - interval '24 hours') news_24h,
              (select count(*) from kz_comments where org_id=$1 and status='new') new_comments,
              (select balance_kop from kz_orgs where id=$1) balance_kop`, [o]);
    return k;
  }
  if (name === "news") {
    const hours = int(a.hours, 48, 1, 24 * 30), limit = int(a.limit, 12, 1, 25), query = clip(a.query, 60).toLowerCase();
    const rows = await q(`select i.id,i.title,s.title source,i.url,i.published_at,i.score,i.matched,i.status from kz_feed_items i join kz_sources s on s.id=i.source_id
        where i.org_id=$1 and not i.excluded and i.status in ('new','saved') and i.published_at > ${SINCE(hours)} and ($2='' or lower(i.title) like '%'||$2||'%')
        order by i.score desc, i.published_at desc limit ${limit}`, [o, query]);
    const per = await q(`select s.title source,count(*) n from kz_feed_items i join kz_sources s on s.id=i.source_id where i.org_id=$1 and i.published_at > ${SINCE(hours)} group by s.title order by n desc limit 15`, [o]);
    return { hours, top: rows, perSource: per };
  }
  if (name === "sources") {
    return q(`select s.id,s.title,s.kind,s.status,s.last_fetched_at,s.last_error,(select count(*) from kz_feed_items i where i.source_id=s.id and i.fetched_at > now() - interval '24 hours') news_24h from kz_sources s where s.org_id=$1 and s.kind<>'manual' order by s.created_at limit 40`, [o]);
  }
  if (name === "analytics") {
    const days = int(a.days, 7, 1, 90), since = `now() - interval '${days} days'`;
    const total = await one(`select count(*) published, coalesce(sum(s.views),0) views, coalesce(sum(s.likes),0) likes, coalesce(sum(s.comments),0) comments, coalesce(sum(s.reposts),0) reposts
        from kz_publications p left join kz_post_stats s on s.publication_id=p.id where p.org_id=$1 and p.status='published' and p.published_at > ${since}`, [o]);
    const byChannel = await q(`select c.kind channel, c.title, count(*) posts, coalesce(sum(s.views),0) views, coalesce(sum(s.likes),0) likes from kz_publications p join kz_channels c on c.id=p.channel_id left join kz_post_stats s on s.publication_id=p.id
        where p.org_id=$1 and p.status='published' and p.published_at > ${since} group by c.kind,c.title order by views desc limit 10`, [o]);
    const byKind = await q(`select i.kind, count(*) posts, coalesce(sum(s.views),0) views, coalesce(sum(s.likes),0) likes from kz_publications p join kz_content_items i on i.id=p.item_id left join kz_post_stats s on s.publication_id=p.id
        where p.org_id=$1 and p.status='published' and p.published_at > ${since} group by i.kind order by views desc`, [o]);
    const top = await q(`select i.id item_id, i.topic, i.kind, coalesce(s.views,0) views, coalesce(s.likes,0) likes, p.external_url url from kz_publications p join kz_content_items i on i.id=p.item_id left join kz_post_stats s on s.publication_id=p.id
        where p.org_id=$1 and p.status='published' and p.published_at > ${since} order by coalesce(s.views,0) desc limit 5`, [o]);
    return { days, total, byChannel, byKind, top };
  }
  if (name === "factories") {
    return q(`select f.id,f.name,b.name brand,f.brand_id,f.niche,f.product,f.formats,f.schedule,f.status,f.autopublish,f.approval,coalesce((f.brief->>'images')::boolean,false) images,coalesce(array_length(f.channel_ids,1),0) channels,
        (select max(planned_for) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved','ready','scheduled')) plan_until,
        (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='idea') ideas, (select count(*) from kz_content_items i where i.factory_id=f.id and i.status in ('ready','scheduled')) ready
        from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at limit 20`, [o]);
  }
  if (name === "items") {
    const st = ["idea", "approved", "generating", "ready", "scheduled", "published", "failed", "rejected"].includes(String(a.status)) ? String(a.status) : null;
    return q(`select id,kind,topic,status,planned_for,factory_id from kz_content_items where org_id=$1 and ($2::text is null or status=$2) and ($3::uuid is null or factory_id=$3) order by planned_for nulls last, created_at desc limit ${int(a.limit, 10, 1, 25)}`, [o, st, uuid(a.factoryId) || null]);
  }
  if (name === "competitors") {
    const { groupSummaries } = await import("../competitors");
    return (await groupSummaries(o)).map((g) => ({ id: g.id, name: g.name, platforms: g.platforms.map((p) => p.kind), members: g.members, perWeek: g.perWeek, avgViews: g.avgViews, lastPostAt: g.lastPostAt, bestPost: g.best?.body.slice(0, 160) ?? null }));
  }
  if (name === "brands") {
    return q(`select b.id,b.name,b.description,b.audience,b.tone,b.rules,b.kit->>'style' style,b.kit->>'styleNotes' style_notes,b.kit->>'imageMust' image_must,b.kit->>'imageNever' image_never,b.kit->'colors' colors,b.kit->>'logoPos' logo_pos,b.kit->>'logoScale' logo_scale,(select count(*) from kz_factories f where f.brand_id=b.id) factories,(select count(*) from kz_channels c where c.brand_id=b.id and c.status='active') channels from kz_brands b where b.org_id=$1 order by b.created_at limit 20`, [o]);
  }
  if (name === "channels") {
    return q(`select c.id,c.title,c.kind,b.name brand,c.signature from kz_channels c join kz_brands b on b.id=c.brand_id where c.org_id=$1 and c.status='active' order by c.created_at limit 30`, [o]);
  }
  if (name === "plan") {
    const fid = uuid(a.factoryId) || (await one<{ id: string }>("select id from kz_factories where org_id=$1 order by created_at limit 1", [o]))?.id;
    if (!fid) return { items: [] };
    const items = await q(`select id,kind,topic,status,planned_for from kz_content_items where factory_id=$1 and org_id=$2 and status in ('idea','approved','generating','ready','scheduled') and not coalesce((meta->>'draft')::boolean,false) order by planned_for nulls last, created_at limit 10`, [fid, o]);
    return { factoryId: fid, items };
  }
  if (name === "site") return (await import("./setup")).inspectSite(clip(a.url, 300));
  if (name === "search") return (await import("./setup")).webSearch(clip(a.query, 160));
  throw new Error("Неизвестный инструмент");
}

/** Обновление источников: бесплатно, поэтому выполняется сразу. */
export async function runAuto(ctx: ToolCtx, name: string): Promise<unknown> {
  if (name !== "refresh_news") throw new Error("Неизвестный инструмент");
  const src = await q<{ id: string; title: string }>("select id,title from kz_sources where org_id=$1 and status='active' and kind<>'manual' order by last_fetched_at nulls first limit 12", [ctx.orgId]);
  const out: { source: string; added: number; error?: string }[] = [];
  for (let i = 0; i < src.length; i += 4) {
    const rs = await Promise.all(src.slice(i, i + 4).map((s) => pollSource(s.id)));
    rs.forEach((r, j) => out.push({ source: src[i + j].title, added: r.added, error: r.error }));
  }
  return { refreshed: out.length, added: out.reduce((n, r) => n + r.added, 0), failed: out.filter((r) => r.error).length, sources: out };
}

/** Проверка аргументов предложенного действия до показа кнопки: чужие и несуществующие id отбрасываются. */
export async function validateAction(ctx: ToolCtx, name: string, a: Args): Promise<{ ok: true; args: Args; hint: string } | { ok: false }> {
  const o = ctx.orgId;
  if (name === "set_source_status") {
    const s = await one<{ title: string }>("select title from kz_sources where id=$1 and org_id=$2", [uuid(a.sourceId) || null, o]);
    const status = a.status === "paused" ? "paused" : a.status === "active" ? "active" : "";
    return s && status ? { ok: true, args: { sourceId: uuid(a.sourceId), status }, hint: `${s.title}` } : { ok: false };
  }
  if (name === "set_factory") {
    const f = await one<{ name: string }>("select name from kz_factories where id=$1 and org_id=$2", [uuid(a.factoryId) || null, o]);
    if (!f) return { ok: false };
    const args: Args = { factoryId: uuid(a.factoryId) };
    if (typeof a.autopublish === "boolean") args.autopublish = a.autopublish;
    if (a.approval === "manual" || a.approval === "auto") args.approval = a.approval;
    if (typeof a.images === "boolean") args.images = a.images;
    return Object.keys(args).length > 1 ? { ok: true, args, hint: f.name } : { ok: false };
  }
  if (name === "create_from_news") {
    const it = await one<{ title: string }>("select title from kz_feed_items where id=$1 and org_id=$2", [uuid(a.itemId) || null, o]);
    const f = await one<{ name: string }>("select name from kz_factories where id=$1 and org_id=$2", [uuid(a.factoryId) || null, o]);
    const kinds = (Array.isArray(a.kinds) ? a.kinds : ["post"]).map(String).filter((k) => MAKE_KINDS.includes(k)).slice(0, 4);
    return it && f && kinds.length ? { ok: true, args: { itemId: uuid(a.itemId), factoryId: uuid(a.factoryId), kinds, mode: a.mode === "ideas" ? "ideas" : "now" }, hint: `${it.title.slice(0, 80)} → ${f.name}` } : { ok: false };
  }
  if (name === "extend_plan") {
    const f = await one<{ name: string }>("select name from kz_factories where id=$1 and org_id=$2", [uuid(a.factoryId) || null, o]);
    const days = [7, 14, 30].includes(Number(a.days)) ? Number(a.days) : 7;
    return f ? { ok: true, args: { factoryId: uuid(a.factoryId), days }, hint: `${f.name}, ${days} дн.` } : { ok: false };
  }
  return { ok: false };
}

/** Выполнение подтверждённого действия. Аргументы берутся из сохранённого сообщения, а не от браузера. */
export async function runConfirmed(ctx: ToolCtx, name: string, a: Args): Promise<{ ok: boolean; text: string; href?: string }> {
  if (ctx.role === "viewer") return { ok: false, text: "У вашей роли нет прав на это действие" };
  const o = ctx.orgId;
  if (name === "set_source_status") {
    await q("update kz_sources set status=$3 where id=$1 and org_id=$2", [a.sourceId, o, a.status]);
    return { ok: true, text: a.status === "active" ? "Источник включён" : "Источник на паузе", href: "/app/monitor/settings" };
  }
  if (name === "set_factory") {
    const sets: string[] = [], vals: unknown[] = [a.factoryId, o];
    if (typeof a.autopublish === "boolean") { vals.push(a.autopublish); sets.push(`autopublish=$${vals.length}`); }
    if (a.approval) { vals.push(a.approval); sets.push(`approval=$${vals.length}`); }
    if (typeof a.images === "boolean") { vals.push(a.images); sets.push(`brief = brief || jsonb_build_object('images', $${vals.length}::boolean)`); }
    if (sets.length) await q(`update kz_factories set ${sets.join(", ")} where id=$1 and org_id=$2`, vals);
    return { ok: true, text: "Настройки завода сохранены", href: `/app/factories/${a.factoryId}` };
  }
  if (name === "create_from_news") {
    const r = await createFromNews(o, String(a.itemId), String(a.factoryId), (a.kinds as string[]) ?? ["post"], a.mode !== "ideas");
    return r.ok ? { ok: true, text: r.error ? `Создано материалов: ${r.ids.length}. Замечание: ${r.error}` : `Создано материалов: ${r.ids.length}`, href: `/app/factories/${a.factoryId}?view=list&open=${r.ids[0]}` } : { ok: false, text: r.error };
  }
  if (name === "extend_plan") {
    const r = await buildPlan(o, String(a.factoryId), Number(a.days));
    return r.ok ? { ok: true, text: `План продлён на ${a.days} дн.`, href: `/app/factories/${a.factoryId}?view=list` } : { ok: false, text: r.error };
  }
  return { ok: false, text: "Неизвестное действие" };
}

/** Письменные действия (написать, переписать, картинка). Выполняются по прямой просьбе в чате, не по кнопке: результат сразу показывается. */
export async function runAct(ctx: ToolCtx, name: string, a: Args): Promise<import("./setup").SetupResult> {
  if (ctx.role === "viewer") return { ok: false, text: "У вашей роли нет прав на это действие" };
  const w = await import("./writer");
  if (name === "write") return w.writeMaterial(ctx.orgId, a);
  if (name === "rewrite") return w.rewriteMaterial(ctx.orgId, a);
  if (name === "image") return w.imageForMaterial(ctx.orgId, a);
  if (name === "save_brand") return (await import("./setup")).saveBrandInfo(ctx.orgId, a);
  if (name === "save_factory") return (await import("./setup")).saveFactoryInfo(ctx.orgId, a);
  return { ok: false, text: "Неизвестное действие" };
}
