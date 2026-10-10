import { one, q, tx } from "./db";
import { aiReady, genCarousel, genPlan, genPost, type BrandCtx } from "./ai";
import { PRICES, InsufficientFunds, charge, refund } from "./wallet";
import { open } from "./crypto";
import { providerFor, PublishError, SITE_CHANNELS, ARTICLE_ONLY } from "./publishing";
import { pollDue } from "./monitor/service";
import { allocateDates } from "./plan";
import { collectComments, collectMembers, collectStats } from "./engage";
import { genSeoArticle } from "./seo";
import { learnings } from "./engage";
import { cleanSettings, type ContentSettings } from "./postsettings";
import { carouselAssets, prepCover, renderForItem, slideHeight } from "./carousel/service";
import { cleanKit, buildImagePrompt, finalizeImage, generateImage, SIZES } from "./images";
import { loadAsset, processImage, saveAsset } from "./assets";

interface FactoryRow {
  id: string; org_id: string; brand_id: string; name: string; niche: string; product: string; formats: string[];
  description: string; audience: string; tone: string; rules: { forbidden?: string[] }; brand_name: string;
  brief: { images?: boolean }; kit: unknown;
}

export async function loadFactory(orgId: string, id: string): Promise<FactoryRow | null> {
  return one<FactoryRow>(
    `select f.id,f.org_id,f.brand_id,f.name,f.niche,f.product,f.formats,b.description,b.audience,b.tone,b.rules,b.name brand_name,f.brief,b.kit
       from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2`, [id, orgId]);
}
const brandOf = (r: FactoryRow): BrandCtx => ({ name: r.brand_name, description: r.description, audience: r.audience, tone: r.tone, forbidden: r.rules?.forbidden ?? [] });

/** Цена материала. У карусели к базе добавляется обложка нейросетью, если она включена в настройках завода. */
export const priceOf = (kind: string, brief?: unknown) =>
  kind === "carousel" ? PRICES.carousel + (cleanSettings(brief).carouselCover === "ai" ? PRICES.image : 0) : kind === "article" ? PRICES.article : kind === "reels" ? PRICES.reels : kind === "seo" ? PRICES.seo : PRICES.post;

export type Result = { ok: true } | { ok: false; error: string };

