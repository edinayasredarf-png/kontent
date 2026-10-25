import { one, q } from "../db";
import { aiReady, chat, extractObject } from "../ai";
import { PRICES, InsufficientFunds, charge, refund } from "../wallet";
import { cleanRefs, hydrateCards, type Card, type CardRef } from "./cards";
import type { ActResult } from "./writer";
import { loadAsset } from "../assets";
import { ONBOARDING_TITLE, progressText } from "./onboarding";
import { createThread, currentThread, threadsReady } from "./threads";
import { setUsageCtx, usageStore } from "../billing";
import { visionAsk } from "../images";
import { TOOLS, runAct, runAuto, runRead, toolByName, validateAction, type Args, type ToolCtx } from "./tools";

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
export interface ChatFile { id: string; name: string; kind: "image" | "doc" }
export interface Blocks { links?: Link[]; actions?: Action[]; cards?: CardRef[]; files?: ChatFile[]; replies?: string[] }
export interface ChatMsg { id: string; role: "user" | "assistant"; content: string; blocks: Blocks; created_at: string; cards?: Card[]; cost_kop?: number }

const toolDocs = () => TOOLS.map((t) => `- ${t.name} ${t.args} — ${t.desc}${t.kind === "confirm" ? " [только предложение: выполнится после нажатия кнопки пользователем]" : t.kind === "act" ? " [выполняется сразу, платно]" : ""}`).join("\n");
const sectionDocs = () => Object.entries(SECTIONS).map(([h, l]) => `${h} — ${l}`).join("\n") + "\n/app/factories/<id завода>, /app/brands/<id бренда>, /app/brands/<id бренда>/knowledge (база знаний бренда), /app/flows/<id потока>";

