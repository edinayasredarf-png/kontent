import { one, q } from "../db";
import { addDoc } from "../kb/docs";
import { KB_KINDS, type KbKind } from "../kb/kinds";
import { addSource, pollSource, recompute } from "../monitor/service";
import type { Kind } from "../monitor/fetchers";
import { suggestKeywords } from "../monitor/news";
import { loadAsset } from "../assets";
import { urlToText } from "../kb/ingest";
import { PLANS, type PlanKey } from "../plans";
import { cleanKit } from "../images";
import { createThread } from "./threads";
import type { SetupResult } from "./setup";

/** Обучение нового клиента в чате: прогресс настройки, инструменты для брендбука, источников и слов, приветствие. */
type Args = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : "");
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
export const ONBOARDING_TITLE = "Знакомство";

export interface Step { key: string; title: string; done: boolean; detail: string; href?: string }

type Raw = { b: { id: string; name: string; description: string; audience: string; tone: string; kit: unknown } | null; f: { id: string; name: string; niche: string; product: string } | null; docs: number; logo: number; channels: number; sources: number; words: number; made: number };

/** Прогресс настройки: один запрос вместо восьми (на удалённой базе каждый запрос стоит сетевой задержки). Если схема старая и запрос не прошёл, считаем по частям. */
export async function progress(orgId: string): Promise<Step[]> {
  let raw: Raw | null = null;
  try {
    raw = await one<Raw>(
      `select (select to_jsonb(x) from (select id,name,description,audience,tone,kit from kz_brands where org_id=$1 order by created_at limit 1) x) b,
              (select to_jsonb(x) from (select id,name,niche,product from kz_factories where org_id=$1 order by created_at limit 1) x) f,
              coalesce((select count(*) from kz_brand_docs d where d.brand_id=(select id from kz_brands where org_id=$1 order by created_at limit 1)),0)::int docs,
              (select count(*) from kz_assets where org_id=$1 and kind='logo' and brand_id=(select id from kz_brands where org_id=$1 order by created_at limit 1))::int logo,
              (select count(*) from kz_channels where org_id=$1 and status='active')::int channels,
              (select count(*) from kz_sources where org_id=$1 and kind<>'manual' and status='active')::int sources,
              (select count(*) from kz_keywords where org_id=$1 and kind='include')::int words,
              (select count(*) from kz_content_items where org_id=$1 and status in ('ready','scheduled','published'))::int made`, [orgId]);
  } catch { raw = null; }
  if (!raw) return progressParts(orgId);
  return steps(raw);
}

