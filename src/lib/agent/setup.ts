import { one, q } from "../db";
import { cleanKit, STYLES, type Kit } from "../images";
import { PLANS, type PlanKey } from "../plans";
import { htmlTitle, htmlToText } from "../repurpose";
import { safeFetchText } from "../safefetch";
import type { ActResult } from "./writer";
import type { CardRef } from "./cards";

/** Заполнение брендов и заводов из чата и чтение интернета для подсказок. Сохранение бесплатное и сразу: ассистент вызывает его, когда человек сказал «заполни/сохрани» или согласился с предложением. */
type Args = Record<string, unknown>;
export type SetupResult = ActResult & { refs?: CardRef[] };
const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : "");
const has = (a: Args, k: string) => a[k] !== undefined && a[k] !== null;
const txt = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const list = (v: unknown, n = 20) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);

async function orgLimits(orgId: string) {
  const o = await one<{ plan: PlanKey; unlimited: boolean }>("select plan,unlimited from kz_orgs where id=$1", [orgId]);
  return o ? { brands: o.unlimited ? null : PLANS[o.plan].brands, factories: o.unlimited ? null : PLANS[o.plan].factories, name: PLANS[o.plan].name } : null;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Создать или обновить бренд: меняются только переданные поля. Стиль картинок и цвета лежат в брендбуке, тот же набор, что в разделе «Бренды». */
export async function saveBrandInfo(orgId: string, a: Args): Promise<SetupResult> {
  const id = uuid(a.brandId);
  const row = id ? await one<{ id: string; rules: { forbidden?: string[]; competitors?: string[] } | null; kit: unknown }>("select id,rules,kit from kz_brands where id=$1 and org_id=$2", [id, orgId]) : null;
  if (id && !row) return { ok: false, text: "Бренд не найден" };
  const name = has(a, "name") ? txt(a.name, 80) : null;
  if (!row && (!name || name.length < 2)) return { ok: false, text: "Для нового бренда нужно название" };
  if (name !== null && name.length < 2) return { ok: false, text: "Название бренда — минимум 2 знака" };

  const rules = { forbidden: row?.rules?.forbidden ?? [], competitors: row?.rules?.competitors ?? [] };
  if (has(a, "forbidden")) rules.forbidden = list(a.forbidden);
  if (has(a, "competitors")) rules.competitors = list(a.competitors);

  const kitPatch: Partial<Kit> = {};
  if (has(a, "style")) { const st = txt(a.style, 40); kitPatch.style = STYLES[st] ? st : undefined; }
  if (has(a, "styleNotes")) kitPatch.styleNotes = txt(a.styleNotes, 600);
  if (has(a, "imageMust")) kitPatch.imageMust = txt(a.imageMust, 300);
  if (has(a, "imageNever")) kitPatch.imageNever = txt(a.imageNever, 300);
  if (has(a, "colors")) kitPatch.colors = (Array.isArray(a.colors) ? a.colors : []).map((c) => (typeof c === "string" ? { hex: c } : (c as { hex?: string; name?: string }))).filter((c) => c?.hex && HEX.test(String(c.hex))).map((c) => ({ hex: String(c.hex), name: txt(c.name, 30) }));
  const touchesKit = Object.keys(kitPatch).length > 0;
  const kit = JSON.stringify(cleanKit({ ...cleanKit(row?.kit), ...kitPatch }));

  if (row) {
    await q(`update kz_brands set name=coalesce($3,name), description=coalesce($4,description), audience=coalesce($5,audience), tone=coalesce($6,tone), rules=$7::jsonb, kit=case when $9 then $8::jsonb else kit end where id=$1 and org_id=$2`,
      [row.id, orgId, name, has(a, "description") ? txt(a.description, 2000) : null, has(a, "audience") ? txt(a.audience, 1000) : null, has(a, "tone") ? txt(a.tone, 300) || "professional" : null, JSON.stringify(rules), kit, touchesKit]);
    return { ok: true, text: "Бренд сохранён", refs: [{ t: "brand", id: row.id }] };
  }
  const lim = await orgLimits(orgId);
  const n = Number((await one<{ n: string }>("select count(*) n from kz_brands where org_id=$1", [orgId]))!.n);
  if (lim?.brands != null && n >= lim.brands) return { ok: false, text: `Тариф «${lim.name}»: максимум брендов — ${lim.brands}` };
  const created = await one<{ id: string }>("insert into kz_brands(org_id,name,description,audience,tone,rules,kit) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning id",
    [orgId, name, txt(a.description, 2000), txt(a.audience, 1000), txt(a.tone, 300) || "professional", JSON.stringify(rules), kit]);
  return { ok: true, text: "Бренд создан", refs: [{ t: "brand", id: created!.id }] };
}

const FORMATS = ["post", "carousel", "story", "article", "seo", "poll", "contest", "reels", "email", "guide"];

/** Создать или обновить завод: название, ниша, продукт, форматы, расписание. Каналы и тумблеры (автопубликация, одобрение) меняются карточкой завода. */
export async function saveFactoryInfo(orgId: string, a: Args): Promise<SetupResult> {
  const id = uuid(a.factoryId);
  const row = id ? await one<{ id: string; schedule: { days?: number[]; times?: string[]; tz?: string } | null }>("select id,schedule from kz_factories where id=$1 and org_id=$2", [id, orgId]) : null;
  if (id && !row) return { ok: false, text: "Завод не найден" };
  const name = has(a, "name") ? txt(a.name, 80) : null;
  const formats = has(a, "formats") ? list(a.formats).filter((f) => FORMATS.includes(f)) : null;
  const days = has(a, "days") ? (Array.isArray(a.days) ? a.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null;
  const times = has(a, "times") ? list(a.times).filter((t) => /^\d{2}:\d{2}$/.test(t)).slice(0, 6) : null;
  let schedule: string | null = null;
  if (days || times || !row) {
    const cur = row?.schedule ?? {};
    schedule = JSON.stringify({ days: days?.length ? days : cur.days?.length ? cur.days : [1, 2, 3, 4, 5], times: times?.length ? times : cur.times?.length ? cur.times : ["10:00"], tz: cur.tz ?? "Europe/Moscow" });
  }
  if (row) {
    if (name !== null && name.length < 2) return { ok: false, text: "Название завода — минимум 2 знака" };
    await q(`update kz_factories set name=coalesce($3,name), niche=coalesce($4,niche), product=coalesce($5,product), formats=coalesce($6::text[],formats), schedule=coalesce($7::jsonb,schedule) where id=$1 and org_id=$2`,
      [row.id, orgId, name, has(a, "niche") ? txt(a.niche, 300) : null, has(a, "product") ? txt(a.product, 2000) : null, formats?.length ? formats : null, schedule]);
    return { ok: true, text: "Завод сохранён", refs: [{ t: "factory", id: row.id }] };
  }
  const brand = await one<{ id: string }>("select id from kz_brands where id=$1 and org_id=$2", [uuid(a.brandId) || null, orgId]);
  if (!brand) return { ok: false, text: "Для нового завода нужен бренд: укажите бренд или сначала создайте его" };
  if (!name || name.length < 2) return { ok: false, text: "Для нового завода нужно название" };
  const lim = await orgLimits(orgId);
  const n = Number((await one<{ n: string }>("select count(*) n from kz_factories where org_id=$1", [orgId]))!.n);
  if (lim?.factories != null && n >= lim.factories) return { ok: false, text: `Тариф «${lim.name}»: максимум заводов — ${lim.factories}` };
  const created = await one<{ id: string }>(
    "insert into kz_factories(org_id,brand_id,name,niche,product,formats,schedule,approval,autopublish,brief) values($1,$2,$3,$4,$5,$6,$7::jsonb,'manual',false,'{}'::jsonb) returning id",
    [orgId, brand.id, name, txt(a.niche, 300), txt(a.product, 2000), formats?.length ? formats : ["post"], schedule]);
  return { ok: true, text: "Завод создан. Автопубликация выключена, идеи одобряются вручную", refs: [{ t: "factory", id: created!.id }] };
}

/** Прочитать сайт по ссылке: главная и до двух внутренних страниц («о компании», «услуги», «контакты»). Текст отдаётся ассистенту, чтобы предложить заполнение. */
export async function inspectSite(url: string): Promise<unknown> {
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let base: URL;
  try { base = new URL(url); } catch { return { error: "Некорректная ссылка" }; }
  try {
    const page = await safeFetchText(base.toString(), { maxBytes: 2_000_000 });
    const html = /<(html|body|p|div)\b/i.test(page.text);
    const text = (html ? htmlToText(page.text) : page.text).replace(/\s+/g, " ").trim();
    const out: { url: string; title: string; text: string; pages: { url: string; text: string }[] } = { url: base.toString(), title: html ? htmlTitle(page.text) : "", text: text.slice(0, 4500), pages: [] };
    if (html) {
      const links = [...page.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((m) => ({ href: m[1], label: htmlToText(m[2]).trim().toLowerCase() }))
        .filter((l) => /о нас|о компании|услуг|продукт|решени|контакт|about|services|products|contacts?/.test(`${l.label} ${l.href}`.toLowerCase()));
      const seen = new Set<string>([base.pathname]);
      for (const l of links) {
        if (out.pages.length >= 2) break;
        try {
          const u = new URL(l.href, base);
          if (u.host !== base.host || seen.has(u.pathname)) continue;
          seen.add(u.pathname);
          const p = await safeFetchText(u.toString(), { maxBytes: 1_500_000 });
          out.pages.push({ url: u.toString(), text: (/<(html|body|p|div)\b/i.test(p.text) ? htmlToText(p.text) : p.text).replace(/\s+/g, " ").trim().slice(0, 2200) });
        } catch { /* страница не открылась: пропускаем */ }
      }
    }
    if (out.text.length < 200 && !out.pages.length) return { error: "На сайте почти нет текста (возможно, он собирается скриптами). Расскажите о компании своими словами" };
    return out;
  } catch (e) { return { error: `Не удалось открыть сайт: ${(e as Error).message.slice(0, 120)}` }; }
}

/** Поиск в интернете (DuckDuckGo, без ключа). При блокировке или сбое честно возвращает ошибку, ассистент скажет об этом. */
export async function webSearch(query: string): Promise<unknown> {
  const qy = query.replace(/\s+/g, " ").trim().slice(0, 160);
  if (qy.length < 3) return { error: "Пустой запрос" };
  try {
    const r = await safeFetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(qy)}`, { maxBytes: 600_000, headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentFactoryBot/1.0)", "Accept-Language": "ru,en;q=0.8" } });
    const results: { title: string; url: string; snippet: string }[] = [];
    for (const m of r.text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) {
      let href = m[1].replace(/&amp;/g, "&");
      const u = href.match(/[?&]uddg=([^&]+)/); if (u) href = decodeURIComponent(u[1]);
      if (!/^https?:\/\//.test(href)) continue;
      results.push({ title: htmlToText(m[2]).trim().slice(0, 140), url: href, snippet: htmlToText(m[3]).replace(/\s+/g, " ").trim().slice(0, 280) });
      if (results.length >= 6) break;
    }
    return results.length ? { query: qy, results } : { error: "Поиск ничего не вернул или временно недоступен. Дайте ссылку на сайт или расскажите о компании сами" };
  } catch (e) { return { error: `Поиск недоступен: ${(e as Error).message.slice(0, 100)}` }; }
}
