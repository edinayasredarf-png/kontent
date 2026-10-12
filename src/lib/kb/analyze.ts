import { createHash } from "node:crypto";
import { chat, extractObject } from "../ai";
import { q, one } from "../db";
import { charge, refund, PRICES, InsufficientFunds } from "../wallet";
import { cleanProfile, cleanStyle, emptyProfile, type Profile } from "./types";
import { kbBlock } from "./use";

export interface DocRow { id: string; kind: string; title: string; text: string; use_style: boolean; digest: unknown; chars: number }

const PROFILE_SHAPE = `{"about":"чем занимается компания, 2-4 предложения","mission":"","products":[{"name":"","desc":""}],"audience":[{"segment":"","needs":""}],"usp":["уникальные предложения"],"advantages":["чем лучше других, конкретно"],"competitors":[{"name":"","weakness":"","edge":"чем мы отличаемся"}],"proof":["факты, цифры, кейсы, награды, сроки, цены — только из текста"],"objections":[{"q":"возражение клиента","a":"как отвечаем"}],"faq":[{"q":"","a":""}],"terms":[{"term":"как мы называем","meaning":""}],"avoid":["что нельзя утверждать"]}`;

const SYS_DIGEST = `Ты аналитик бренда. По материалу компании составь структурированную выжимку для базы знаний. Правила: только факты из текста, ничего не выдумывай; если раздела нет в тексте — оставь пустым; формулировки короткие и конкретные; цифры, названия, сроки сохраняй точно. Ответ — один JSON-объект без пояснений и markdown формата: ${PROFILE_SHAPE}`;
const SYS_MERGE = `Ты редактор базы знаний бренда. Тебе дают несколько выжимок (JSON) из разных материалов одной компании. Объедини в один JSON той же структуры: убери повторы и противоречия (при противоречии оставь более конкретное), сгруппируй по смыслу, самое важное — вверх. Ничего не добавляй от себя. Ответ — один JSON-объект без пояснений формата: ${PROFILE_SHAPE}`;
const SYS_STYLE = `Ты редактор-стилист. По образцам текстов компании опиши её авторский стиль письма так, чтобы другой автор мог писать неотличимо. Не пересказывай содержание — описывай манеру. Ответ — один JSON-объект без пояснений формата: {"voice":"голос и характер, 2-4 предложения","person":"как обращаемся к читателю (ты/вы, мы/я) и как говорим о себе","sentence":"длина фраз и абзацев, ритм, пунктуация, эмодзи, списки","formatting":"заголовки, выделения, хештеги, подписи","structure":["типичная структура текста по шагам"],"openings":["2-4 типичных начала дословно"],"closings":["2-4 типичных концовки дословно"],"like":["характерные слова и обороты"],"dislike":["чего авторы никогда не делают: штампы, слова"],"rules":["конкретные правила письма, 5-10 пунктов"],"samples":["2-3 самых характерных абзаца (до 400 знаков) дословно из образцов"]}`;

/** Равномерная выборка из образцов, чтобы уместить их в один запрос: из каждого берётся начало. */
export function sampleTexts(texts: string[], budget: number): string {
  if (!texts.length) return "";
  const each = Math.max(600, Math.floor(budget / texts.length));
  return texts.map((t, i) => `--- Образец ${i + 1} ---\n${t.slice(0, each)}`).join("\n\n").slice(0, budget);
}