async function progressParts(orgId: string): Promise<Step[]> {
  const [b] = await q<NonNullable<Raw["b"]>>("select id,name,description,audience,tone,kit from kz_brands where org_id=$1 order by created_at limit 1", [orgId]);
  const f = await one<NonNullable<Raw["f"]>>("select id,name,niche,product from kz_factories where org_id=$1 order by created_at limit 1", [orgId]);
  const n = async (sql: string, p: unknown[]) => Number((await one<{ n: string }>(sql, p).catch(() => null))?.n ?? 0);
  const [docs, logo, channels, sources, words, made] = await Promise.all([
    b ? n("select count(*) n from kz_brand_docs where brand_id=$1", [b.id]) : 0,
    b ? n("select count(*) n from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, b.id]) : 0,
    n("select count(*) n from kz_channels where org_id=$1 and status='active'", [orgId]),
    n("select count(*) n from kz_sources where org_id=$1 and kind<>'manual' and status='active'", [orgId]),
    n("select count(*) n from kz_keywords where org_id=$1 and kind='include'", [orgId]),
    n("select count(*) n from kz_content_items where org_id=$1 and status in ('ready','scheduled','published')", [orgId]),
  ]);
  return steps({ b: b ?? null, f, docs, logo, channels, sources, words, made });
}

function steps({ b, f, docs, logo, channels, sources, words, made }: Raw): Step[] {
  const kit = cleanKit(b?.kit);
  const briefOk = !!b && b.description.trim().length > 10 && b.audience.trim().length > 5;
  const styleOk = !!b && (logo > 0 || docs > 0 || (kit.colors?.length ?? 0) > 0 || !!kit.style);
  return [
    { key: "brand", title: "Бренд: чем занимаетесь, для кого, в каком тоне", done: briefOk, detail: b ? (briefOk ? b.name : `бренд создан, не хватает: ${[b.description.trim().length > 10 ? "" : "описания", b.audience.trim().length > 5 ? "" : "аудитории"].filter(Boolean).join(" и ")}`) : "бренда ещё нет", href: b ? `/app/brands/${b.id}` : "/app/brands" },
    { key: "style", title: "Брендбук: логотип, цвета, стиль, документы", done: styleOk, detail: styleOk ? `${logo ? "логотип есть; " : ""}документов: ${docs}` : "нет ни логотипа, ни цветов, ни документов", href: b ? `/app/brands/${b.id}` : undefined },
    { key: "factory", title: "Контент-завод: ниша, продукт, форматы, расписание", done: !!f && f.niche.trim().length > 2 && f.product.trim().length > 5, detail: f ? f.name : "завода ещё нет", href: f ? `/app/factories/${f.id}` : "/app/factories" },
    { key: "channels", title: "Каналы публикации (VK, Telegram, MAX…)", done: channels > 0, detail: channels ? `подключено: ${channels}` : "каналов нет: подключите в чате (защищённая форма) или на странице «Каналы»", href: "/app/channels" },
    { key: "monitor", title: "Мониторинг новостей: источники и ключевые слова", done: sources > 0 && words > 0, detail: `источников: ${sources}, ключевых слов: ${words}`, href: "/app/monitor/settings" },
    { key: "first", title: "Первый материал", done: made > 0, detail: made ? `готово материалов: ${made}` : "ещё ничего не написано", href: "/app/calendar" },
  ];
}

/** Для подсказки модели: короткий текст о том, что уже настроено. */
export async function progressText(orgId: string): Promise<string> {
  const st = await progress(orgId);
  const [b] = await q<{ id: string; name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[]; competitors?: string[]; notes?: string[] } | null; kit: unknown }>("select id,name,description,audience,tone,rules,kit from kz_brands where org_id=$1 order by created_at limit 1", [orgId]);
  const fs = await q<{ id: string; name: string; niche: string; product: string; formats: string[]; schedule: { days?: number[]; times?: string[] } | null; approval: string; autopublish: boolean; brief: Record<string, unknown> | null; ch: string }>(
    "select id,name,niche,product,formats,schedule,approval,autopublish,brief,coalesce(array_length(channel_ids,1),0)::text ch from kz_factories where org_id=$1 order by created_at limit 3", [orgId]);
  const kit = cleanKit(b?.kit);
  const saved: string[] = [];
  if (b) saved.push(`Бренд ${b.id}: название «${b.name}»; описание: ${b.description || "—"}; аудитория: ${b.audience || "—"}; тон: ${b.tone}; запреты: ${(b.rules?.forbidden ?? []).join(", ") || "—"}; конкуренты: ${(b.rules?.competitors ?? []).join(", ") || "—"}; правила: ${(b.rules?.notes ?? []).join("; ") || "—"}; стиль картинок: ${kit.style || "—"}; цвета: ${(kit.colors ?? []).map((c) => c.hex).join(" ") || "—"}`);
  for (const f of fs) saved.push(`Завод ${f.id}: «${f.name}»; ниша: ${f.niche || "—"}; продукт: ${f.product || "—"}; форматы: ${(f.formats ?? []).join(", ")}; дни ${(f.schedule?.days ?? []).join(",")} время ${(f.schedule?.times ?? []).join(",")}; одобрение: ${f.approval}; автопубликация: ${f.autopublish ? "да" : "нет"}; картинки: ${f.brief?.images ? "да" : "нет"}; каналов привязано: ${f.ch}; призыв: ${String(f.brief?.cta ?? "") || "—"}; ссылка: ${String(f.brief?.link ?? "") || "—"}`);
  return `Прогресс настройки (${st.filter((s) => s.done).length} из ${st.length}):\n${st.map((s) => `- ${s.done ? "готово" : "НЕ сделано"}: ${s.title} (${s.detail})`).join("\n")}\nУЖЕ СОХРАНЕНО В СЕРВИСЕ (не переспрашивай это, а дополняй недостающее):\n${saved.join("\n") || "ничего"}\n\n`;
}