const SYSTEM = (name: string) => `Ты ассистент платформы «Контент-завод»: помогаешь вести контент компании. Обращайся к пользователю по имени (${name || "без имени"}) на «вы». Отвечай по-русски, дружелюбно, коротко, без воды и без технических слов (никаких id, JSON, названий инструментов в тексте).
Ты видишь данные аккаунта через инструменты. Цифры и названия берёшь только из результатов инструментов, не выдумываешь.
Каждый твой ответ — ОДИН JSON-объект и ничего вне него. Два вида:
1) вызвать инструмент: {"tool":"имя","args":{...}}
2) финальный ответ: {"final":{"text":"текст для человека; абзацы через \\n\\n, списки через «• »","links":[],"actions":[],"cards":[],"replies":[]}}
"replies" — до 4 коротких вариантов ответа человека (кнопки), когда ты задаёшь вопрос с понятными вариантами («Да, давайте», «Пропустить», «Покажи примеры»). Без вопроса не добавляй.
В "text" пиши обычный текст: кавычки внутри экранируй (\\"), а лучше используй «ёлочки».
Инструменты:
${toolDocs()}
КАК РАБОТАТЬ:
- ОБУЧЕНИЕ НОВОГО КЛИЕНТА. Когда в данных есть блок «Прогресс настройки» (диалог «Знакомство» или человек просит настроить с нуля, обучить, с чего начать), ты ведёшь настройку как внимательный консультант:
  ПРАВИЛА ВЕДЕНИЯ. Блок «УЖЕ СОХРАНЕНО В СЕРВИСЕ» — твоя память: не переспрашивай то, что там заполнено, а дополняй пустое («—»). Задавай один вопрос за раз (максимум два связанных), коротко, и к каждому вопросу давай готовые варианты в "replies" и 1–2 рекомендации с причиной. Если человек ответил сразу на несколько вопросов или прислал сайт, документ, ответ не по порядку, используй всё сразу, сохрани и переходи к первому незакрытому шагу. Подстраивайся под бизнес: для услуг и B2B советуй кейсы, экспертные посты и SEO-статьи; для товаров и розницы — карусели и истории; для локального бизнеса — акции и отзывы; для блога и медиа — новости и лонгриды. Не используй одни и те же формулировки, примеры бери из ниши клиента. Если человек сомневается, предложи разумное значение по умолчанию и скажи, что это можно поменять позже. Никогда не придумывай факты о компании: предлагай, а сохраняй после согласия, кроме случая, когда человек сам продиктовал значение. После каждого сохранения коротко подтверди, что именно записано, покажи карточку «setup» и предложи следующий шаг.
  ШАГИ.
  1) Бренд: название; чем занимается и что продаёт; для кого (аудитория, боли); тон общения; что нельзя упоминать; главные конкуренты. Дал сайт: прочитай (site), при нужде поищи (search), предложи заполнение и спроси «Сохранить?», потом save_brand.
  2) Брендбук: логотип (прикрепить файл, затем set_logo), цвета (предложи из логотипа или стиля ниши), стиль картинок (minimal, futurism, corporate, popart, pastel, dark, photo, illustration: посоветуй под нишу), что всегда и чего никогда не должно быть на картинках, документы (о компании, примеры лучших постов или статей для обучения стилю, кейсы, FAQ): add_to_kb. Всё сохраняй через save_brand и add_to_kb.
  3) Контент-завод: название, ниша, продукт и главные выгоды, форматы (рекомендуй под нишу), дни и время выхода (для старта 3 раза в неделю, утро или вечер по аудитории), длина постов (short, medium, long), эмодзи, хештеги, призыв к действию, ссылка на сайт, ручное одобрение идей и выключенная автопубликация на старте, картинки к постам. Предложи набор и после согласия save_factory (там же approval, autopublish, images, channels, length, emoji, hashtags, cta, link).
  4) Каналы: покажи защищённую форму connect_channel (kind: telegram, vk, max_bot…), коротко объясни, какие значения нужны и где их взять. Токены и пароли просишь вводить ТОЛЬКО в эту форму и никогда сообщением. После подключения (человек напишет «готово») проверь инструментом channels и привяжи канал к заводу через save_factory (channels).
  5) Мониторинг: предложи 5–8 источников под нишу (отраслевые СМИ, Telegram-каналы, группы VK, сайты конкурентов), добавь одобренные через add_source; ключевые слова подбери (suggest_keywords или сам, платно покажи цену) и сохрани add_keywords вместе со словами-исключениями.
  6) Первый материал: предложи написать пост по свежей новости из мониторинга или по теме клиента и сделай через write; потом предложи вариант в другом формате и постановку в план.
  Когда всё готово или человек просит пропустить, вызови finish_onboarding и коротко подведи итог: что настроено, чего не хватает, что делать дальше.
- Просят НАПИСАТЬ, создать, сделать пост, статью, SEO-статью, карусель, сторис: вызови write (источник: новость, ссылка из сообщения, тема или прежний материал) и сразу дай финальный ответ. Сам материал покажется в чате под твоим текстом, поэтому не пересказывай его и не вставляй в text. В тексте скажи одной фразой, что сделано, и закончи абзацем «Что дальше:» с 2–3 конкретными следующими шагами именно для этого материала (например: добавить картинку; сделать длиннее или другой тон; сделать из него SEO-статью или карусель; поставить в контент-план на выбранный день; опубликовать в каналы).
- Если для новости нужен выбор, а пользователь не назвал новость, найди подходящую инструментом news (если просят «из новостей за неделю», передай hours) и пиши по лучшей, назвав, какую выбрал. Ссылку, которую прислал пользователь, передавай в url.
- Просят изменить уже показанный материал («длиннее», «короче», «в дружелюбном тоне», «перепиши как SEO-статью», «другая картинка», «сделай вертикальную», «логотип в левый верхний угол», «убери логотип»): вызови rewrite или image с itemId из списка «Материалы в этом диалоге» (по умолчанию последний), для другого формата вызови write с itemId. Не переспрашивай, если можно догадаться.
- Заполнение бренда и завода: человек рассказывает о бизнесе, даёт сайт или просит подобрать сам. Прочитай сайт (site) или поищи (search), предложи значения коротким текстом и спроси «Сохранить?». Если человек сказал «заполни», «сохрани», «поменяй» или согласился, вызови save_brand и save_factory (бесплатно, сразу): сказанное в чате применяется в настройках.
- Цены операций (₽): пост %PRICE_POST%, карусель %PRICE_CAROUSEL%, SEO-статья %PRICE_SEO%, картинка %PRICE_IMAGE%, идея плана %PRICE_PLAN%. Если действие дороже примерно 50 ₽ (серия из 5 и более материалов, картинки ко всем разделам, несколько материалов подряд), СНАЧАЛА назови итоговую цену и спроси «Делаем?», и выполни после согласия. Мелкие операции делай сразу.
- Серия, неделя контента, план по теме: series. Несколько вариантов на выбор: variants. «Поставь на завтра в 10», «опубликуй в VK и Telegram»: schedule и publish (публикуй только по прямой просьбе, перед публикацией убедись, что материал тот). «Не пиши про…», «всегда добавляй…»: remember. «Убери надпись с картинки», «смени фон» на присланной картинке: edit_image. «Почему этот пост сработал», «сделай как лучший»: top_posts, потом объясни или вызови write с темой лучшего поста.
- Логотип на картинке (больше, меньше, другое место, убрать) меняй только через image с op logo, а не rework: это делается кодом, без нейросети.
- Вложения пользователя (картинки и документы) описаны в блоке «Вложения». Что с ними делать, определи по просьбе: «сделай в таком стиле» или «вот референс»: используй описание стиля в prompt для image (op new/redo) или в instructions для write; «поставь эту картинку в пост»: write с imageAssetId или image с op use; «напиши по этому документу»: write с fileId; «это наш логотип»: set_logo; «заполни бренд по документу»: save_brand/save_factory по тексту документа; «что на картинке», «проанализируй»: просто ответь текстом. Если непонятно, что сделать с файлом, коротко спроси.
- Просят ПОКАЗАТЬ или поменять настройки, данные (аналитику, каналы, бренды, заводы, конкурентов, источники, план): тогда и только тогда добавь карточку в "cards". Пока человек об этом не просил, карточек не добавляй.
- Платные действия выполняй, только если пользователь прямо попросил что-то создать или изменить. На вопросы и «покажи» ничего платного не запускай. За одно сообщение не больше трёх платных действий.
- Настройки (set_factory, set_source_status, extend_plan, create_from_news) только предложи в "actions": человек нажмёт кнопку сам.
- Если инструмент вернул ошибку, объясни человеку простыми словами, что делать дальше.
- "links" давай только когда они реально нужны (например «Открыть календарь» после постановки в план), не больше двух, и не давай, если ответ уже содержит материал или карточку. Разрешены только адреса:
${sectionDocs()}
Карточки (type): news {"ids":[uuid…]} до 3 постов ленты; item {"ids":[…]} материалы; factory {"id"}; brand {"id"}; plan {"id"}; analytics {"days":1|7|30|90}; sources; competitors; channels. uuid берёшь только из результатов инструментов.
Если чего-то нет в платформе, честно скажи. Юридических и финансовых советов не давай. Ответ до 120 слов.`;


