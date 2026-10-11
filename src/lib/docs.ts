import { chat, brandBlock, type BrandCtx } from "./ai";
import { cleanHtml } from "./seo";
import { styleBlock, type ContentSettings } from "./postsettings";

const clip = (v: string, n: number) => v.replace(/\s+/g, " ").trim().slice(0, n);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const words = (html: string) => textOf(html).split(/\s+/).filter(Boolean).length;
const field = (raw: string, name: string) => raw.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
const body = (raw: string) => cleanHtml((raw.match(/---\s*BODY\s*---\s*([\s\S]*)$/i)?.[1] ?? "").replace(/^```(?:html)?\s*|```\s*$/g, "").trim());

export interface EmailMeta { subject: string; preheader: string; headline: string; cta: string; ctaUrl: string }
export interface SourceLike { title: string; body: string; url: string }

/** Рассылка: тема, прехедер, заголовок, текст и кнопка. Один запрос; текст короткий (250–400 слов), поэтому цельный ответ надёжен. */
export async function genEmail(b: BrandCtx, product: string, niche: string, topic: string, hook: string, st: ContentSettings, source?: SourceLike): Promise<{ meta: EmailMeta; html: string }> {
  const raw = await chat("post",
    "Ты email-маркетолог. Пиши по-русски живо и по делу, без спам-триггеров (ВСЕ ЗАГЛАВНЫЕ, «!!!», «бесплатно» без условий), без выдуманных фактов, цифр и скидок.",
    `${brandBlock(b, product, niche)}\nТема письма: ${topic}\nХук: ${hook}\n` +
    (source ? `\nМатериал-источник: «${source.title}»\n${source.body.slice(0, 4500)}\nФакты только оттуда.\n` : "") +
    `\nНапиши письмо-рассылку: одна главная мысль, короткие абзацы, 250–400 слов, один понятный призыв к действию.\n${st.cta ? `Призыв (близко к смыслу): «${st.cta}».\n` : ""}${st.link ? `Ссылка для кнопки: ${st.link}\n` : ""}Правила: ${styleBlock({ ...st, hashtags: "none" }, "email")}\n` +
    `ФОРМАТ строго такой:\nSUBJECT: тема письма до 55 знаков, без капса\nPREHEADER: прехедер до 90 знаков, дополняет тему\nHEADLINE: заголовок внутри письма до 70 знаков\nCTA: текст кнопки до 30 знаков\n---BODY---\n(HTML: только p, ul, ol, li, strong, em, h3, a)`,
    { maxTokens: 1800, temperature: 0.7, timeoutMs: 50_000 });
  const html = body(raw);
  if (words(html) < 60) throw new Error("Модель вернула слишком короткое письмо");
  return { meta: { subject: clip(field(raw, "SUBJECT") || topic, 80), preheader: clip(field(raw, "PREHEADER"), 120), headline: clip(field(raw, "HEADLINE") || topic, 90), cta: clip(field(raw, "CTA"), 40), ctaUrl: st.link || "" }, html };
}

/** Готовое письмо для почтовых сервисов: таблица 600 px, стили строкой (почтовые клиенты не читают внешние). Ссылка отписки — подстановка для вашего сервиса рассылок. */
export function emailHtml(m: EmailMeta, bodyHtml: string, brand: { name: string; color: string }): string {
  const color = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#029cda";
  const btn = m.cta && m.ctaUrl ? `<p style="margin:28px 0 8px"><a href="${esc(m.ctaUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px">${esc(m.cta)}</a></p>` : "";
  const inner = bodyHtml.replace(/<p>/g, '<p style="margin:0 0 16px">').replace(/<ul>/g, '<ul style="margin:0 0 16px;padding-left:22px">').replace(/<h3>/g, '<h3 style="margin:24px 0 8px;font-size:18px">');
  return `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.subject)}</title></head>\n<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1b2029">\n<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preheader)}</span>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px">\n<tr><td style="padding:24px 32px 0;font-size:14px;font-weight:700;color:${color}">${esc(brand.name)}</td></tr>\n<tr><td style="padding:12px 32px 0;font-size:26px;line-height:1.25;font-weight:700">${esc(m.headline)}</td></tr>\n<tr><td style="padding:16px 32px 8px;font-size:16px;line-height:1.6">${inner}${btn}</td></tr>\n<tr><td style="padding:20px 32px 28px;font-size:12px;line-height:1.5;color:#8b93a0;border-top:1px solid #eceef1">Вы получили это письмо от «${esc(brand.name)}», потому что подписались на рассылку.<br><a href="{{unsubscribe_url}}" style="color:#8b93a0">Отписаться</a></td></tr>\n</table></td></tr></table></body></html>`;
}

export interface GuideMeta { title: string; subtitle: string }

/**
 * Гайд / лид-магнит целиком одним ответом (так он связный): введение, 5–7 глав с шагами, чек-лист, заключение с призывом.
 * Короче 1000 слов — модель видит готовый текст и дописывает две главы перед заключением.
 */