/** Документ из вложения чата → база знаний бренда (стиль, о компании, кейсы…). */
export async function addToKb(orgId: string, a: Args): Promise<SetupResult> {
  const f = uuid(a.fileId) ? await loadAsset(orgId, uuid(a.fileId)) : null;
  if (!f || !f.mime.startsWith("text/")) return { ok: false, text: "Не нашёл прикреплённый документ" };
  const bid = uuid(a.brandId) || (await one<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [orgId]))?.id;
  if (!bid || !(await one("select 1 from kz_brands where id=$1 and org_id=$2", [bid, orgId]))) return { ok: false, text: "Сначала нужен бренд" };
  const kind = (String(a.kind) in KB_KINDS ? String(a.kind) : "company") as KbKind;
  const r = await addDoc(orgId, bid, { kind, title: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Документ", text: f.data.toString("utf8"), useStyle: kind === "article" || a.useStyle === true });
  return r.error ? { ok: false, text: r.error } : { ok: true, text: `Документ «${f.name}» добавлен в базу знаний бренда (${KB_KINDS[kind]}). ИИ будет опираться на него при написании`, refs: [{ t: "setup" }] };
}

/** Ссылки на статьи и посты клиента → база знаний бренда (по умолчанию как примеры стиля). До 5 ссылок за раз; что не открылось, называем отдельно. */
export async function addLinksToKb(orgId: string, a: Args): Promise<SetupResult> {
  const urls = [...new Set((Array.isArray(a.urls) ? a.urls : typeof a.urls === "string" ? a.urls.split(/\s+/) : []).map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 5);
  if (!urls.length) return { ok: false, text: "Не нашёл ссылок (нужны адреса с http:// или https://)" };
  const bid = uuid(a.brandId) || (await one<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [orgId]))?.id;
  if (!bid || !(await one("select 1 from kz_brands where id=$1 and org_id=$2", [bid, orgId]))) return { ok: false, text: "Сначала нужен бренд: сохраните его (save_brand), потом добавляйте ссылки" };
  const kind = (String(a.kind) in KB_KINDS ? String(a.kind) : "article") as KbKind;
  const done: string[] = [], bad: string[] = [];
  for (const u of urls) {
    try {
      const t = await urlToText(u);
      const r = await addDoc(orgId, bid, { kind, title: t.title.slice(0, 120) || u, text: t.text, url: u, useStyle: kind === "article" || a.useStyle === true });
      if (r.error) bad.push(`${u}: ${r.error}`); else done.push(t.title.slice(0, 60) || u);
    } catch (e) { bad.push(`${u}: ${(e as Error).message.slice(0, 90)}`); }
  }
  if (!done.length) return { ok: false, text: `Ни одна ссылка не открылась. ${bad.join("; ")}. Попросите прислать текст или файл` };
  return { ok: true, text: `В базу знаний (${KB_KINDS[kind]}) добавлено: ${done.length} из ${urls.length}${bad.length ? `. Не получилось: ${bad.join("; ")}` : ""}`, refs: [{ t: "setup" }] };
}

const KINDS = ["site", "telegram", "vk", "news", "max"];
/** Источник мониторинга: сайт, Telegram-канал, группа VK, MAX или ленту новостей. Сразу собираем первые новости. */
export async function addMonitorSource(orgId: string, a: Args): Promise<SetupResult> {
  const kind = KINDS.includes(String(a.kind)) ? String(a.kind) : "site";
  const value = clip(a.value ?? a.url, 300);
  if (!value) return { ok: false, text: "Не указан источник: ссылка или имя канала" };
  const o = await one<{ plan: PlanKey; unlimited: boolean }>("select plan,unlimited from kz_orgs where id=$1", [orgId]);
  if (!o) return { ok: false, text: "Организация не найдена" };
  const r = await addSource(orgId, o.plan, o.unlimited, kind as Kind, value);
  if (r.error) return { ok: false, text: r.error };
  const row = await one<{ id: string; title: string }>("select id,title from kz_sources where org_id=$1 order by created_at desc limit 1", [orgId]);
  let got = 0;
  if (row) { const p = await pollSource(row.id).catch(() => null); got = p?.added ?? 0; }
  return { ok: true, text: `Источник «${row?.title ?? value}» добавлен${got ? `, собрано новостей: ${got}` : ""}`, refs: [{ t: "sources" }] };
}

/** Ключевые слова мониторинга: что искать и что исключать. */
export async function addKeywords(orgId: string, a: Args): Promise<SetupResult> {
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n;]/) : []).map((w) => String(w).trim().toLowerCase().replace(/\s+/g, " ")).filter((w) => w.length >= 2 && w.length <= 60).slice(0, 50);
  const inc = list(a.include), exc = list(a.exclude);
  if (!inc.length && !exc.length) return { ok: false, text: "Не указаны слова" };
  const total = Number((await one<{ n: string }>("select count(*) n from kz_keywords where org_id=$1", [orgId]))!.n);
  if (total + inc.length + exc.length > 300) return { ok: false, text: "Не больше 300 ключевых слов" };
  for (const w of new Set(inc)) await q("insert into kz_keywords(org_id,word,kind) values($1,$2,'include') on conflict do nothing", [orgId, w]);
  for (const w of new Set(exc)) await q("insert into kz_keywords(org_id,word,kind) values($1,$2,'exclude') on conflict do nothing", [orgId, w]);
  await recompute(orgId);
  return { ok: true, text: `Ключевые слова сохранены: искать ${inc.length}, исключать ${exc.length}`, refs: [{ t: "setup" }] };
}

