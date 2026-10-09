import { one, q, tx } from "./db";
import { aiReady, chat, extractObject } from "./ai";
import { PRICES, InsufficientFunds, charge, refund } from "./wallet";
import { PLANS, type PlanKey } from "./plans";
import { KINDS } from "./plan";

const KNOWLEDGE = `Платформа «Контент-завод» (Единая среда) делает контент для соцсетей и сайтов автоматически.
Разделы меню:
- Обзор: показатели, «Что горит», быстрый старт.
- Заводы: конвейер под один продукт. Внутри — контент-план (ИИ или свои идеи), одобрение, генерация текста и картинок, расписание, публикация, календарь.
- Бренды: профиль компании и брендбук (цвета, стиль, логотип, фото продукта, референсы).
- Календарь: все материалы по датам. Мониторинг: источники (сайты, Telegram, VK, новости) и ключевые слова, из постов делаются идеи.
- Публикации, Аналитика (просмотры, реакции, рекомендации ИИ), Входящие (комментарии VK, ответы).
- Каналы: Telegram, VK, MAX (бета), WordPress и Webhook для SEO-статей и других соцсетей через n8n/Make.
- Студия и агенты: пост, хуки, сценарий ролика, вирусные идеи, изображение, обложка карусели, озвучка, банк идей, библиотека.
- Баланс и тариф, Команда (приглашения и роли), Партнёрка, Профиль.
Форматы материалов: пост, карусель, ролик (сценарий), статья, сторис, SEO-статья. Деньги списываются в момент генерации, при ошибке возвращаются.
Видео, аватары, музыка и анимация пока недоступны.`;

const SYSTEM = `Ты Лия — помощница платформы «Контент-завод». Отвечай по-русски, дружелюбно, коротко и по делу (до 120 слов). Подсказывай, в каком разделе меню что сделать. Если чего-то в платформе нет — честно скажи об этом. Не выдумывай функции, цены и обещания. Не давай юридических и финансовых советов.\n\n${KNOWLEDGE}`;

export interface Msg { role: "user" | "assistant"; content: string }

export async function askLia(orgId: string, history: Msg[], message: string): Promise<{ text?: string; error?: string }> {
  const m = message.trim();
  if (!m) return { error: "Напишите вопрос" };
  if (m.length > 1500) return { error: "Вопрос слишком длинный (до 1500 знаков)" };
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const ctx = await one<{ brands: string; factories: string; channels: string; plan: string }>(
    `select (select count(*) from kz_brands where org_id=$1) brands,(select count(*) from kz_factories where org_id=$1) factories,(select count(*) from kz_channels where org_id=$1) channels,(select plan from kz_orgs where id=$1) plan`, [orgId]);
  const past = history.slice(-8).filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string").map((h) => `${h.role === "user" ? "Пользователь" : "Лия"}: ${h.content.slice(0, 1500)}`).join("\n");
  const cost = PRICES.idea;
  try { await charge(orgId, cost, "Лия: ответ"); } catch (e) { if (e instanceof InsufficientFunds) return { error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const text = await chat("assistant", SYSTEM, `Состояние аккаунта: тариф ${ctx?.plan}, брендов ${ctx?.brands}, заводов ${ctx?.factories}, каналов ${ctx?.channels}.\n${past ? `\nДиалог до этого:\n${past}\n` : ""}\nПользователь: ${m}\nЛия:`, { maxTokens: 500, temperature: 0.4, timeoutMs: 40_000 });
    return { text };
  } catch (e) { await refund(orgId, cost, "ошибка ответа Лии"); return { error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}

/** «Быстрый режим»: из описания бизнеса собираем бренд и завод. Лимиты тарифа действуют так же, как при ручном создании. */
export async function quickLaunch(o: { orgId: string; plan: PlanKey; unlimited: boolean; description: string }): Promise<{ ok: true; factoryId: string } | { ok: false; error: string }> {
  const d = o.description.trim();
  if (d.length < 20) return { ok: false, error: "Опишите бизнес подробнее — хотя бы пару предложений" };
  if (d.length > 3000) return { ok: false, error: "Описание слишком длинное (до 3000 знаков)" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const counts = await one<{ b: string; f: string }>("select (select count(*) from kz_brands where org_id=$1) b,(select count(*) from kz_factories where org_id=$1) f", [o.orgId]);
  const lim = { b: o.unlimited ? null : PLANS[o.plan].brands, f: o.unlimited ? null : PLANS[o.plan].factories };
  if (lim.b !== null && Number(counts!.b) >= lim.b) return { ok: false, error: `Тариф «${PLANS[o.plan].name}»: максимум брендов — ${lim.b}` };
  if (lim.f !== null && Number(counts!.f) >= lim.f) return { ok: false, error: `Тариф «${PLANS[o.plan].name}»: максимум заводов — ${lim.f}` };
  const cost = PRICES.idea * 2;
  try { await charge(o.orgId, cost, "Быстрый запуск"); } catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const raw = await chat("assistant", "Ты помощник по запуску контент-маркетинга. Отвечай ТОЛЬКО валидным JSON-объектом, без пояснений.",
      `Описание бизнеса от владельца:\n«${d}»\n\nВерни JSON: {"brand":{"name":"название компании","description":"чем занимается, 2–3 предложения","audience":"кто клиенты","tone":"professional|friendly|humor|serious|inspiring","forbidden":["что не упоминать, если явно сказано"]},"factory":{"name":"название завода, например «Блог про …»","niche":"ниша","product":"продукт или направление","formats":["post"]}}\nformats — из: post, carousel, article, reels, seo (1–3 подходящих). Ничего не выдумывай сверх описания.`,
      { maxTokens: 900, temperature: 0.3 });
    const j = extractObject(raw) as { brand?: Record<string, unknown>; factory?: Record<string, unknown> } | null;
    if (!j?.brand?.name || !j.factory) throw new Error("Модель не вернула структуру");
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
    const tone = ["professional", "friendly", "humor", "serious", "inspiring"].includes(String(j.brand.tone)) ? String(j.brand.tone) : "professional";
    const formats = (Array.isArray(j.factory.formats) ? j.factory.formats : []).map(String).filter((k) => (KINDS as readonly string[]).includes(k)).slice(0, 3);
    const forbidden = (Array.isArray(j.brand.forbidden) ? j.brand.forbidden : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 10);
    const id = await tx(async (run) => {
      const [b] = await run<{ id: string }>("insert into kz_brands(org_id,name,description,audience,tone,rules) values($1,$2,$3,$4,$5,$6) returning id",
        [o.orgId, str(j.brand!.name, 80), str(j.brand!.description, 800), str(j.brand!.audience, 400), tone, JSON.stringify({ forbidden, competitors: [] })]);
      const [f] = await run<{ id: string }>("insert into kz_factories(org_id,brand_id,name,niche,product,formats) values($1,$2,$3,$4,$5,$6) returning id",
        [o.orgId, b.id, str(j.factory!.name, 80) || `Блог ${str(j.brand!.name, 60)}`, str(j.factory!.niche, 120), str(j.factory!.product, 300), formats.length ? formats : ["post"]]);
      return f.id;
    });
    return { ok: true, factoryId: id };
  } catch (e) { await refund(o.orgId, cost, "ошибка быстрого запуска"); return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}
