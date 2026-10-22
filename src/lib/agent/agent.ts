import { one, q } from "../db";
import { aiReady, chat, extractObject } from "../ai";
import { PRICES, InsufficientFunds, charge, refund } from "../wallet";
import { cleanRefs, hydrateCards, type Card, type CardRef } from "./cards";
import { TOOLS, runAuto, runRead, toolByName, validateAction, type Args, type ToolCtx } from "./tools";

/** Разделы сервиса, на которые ассистент может дать кнопку. Всё, чего здесь нет, в ссылки не попадает. */
export const SECTIONS: Record<string, string> = {
  "/app": "Чат", "/app/overview": "Сводка", "/app/factories": "Заводы", "/app/brands": "Бренды", "/app/calendar": "Календарь", "/app/monitor": "Мониторинг новостей",
  "/app/monitor/settings": "Источники и ключевые слова", "/app/flows": "Автолента", "/app/competitors": "Конкуренты", "/app/inbox": "Входящие", "/app/publications": "Публикации",
  "/app/analytics": "Аналитика", "/app/studio": "ИИ-ассистенты", "/app/channels": "Каналы публикации", "/app/billing": "Баланс и тариф", "/app/team": "Команда",
  "/app/developers": "API и интеграции", "/app/partners": "Партнёрская программа", "/app/profile": "Профиль", "/app/settings": "Настройки",
};
const DYNAMIC = /^\/app\/(factories|brands|flows)\/[0-9a-f-]{36}(\/knowledge)?(\?[\w=&%.-]{0,80})?$/i;

/** Ссылка допустима, если это известный раздел или страница завода, бренда либо потока по uuid. Остальное отбрасываем. */
export function cleanHref(h: unknown): string | null {
  if (typeof h !== "string") return null;
  const href = h.trim();
  const base = href.split("?")[0];
  if (base in SECTIONS && /^\/app[\w/-]*(\?[\w=&%.-]{0,80})?$/.test(href)) return href;
  return DYNAMIC.test(href) ? href : null;
}

export interface Link { label: string; href: string }
export interface Action { label: string; tool: string; args: Args; hint: string; done?: string }
export interface Blocks { links?: Link[]; actions?: Action[]; cards?: CardRef[] }
export interface ChatMsg { id: string; role: "user" | "assistant"; content: string; blocks: Blocks; created_at: string; cards?: Card[] }

const toolDocs = () => TOOLS.map((t) => `- ${t.name} ${t.args} — ${t.desc}${t.kind === "confirm" ? " [только предложение: выполнится после нажатия кнопки пользователем]" : ""}`).join("\n");
const sectionDocs = () => Object.entries(SECTIONS).map(([h, l]) => `${h} — ${l}`).join("\n") + "\n/app/factories/<id завода>, /app/brands/<id бренда>, /app/brands/<id бренда>/knowledge (база знаний бренда), /app/flows/<id потока>";

const SYSTEM = (name: string) => `Ты ассистент платформы «Контент-завод» и главный помощник по контенту компании. Обращайся к пользователю по имени (${name || "без имени"}) на «вы». Отвечай по-русски, дружелюбно, по делу, без воды.
Ты видишь, что происходит в аккаунте, через инструменты. Данные берёшь только из результатов инструментов: цифры и названия не выдумывай. Если инструмент вернул пусто, так и скажи.
Каждый ответ — ОДИН JSON-объект, без пояснений вне JSON. Два вида:
1) вызвать инструмент: {"tool":"имя","args":{...}}
2) финальный ответ: {"final":{"text":"ответ пользователю, абзацы через \\n\\n, списки через «• »","links":[{"label":"Открыть мониторинг","href":"/app/monitor"}],"actions":[{"label":"Включить автопубликацию","tool":"set_factory","args":{"factoryId":"...","autopublish":true}}]}}
Инструменты:
${toolDocs()}
Карточки: в "final" можно добавить "cards" — что показать в чате прямо внутри ответа, с кнопками и переключателями. Типы:
{"type":"news","ids":["uuid новости",…]} — сами посты из ленты (до 3; покажи именно те, о которых пишешь в тексте); {"type":"item","ids":[…]} — материалы; {"type":"factory","id":"uuid"} — настройки завода с тумблерами; {"type":"plan","id":"uuid завода"}; {"type":"sources"}; {"type":"analytics","days":7}; {"type":"competitors"}; {"type":"brand","id":"uuid"}; {"type":"channels"}.
Берёшь uuid только из результатов инструментов. Если пользователь просит создать материал из новости, покажи карточку этой новости: кнопка «Создать материал» в ней. Если просит изменить настройки завода или бренда, покажи карточку завода или бренда: изменения делаются в ней переключателями.
Правила:
- Сначала собери данные инструментами (до 4 вызовов), потом дай финальный ответ.
- Если пользователь просит обновить новости или данные могли устареть, вызови refresh_news.
- Если из запроса понятно, какую настройку включить или что создать, предложи это в "actions" (кнопка), а не обещай, что уже сделал. Платные действия называй платными. Только действия-предложения из списка, с настоящими id из результатов инструментов.
- В "links" давай 1–3 кнопки на разделы, где можно посмотреть подробности. Разрешены только такие адреса:
${sectionDocs()}
- Если чего-то в платформе нет, честно скажи. Не давай юридических и финансовых советов.
- Ответ короткий: до 150 слов, если не просят подробнее.`;