const TODAY = () => new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export async function loadHistory(orgId: string, userId: string, limit = 40, threadId: string | null = null): Promise<ChatMsg[]> {
  const t = threadId && (await threadsReady());
  const rows = t
    ? await q<ChatMsg>("select id,role,content,blocks,created_at,cost_kop from kz_chat_messages where org_id=$1 and user_id=$2 and thread_id=$4 order by created_at desc limit $3", [orgId, userId, limit, threadId])
    : await q<ChatMsg>("select id,role,content,blocks,created_at from kz_chat_messages where org_id=$1 and user_id=$2 order by created_at desc limit $3", [orgId, userId, limit]);
  return rows.reverse();
}
/** История чата вместе со свежими данными карточек (ссылки на объекты превращаются в актуальные карточки). */
export async function loadHistoryWithCards(orgId: string, userId: string, limit = 40, threadId: string | null = null): Promise<ChatMsg[]> {
  const msgs = await loadHistory(orgId, userId, limit, threadId);
  // карточки показываем только у последних ответов: старые остаются текстом, чтобы страница не тяжелела
  const recent = msgs.filter((m) => m.role === "assistant" && m.blocks?.cards?.length).slice(-6);
  await Promise.all(recent.map(async (m) => { m.cards = await hydrateCards(orgId, m.blocks.cards); }));
  return msgs;
}
export const clearHistory = (orgId: string, userId: string) => q("delete from kz_chat_messages where org_id=$1 and user_id=$2", [orgId, userId]);

