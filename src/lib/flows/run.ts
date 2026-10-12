import { kbText } from "../kb/use";
import { one, q } from "../db";
import { aiReady, type BrandCtx } from "../ai";
import { InsufficientFunds, PRICES, charge, refund } from "../wallet";
import { enqueue, buildImage } from "../pipeline";
import { MAX_UPLOAD, processImage, saveAsset } from "../assets";
import { safeFetchBuffer } from "../safefetch";
import { classify, rewrite, sameEvent } from "./ai";
import { cleanFlowSettings, inQuiet, mskHour, type FlowSettings } from "./settings";
import { adSignals, hasWord, similarity } from "./text";

export interface FlowRow { id: string; org_id: string; brand_id: string; name: string; status: string; source_ids: string[]; channel_ids: string[]; settings: unknown }
interface Feed { id: string; title: string; body: string; url: string; published_at: string; media: { type: string; url?: string }[] }

const textOf = (f: { title: string; body: string }) => (f.body && f.body.length >= f.title.length ? f.body : f.title).trim();
const DUP_HARD = 0.6, DUP_SOFT = 0.22;

async function brandOf(orgId: string, brandId: string): Promise<BrandCtx | null> {
  const b = await one<{ name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[] } | null }>("select name,description,audience,tone,rules from kz_brands where id=$1 and org_id=$2", [brandId, orgId]);
  return b ? { name: b.name, description: b.description, audience: b.audience, tone: b.tone, forbidden: b.rules?.forbidden ?? [], kb: (await kbText(orgId, brandId).catch(() => "")) || undefined } : null;
}

async function setItem(orgId: string, flowId: string, feedId: string, status: string, o: { code?: string; note?: string; cls?: unknown; text?: string; cost?: number } = {}) {
  await q(`insert into kz_flow_items(org_id,flow_id,feed_item_id,status,reject_code,reject_note,classification,text,cost_kop) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict(flow_id,feed_item_id) do update set status=excluded.status,reject_code=excluded.reject_code,reject_note=excluded.reject_note,classification=coalesce(excluded.classification,kz_flow_items.classification),text=excluded.text,cost_kop=kz_flow_items.cost_kop+excluded.cost_kop,updated_at=now()`,
    [orgId, flowId, feedId, status, o.code ?? null, o.note ?? null, o.cls ? JSON.stringify(o.cls) : null, o.text ?? "", o.cost ?? 0]);
}

/** Один шаг с оплатой: списываем до вызова нейросети, при сбое возвращаем. Возвращает результат и сколько реально стоило. */
async function paid<T>(orgId: string, kop: number, reason: string, ref: string, fn: () => Promise<T>): Promise<{ v: T; cost: number }> {
  await charge(orgId, kop, reason, ref);
  try { return { v: await fn(), cost: kop }; } catch (e) { await refund(orgId, kop, `${reason}: ошибка`, ref); throw e; }
}