/** План: списание → генерация → при ошибке возврат. */
export async function buildPlan(orgId: string, factoryId: string, days: number): Promise<Result> {
  const fac = await loadFactory(orgId, factoryId);
  if (!fac) return { ok: false, error: "Завод не найден" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const cost = PRICES.plan_day * days;
  try { await charge(orgId, cost, `Контент-план на ${days} дн.`, factoryId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const used = (await q<{ topic: string }>("select topic from kz_content_items where factory_id=$1 order by created_at desc limit 60", [factoryId])).map((x) => x.topic);
    const ideas = await genPlan(brandOf(fac), fac.product, fac.niche, fac.formats, days, used, await settingsFor(orgId, fac));
    // продолжаем с дня после последнего запланированного и только в дни публикации завода
    const dates = await allocateDates(factoryId, ideas.length);
    await tx(async (run) => {
      for (let i = 0; i < ideas.length; i++) {
        await run("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,meta) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [orgId, factoryId, fac.brand_id, ideas[i].kind, ideas[i].topic, ideas[i].hook, dates[i], JSON.stringify(ideas[i].type ? { postType: ideas[i].type } : {})]);
      }
    });
    return { ok: true };
  } catch (e) {
    await refund(orgId, cost, "ошибка генерации плана", factoryId);
    return { ok: false, error: `Генерация не удалась, деньги возвращены: ${(e as Error).message}` };
  }
}

/** Настройки завода + выводы из статистики прошлых публикаций бренда (если самообучение включено и данных достаточно). Сбой сбора не мешает генерации. */
async function settingsFor(orgId: string, fac: { brand_id: string; brief: unknown }): Promise<ContentSettings> {
  const st = cleanSettings(fac.brief);
  if (st.learn) { try { st.learnings = await learnings(orgId, fac.brand_id); } catch { /* без выводов */ } }
  return st;
}

/** Описания референсов и фото продукта бренда — они попадают в промпт картинки как «видение стиля». */
async function brandNotes(orgId: string, brandId: string) {
  const rows = await q<{ kind: "reference" | "product"; note: string }>(
    "select kind,note from kz_assets where org_id=$1 and brand_id=$2 and kind in ('reference','product') and note<>'' order by created_at limit 8", [orgId, brandId]);
  return rows.map((n) => ({ kind: n.kind, text: n.note }));
}

/** Материал: атомарный захват (два воркера не спишут деньги дважды) → списание → генерация. */
export async function buildItem(orgId: string, itemId: string): Promise<Result> {
  const item = await one<{ id: string; factory_id: string; kind: string; topic: string; hook: string; meta: { source?: { title: string; body: string; url: string }; postType?: string } }>(
    `update kz_content_items set status='generating', updated_at=now()
      where id=$1 and org_id=$2 and status in ('idea','approved','failed') and factory_id is not null
      returning id,factory_id,kind,topic,hook,meta`, [itemId, orgId]);
  if (!item) return { ok: false, error: "Материал уже обрабатывается или недоступен" };
  const revert = () => q("update kz_content_items set status='approved', updated_at=now() where id=$1", [item.id]);
  if (!aiReady()) { await revert(); return { ok: false, error: "AI Gateway не настроен" }; }
  const fac = await loadFactory(orgId, item.factory_id);
  if (!fac) { await revert(); return { ok: false, error: "Завод не найден" }; }
  const cost = priceOf(item.kind, fac.brief);
  let refundable = cost; // сколько вернуть при сбое: часть (обложка) может быть уже возвращена отдельно
  try { await charge(orgId, cost, `Генерация: ${item.topic.slice(0, 60)}`, item.id); }
  catch (e) { await revert(); if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  await q("update kz_content_items set cost_kop=$2 where id=$1", [item.id, cost]);
  try {
    if (item.kind === "seo") {
      // тема идеи — поисковый запрос, хук — угол статьи; тело — готовый HTML, SEO-поля — в meta.seo
      const art = await genSeoArticle(brandOf(fac), fac.product, fac.niche, item.topic, item.hook, item.meta?.source);
      await q("update kz_content_items set body=$2,meta = (meta-'client') || jsonb_build_object('seo',$3::jsonb),status='ready',updated_at=now() where id=$1", [item.id, art.html, JSON.stringify(art.meta)]);
    } else if (item.kind === "carousel") {
      // тексты слайдов — структурой от нейросети, сами картинки набираем и рисуем у себя (кириллица на картинках нейросетей искажается)
      const st = await settingsFor(orgId, fac);
      const car = await genCarousel(brandOf(fac), fac.product, fac.niche, item.topic, item.hook, st.slides, st, item.meta?.source, item.meta?.postType);
      let cover: Buffer | null = null;
      if (st.carouselCover === "ai") {
        try {
          const kit = cleanKit(fac.kit);
          const prompt = await buildImagePrompt({ brandName: fac.brand_name, kit, topic: car.slides[0].title, hook: car.slides[0].body, body: car.caption, notes: await brandNotes(orgId, fac.brand_id) });
          cover = await prepCover(await generateImage(prompt, st.carouselFormat === "portrait" ? "portrait" : "square"), slideHeight(st.carouselFormat));
        } catch (e) {
          // обложка — необязательная часть: карусель делаем без неё и возвращаем деньги за обложку
          await refund(orgId, PRICES.image, "обложка не создана, карусель сделана без неё", item.id);
          refundable -= PRICES.image;
          await q("update kz_content_items set meta=meta || jsonb_build_object('imageError',$2::text) where id=$1", [item.id, `Обложка нейросетью не создана: ${(e as Error).message}`.slice(0, 300)]);
        }
      }
      await renderForItem(orgId, item.id, car.slides, st.carouselStyle, cover);
      await q("update kz_content_items set body=$2,meta=meta-'client',status='ready',updated_at=now() where id=$1", [item.id, car.caption]);
    } else {
      const body = await genPost(brandOf(fac), fac.product, fac.niche, item.topic, item.hook, item.kind, item.meta?.source, await settingsFor(orgId, fac), item.meta?.postType);
      await q("update kz_content_items set body=$2,meta=meta-'client',status='ready',updated_at=now() where id=$1", [item.id, body]);
    }
    // картинка не обязательна для результата: её сбой не должен ронять уже готовый и оплаченный текст (у карусели свои слайды)
    if (fac.brief?.images && item.kind !== "carousel") {
      const im = await buildImage(orgId, item.id);
      if (!im.ok) await q("update kz_content_items set meta=meta || jsonb_build_object('imageError',$2::text) where id=$1", [item.id, im.error]);
    }
    return { ok: true };
  } catch (e) {
    await refund(orgId, refundable, "ошибка генерации текста", item.id);
    await q("update kz_content_items set status='failed',cost_kop=0,updated_at=now() where id=$1", [item.id]);
    return { ok: false, error: (e as Error).message };
  }
}

/** Обложка карусели: «ai» — новый фон нейросетью (платно, при сбое возврат), «none» — убрать фон и вернуться к цветной обложке. */
export async function setCarouselCover(orgId: string, itemId: string, mode: "ai" | "none"): Promise<Result> {
  const it = await one<{ brand_id: string; status: string; meta: { carousel?: { slides: { title: string; body: string }[]; style: "brand" | "light" | "dark" } } }>(
    "select brand_id,status,meta from kz_content_items where id=$1 and org_id=$2 and kind='carousel'", [itemId, orgId]);
  if (!it?.meta?.carousel) return { ok: false, error: "Карусель не найдена" };
  if (!["idea", "approved", "ready", "failed"].includes(it.status)) return { ok: false, error: "Эту карусель сейчас нельзя изменить" };
  const { slides, style } = it.meta.carousel;
  if (mode === "none") { await renderForItem(orgId, itemId, slides, style, null); return { ok: true }; }
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const brand = await one<{ name: string; kit: unknown; brief: unknown }>(
    "select b.name,b.kit,f.brief from kz_brands b left join kz_factories f on f.id=(select factory_id from kz_content_items where id=$3) where b.id=$1 and b.org_id=$2", [it.brand_id, orgId, itemId]);
  if (!brand) return { ok: false, error: "Бренд не найден" };
  const st = cleanSettings(brand.brief), cost = PRICES.image;
  try { await charge(orgId, cost, "Обложка карусели", itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const prompt = await buildImagePrompt({ brandName: brand.name, kit: cleanKit(brand.kit), topic: slides[0].title, hook: slides[0].body, body: "", notes: await brandNotes(orgId, it.brand_id) });
    const cover = await prepCover(await generateImage(prompt, st.carouselFormat === "portrait" ? "portrait" : "square"), slideHeight(st.carouselFormat));
    await renderForItem(orgId, itemId, slides, style, cover);
    return { ok: true };
  } catch (e) { await refund(orgId, cost, "ошибка обложки карусели", itemId); return { ok: false, error: `Обложка не создана, деньги возвращены: ${(e as Error).message}` }; }
}

/**
 * Картинка к материалу. Захват через meta.imageBusy защищает от двойного клика и параллельного воркера: без него
 * списалось бы дважды. Любой сбой после списания — возврат денег.
 */
export async function buildImage(orgId: string, itemId: string, customPrompt?: string): Promise<Result> {
  const it = await one<{ id: string; brand_id: string; topic: string; hook: string; body: string; image_id: string | null }>(
    `update kz_content_items set meta = meta || jsonb_build_object('imageBusy', extract(epoch from now())::bigint), updated_at=now()
      where id=$1 and org_id=$2 and ((meta->>'imageBusy') is null or (meta->>'imageBusy')::bigint < extract(epoch from now())::bigint - 300)
      returning id,brand_id,topic,hook,body,image_id`, [itemId, orgId]);
  if (!it) return { ok: false, error: "Картинка уже создаётся или материал недоступен" };
  const release = () => q("update kz_content_items set meta = meta - 'imageBusy' where id=$1", [it.id]);
  const brand = await one<{ name: string; kit: unknown }>("select name,kit from kz_brands where id=$1 and org_id=$2", [it.brand_id, orgId]);
  if (!brand) { await release(); return { ok: false, error: "Бренд не найден" }; }
  const cost = PRICES.image;
  try { await charge(orgId, cost, `Картинка: ${it.topic.slice(0, 50)}`, it.id); }
  catch (e) { await release(); if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const kit = cleanKit(brand.kit);
    let prompt = customPrompt?.trim();
    if (!prompt) {
      prompt = await buildImagePrompt({ brandName: brand.name, kit, topic: it.topic, hook: it.hook, body: it.body, notes: await brandNotes(orgId, it.brand_id) });
    }
    const raw = await generateImage(prompt, kit.aspect ?? "square");
    const logo = await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, it.brand_id]);
    const done = await finalizeImage(raw, logo ? await loadAsset(orgId, logo.id) : null, kit);
    const assetId = await saveAsset(orgId, it.brand_id, "generated", `${it.topic.slice(0, 60)}.jpg`, done);
    await q("update kz_content_items set image_id=$2, meta = (meta - 'imageBusy' - 'imageError') || jsonb_build_object('imagePrompt',$3::text), updated_at=now() where id=$1", [it.id, assetId, prompt]);
    if (it.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [it.image_id, orgId]); // прежняя версия не копится в БД
    return { ok: true };
  } catch (e) {
    await refund(orgId, cost, "ошибка генерации картинки", it.id);
    await release();
    return { ok: false, error: `Картинка не создана, деньги возвращены: ${(e as Error).message}` };
  }
}

/** Ставит материал в очередь на все каналы завода. Повтор для упавшей публикации — переводит её обратно в queued. */
export async function enqueue(orgId: string, itemId: string): Promise<Result> {
  const row = await one<{ factory_id: string; channel_ids: string[]; body: string; status: string; kind: string }>(
    `select i.factory_id,f.channel_ids,i.body,i.status,i.kind from kz_content_items i join kz_factories f on f.id=i.factory_id
      where i.id=$1 and i.org_id=$2`, [itemId, orgId]);
  if (!row) return { ok: false, error: "Материал не найден" };
  if (!row.body.trim()) return { ok: false, error: "Нет текста для публикации" };
  if (!["ready", "scheduled", "failed"].includes(row.status)) return { ok: false, error: "Материал не готов к публикации" };
  // SEO-статьи идут только на сайты (WordPress, webhook), обычные посты — только в соцсети
  const chans = await q<{ id: string }>("select id from kz_channels where org_id=$1 and status='active' and id = any($2::uuid[]) and (case when $4::boolean then kind = any($3::text[]) else not (kind = any($5::text[])) end)", [orgId, row.channel_ids, SITE_CHANNELS, row.kind === "seo", ARTICLE_ONLY]);
  if (!chans.length) return { ok: false, error: row.kind === "seo" ? "Для SEO-статей подключите канал WordPress или Webhook и выберите его в настройках публикации завода" : "У завода не выбраны каналы публикации (для постов — Telegram, VK, MAX или Webhook)" };
  await tx(async (run) => {
    for (const ch of chans) {
      await run(`insert into kz_publications(org_id,item_id,channel_id) values($1,$2,$3)
                 on conflict(item_id,channel_id) do update set status='queued',error=null,attempts=0,next_attempt_at=now(),updated_at=now()
                 where kz_publications.status='failed'`, [orgId, itemId, ch.id]);
    }
    await run("update kz_content_items set status='scheduled', scheduled_at=coalesce(scheduled_at,now()), updated_at=now() where id=$1", [itemId]);
  });
  return { ok: true };
}

const MAX_ATTEMPTS = 3;

/** Отправка очереди. Строки захватываются `for update skip locked` — параллельные тики не пересекаются. */
export async function processQueue(limit = 10, onlyItem?: string): Promise<{ sent: number; failed: number; retried: number }> {
  // зависшие в sending (функцию убили по таймауту) возвращаем в очередь
  await q("update kz_publications set status='queued', updated_at=now() where status='sending' and updated_at < now() - interval '10 minutes'");
  const jobs = await q<{ id: string; org_id: string; item_id: string; channel_id: string; attempts: number }>(
    `update kz_publications set status='sending', attempts=attempts+1, updated_at=now()
      where id in (select id from kz_publications where status='queued' and next_attempt_at <= now() and not exists (select 1 from kz_orgs so where so.id=kz_publications.org_id and so.suspended) ${onlyItem ? "and item_id=$2" : ""}
                    order by next_attempt_at limit $1 for update skip locked)
      returning id,org_id,item_id,channel_id,attempts`, onlyItem ? [limit, onlyItem] : [limit]);
  const out = { sent: 0, failed: 0, retried: 0 };
  for (const j of jobs) {
    const ch = await one<{ kind: string; credentials: unknown }>("select kind,credentials from kz_channels where id=$1 and org_id=$2", [j.channel_id, j.org_id]);
    const item = await one<{ body: string; image_id: string | null; kind: string; meta: { seo?: { title: string; description: string; slug: string; keywords: string[] } } }>("select body,image_id,kind,meta from kz_content_items where id=$1", [j.item_id]);
    const img = item?.image_id && item.kind !== "carousel" ? await loadAsset(j.org_id, item.image_id) : null;
    // карусель: все слайды по порядку (загружаем только своими файлами организации)
    const slides = item?.kind === "carousel" ? (await Promise.all((await carouselAssets(j.item_id)).map((a) => loadAsset(j.org_id, a.id)))).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ data: a.data, mime: a.mime })) : [];
    try {
      const prov = ch && providerFor(ch.kind);
      if (!ch || !prov) throw new PublishError("Канал удалён или не поддерживается");
      const r = await prov.publish({ text: item?.body ?? "", image: img ? { data: img.data, mime: img.mime } : undefined, images: slides.length ? slides : undefined, article: item?.kind === "seo" && item.meta?.seo ? { ...item.meta.seo, keywords: item.meta.seo.keywords ?? [], html: item.body } : undefined }, open(ch.credentials));
      await q("update kz_publications set status='published', external_url=$2, error=$3, published_at=now(), updated_at=now() where id=$1", [j.id, r.url, r.warning ?? null]);
      out.sent++;
    } catch (e) {
      const retryable = e instanceof PublishError ? e.retryable : true;
      const msg = (e as Error).message.slice(0, 500);
      if (retryable && j.attempts < MAX_ATTEMPTS) {
        await q("update kz_publications set status='queued', error=$2, next_attempt_at=now()+($3||' minutes')::interval, updated_at=now() where id=$1", [j.id, msg, String(5 * j.attempts)]);
        out.retried++;
      } else {
        await q("update kz_publications set status='failed', error=$2, updated_at=now() where id=$1", [j.id, msg]);
        out.failed++;
      }
    }
    await settleItem(j.item_id);
  }
  return out;
}