const TODAY = () => new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export async function loadHistory(orgId: string, userId: string, limit = 40): Promise<ChatMsg[]> {
  const rows = await q<ChatMsg>("select id,role,content,blocks,created_at from kz_chat_messages where org_id=$1 and user_id=$2 order by created_at desc limit $3", [orgId, userId, limit]);
  return rows.reverse();
}
/** История чата вместе со свежими данными карточек (ссылки на объекты превращаются в актуальные карточки). */
export async function loadHistoryWithCards(orgId: string, userId: string, limit = 40): Promise<ChatMsg[]> {
  const msgs = await loadHistory(orgId, userId, limit);
  // карточки показываем только у последних ответов: старые остаются текстом, чтобы страница не тяжелела
  const recent = msgs.filter((m) => m.role === "assistant" && m.blocks?.cards?.length).slice(-6);
  await Promise.all(recent.map(async (m) => { m.cards = await hydrateCards(orgId, m.blocks.cards); }));
  return msgs;
}
export const clearHistory = (orgId: string, userId: string) => q("delete from kz_chat_messages where org_id=$1 and user_id=$2", [orgId, userId]);

async function save(orgId: string, userId: string, role: "user" | "assistant", content: string, blocks: Blocks = {}) {
  await q("insert into kz_chat_messages(org_id,user_id,role,content,blocks) values($1,$2,$3,$4,$5)", [orgId, userId, role, content, JSON.stringify(blocks)]);
}

const cut = (v: unknown, n = 5500) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…(обрезано)" : s; };