/** Прогон одной новости через отбор. Возвращает false, если нужно остановить поток (не хватило денег). */
async function processOne(flow: FlowRow, s: FlowSettings, brand: BrandCtx, f: Feed): Promise<boolean> {
  const org = flow.org_id, text = textOf(f);
  const reject = (code: string, note = "", cost = 0, cls?: unknown) => setItem(org, flow.id, f.id, "rejected", { code, note, cost, cls });
  if (text.length < 40) { await reject("no_text"); return true; }
  if (s.exclude.length && hasWord(text, s.exclude)) { await reject("exclude"); return true; }
  if (s.include.length && !hasWord(text, s.include)) { await reject("include"); return true; }
  const ad = adSignals(text);
  if (ad.strong || ad.soft >= 3) { await reject("ad", ad.strong ? "прямая пометка рекламы" : "рекламные формулировки"); return true; }

  let cost = 0;
  try {
    // дубли: сначала бесплатное сходство текстов, нейросеть-судья только для пограничных случаев
    if (s.dedupe) {
      const recent = await q<{ body: string; title: string }>(
        `select k.body,k.title from kz_flow_items fi join kz_feed_items k on k.id=fi.feed_item_id
          where fi.flow_id=$1 and fi.feed_item_id<>$2 and fi.status in ('pending','ready','queued') and fi.created_at > now() - interval '72 hours' order by fi.created_at desc limit 60`, [flow.id, f.id]);
      let best = 0, bestText = "";
      for (const r of recent) { const sim = similarity(text, textOf(r)); if (sim > best) { best = sim; bestText = textOf(r); } }
      if (best >= DUP_HARD) { await reject("duplicate", `сходство ${Math.round(best * 100)}%`); return true; }
      if (best >= DUP_SOFT) {
        const j = await paid(org, PRICES.flowJudge, "Автолента: проверка дубля", f.id, () => sameEvent(text, bestText));
        cost += j.cost;
        if (j.v) { await reject("duplicate", "то же событие по оценке нейросети", cost); return true; }
      }
    }
    const c = await paid(org, PRICES.flowClassify, "Автолента: разбор новости", f.id, () => classify(brand, s, text));
    cost += c.cost;
    const cls = c.v;
    if (cls.ad || cls.type === "ad") { await reject("ad", cls.reason || "нейросеть признала рекламой", cost, cls); return true; }
    if (cls.type === "junk") { await reject("junk", cls.reason, cost, cls); return true; }
    if (!s.types.includes(cls.type)) { await reject("type", `тип: ${cls.type}`, cost, cls); return true; }
    if (s.topics.length && !s.topics.includes(cls.topic)) { await reject("topic", `тема: ${cls.topic}`, cost, cls); return true; }
    if (s.scopes.length && !s.scopes.includes(cls.scope)) { await reject("scope", `масштаб: ${cls.scope}`, cost, cls); return true; }
    if (s.geo) {
      const geoWords = s.geo.toLowerCase().split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const where = `${cls.region} ${text}`;
      if ((cls.scope === "local" || cls.scope === "regional") && !hasWord(where, geoWords)) { await reject("geo", `регион: ${cls.region || "не указан"}`, cost, cls); return true; }
    }
    if (cls.fit < s.minFit) { await reject("low_fit", `оценка ${cls.fit} из 10`, cost, cls); return true; }

    const rw = await paid(org, PRICES.flowRewrite, "Автолента: пересказ", f.id, async () => {
      const t = await rewrite(brand, s, text);
      if (!t) throw new Error("COPY");
      return t;
    }).catch(async (e) => { if ((e as Error).message === "COPY") { await reject("copy", "модель не смогла перефразировать", cost, cls); return null; } throw e; });
    if (!rw) return true;
    cost += rw.cost;
    await setItem(org, flow.id, f.id, s.mode === "auto" ? "ready" : "pending", { text: rw.v, cost, cls });
    return true;
  } catch (e) {
    if (e instanceof InsufficientFunds) return false;
    await reject("ai_error", (e as Error).message.slice(0, 160), cost);
    return true;
  }
}

/** Обработка новых новостей потока: до 8 за проход, чтобы не упереться в лимит времени и не потратить бюджет разом. */
export async function processFlow(flow: FlowRow, limit = 8): Promise<{ processed: number; stopped: boolean }> {
  const s = cleanFlowSettings(flow.settings);
  const brand = await brandOf(flow.org_id, flow.brand_id);
  if (!brand || !flow.source_ids.length) return { processed: 0, stopped: false };
  const items = await q<Feed>(
    `select k.id,k.title,k.body,k.url,k.published_at,k.media from kz_feed_items k
      where k.org_id=$1 and k.source_id = any($2::uuid[]) and k.published_at > now() - ($3 || ' hours')::interval
        and not exists (select 1 from kz_flow_items fi where fi.flow_id=$4 and fi.feed_item_id=k.id)
      order by k.published_at asc limit $5`, [flow.org_id, flow.source_ids, String(s.maxAgeHours), flow.id, limit]);
  let processed = 0;
  for (const f of items) {
    if (!(await processOne(flow, s, brand, f))) { await q("update kz_flows set note=$2 where id=$1", [flow.id, "Остановлено: не хватает денег на балансе. Пополните баланс — обработка продолжится."]); return { processed, stopped: true }; }
    processed++;
  }
  if (processed || items.length === 0) await q("update kz_flows set last_run_at=now(), note=case when note like 'Остановлено%' then '' else note end where id=$1", [flow.id]);
  return { processed, stopped: false };
}

