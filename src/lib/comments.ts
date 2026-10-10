import { one, q } from "./db";
import { brandBlock, chat, aiReady, type BrandCtx } from "./ai";
import { InsufficientFunds, PRICES, charge, refund } from "./wallet";

export type Tone = "neutral" | "positive" | "question" | "negative" | "spam";
export const TONE_LABEL: Record<Tone, string> = { neutral: "Обычный", positive: "Позитив", question: "Вопрос", negative: "Негатив", spam: "Спам" };

const SPAM = /(https?:\/\/|www\.|t\.me\/|vk\.cc|bit\.ly|@[a-z0-9_]{4,}|заработ|быстрые деньги|пассивн\w+ доход|казино|ставки на спорт|ставки|крипт|инвестиц\w+ под|пиши(те)? в л(с|ичку)|переходи(те)? по ссылке|подпиш(ись|итесь) на (мой|наш)|взаимн\w+ подписк|раскрутк|накрутк|18\+|интим|порно)/i;
const NEGATIVE = /(ужасн|отвратител|кошмар|развод|обман|мошенник|лохотрон|не рекомендую|не советую|хлам|мусор|дерьм|говно|брак(?![а-яё])|разочаров|жалоб|верните деньги|никогда больше|хамств|хамят|обслуживание (ужас|плох)|плох(ой|ое|ая|о)(?![а-яё])|худш|бред(?![а-яё])|ерунд|позор|стыд)/i;
const QUESTION = /(\?|^(как|где|когда|сколько|почему|зачем|можно ли|есть ли|подскажите|а если|какая|какой|какие|куда|кто)(?![а-яё]))/i;
const POSITIVE = /(спасибо|благодар|класс|супер|отличн|здорово|круто|нравится|нравятся|лучш(ий|ая|ие|ее)|молодцы|обожаю|рекомендую|👍|❤|🔥|😍)/i;

/**
 * Быстрая оценка тона комментария без нейросети (бесплатно, при сборе). Порядок: спам, негатив, вопрос, позитив.
 * Ошибается в сложных случаях (ирония), поэтому только помечает: решение всегда за человеком.
 */
export function classifyComment(text: string): Tone {
  const t = text.trim();
  if (!t) return "neutral";
  if (SPAM.test(t) || /(.)\1{9,}/.test(t) || (t.length > 30 && t === t.toUpperCase() && /[А-ЯA-Z]{12}/.test(t) && /!{2,}/.test(t))) return "spam";
  if (NEGATIVE.test(t)) return "negative";
  if (QUESTION.test(t)) return "question";
  if (POSITIVE.test(t)) return "positive";
  return "neutral";
}

/** Расставляет тон там, где его ещё нет (старые комментарии до появления разметки). */
export async function classifyPending(orgId: string, limit = 200): Promise<void> {
  const rows = await q<{ id: string; body: string }>("select id,body from kz_comments where org_id=$1 and tone is null limit $2", [orgId, limit]);
  for (const r of rows) await q("update kz_comments set tone=$2 where id=$1 and tone is null", [r.id, classifyComment(r.body)]);
}

const GUIDE: Record<Tone, string> = {
  negative: "Комментарий негативный. Ответь спокойно и с уважением: признай неудобство, не спорь и не оправдывайся, не обвиняй автора, предложи решить вопрос в личных сообщениях. Без шаблонных извинений и без обещаний, которых нет в описании бренда.",
  question: "В комментарии вопрос. Ответь по существу в 1–3 предложениях. Если ответа нет в описании бренда, не выдумывай: скажи, что уточнишь, и предложи написать в личные сообщения.",
  positive: "Комментарий добрый. Поблагодари искренне, одной-двумя фразами, без шаблонов и лишних эмодзи.",
  neutral: "Ответь коротко и дружелюбно по смыслу комментария.",
  spam: "Это похоже на спам: ответ не нужен.",
};

/** Черновик ответа от ИИ: учитывает бренд, пост и тон комментария. Платно (мало), при сбое деньги возвращаются. */
export async function suggestReply(orgId: string, commentId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const c = await one<{ id: string; body: string; author: string; tone: Tone | null; topic: string | null; post_body: string | null; name: string; description: string; audience: string; btone: string; rules: { forbidden?: string[] } | null; product: string | null; niche: string | null }>(
    `select cm.id,cm.body,cm.author,cm.tone,i.topic,i.body post_body,b.name,b.description,b.audience,b.tone btone,b.rules,f.product,f.niche
       from kz_comments cm join kz_channels ch on ch.id=cm.channel_id join kz_brands b on b.id=ch.brand_id
       left join kz_publications p on p.id=cm.publication_id left join kz_content_items i on i.id=p.item_id left join kz_factories f on f.id=i.factory_id
      where cm.id=$1 and cm.org_id=$2`, [commentId, orgId]);
  if (!c) return { ok: false, error: "Комментарий не найден" };
  const tone = c.tone ?? classifyComment(c.body);
  if (tone === "spam") return { ok: false, error: "Это похоже на спам. Скройте комментарий, отвечать на него не нужно." };
  try { await charge(orgId, PRICES.reply, "Черновик ответа на комментарий", c.id); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  const brand: BrandCtx = { name: c.name, description: c.description, audience: c.audience, tone: c.btone, forbidden: c.rules?.forbidden ?? [] };
  try {
    const text = (await chat("post",
      "Ты менеджер сообщества бренда. Отвечаешь на комментарии под постами от имени бренда. Пиши по-русски, тепло и коротко (до 350 знаков), без канцелярита. Не придумывай фактов, цен, сроков и контактов. Верни только текст ответа, без кавычек и пояснений.",
      `${brandBlock(brand, c.product ?? "", c.niche ?? "")}\n${c.topic ? `Пост, под которым комментарий: «${c.topic}»\n${(c.post_body ?? "").slice(0, 600)}\n` : ""}\nКомментарий от ${c.author}: «${c.body.slice(0, 800)}»\n\n${GUIDE[tone]}`,
      { maxTokens: 400, temperature: 0.6, timeoutMs: 30_000 })).trim().replace(/^["«]|["»]$/g, "").slice(0, 1000);
    if (!text) throw new Error("пустой ответ модели");
    await q("update kz_comments set draft=$2 where id=$1", [c.id, text]);
    return { ok: true, text };
  } catch (e) { await refund(orgId, PRICES.reply, "ошибка черновика ответа", c.id); return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}