/** Механическое слияние выжимок: используется, когда выжимка одна или модель на объединении не ответила. */
export function mergeProfiles(ps: Profile[]): Profile {
  const m = emptyProfile();
  const uniq = <T>(a: T[], key: (x: T) => string) => { const s = new Set<string>(); return a.filter((x) => { const k = key(x).toLowerCase(); if (s.has(k)) return false; s.add(k); return true; }); };
  m.about = ps.map((p) => p.about).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? "";
  m.mission = ps.map((p) => p.mission).find(Boolean) ?? "";
  m.products = uniq(ps.flatMap((p) => p.products), (x) => x.name);
  m.audience = uniq(ps.flatMap((p) => p.audience), (x) => x.segment);
  m.usp = uniq(ps.flatMap((p) => p.usp), (x) => x);
  m.advantages = uniq(ps.flatMap((p) => p.advantages), (x) => x);
  m.competitors = uniq(ps.flatMap((p) => p.competitors), (x) => x.name);
  m.proof = uniq(ps.flatMap((p) => p.proof), (x) => x);
  m.objections = uniq(ps.flatMap((p) => p.objections), (x) => x.q);
  m.faq = uniq(ps.flatMap((p) => p.faq), (x) => x.q);
  m.terms = uniq(ps.flatMap((p) => p.terms), (x) => x.term);
  m.avoid = uniq(ps.flatMap((p) => p.avoid), (x) => x);
  return cleanProfile(m);
}

async function paid<T>(orgId: string, kop: number, reason: string, ref: string, run: () => Promise<T>): Promise<T> {
  await charge(orgId, kop, reason, ref);
  try { return await run(); } catch (e) { await refund(orgId, kop, `Возврат: ${reason}`, ref).catch(() => {}); throw e; }
}

async function digestOne(orgId: string, d: DocRow): Promise<{ ok: boolean; error?: string }> {
  try {
    const out = await paid(orgId, PRICES.kbDigest, "База знаний: разбор материала", d.id, async () => {
      const raw = await chat("analyst", SYS_DIGEST, `Тип материала: ${d.kind}\nНазвание: ${d.title}\n\n${d.text.slice(0, 16_000)}`, { maxTokens: 2500, temperature: 0.2, timeoutMs: 55_000 });
      const o = extractObject(raw);
      if (!o) throw new Error("Модель вернула ответ не в том формате");
      return cleanProfile(o);
    });
    await q("update kz_brand_docs set digest=$2, digest_error=null, digested_at=now() where id=$1", [d.id, JSON.stringify(out)]);
    return { ok: true };
  } catch (e) {
    const m = e instanceof InsufficientFunds ? "Недостаточно средств на балансе" : (e as Error).message.slice(0, 300);
    await q("update kz_brand_docs set digest_error=$2 where id=$1", [d.id, m]);
    return { ok: false, error: m };
  }
}

export interface AnalyzeResult { digested: number; failed: number; pending: number; profile: boolean; style: boolean; error?: string }

/**
 * Единоразовый разбор всей базы: выжимка по каждому новому материалу, слияние в общий профиль и отдельный разбор стиля по образцам.
 * За один вызов обрабатывается не больше 6 новых материалов (лимит времени); остальные разбираются следующим нажатием.
 */