export async function askAgent(c: { orgId: string; userId: string; userName: string; role: string }, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = message.trim();
  if (!m) return { ok: false, error: "Напишите сообщение" };
  if (m.length > 1500) return { ok: false, error: "Сообщение слишком длинное (до 1500 знаков)" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const ctx: ToolCtx = { orgId: c.orgId, role: c.role };
  const hist = (await loadHistory(c.orgId, c.userId, 8)).map((h) => `${h.role === "user" ? "Пользователь" : "Ассистент"}: ${h.content.slice(0, 1200)}`).join("\n");
  try { await charge(c.orgId, PRICES.idea, "Чат: ответ"); } catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  await save(c.orgId, c.userId, "user", m);
  const t0 = Date.now();
  let scratch = "";
  const got: Record<string, unknown> = {};
  try {
    for (let step = 0; step < 5; step++) {
      if (Date.now() - t0 > 100_000) throw new Error("Слишком долго думаю, спросите короче");
      const raw = await chat("assistant", SYSTEM(c.userName), `Сегодня ${TODAY()}.\n${hist ? `Диалог до этого:\n${hist}\n\n` : ""}Пользователь: ${m}\n${scratch}${step >= 4 ? "\nБольше инструменты вызывать нельзя: дай финальный ответ." : ""}`, { maxTokens: 1200, temperature: 0.3, timeoutMs: 40_000 });
      const o = extractObject(raw);
      if (o && typeof o.tool === "string" && step < 4) {
        const t = toolByName(o.tool);
        let res: unknown;
        if (!t || t.kind === "confirm") res = { error: t ? "Это действие только предлагается кнопкой в финальном ответе" : "Нет такого инструмента" };
        else { try { res = t.kind === "auto" ? await runAuto(ctx, t.name) : await runRead(ctx, t.name, (o.args as Args) ?? {}); } catch (e) { res = { error: (e as Error).message.slice(0, 200) }; } }
        got[o.tool] = res;
        scratch += `\nВызван ${o.tool}. Результат: ${cut(res)}\n`;
        continue;
      }
      const fin = (o?.final ?? o) as { text?: unknown; links?: unknown; actions?: unknown } | null;
      const text = typeof fin?.text === "string" && fin.text.trim() ? fin.text.replace(/\\n/g, "\n").trim().slice(0, 4000) : (o ? "" : raw.trim().slice(0, 4000));
      if (!text) { scratch += "\nНужен финальный ответ в формате {\"final\":{...}}.\n"; continue; }
      const links = (Array.isArray(fin?.links) ? fin!.links as { label?: unknown; href?: unknown }[] : []).map((l) => ({ label: String(l?.label ?? "").slice(0, 60), href: cleanHref(l?.href) })).filter((l): l is Link => !!l.label && !!l.href).slice(0, 4);
      const actions: Action[] = [];
      for (const a of (Array.isArray(fin?.actions) ? fin!.actions as { label?: unknown; tool?: unknown; args?: unknown }[] : []).slice(0, 4)) {
        const tool = String(a?.tool ?? "");
        if (toolByName(tool)?.kind !== "confirm") continue;
        const v = await validateAction(ctx, tool, (a.args as Args) ?? {});
        if (v.ok) actions.push({ label: String(a.label ?? "").slice(0, 80) || tool, tool, args: v.args, hint: v.hint });
      }
      const cards = await finalCards(c.orgId, cleanRefs((fin as { cards?: unknown } | null)?.cards), got);
      await save(c.orgId, c.userId, "assistant", text, { links, actions, cards });
      return { ok: true };
    }
    throw new Error("Не получилось сформировать ответ");
  } catch (e) {
    await refund(c.orgId, PRICES.idea, "Чат: ошибка ответа").catch(() => {});
    await save(c.orgId, c.userId, "assistant", `Не получилось ответить: ${(e as Error).message.slice(0, 200)}. Деньги за ответ возвращены.`).catch(() => {});
    return { ok: true };
  }
}

/**
 * Карточки к ответу: те, что назвала модель (проверяются по базе), а по вызванным инструментам, которых модель не коснулась, добавляются
 * обычные (новости, аналитика, заводы…): пользователь видит сами данные, а не только пересказ.
 */
async function finalCards(orgId: string, asked: CardRef[], got: Record<string, unknown>): Promise<CardRef[]> {
  const have = new Set(asked.map((r) => r.t));
  const out = [...asked];
  const ids = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => String((x as { id?: unknown })?.id ?? "")).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, n);
  const add = (r: CardRef) => { if (!have.has(r.t) || r.t === "factory" || r.t === "brand") { out.push(r); have.add(r.t); } };
  const news = (got.news as { top?: unknown } | undefined)?.top;
  if (news && !have.has("news")) { const i = ids(news, 3); if (i.length) add({ t: "news", ids: i }); }
  if (got.analytics) add({ t: "analytics", days: Number((got.analytics as { days?: number }).days) || 7 });
  if (got.sources) add({ t: "sources" });
  if (got.competitors) add({ t: "competitors" });
  if (got.channels) add({ t: "channels" });
  if (got.items && !have.has("item")) { const i = ids(got.items, 4); if (i.length) add({ t: "item", ids: i }); }
  if (got.factories && !have.has("factory")) for (const id of ids(got.factories, 2)) out.push({ t: "factory", id });
  if (got.brands && !have.has("brand")) for (const id of ids(got.brands, 2)) out.push({ t: "brand", id });
  if (got.plan && !have.has("plan")) { const f = (got.plan as { factoryId?: string }).factoryId; if (f) add({ t: "plan", id: f }); }
  // проверка: пустые и чужие карточки не сохраняем
  const keep: CardRef[] = [];
  for (const r of out.slice(0, 7)) if ((await hydrateCards(orgId, [r])).length) keep.push(r);
  return keep.slice(0, 6);
}

/** Нажатие кнопки-действия: параметры берём из сохранённого сообщения, а не от браузера. */
export async function runMessageAction(ctx: ToolCtx, userId: string, messageId: string, index: number): Promise<{ ok: boolean; text: string; href?: string }> {
  const { runConfirmed } = await import("./tools");
  const row = await one<{ blocks: Blocks }>("select blocks from kz_chat_messages where id=$1 and org_id=$2 and user_id=$3 and role='assistant'", [messageId, ctx.orgId, userId]);
  const a = row?.blocks?.actions?.[index];
  if (!row || !a) return { ok: false, text: "Действие не найдено" };
  if (a.done) return { ok: false, text: "Это действие уже выполнено" };
  // отметка до выполнения: двойной клик не создаст дубль
  const claimed = await q<{ id: string }>(`update kz_chat_messages set blocks = jsonb_set(blocks, $3, to_jsonb('выполняется'::text)) where id=$1 and org_id=$2 and blocks #>> $3 is null returning id`, [messageId, ctx.orgId, `{actions,${index},done}`]);
  if (!claimed.length) return { ok: false, text: "Действие уже выполняется" };
  const r = await runConfirmed(ctx, a.tool, a.args).catch((e) => ({ ok: false, text: (e as Error).message.slice(0, 200) } as { ok: boolean; text: string; href?: string }));
  await q(`update kz_chat_messages set blocks = ${r.ok ? "jsonb_set(blocks, $3, to_jsonb($4::text))" : "blocks #- $3"} where id=$1 and org_id=$2`, [messageId, ctx.orgId, `{actions,${index},done}`, r.text]);
  return r;
}