/* ───────── публикация ───────── */
async function attachImage(orgId: string, contentId: string, brandId: string, mode: FlowSettings["images"], media: { type: string; url?: string }[]): Promise<string | null> {
  if (mode === "own") { const r = await buildImage(orgId, contentId); return r.ok ? null : `Картинка нейросетью не создана: ${r.error}`; }
  if (mode !== "original") return null;
  const url = media.find((m) => m.type === "image" && m.url)?.url;
  if (!url) return null;
  try {
    const { data } = await safeFetchBuffer(url, MAX_UPLOAD * 2);
    const p = await processImage(data, "generated");
    const id = await saveAsset(orgId, brandId, "generated", "source.jpg", p);
    await q("update kz_content_items set image_id=$2 where id=$1", [contentId, id]);
    return null;
  } catch (e) { return `Картинку источника не удалось взять: ${(e as Error).message.slice(0, 100)}`; }
}

/** Создаёт материал по пересказу и ставит его в очередь публикации в каналы потока. Сбой — статус «failed» с причиной. */
export async function publishFlowItem(orgId: string, flowItemId: string, textOverride?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await one<{ id: string; status: string; text: string; flow_id: string; feed_item_id: string; brand_id: string; channel_ids: string[]; settings: unknown; url: string; media: { type: string; url?: string }[] }>(
    `select fi.id,fi.status,fi.text,fi.flow_id,fi.feed_item_id,f.brand_id,f.channel_ids,f.settings,k.url,k.media
       from kz_flow_items fi join kz_flows f on f.id=fi.flow_id join kz_feed_items k on k.id=fi.feed_item_id where fi.id=$1 and fi.org_id=$2`, [flowItemId, orgId]);
  if (!r) return { ok: false, error: "Запись не найдена" };
  if (!["pending", "ready", "failed"].includes(r.status)) return { ok: false, error: "Эта запись уже обработана" };
  const s = cleanFlowSettings(r.settings);
  let text = (textOverride ?? r.text).trim();
  if (text.length < 20) return { ok: false, error: "Текст слишком короткий" };
  if (s.source === "link" && /^https?:\/\//i.test(r.url)) text += `\n\nИсточник: ${r.url}`;
  // защита от двойного клика и параллельного воркера: запись захватывается одним UPDATE
  const taken = await q("update kz_flow_items set status='queued', updated_at=now() where id=$1 and status = any($2::text[]) returning id", [flowItemId, ["pending", "ready", "failed"]]);
  if (!taken.length) return { ok: false, error: "Запись уже публикуется" };
  const c = (await one<{ id: string }>(
    `insert into kz_content_items(org_id,brand_id,kind,topic,hook,body,planned_for,status,meta) values($1,$2,'post',$3,'',$4,current_date,'ready',$5) returning id`,
    [orgId, r.brand_id, text.split(/[.!?\n]/)[0].slice(0, 200) || "Новость", text, JSON.stringify({ flow: r.flow_id, flowItem: r.id, channelIds: r.channel_ids })]))!;
  const imgNote = await attachImage(orgId, c.id, r.brand_id, s.images, r.media ?? []);
  const e = await enqueue(orgId, c.id);
  if (!e.ok) { await q("update kz_flow_items set status='failed', reject_note=$2, content_item_id=$3, updated_at=now() where id=$1", [flowItemId, e.error, c.id]); return { ok: false, error: e.error ?? "Не удалось поставить в очередь" }; }
  await q("update kz_flow_items set status='queued', text=$2, content_item_id=$3, reject_note=$4, updated_at=now() where id=$1", [flowItemId, text, c.id, imgNote]);
  return { ok: true };
}

/** Автоматический режим: выпускаем готовые пересказы по одному, с учётом тихих часов, суточного лимита и паузы между постами. */
export async function releaseReady(flow: FlowRow): Promise<number> {
  const s = cleanFlowSettings(flow.settings);
  if (s.mode !== "auto" || flow.status !== "active") return 0;
  if (inQuiet(mskHour(), s.quietFrom, s.quietTo)) return 0;
  const st = await one<{ today: string; last: string | null }>(
    "select count(*) filter (where updated_at >= date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow') today, max(updated_at) last from kz_flow_items where flow_id=$1 and status='queued'", [flow.id]);
  if (Number(st!.today) >= s.dailyCap) return 0;
  if (st!.last && Date.now() - new Date(st!.last).getTime() < s.minGapMin * 60_000) return 0;
  const next = await one<{ id: string }>("select id from kz_flow_items where flow_id=$1 and status='ready' and created_at > now() - ($2 || ' hours')::interval order by created_at limit 1", [flow.id, String(Math.max(s.maxAgeHours, 6))]);
  if (!next) return 0;
  const r = await publishFlowItem(flow.org_id, next.id);
  return r.ok ? 1 : 0;
}

/** Проход воркера по активным потокам. Новости обрабатываются, готовые выпускаются. */
export async function runFlows(budgetMs = 90_000): Promise<{ processed: number; released: number; errors: string[] }> {
  const out = { processed: 0, released: 0, errors: [] as string[] };
  if (!aiReady()) return out;
  const t0 = Date.now();
  const flows = await q<FlowRow>(
    `select f.id,f.org_id,f.brand_id,f.name,f.status,f.source_ids,f.channel_ids,f.settings from kz_flows f
      where f.status='active' and not exists (select 1 from kz_orgs o where o.id=f.org_id and o.suspended) order by f.last_run_at nulls first limit 6`);
  for (const f of flows) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const p = await processFlow(f);
      out.processed += p.processed;
      out.released += await releaseReady(f);
      await q("update kz_flows set last_run_at=now() where id=$1", [f.id]);
    } catch (e) { out.errors.push(`flow ${f.id}: ${(e as Error).message}`.slice(0, 160)); }
  }
  return out;
}