/** Подбор слов нейросетью по описанию бренда (платно); сами слова ассистент предлагает человеку, сохраняет после согласия. */
export async function suggestWords(orgId: string, a: Args): Promise<unknown> {
  const bid = uuid(a.brandId) || (await one<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [orgId]))?.id;
  if (!bid) return { error: "Сначала нужен бренд с описанием" };
  const r = await suggestKeywords(orgId, bid);
  return r.ok ? r.s : { error: r.error };
}

export async function finishOnboarding(orgId: string, userId: string): Promise<SetupResult> {
  await q("update kz_chat_threads set title='Настройка завершена' where org_id=$1 and user_id=$2 and title=$3", [orgId, userId, ONBOARDING_TITLE]).catch(() => null);
  return { ok: true, text: "Обучение завершено", refs: [{ t: "setup" }] };
}

/**
 * Обучение бесплатно для клиента: ответы ассистента в диалоге «Знакомство» (до 60 сообщений на организацию), подбор слов и один первый материал.
 * Дальше цены обычные. Расходы на нейросеть при этом записываются как «Обучение» и видны в экономике.
 */
export const FREE_LEARN_MESSAGES = 60;
export async function learnFree(orgId: string, threadTitle: string | null): Promise<{ chat: boolean; first: boolean }> {
  if (threadTitle !== ONBOARDING_TITLE) return { chat: false, first: false };
  const used = Number((await one<{ n: string }>(
    "select count(*) n from kz_chat_messages m join kz_chat_threads t on t.id=m.thread_id where m.org_id=$1 and m.role='user' and t.title in ($2,'Настройка завершена')", [orgId, ONBOARDING_TITLE]).catch(() => null))?.n ?? 0);
  const chat = used < FREE_LEARN_MESSAGES;
  const firstUsed = await one("select 1 from kz_content_items where org_id=$1 and meta->>'freeFirst'='true' limit 1", [orgId]).catch(() => null);
  return { chat, first: chat && !firstUsed };
}

/** Первый вход нового клиента: диалог «Знакомство» с приветствием, чек-листом и быстрыми ответами. */
export async function startOnboarding(orgId: string, userId: string): Promise<string | null> {
  const t = await createThread(orgId, userId, ONBOARDING_TITLE);
  if (!t) return null;
  const text = "Здравствуйте! Я ваш ассистент в Контент-заводе. Давайте настроим всё за 10–15 минут прямо в этом чате, а в конце я сразу напишу первый материал.\n\nМы пройдём шесть шагов: бренд, брендбук (логотип, цвета, документы), контент-завод, каналы публикации, мониторинг новостей и первый пост.\n\nОбучение для вас бесплатное, включая первый материал.\n\nНачнём с бренда. Расскажите, чем занимается компания и для кого, или пришлите ссылку на сайт, и я сам предложу описание. Если нужно, прикрепите документы через «+».";
  await q("insert into kz_chat_messages(org_id,user_id,role,content,blocks,thread_id) values($1,$2,'assistant',$3,$4,$5)", [orgId, userId, text, JSON.stringify({ cards: [{ t: "setup" }], replies: ["Вот наш сайт", "Расскажу своими словами", "Пропустить обучение"] }), t]);
  return t;
}

export { PLANS };