/** Итог по материалу: хоть одна публикация ушла → published; все упали → обратно в ready (можно повторить). */
async function settleItem(itemId: string) {
  const s = await one<{ pending: string; ok: string; bad: string }>(
    `select count(*) filter (where status in ('queued','sending')) pending, count(*) filter (where status='published') ok,
            count(*) filter (where status='failed') bad from kz_publications where item_id=$1`, [itemId]);
  if (!s || Number(s.pending) > 0) return;
  if (Number(s.ok) > 0) await q("update kz_content_items set status='published', updated_at=now() where id=$1", [itemId]);
  else if (Number(s.bad) > 0) await q("update kz_content_items set status='ready', scheduled_at=null, updated_at=now() where id=$1", [itemId]);
}

function nowIn(tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, dow, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export interface TickReport { stats: number; comments: number; sources: number; fetched: number; generated: number; planned: number; queued: number; sent: number; failed: number; retried: number; reaped: number; errors: string[] }

/** Один проход воркера. Вызывается внешним планировщиком каждые ~5 минут (/api/cron/tick). */
export async function tick(budgetMs = 200_000): Promise<TickReport> {
  const t0 = Date.now();
  const rep: TickReport = { stats: 0, comments: 0, sources: 0, fetched: 0, generated: 0, planned: 0, queued: 0, sent: 0, failed: 0, retried: 0, reaped: 0, errors: [] };

  // 0) застрявшие генерации (функцию убили посреди запроса): возврат денег и статус failed
  const stuck = await q<{ id: string; org_id: string; cost_kop: number }>(
    "update kz_content_items set status='failed', cost_kop=0, updated_at=now() where status='generating' and updated_at < now() - interval '10 minutes' returning id,org_id,cost_kop");
  for (const s of stuck) { if (s.cost_kop > 0) await refund(s.org_id, s.cost_kop, "генерация зависла", s.id); rep.reaped++; }

  // 1) полный автомат: одобряем идеи заводов с approval=auto
  await q(`update kz_content_items i set status='approved', updated_at=now() from kz_factories f
            where i.factory_id=f.id and f.status='active' and f.approval='auto' and i.status='idea' and not exists (select 1 from kz_orgs so where so.id=f.org_id and so.suspended)`);

  // 2) автопополнение плана: у автозаводов осталось меньше 3 идей вперёд — докидываем 7 дней (с баланса организации)
  const low = await q<{ id: string; org_id: string }>(
    `select f.id,f.org_id from kz_factories f where f.status='active' and f.approval='auto' and f.autopublish and not exists (select 1 from kz_orgs so where so.id=f.org_id and so.suspended)
        and (select count(*) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved') and i.planned_for >= current_date) < 3
        and (select balance_kop >= $1 or unlimited from kz_orgs o where o.id=f.org_id) limit 3`, [PRICES.plan_day * 7]);
  for (const f of low) {
    if (Date.now() - t0 > budgetMs) break;
    const r = await buildPlan(f.org_id, f.id, 7);
    if (r.ok) rep.planned++; else rep.errors.push(`plan ${f.id}: ${r.error}`);
  }

  // 3) генерация одобренных материалов, срок которых настал. Берём только тех, у кого хватает денег — иначе один
  //    пустой баланс занимал бы очередь всех остальных.
  const todo = await q<{ id: string; org_id: string }>(
    `select i.id,i.org_id from kz_content_items i join kz_factories f on f.id=i.factory_id join kz_orgs o on o.id=i.org_id
      where f.status='active' and not o.suspended and i.status='approved' and i.planned_for <= current_date + 1
        and (o.unlimited or o.balance_kop >= case i.kind when 'carousel' then $1::int when 'article' then $2::int when 'reels' then $3::int else $4::int end)
      order by i.planned_for limit 4`, [PRICES.carousel + PRICES.image, PRICES.article, PRICES.reels, PRICES.post]);
  for (const it of todo) {
    if (Date.now() - t0 > budgetMs - 60_000) break;
    const r = await buildItem(it.org_id, it.id);
    if (r.ok) rep.generated++; else rep.errors.push(`item ${it.id}: ${r.error}`);
  }

  // 4) расписание автопубликации: сколько слотов дня уже прошло минус сколько уже опубликовано/запланировано сегодня
  const facs = await q<{ id: string; org_id: string; schedule: { days: number[]; times: string[]; tz: string } }>(
    "select id,org_id,schedule from kz_factories where status='active' and autopublish and cardinality(channel_ids)>0 and not exists (select 1 from kz_orgs so where so.id=kz_factories.org_id and so.suspended)");
  for (const f of facs) {
    const tz = f.schedule.tz || "Europe/Moscow";
    const n = nowIn(tz);
    if (!f.schedule.days.includes(n.dow)) continue;
    const passed = f.schedule.times.filter((t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m <= n.minutes; }).length;
    const done = Number((await one<{ c: string }>(
      "select count(*) c from kz_content_items where factory_id=$1 and scheduled_at is not null and (scheduled_at at time zone $2)::date = $3::date", [f.id, tz, n.date]))!.c);
    const slots = passed - done;
    if (slots <= 0) continue;
    const ready = await q<{ id: string }>("select id from kz_content_items where factory_id=$1 and status='ready' and planned_for <= $2::date order by planned_for limit $3", [f.id, n.date, slots]);
    for (const r of ready) { const e = await enqueue(f.org_id, r.id); if (e.ok) rep.queued++; else rep.errors.push(`enqueue ${r.id}: ${e.error}`); }
  }

  // 4.5) мониторинг: опрос источников, давно не обновлявшихся
  try { const p = await pollDue(8); rep.sources = p.polled; rep.fetched = p.added; } catch (e) { rep.errors.push(`monitor: ${(e as Error).message}`); }

  // статистика опубликованных постов и новые комментарии (сбой площадки не должен ронять остальной проход)
  try { const s = await collectStats(40); rep.stats = s.updated; rep.errors.push(...s.errors.slice(0, 3)); } catch (e) { rep.errors.push(`stats: ${(e as Error).message}`); }
  try { const m = await collectMembers(20); rep.errors.push(...m.errors.slice(0, 2)); } catch (e) { rep.errors.push(`members: ${(e as Error).message}`); }
  try { const c = await collectComments(15); rep.comments = c.added; rep.errors.push(...c.errors.slice(0, 3)); } catch (e) { rep.errors.push(`comments: ${(e as Error).message}`); }

  // сгенерированные картинки, на которые больше ничего не ссылается (материал удалён), не копим в БД
  await q("delete from kz_assets a where a.kind='generated' and a.item_id is null and a.created_at < now() - interval '1 hour' and not exists (select 1 from kz_content_items i where i.image_id=a.id)").catch(() => {});

  // 5) отправка очереди
  const s = await processQueue(15);
  rep.sent = s.sent; rep.failed = s.failed; rep.retried = s.retried;
  // отчёт последнего прохода — для раздела «Система» в админке платформы (виден, работает ли cron)
  await q("insert into kz_kv(key,value) values('last_tick',$1) on conflict(key) do update set value=excluded.value, updated_at=now()", [JSON.stringify({ ...rep, ms: Date.now() - t0 })]).catch(() => {});
  return rep;
}