/** Новый пересказ той же новости (кнопка «Переписать ещё раз»): с пожеланием редактора. Платно, при сбое возврат. */
export async function rewriteFlowItem(orgId: string, flowItemId: string, note = ""): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const r = await one<{ status: string; flow_id: string; brand_id: string; settings: unknown; title: string; body: string }>(
    `select fi.status,fi.flow_id,f.brand_id,f.settings,k.title,k.body from kz_flow_items fi join kz_flows f on f.id=fi.flow_id join kz_feed_items k on k.id=fi.feed_item_id where fi.id=$1 and fi.org_id=$2`, [flowItemId, orgId]);
  if (!r) return { ok: false, error: "Запись не найдена" };
  if (!["pending", "ready", "failed", "rejected"].includes(r.status)) return { ok: false, error: "Эта запись уже опубликована" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const brand = await brandOf(orgId, r.brand_id);
  if (!brand) return { ok: false, error: "Бренд не найден" };
  try {
    const t = await paid(orgId, PRICES.flowRewrite, "Автолента: пересказ", flowItemId, async () => {
      const out = await rewrite(brand, cleanFlowSettings(r.settings), textOf(r), note.slice(0, 300));
      if (!out) throw new Error("модель не смогла перефразировать");
      return out;
    });
    await q("update kz_flow_items set text=$2, cost_kop=cost_kop+$3, updated_at=now() where id=$1", [flowItemId, t.v, t.cost]);
    return { ok: true, text: t.v };
  } catch (e) {
    if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" };
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

/** «Это нам надо»: отбракованную новость возвращаем в очередь, предварительно пересказав. */
export async function rescueFlowItem(orgId: string, flowItemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await one<{ status: string; mode: string }>("select fi.status, f.settings->>'mode' mode from kz_flow_items fi join kz_flows f on f.id=fi.flow_id where fi.id=$1 and fi.org_id=$2", [flowItemId, orgId]);
  if (!r || r.status !== "rejected") return { ok: false, error: "Эта запись не в отбракованных" };
  const t = await rewriteFlowItem(orgId, flowItemId);
  if (!t.ok) return t;
  await q("update kz_flow_items set status='pending', reject_code=null, reject_note=null, updated_at=now() where id=$1", [flowItemId]);
  return { ok: true };
}