async function save(orgId: string, userId: string, role: "user" | "assistant", content: string, blocks: Blocks = {}, threadId: string | null = null, cost = 0) {
  if (threadId) {
    await q("insert into kz_chat_messages(org_id,user_id,role,content,blocks,thread_id,cost_kop) values($1,$2,$3,$4,$5,$6,$7)", [orgId, userId, role, content, JSON.stringify(blocks), threadId, Math.round(cost)]);
    // название диалога — начало первого вопроса; свежие диалоги поднимаются наверх списка
    await q("update kz_chat_threads set updated_at=now(), title=case when title='Новый диалог' and $2='user' then $3 else title end where id=$1", [threadId, role, content.replace(/\s+/g, " ").slice(0, 60)]);
  } else await q("insert into kz_chat_messages(org_id,user_id,role,content,blocks) values($1,$2,$3,$4,$5)", [orgId, userId, role, content, JSON.stringify(blocks)]);
}

const cut = (v: unknown, n = 5500) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…(обрезано)" : s; };


/** Объект из ответа модели. Модель иногда присылает «почти JSON» (перенос строки внутри текста, неэкранированные кавычки): чиним, а в крайнем случае достаём текст вручную. Сырой JSON человеку не показываем никогда. */
export function parseReply(raw: string): { tool?: string; args?: Args; final?: { text: string; links?: unknown; actions?: unknown; cards?: unknown; replies?: unknown } } | null {
  const direct = extractObject(raw);
  if (direct) return normalize(direct);
  // чиним переносы строк внутри строк
  let out = "", inStr = false, esc = false;
  for (const ch of raw.replace(/```(?:json)?/g, "")) {
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { out += ch; esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    out += inStr && ch === "\n" ? "\\n" : inStr && ch === "\r" ? "" : inStr && ch === "\t" ? " " : ch;
  }
  const fixed = extractObject(out);
  if (fixed) return normalize(fixed);
  // последний шанс: вытаскиваем текст и блоки регулярками
  const m = raw.match(/"text"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"(?:links|cards|actions)"|\}\s*\}?\s*$)/);
  if (m) {
    const grab = (k: string) => { const g = raw.match(new RegExp(`"${k}"\\s*:\\s*(\\[[\\s\\S]*?\\])\\s*(?:,\\s*"|\\}\\s*\\}?\\s*$)`)); try { return g ? JSON.parse(g[1]) : undefined; } catch { return undefined; } };
    return { final: { text: m[1], links: grab("links"), cards: grab("cards"), actions: grab("actions") } };
  }
  return null;
}
function normalize(o: Record<string, unknown>): { tool?: string; args?: Args; final?: { text: string; links?: unknown; actions?: unknown; cards?: unknown; replies?: unknown } } | null {
  if (typeof o.tool === "string") return { tool: o.tool, args: (o.args as Args) ?? {} };
  const f = (o.final ?? o) as { text?: unknown; links?: unknown; actions?: unknown; cards?: unknown };
  return typeof f.text === "string" ? { final: { text: f.text, links: f.links, actions: f.actions, cards: f.cards, replies: (f as { replies?: unknown }).replies } } : null;
}
/** Текст ответа без остатков разметки: литеральные «\n», хвост из JSON, лишние пробелы. */
export function cleanReply(t: string): string {
  let x = t.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  const cut = x.search(/["”]?\s*,\s*"(?:links|cards|actions)"\s*:/);
  if (cut > 0) x = x.slice(0, cut);
  x = x.replace(/^\s*\{\s*"final"\s*:\s*\{\s*"text"\s*:\s*"?/, "").replace(/["”]?\s*\}\s*\}?\s*$/, "");
  return x.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

/** Материалы, показанные в последних ответах: ассистент подставляет их id, когда человек говорит «сделай длиннее» или «другая картинка». */
async function recentItems(orgId: string, userId: string, thread: string | null): Promise<string> {
  const rows = thread
    ? await q<{ blocks: Blocks }>("select blocks from kz_chat_messages where org_id=$1 and user_id=$2 and thread_id=$3 and role='assistant' order by created_at desc limit 6", [orgId, userId, thread])
    : await q<{ blocks: Blocks }>("select blocks from kz_chat_messages where org_id=$1 and user_id=$2 and role='assistant' order by created_at desc limit 6", [orgId, userId]);
  const ids: string[] = [];
  for (const r of rows) for (const c of r.blocks?.cards ?? []) if (c.t === "item") for (const id of c.ids) if (!ids.includes(id)) ids.push(id);
  if (!ids.length) return "";
  const list = await q<{ id: string; kind: string; topic: string; image: boolean }>("select id,kind,topic,image_id is not null image from kz_content_items where org_id=$1 and id = any($2::uuid[])", [orgId, ids.slice(0, 5)]);
  const by = new Map(list.map((x) => [x.id, x]));
  const lines = ids.slice(0, 5).map((id) => by.get(id)).filter((x): x is NonNullable<typeof x> => !!x).map((x, i) => `${i === 0 ? "(последний) " : ""}${x.id}: ${x.kind}, «${x.topic.slice(0, 70)}», картинка ${x.image ? "есть" : "нет"}`);
  return lines.length ? `Материалы в этом диалоге:\n${lines.join("\n")}\n\n` : "";
}

/** Токены и ключи, случайно присланные сообщением: вырезаем до сохранения и до нейросети. */
export function redactSecrets(t: string): string {
  return t
    .replace(/\b\d{8,11}:[A-Za-z0-9_-]{30,}\b/g, "[токен скрыт]")
    .replace(/\bvk1\.a\.[A-Za-z0-9_.-]{20,}/g, "[токен скрыт]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, "[ключ скрыт]")
    .replace(/(токен|token|ключ|пароль|password)\s*[:=]\s*[A-Za-z0-9_.\-]{20,}/gi, "$1: [скрыто]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[токен скрыт]");
}

const MAX_ACTS = 3;
const rubP = (k: number) => String(Math.round(k) / 100).replace(".", ",");

export async function askAgent(c: { orgId: string; userId: string; userName: string; role: string }, message: string, fileIds: string[] = [], threadIn: string | null = null): Promise<{ ok: true; threadId?: string } | { ok: false; error: string }> {
  const raw0 = message.trim();
  const m = redactSecrets(raw0);
  const leaked = m !== raw0;
  if (!m) return { ok: false, error: "Напишите сообщение" };
  if (m.length > 1500) return { ok: false, error: "Сообщение слишком длинное (до 1500 знаков)" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const files: ChatFile[] = [];
  const attach: string[] = [];
  for (const fid of fileIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 4)) {
    const f = await loadAsset(c.orgId, fid);
    if (!f || f.note !== "вложение чата") continue;
    if (f.mime.startsWith("image/")) {
      files.push({ id: fid, name: f.name, kind: "image" });
      const d = await visionAsk(`data:${f.mime};base64,${f.data.toString("base64")}`, "Опиши изображение для редактора контента: что на нём, композиция, палитра, настроение, стиль (фото, иллюстрация, 3D…). Весь текст на картинке перепиши дословно. До 120 слов.").catch((e) => `(описание недоступно: ${(e as Error).message.slice(0, 80)})`);
      attach.push(`- картинка assetId=${fid}, «${f.name}»: ${d.slice(0, 900)}`);
    } else {
      files.push({ id: fid, name: f.name, kind: "doc" });
      attach.push(`- документ fileId=${fid}, «${f.name}»: ${f.data.toString("utf8").slice(0, 4500)}`);
    }
  }
  const attached = attach.length ? `Вложения:\n${attach.join("\n")}\n\n` : "";
  const ctx: ToolCtx = { orgId: c.orgId, userId: c.userId, role: c.role };
  const thread = (await threadsReady()) ? (threadIn ? await currentThread(c.orgId, c.userId, threadIn) : null) ?? (await createThread(c.orgId, c.userId)) : null;
  setUsageCtx({ spent: 0 });
  const hist = (await loadHistory(c.orgId, c.userId, /Знакомство/.test((await one<{ title: string }>("select title from kz_chat_threads where id=$1", [thread ?? "00000000-0000-0000-0000-000000000000"]).catch(() => null))?.title ?? "") ? 24 : 8, thread)).map((h) => `${h.role === "user" ? "Пользователь" : "Ассистент"}: ${h.content.slice(0, 1200)}`).join("\n");
  const shown0 = await recentItems(c.orgId, c.userId, thread);
  const th = thread ? await one<{ title: string }>("select title from kz_chat_threads where id=$1", [thread]) : null;
  const onboarding = th?.title === ONBOARDING_TITLE || /настро(й|ить|им)|обучен|с нуля|с чего начать|помоги начать|пройти обучение/i.test(m);
  const shown = (onboarding ? await progressText(c.orgId) : "") + shown0 + (leaked ? "ВАЖНО: пользователь прислал в сообщении токен или ключ, он удалён из переписки. Не повторяй его. Объясни, что такие данные вводятся только в защищённой форме, и вызови connect_channel (kind по смыслу), токен просить не нужно повторно в сообщении.\n\n" : "");
  try { await charge(c.orgId, PRICES.idea, "Чат: ответ"); } catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  await save(c.orgId, c.userId, "user", m, files.length ? { files } : {}, thread);
  const t0 = Date.now();
  let scratch = "", acts = 0;
  const got: Record<string, unknown> = {}, made: string[] = [], extra: CardRef[] = [];
  const failed: string[] = [];
  const notes: string[] = [];
  try {
    for (let step = 0; step < 7; step++) {
      if (Date.now() - t0 > 240_000) throw new Error("Слишком долго думаю, попробуйте короче");
      const last = step >= 6;
      const raw = await chat("assistant", SYSTEM(c.userName).replace("%PRICE_POST%", rubP(PRICES.post)).replace("%PRICE_CAROUSEL%", rubP(PRICES.carousel)).replace("%PRICE_SEO%", rubP(PRICES.seo)).replace("%PRICE_IMAGE%", rubP(PRICES.image)).replace("%PRICE_PLAN%", rubP(PRICES.plan_day)), `Сегодня ${TODAY()}.\n${shown}${attached}${hist ? `Диалог до этого:\n${hist}\n\n` : ""}Пользователь: ${m}\n${scratch}${last ? "\nБольше инструментов нет: дай финальный ответ." : ""}`, { maxTokens: 1500, temperature: 0.3, timeoutMs: 60_000 });
      const o = parseReply(raw);
      if (o?.tool && !last) {
        const t = toolByName(o.tool);
        let res: unknown;
        if (!t || t.kind === "confirm") res = { error: t ? "Это действие только предлагается кнопкой в финальном ответе" : "Нет такого инструмента" };
        else if (t.kind === "act") {
          if (acts >= MAX_ACTS) res = { error: "В одном сообщении можно не больше трёх платных действий" };
          else { acts++; const r = await runAct(ctx, t.name, o.args ?? {}).catch((e) => ({ ok: false, text: (e as Error).message.slice(0, 200) } as ActResult)); res = r.ok ? { ok: true, result: r.text, itemId: r.itemIds?.[0] } : { error: r.text }; if (!r.ok) failed.push(r.text); if (r.ok) { for (const id of r.itemIds ?? []) if (!made.includes(id)) made.push(id); extra.push(...((r as { refs?: CardRef[] }).refs ?? [])); notes.push(r.text); } }
        } else { try { res = t.kind === "auto" ? await runAuto(ctx, t.name) : await runRead(ctx, t.name, o.args ?? {}); } catch (e) { res = { error: (e as Error).message.slice(0, 200) }; } }
        got[o.tool] = res;
        scratch += `\nВызван ${o.tool}. Результат: ${cut(res)}\n`;
        continue;
      }
      const fin = o?.final;
      let text = fin ? cleanReply(fin.text) : "";
      // модель не следует формату: показываем её текст без разметки, а если и его нет — просим ещё раз
      if (!fin) { const bare = cleanReply(raw.replace(/^\s*\{[\s\S]*$/, "")); if (bare && !/^[{\[]/.test(bare)) text = bare; }
      if (!text && made.length) text = notes.join(". ");
      if (text && failed.length && !made.length) text += `\n\nПричина: ${failed[failed.length - 1].slice(0, 300)}`;
      if (!text) { scratch += "\nНужен финальный ответ в формате {\"final\":{...}}.\n"; continue; }
      const links = (Array.isArray(fin?.links) ? fin!.links as { label?: unknown; href?: unknown }[] : []).map((l) => ({ label: String(l?.label ?? "").slice(0, 60), href: cleanHref(l?.href) })).filter((l): l is Link => !!l.label && !!l.href).slice(0, 2);
      const actions: Action[] = [];
      for (const a of (Array.isArray(fin?.actions) ? fin!.actions as { label?: unknown; tool?: unknown; args?: unknown }[] : []).slice(0, 4)) {
        const tool = String(a?.tool ?? "");
        if (toolByName(tool)?.kind !== "confirm") continue;
        const v = await validateAction(ctx, tool, (a.args as Args) ?? {});
        if (v.ok) actions.push({ label: String(a.label ?? "").slice(0, 80) || tool, tool, args: v.args, hint: v.hint });
      }
      const asked = cleanRefs(fin?.cards);
      // написанный материал всегда показываем целиком: текст, картинка и кнопки правки
      const refs: CardRef[] = made.length ? [{ t: "item", ids: made.slice(0, 3) }] : [...extra, ...asked];
      const replies = (Array.isArray(fin?.replies) ? (fin!.replies as unknown[]) : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 4);
      const cards = await keepCards(c.orgId, refs);
      await save(c.orgId, c.userId, "assistant", text, { links: made.length ? [] : links, actions, cards, ...(replies.length ? { replies } : {}) }, thread, usageStore().spent ?? 0);
      return { ok: true, threadId: thread ?? undefined };
    }
    throw new Error("Не получилось сформировать ответ");
  } catch (e) {
    await refund(c.orgId, PRICES.idea, "Чат: ошибка ответа").catch(() => {});
    // материал мог успеть создаться: показываем его, даже если ответ не сложился
    const cards = made.length ? await keepCards(c.orgId, [{ t: "item", ids: made.slice(0, 3) }]) : [];
    await save(c.orgId, c.userId, "assistant", made.length ? `${notes.join(". ")}. Ответ получился не до конца, но материал готов.` : `Не получилось ответить: ${(e as Error).message.slice(0, 200)}. Деньги за ответ возвращены.`, cards.length ? { cards } : {}, thread, usageStore().spent ?? 0).catch(() => {});
    return { ok: true, threadId: thread ?? undefined };
  }
}

/** Оставляем только карточки с реальными данными: пустые и чужие не сохраняем. */
async function keepCards(orgId: string, refs: CardRef[]): Promise<CardRef[]> {
  const keep: CardRef[] = [];
  const seen = new Set<string>();
  for (const r of refs.slice(0, 5)) {
    const k = JSON.stringify(r); if (seen.has(k)) continue; seen.add(k);
    if ((await hydrateCards(orgId, [r])).length) keep.push(r);
  }
  return keep;
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