export async function analyzeBrand(orgId: string, brandId: string, opts: { force?: boolean } = {}): Promise<AnalyzeResult> {
  const res: AnalyzeResult = { digested: 0, failed: 0, pending: 0, profile: false, style: false };
  const docs = await q<DocRow>("select id,kind,title,text,use_style,digest,chars from kz_brand_docs where brand_id=$1 and org_id=$2 order by created_at", [brandId, orgId]);
  if (!docs.length) { res.error = "Добавьте хотя бы один материал"; return res; }
  const todo = docs.filter((d) => opts.force || !d.digest);
  const batch = todo.slice(0, 6);
  res.pending = Math.max(0, todo.length - batch.length);
  for (let i = 0; i < batch.length; i += 3) {
    const rs = await Promise.all(batch.slice(i, i + 3).map((d) => digestOne(orgId, d)));
    for (const r of rs) { if (r.ok) res.digested++; else { res.failed++; res.error ??= r.error; } }
  }
  const fresh = await q<{ digest: unknown }>("select digest from kz_brand_docs where brand_id=$1 and org_id=$2 and digest is not null order by created_at", [brandId, orgId]);
  const digests = fresh.map((d) => cleanProfile(d.digest));
  const keep = !digests.length ? await one<{ profile: unknown }>("select profile from kz_brand_kb where brand_id=$1", [brandId]) : null;
  let profile = digests.length ? mergeProfiles(digests) : cleanProfile(keep?.profile);
  if (res.pending === 0 && digests.length > 1 && (res.digested > 0 || opts.force)) {
    try {
      profile = await paid(orgId, PRICES.kbMerge, "База знаний: сведение в единый профиль", brandId, async () => {
        const raw = await chat("analyst", SYS_MERGE, JSON.stringify(digests.map((p) => ({ ...p, faq: p.faq.slice(0, 8) }))).slice(0, 40_000), { maxTokens: 4000, temperature: 0.2, timeoutMs: 58_000 });
        const o = extractObject(raw);
        if (!o) throw new Error("формат");
        const p = cleanProfile(o);
        return p.about || p.products.length ? p : profile;
      });
    } catch (e) { if (e instanceof InsufficientFunds) res.error ??= "Недостаточно средств для сведения профиля; сохранён упрощённый"; }
  }
  const styleDocs = docs.filter((d) => d.use_style);
  const hash = createHash("sha1").update(styleDocs.map((d) => d.id + d.chars).join(",")).digest("hex");
  const cur = await one<{ style_hash: string | null; style: unknown }>("select style_hash,style from kz_brand_kb where brand_id=$1", [brandId]);
  let style = cleanStyle(cur?.style);
  let newHash = cur?.style_hash ?? null;
  if (styleDocs.length && res.pending === 0 && (opts.force || cur?.style_hash !== hash)) {
    try {
      style = await paid(orgId, PRICES.kbStyle, "База знаний: разбор стиля письма", brandId, async () => {
        const raw = await chat("analyst", SYS_STYLE, sampleTexts(styleDocs.map((d) => d.text), 24_000), { maxTokens: 2500, temperature: 0.3, timeoutMs: 58_000 });
        const o = extractObject(raw);
        if (!o) throw new Error("Модель вернула ответ не в том формате");
        return cleanStyle(o);
      });
      newHash = hash; res.style = true;
    } catch (e) { res.error ??= e instanceof InsufficientFunds ? "Недостаточно средств для разбора стиля" : `Стиль не разобран: ${(e as Error).message.slice(0, 200)}`; }
  }
  await q(`insert into kz_brand_kb(brand_id,org_id,profile,style,style_hash,analyzed_at,docs_count,updated_at) values($1,$2,$3,$4,$5,now(),$6,now())
    on conflict (brand_id) do update set profile=excluded.profile, style=excluded.style, style_hash=excluded.style_hash, analyzed_at=now(), docs_count=excluded.docs_count, updated_at=now()`,
    [brandId, orgId, JSON.stringify(profile), JSON.stringify(style), newHash, docs.length]);
  res.profile = true;
  return res;
}

/** Проверка стиля: короткий пост на заданную тему по базе знаний. */
export async function testStyle(orgId: string, brandId: string, topic: string): Promise<string> {
  const kb = await one<{ profile: unknown; style: unknown }>("select profile,style from kz_brand_kb where brand_id=$1 and org_id=$2", [brandId, orgId]);
  if (!kb) throw new Error("Сначала проанализируйте материалы");
  const block = kbBlock(cleanProfile(kb.profile), cleanStyle(kb.style), topic);
  if (!block) throw new Error("База знаний пуста");
  return paid(orgId, PRICES.kbTest, "База знаний: пробный текст", brandId, () =>
    chat("post", `Ты автор бренда. Напиши пост (500–800 знаков) строго в стиле бренда, опираясь на базу знаний.\n\n${block}`, `Тема: ${topic}`, { maxTokens: 900, temperature: 0.7, timeoutMs: 55_000 }));
}