export async function genGuide(b: BrandCtx, product: string, niche: string, topic: string, hook: string, source?: SourceLike): Promise<{ meta: GuideMeta; html: string }> {
  const ctx = `${brandBlock(b, product, niche)}\nТема гайда: ${topic}\nХук: ${hook}\n` + (source ? `\nМатериал-источник (${source.url}): «${source.title}»\n${source.body.slice(0, 4500)}\nФакты только оттуда.\n` : "");
  const sys = "Ты автор практических гайдов. Пиши по-русски понятно и полезно, без воды, выдуманных фактов, цифр и ссылок. Каждая глава даёт конкретные шаги, примеры или проверки.";
  const raw = await chat("article", sys,
    `${ctx}\nНапиши гайд, который человек сохранит и применит: 1200–1800 слов. Структура: короткое введение (зачем и что получит читатель), 5–7 глав <h2> с шагами и примерами, в конце чек-лист <ul> из 7–10 пунктов, затем заключение с мягким призывом от бренда. Единая логика, одни и те же термины, плавные переходы. Без <h1>.\n` +
    `ФОРМАТ строго такой:\nTITLE: название гайда до 70 знаков\nSUBTITLE: подзаголовок до 110 знаков\n---BODY---\n(HTML: h2, h3, p, ul, ol, li, strong, em, blockquote, table)`,
    { maxTokens: 8000, temperature: 0.6, timeoutMs: 120_000 });
  let html = body(raw);
  const meta = { title: clip(field(raw, "TITLE") || topic, 90), subtitle: clip(field(raw, "SUBTITLE"), 140) };
  if (words(html) < 500) throw new Error("Модель вернула слишком короткий гайд");
  if (words(html) < 1000) {
    try {
      const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => textOf(m[1]));
      const add = body("---BODY---\n" + await chat("article", sys, `${ctx}\nНиже гайд, который получился короче нужного. Допиши 2 НОВЫЕ главы (по 250–350 слов) с шагами и примерами, в том же стиле и терминах, без повторов. Они вставятся перед заключением. Уже есть: ${heads.join("; ")}.\n\nГАЙД:\n${html.slice(0, 14000)}\n\nВерни ТОЛЬКО HTML двух новых глав (каждая начинается с <h2>).`, { maxTokens: 2600, temperature: 0.6, timeoutMs: 70_000 }));
      const last = html.lastIndexOf("<h2");
      if (words(add) > 120 && /<h2/i.test(add)) html = heads.length >= 3 && last > 0 ? html.slice(0, last) + add + "\n" + html.slice(last) : html + "\n" + add;
    } catch { /* остаёмся с тем, что есть */ }
  }
  return { meta, html };
}

/** Гайд как страница для печати и «Сохранить как PDF»: обложка, оглавление глав, содержание. */
export function guideHtml(m: GuideMeta, html: string, brand: { name: string; color: string }): string {
  const color = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#029cda";
  const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((x) => textOf(x[1]));
  return `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title>\n<style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font:16px/1.65 Arial,Helvetica,sans-serif;color:#1b2029;background:#fff}.wrap{max-width:760px;margin:0 auto;padding:32px 24px}.cover{border-left:8px solid ${color};padding:24px 0 24px 22px;margin-bottom:28px}.brand{font-weight:700;color:${color};font-size:14px;letter-spacing:.04em;text-transform:uppercase}h1{font-size:34px;line-height:1.15;margin:10px 0 8px}.sub{color:#5d6570;font-size:18px;margin:0}.toc{background:#f4f5f7;border-radius:12px;padding:16px 22px;margin:0 0 28px}.toc b{display:block;margin-bottom:6px}.toc ol{margin:0;padding-left:20px}h2{font-size:24px;margin:34px 0 10px;color:${color};break-after:avoid}h3{font-size:18px;margin:22px 0 6px;break-after:avoid}p,li{margin:0 0 12px}ul,ol{padding-left:24px}blockquote{margin:16px 0;padding:10px 18px;border-left:4px solid ${color};background:#f4f5f7}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #dfe2e7;padding:8px 10px;text-align:left}.foot{margin-top:40px;border-top:1px solid #eceef1;padding-top:12px;color:#8b93a0;font-size:12px}.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #eceef1;padding:10px 24px;text-align:right}.bar button{font:inherit;padding:8px 16px;border:0;border-radius:10px;background:${color};color:#fff;font-weight:600;cursor:pointer}@media print{.bar{display:none}.wrap{padding:0}h2{break-after:avoid}li,p{break-inside:avoid}}</style></head>\n<body><div class="bar"><button onclick="window.print()">Сохранить как PDF</button></div><div class="wrap">\n<div class="cover"><div class="brand">${esc(brand.name)}</div><h1>${esc(m.title)}</h1>${m.subtitle ? `<p class="sub">${esc(m.subtitle)}</p>` : ""}</div>\n${heads.length >= 3 ? `<div class="toc"><b>Содержание</b><ol>${heads.map((h) => `<li>${esc(h)}</li>`).join("")}</ol></div>` : ""}\n${html}\n<div class="foot">${esc(brand.name)}</div></div></body></html>`;
}
