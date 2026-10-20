import { one, q, tx } from "./db";
import { aiReady, brandBlock, chat, extractArray, extractObject } from "./ai";
import { allocateDates } from "./plan";
import { brandOf, loadFactory, settingsFor } from "./pipeline";
import { InsufficientFunds, PRICES, charge, refund } from "./wallet";
import { cleanAngles } from "./repurpose";
export { textForChannel } from "./growth-lite";

type Result = { ok: true; added?: number } | { ok: false; error: string };

/**
 * «Сделай ещё в духе этого»: по материалу, который сработал, предлагаем N новых тем с другим углом, но с той же причиной успеха.
 * Идеи ложатся в план как обычно. Платим за идеи (PRICES.idea за штуку), при сбое возврат.
 */
export async function moreLikeThis(orgId: string, itemId: string, count: number): Promise<Result> {
  const n = Math.min(10, Math.max(2, Math.round(count) || 5));
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const it = await one<{ factory_id: string; brand_id: string; kind: string; topic: string; hook: string; body: string; views: number | null }>(
    `select i.factory_id,i.brand_id,i.kind,i.topic,i.hook,i.body,(select max(s.views) from kz_publications p join kz_post_stats s on s.publication_id=p.id where p.item_id=i.id) views
       from kz_content_items i where i.id=$1 and i.org_id=$2 and i.factory_id is not null`, [itemId, orgId]);
  if (!it) return { ok: false, error: "Материал не найден" };
  const fac = await loadFactory(orgId, it.factory_id);
  if (!fac) return { ok: false, error: "Завод не найден" };
  const kinds = fac.formats.filter((k) => ["post", "carousel", "story", "poll", "contest", "infographic"].includes(k));
  if (!kinds.length) return { ok: false, error: "У завода нет форматов для постов, каруселей или опросов" };
  const cost = PRICES.idea * n;
  try { await charge(orgId, cost, `Ещё ${n} идей в духе материала`, itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const st = await settingsFor(orgId, fac);
    const used = (await q<{ topic: string }>("select topic from kz_content_items where factory_id=$1 order by created_at desc limit 40", [it.factory_id])).map((x) => x.topic);
    const system = "Ты контент-стратег. Отвечай ТОЛЬКО валидным JSON-массивом, без пояснений и без markdown.";
    const user = `${brandBlock(brandOf(fac, it.topic), fac.product, fac.niche)}\nУспешный материал${it.views ? ` (${it.views} просмотров)` : ""}:\nТема: ${it.topic}\nХук: ${it.hook}\n${it.body.slice(0, 1500)}\n\n` +
      `Сначала пойми, почему он мог сработать (боль аудитории, формат, угол, интрига). Предложи ровно ${n} новых материалов в том же духе: та же причина успеха, но другие темы и углы, без повторов самого материала.\n` +
      `Допустимые форматы: ${kinds.join(", ")}; предпочитай формат "${kinds.includes(it.kind) ? it.kind : kinds[0]}".\n` +
      (used.length ? `Уже есть в плане, не повторять:\n- ${used.slice(0, 40).join("\n- ")}\n` : "") +
      (st.learnings ? `${st.learnings}\n` : "") +
      `Формат ответа: [{"topic":"...","hook":"цепляющая первая строка","kind":"${kinds[0]}","angle":"чем отличается от исходного"}]`;
    let angles: ReturnType<typeof cleanAngles> | null = null;
    for (let a = 0; a < 2 && !angles?.length; a++) {
      const arr = extractArray(await chat("idea", system, a ? user + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON. Верни только JSON-массив." : user, { maxTokens: 3000, temperature: 0.7, timeoutMs: 50_000 }));
      angles = arr ? cleanAngles(arr, kinds, [], n) : null;
    }
    if (!angles?.length) throw new Error("Модель не вернула идеи");
    const dates = await allocateDates(it.factory_id, angles.length);
    await tx(async (run) => {
      for (let i = 0; i < angles!.length; i++) {
        await run("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,meta) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [orgId, it.factory_id, it.brand_id, angles![i].kind, angles![i].topic, angles![i].hook, dates[i], JSON.stringify({ similarTo: itemId })]);
      }
    });
    if (angles.length < n) await refund(orgId, PRICES.idea * (n - angles.length), "получено меньше идей", itemId);
    return { ok: true, added: angles.length };
  } catch (e) {
    await refund(orgId, cost, "ошибка подбора идей", itemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

/* ───────── A/B-тест ───────── */
const AB_KINDS = ["post", "story", "contest"];

/**
 * Вариант Б того же поста: те же факты, другой заход (первое предложение, подача). Выходит на день позже варианта А в те же каналы;
 * сравнение просмотров показывается, когда оба прожили не меньше суток. Платим как за пост.
 */
export async function createVariant(orgId: string, itemId: string, date?: string): Promise<Result> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const it = await one<{ factory_id: string; brand_id: string; kind: string; topic: string; hook: string; body: string; planned_for: string | null; meta: { ab?: { group: string; variant: string } } }>(
    "select factory_id,brand_id,kind,topic,hook,body,to_char(planned_for,'YYYY-MM-DD') planned_for,meta from kz_content_items where id=$1 and org_id=$2 and factory_id is not null and status in ('ready','scheduled','published')", [itemId, orgId]);
  if (!it) return { ok: false, error: "Вариант можно сделать у готового или опубликованного материала" };
  if (!AB_KINDS.includes(it.kind)) return { ok: false, error: "A/B-тест доступен для постов, сторис и конкурсов" };
  if (it.meta?.ab) return { ok: false, error: "У этого материала уже есть A/B-вариант" };
  const bDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (bDate && bDate < new Date().toISOString().slice(0, 10)) return { ok: false, error: "Дата выхода варианта Б не может быть в прошлом" };
  if (!it.body.trim()) return { ok: false, error: "У материала нет текста" };
  const fac = await loadFactory(orgId, it.factory_id);
  if (!fac) return { ok: false, error: "Завод не найден" };
  try { await charge(orgId, PRICES.post, `A/B-вариант: ${it.topic.slice(0, 50)}`, itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const body = (await chat("post",
      "Ты редактор бренда. Перепиши пост так, чтобы получился вариант Б для A/B-теста: те же факты, смысл и призыв, но другой заход (иной первый абзац, другая интонация подачи) и другая структура. Не копируй формулировки варианта А. Не выдумывай новых фактов. Верни только текст поста.",
      `${brandBlock(brandOf(fac, it.topic), fac.product, fac.niche)}\nВариант А:\n${it.body.slice(0, 3500)}\n\nНапиши вариант Б.`, { maxTokens: 1500, temperature: 0.85, timeoutMs: 45_000 })).trim();
    if (body.length < 30) throw new Error("пустой ответ модели");
    // дата выхода варианта Б: выбранная пользователем или на день позже варианта А
    const base = it.planned_for ? new Date(it.planned_for + "T12:00:00") : new Date();
    base.setDate(base.getDate() + 1);
    const when = bDate ?? base.toISOString().slice(0, 10);
    const bId = await tx(async (run) => {
      const [b] = await run<{ id: string }>(
        "insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,body,planned_for,status,meta,cost_kop) values($1,$2,$3,$4,$5,$6,$7,$8,'ready',$9,$10) returning id",
        [orgId, it.factory_id, it.brand_id, it.kind, `${it.topic} (вариант Б)`.slice(0, 300), it.hook, body, when, JSON.stringify({ ab: { group: itemId, variant: "B" } }), PRICES.post]);
      await run("update kz_content_items set meta = meta || jsonb_build_object('ab', jsonb_build_object('group',$2::text,'variant','A','pair',$3::text)) where id=$1", [itemId, itemId, b.id]);
      await run("update kz_content_items set meta = jsonb_set(meta,'{ab,pair}', to_jsonb($2::text)) where id=$1", [b.id, itemId]);
      return b.id;
    });
    void bId;
    return { ok: true };
  } catch (e) {
    await refund(orgId, PRICES.post, "ошибка A/B-варианта", itemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

export interface AbResult { aViews: number | null; bViews: number | null; ready: boolean; winner: "A" | "B" | "tie" | null; diffPct: number | null; aId: string; bId: string; aDate: string | null; bDate: string | null; bStatus: string | null }

/** Сравнение вариантов A и B: честно только когда оба опубликованы не меньше суток назад (иначе у раннего больше времени набрать просмотры). */
export async function abResult(orgId: string, itemId: string): Promise<AbResult | null> {
  const me = await one<{ meta: { ab?: { variant: string; pair?: string } } }>("select meta from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
  const ab = me?.meta?.ab;
  if (!ab?.pair) return null;
  const aId = ab.variant === "A" ? itemId : ab.pair, bId = ab.variant === "B" ? itemId : ab.pair;
  const stat = async (id: string) => one<{ views: string | null; age: string | null }>(
    `select sum(s.views) views, extract(epoch from now() - min(p.published_at))/3600 age from kz_publications p left join kz_post_stats s on s.publication_id=p.id
      where p.item_id=$1 and p.org_id=$2 and p.status='published'`, [id, orgId]);
  const [a, b] = await Promise.all([stat(aId), stat(bId)]);
  const dates = await q<{ id: string; d: string | null; status: string }>("select id,to_char(planned_for,'YYYY-MM-DD') d,status from kz_content_items where org_id=$1 and id = any($2::uuid[])", [orgId, [aId, bId]]);
  const dOf = (id: string) => dates.find((x) => x.id === id);
  const av = a?.views != null ? Number(a.views) : null, bv = b?.views != null ? Number(b.views) : null;
  const ready = av != null && bv != null && Number(a?.age ?? 0) >= 24 && Number(b?.age ?? 0) >= 24;
  let winner: AbResult["winner"] = null, diffPct: number | null = null;
  if (ready && av != null && bv != null) {
    const hi = Math.max(av, bv), lo = Math.min(av, bv);
    diffPct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : null;
    winner = hi === 0 || (lo > 0 && (hi - lo) / lo < 0.1) ? "tie" : av > bv ? "A" : "B"; // разница меньше 10% — считаем ничьей
  }
  return { aViews: av, bViews: bv, ready, winner, diffPct, aId, bId, aDate: dOf(aId)?.d ?? null, bDate: dOf(bId)?.d ?? null, bStatus: dOf(bId)?.status ?? null };
}

/* ───────── версии под площадки ───────── */
export const VARIANT_LABEL: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX", short: "Короткая версия (до 280 знаков)", reels: "Сценарий ролика (20 секунд)" };

const VARIANT_SPEC: Record<string, string> = {
  telegram: "Telegram: живо, короткие абзацы, можно 1–3 эмодзи, до 900 знаков",
  vk: "ВКонтакте: чуть подробнее и дружелюбнее, до 1200 знаков",
  max: "MAX: компактно, до 600 знаков",
  short: "Короткая версия: одна мысль до 280 знаков, для X, Threads, сторис",
  reels: "Сценарий ролика на 20 секунд: хук, 3 кадра с текстом на экране, призыв",
};

/** Разбор ответа вида «### telegram … ### vk …». Терпим к регистру, markdown и лишним словам; запасной путь — JSON. */
function parseVariants(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(VARIANT_SPEC);
  const re = new RegExp(`^[#*\\s>-]*(${keys.join("|")})[*\\s:#-]*$`, "gim");
  const marks = [...text.matchAll(re)];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index! + marks[i][0].length, end = i + 1 < marks.length ? marks[i + 1].index! : text.length;
    const t = text.slice(start, end).replace(/^[\s`]+|[\s`]+$/g, "").slice(0, 4000);
    if (t) out[marks[i][1].toLowerCase()] = t;
  }
  if (!Object.keys(out).length) {
    const o = extractObject(text);
    if (o) for (const k of keys) { const t = typeof o[k] === "string" ? (o[k] as string).trim().slice(0, 4000) : ""; if (t) out[k] = t; }
  }
  return out;
}

/**
 * Версии поста под площадки: каждая со своей подачей (Telegram — живее и с абзацами, ВК — чуть подробнее, MAX — компактнее),
 * плюс короткая и сценарий ролика для ручного использования. При публикации в канал берётся версия его площадки.
 * Ответ модели — размеченный текст, а не JSON: в JSON переносы строк внутри абзацев ломали разбор, и версии «не создавались».
 * only — пересоздать одну площадку (дешевле).
 */
export async function genVariants(orgId: string, itemId: string, only?: string): Promise<Result> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const it = await one<{ factory_id: string; kind: string; topic: string; body: string; status: string; meta: { variants?: Record<string, string> } }>(
    "select factory_id,kind,topic,body,status,meta from kz_content_items where id=$1 and org_id=$2 and factory_id is not null", [itemId, orgId]);
  if (!it || !it.body.trim()) return { ok: false, error: "Сначала создайте текст материала" };
  if (!["post", "story", "contest"].includes(it.kind)) return { ok: false, error: "Версии доступны для постов, сторис и конкурсов" };
  if (["generating", "published"].includes(it.status)) return { ok: false, error: "Материал уже публикуется или опубликован" };
  if (only && !VARIANT_SPEC[only]) return { ok: false, error: "Неизвестная площадка" };
  const fac = await loadFactory(orgId, it.factory_id);
  if (!fac) return { ok: false, error: "Завод не найден" };
  const cost = only ? Math.round(PRICES.variants / 3) : PRICES.variants;
  try { await charge(orgId, cost, `Версии под площадки: ${it.topic.slice(0, 50)}`, itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const want = only ? [only] : Object.keys(VARIANT_SPEC);
    const sys = "Ты редактор бренда. Пиши по-русски. Факты, ссылки и призыв из исходного поста сохраняй, ничего не выдумывай. Отвечай только версиями в заданном формате, без пояснений.";
    const ask = (keys: string[], retry = false) => `${brandBlock(brandOf(fac, it.topic), fac.product, fac.niche)}\nИсходный пост:\n${it.body.slice(0, 3500)}\n\n` +
      `Сделай версии этого поста:\n${keys.map((k) => `- ${k}: ${VARIANT_SPEC[k]}`).join("\n")}\n\n` +
      `Формат ответа строго такой: перед каждой версией отдельная строка ### имя (${keys.join(", ")}), ниже текст версии.${retry ? "\n\nПРЕДЫДУЩИЙ ОТВЕТ НЕ УДАЛОСЬ РАЗОБРАТЬ, СЛЕДУЙ ФОРМАТУ." : ""}`;
    let v: Record<string, string> = {};
    for (let a = 0; a < 2 && Object.keys(v).length < want.length; a++) {
      const got = parseVariants(await chat("post", sys, ask(want.filter((k) => !v[k]), a > 0), { maxTokens: 2800, temperature: 0.7, timeoutMs: 55_000 }));
      v = { ...v, ...Object.fromEntries(Object.entries(got).filter(([k]) => want.includes(k))) };
    }
    // чего не хватило — по одной площадке отдельными короткими запросами
    for (const k of want.filter((k) => !v[k])) {
      const got = parseVariants(`### ${k}\n` + (await chat("post", sys, ask([k]), { maxTokens: 900, temperature: 0.7, timeoutMs: 30_000 })).replace(new RegExp(`^[#*\\s]*${k}[*\\s:#-]*`, "i"), ""));
      if (got[k]) v[k] = got[k];
    }
    if (!Object.keys(v).length) throw new Error("модель не вернула версии");
    const merged = { ...(it.meta?.variants ?? {}), ...v };
    await q("update kz_content_items set meta = meta || jsonb_build_object('variants',$3::jsonb), updated_at=now() where id=$1 and org_id=$2", [itemId, orgId, JSON.stringify(merged)]);
    return { ok: true };
  } catch (e) {
    await refund(orgId, cost, "ошибка версий под площадки", itemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

