import http from "node:http";
import { createHmac } from "node:crypto";
import { q, one } from "../src/lib/db";
import { seal } from "../src/lib/crypto";
import { cleanHtml, parseSeoResponse, seoCheck, slugify } from "../src/lib/seo";
import { wordpress } from "../src/lib/publishing/wordpress";
import { webhook } from "../src/lib/publishing/webhook";
import { buildItem, enqueue, processQueue } from "../src/lib/pipeline";
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };

const SEO_RESP = `TITLE: Как читать закупки по 44-ФЗ: пошаговая инструкция
DESCRIPTION: Разбираем, как читать закупки по 44-ФЗ: где искать, на что смотреть в документации и как не пропустить срок подачи заявки.
SLUG: Как читать закупки по 44-ФЗ
KEYWORDS: закупки 44-фз, госзакупки, тендер, документация
---BODY---
<p>Закупки по 44-ФЗ — это основа работы с госзаказом, и разобраться в них проще, чем кажется.</p>
<script>alert(1)</script>
<h2>Где искать закупки</h2><p>Закупки публикуются в ЕИС. <a href="javascript:alert(2)" onclick="x()">ссылка</a> <img src=x onerror=alert(3)></p>
<h2>Что смотреть в документации</h2><ul><li>НМЦК</li><li>Сроки</li></ul>
<h2>Как подать заявку</h2><p>Закупки требуют внимательности. ${"Закупки — это важно. ".repeat(60)}</p>
<iframe src="https://evil.example"></iframe><style>body{display:none}</style>
---FAQ---
Q: Что такое 44-ФЗ?
A: Закон о контрактной системе.
Q: Где смотреть закупки?
A: В ЕИС.
Q: Кто может участвовать?
A: Любая компания.`;

let wpReq: { method: string; url: string; auth: string; ct: string; body: string; cd: string }[] = []; let hooks: { headers: http.IncomingHttpHeaders; body: string }[] = []; let wpMode = "ok"; let gwCalls = 0;
const srv = http.createServer((req, res) => {
  const ch: Buffer[] = []; req.on("data", (d) => ch.push(d));
  req.on("end", () => {
    const body = Buffer.concat(ch); const url = req.url ?? ""; res.setHeader("content-type", "application/json");
    if (url.startsWith("/wp-json/wp/v2")) {
      wpReq.push({ method: req.method!, url, auth: String(req.headers.authorization), ct: String(req.headers["content-type"]), body: String(req.headers["content-type"]).includes("json") ? body.toString() : `[binary ${body.length}]`, cd: String(req.headers["content-disposition"]) });
      if (wpMode === "401") { res.statusCode = 401; return res.end(JSON.stringify({ message: "bad" })); }
      if (wpMode === "404") { res.statusCode = 404; return res.end("<html>nope</html>"); }
      if (wpMode === "500") { res.statusCode = 503; return res.end(JSON.stringify({ message: "down" })); }
      if (url.startsWith("/wp-json/wp/v2/users/me")) return res.end(JSON.stringify({ name: "editor" }));
      if (url === "/wp-json/wp/v2/media") { if (wpMode === "media-fail") { res.statusCode = 413; return res.end(JSON.stringify({ message: "too big" })); } return res.end(JSON.stringify({ id: 77 })); }
      if (url === "/wp-json/wp/v2/posts") return res.end(JSON.stringify({ id: 501, link: "https://site.example/kak-chitat-zakupki/" }));
    }
    if (url === "/hook") { hooks.push({ headers: req.headers, body: body.toString() }); if (wpMode === "hook500") { res.statusCode = 502; return res.end("bad gateway"); } return res.end(JSON.stringify({ id: 9, url: "https://cms.example/p/9" })); }
    if (url === "/chat/completions") { gwCalls++; return res.end(JSON.stringify({ choices: [{ message: { content: SEO_RESP } }] })); }
    res.statusCode = 404; res.end("{}");
  });
}).listen(54370);
const base = "http://localhost:54370";

(async () => {
  // ---- чистый HTML ----
  const c = cleanHtml(`<p onclick="x()">a <a href="javascript:alert(1)">b</a> <a href="https://ok.ru" target="_blank">ok</a></p><script>1</script><iframe src="//e"></iframe><img src="javascript:1" onerror="x"><img src="https://i.ru/a.jpg" alt="ок"><style>p{}</style><svg onload=x><form action=x><input></form><h1>H1</h1>`);
  ok(!/script|iframe|onclick|onerror|javascript:|<style|<svg|<form|<input|<h1/i.test(c), "cleanHtml вырезает script/iframe/style/svg/form/h1, on*-атрибуты и javascript:-ссылки: " + c);
  ok(/<a href="https:\/\/ok\.ru" target="_blank" rel="noopener noreferrer">/.test(c) && /<img src="https:\/\/i\.ru\/a\.jpg" alt="ок" \/>/.test(c), "нормальные ссылка и картинка остаются, rel=noopener добавлен");
  ok(slugify("Как читать закупки по 44-ФЗ") === "kak-chitat-zakupki-po-44-fz" && slugify("!!!") === "article" && slugify("Щука и ёж") === "schuka-i-ezh", "slugify: транслит, мусор → article");

  // ---- разбор ответа модели ----
  const p = parseSeoResponse(SEO_RESP, "закупки 44-фз");
  ok(p.meta.title.startsWith("Как читать закупки") && p.meta.slug === "kak-chitat-zakupki-po-44-fz" && p.meta.keywords.length === 4 && p.meta.faq.length === 3, "поля, slug-транслит, 4 ключа, 3 FAQ");
  ok(!/script|iframe|style|javascript:|onerror/i.test(p.html) && /<h2>Частые вопросы<\/h2>/.test(p.html) && /<h3>Что такое 44-ФЗ\?<\/h3>/.test(p.html), "тело очищено, FAQ добавлен разметкой");
  let bad = ""; try { parseSeoResponse("TITLE: x\nвообще без тела", "k"); } catch (e) { bad = (e as Error).message; } ok(/не вернула текст/.test(bad), "ответ без тела → понятная ошибка");
  const chk = seoCheck(p.meta, p.html);
  ok(chk.checks.find((x) => x.label.startsWith("Запрос есть в Title"))!.ok && chk.checks.find((x) => x.label.startsWith("Блок вопросов"))!.ok && chk.score > 50, `SEO-проверка: ${chk.score}%`);
  ok(!seoCheck({ ...p.meta, title: "Коротко" }, p.html).checks[0].ok && !seoCheck({ ...p.meta, keyword: "совсем другое" }, p.html).checks[1].ok, "короткий Title и отсутствие запроса ловятся");

  // ---- WordPress ----
  process.env.ALLOW_PRIVATE_FETCH = "1";
  const cred = { target: base, token: "editor:abcd efgh", status: "draft" };
  ok((await wordpress.verify(cred)).includes("editor") && wpReq[0].auth === "Basic " + Buffer.from("editor:abcd efgh").toString("base64"), "WP verify: Basic-авторизация, имя пользователя");
  const art = { title: p.meta.title, description: p.meta.description, slug: p.meta.slug, keywords: p.meta.keywords, html: p.html };
  wpReq = []; let o = await wordpress.publish({ text: "", article: art, image: { data: Buffer.alloc(3000, 1), mime: "image/jpeg" } }, cred);
  ok(wpReq.map((r) => r.url).join() === "/wp-json/wp/v2/media,/wp-json/wp/v2/posts" && /attachment; filename="kak-chitat/.test(wpReq[0].cd) && wpReq[0].ct === "image/jpeg", "WP: сначала обложка (binary + Content-Disposition), затем пост");
  const post = JSON.parse(wpReq[1].body); ok(post.status === "draft" && post.featured_media === 77 && post.slug === art.slug && post.excerpt === art.description && post.meta._yoast_wpseo_metadesc === art.description && !/<script/.test(post.content), "WP: черновик, обложка, slug, excerpt, Yoast-поля");
  ok(o.url === "https://site.example/kak-chitat-zakupki/" && /черновик/.test(o.warning ?? ""), "WP: ссылка и предупреждение о черновике");
  wpReq = []; o = await wordpress.publish({ text: "", article: art }, { ...cred, status: "publish" }); ok(JSON.parse(wpReq[0].body).status === "publish" && !o.warning, "WP: режим publish без предупреждения");
  wpMode = "media-fail"; o = await wordpress.publish({ text: "", article: art, image: { data: Buffer.alloc(10), mime: "image/jpeg" } }, { ...cred, status: "publish" }); ok(!!o.url && /Обложка не загружена/.test(o.warning ?? ""), "WP: обложка не загрузилась → статья всё равно опубликована с предупреждением");
  for (const [m, re, retry] of [["401", /логин или пароль/, false], ["404", /REST API/, false], ["500", /503/, true]] as const) {
    wpMode = m; try { await wordpress.publish({ text: "", article: art }, cred); ok(false, "WP " + m); } catch (e) { ok(re.test((e as Error).message) && (e as { retryable?: boolean }).retryable === retry, `WP ${m}: ${(e as Error).message.slice(0, 60)} (retryable=${retry})`); }
  }
  wpMode = "ok";
  try { await wordpress.publish({ text: "обычный пост" }, cred); ok(false, "wp post"); } catch { ok(true, "WP: обычный пост не принимает"); }
  process.env.ALLOW_PRIVATE_FETCH = "";
  try { await wordpress.verify({ target: "http://169.254.169.254", token: "a:b" }); ok(false, "ssrf"); } catch (e) { ok(/внутренняя сеть/.test((e as Error).message), "WP: адрес во внутреннюю сеть заблокирован (SSRF): " + (e as Error).message.slice(0, 70)); }
  try { await wordpress.verify({ target: "https://localhost:6379", token: "a:b" }); ok(false, "ssrf2"); } catch (e) { ok(true, "WP: localhost запрещён"); }
  process.env.ALLOW_PRIVATE_FETCH = "1";

  // ---- webhook ----
  hooks = []; const wc = { target: `${base}/hook`, token: "s3cret" };
  await webhook.verify(wc); ok(JSON.parse(hooks[0].body).event === "ping", "webhook verify: ping");
  o = await webhook.publish({ text: "", article: art, image: { data: Buffer.from("img"), mime: "image/jpeg" } }, wc);
  const h = hooks[1], ts = String(h.headers["x-timestamp"]);
  ok(h.headers["x-signature"] === "sha256=" + createHmac("sha256", "s3cret").update(`${ts}.${h.body}`).digest("hex"), "webhook: подпись HMAC-SHA256 от «timestamp.тело» верна");
  const wb = JSON.parse(h.body); ok(wb.event === "article.publish" && wb.slug === art.slug && wb.image.base64 === Buffer.from("img").toString("base64") && o.url === "https://cms.example/p/9", "webhook: тело, картинка base64, url из ответа");
  wpMode = "hook500"; try { await webhook.publish({ text: "", article: art }, wc); ok(false, "hook500"); } catch (e) { ok((e as { retryable?: boolean }).retryable === true, "webhook 502 → повтор позже"); } wpMode = "ok";

  // ---- конвейер ----
  const u = (await one<{ id: string }>("insert into kz_users(email,password_hash) values('d@x.ru','x') returning id"))!;
  const org = (await one<{ id: string }>("insert into kz_orgs(name,balance_kop,unlimited) values('O',100000,false) returning id"))!;
  const br = (await one<{ id: string }>("insert into kz_brands(org_id,name,description) values($1,'Бренд','Описание') returning id", [org.id]))!;
  const chWp = (await one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'wordpress','Сайт',$3) returning id", [org.id, br.id, JSON.stringify(seal({ ...cred, status: "publish" }))]))!;
  const chTg = (await one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'telegram','TG',$3) returning id", [org.id, br.id, JSON.stringify(seal({ token: "1:a", target: "@c" }))]))!;
  const fac = (await one<{ id: string }>("insert into kz_factories(org_id,brand_id,name,formats,channel_ids) values($1,$2,'SEO','{seo}',$3) returning id", [org.id, br.id, [chWp.id, chTg.id]]))!;
  const seoIt = (await one<{ id: string }>("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,status) values($1,$2,$3,'seo','закупки 44-фз','информационное','approved') returning id", [org.id, fac.id, br.id]))!;
  const postIt = (await one<{ id: string }>("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,body,status) values($1,$2,$3,'post','Пост','Текст','ready') returning id", [org.id, fac.id, br.id]))!;
  process.env.SELFHOSTED_LLM_URL = base; process.env.SELFHOSTED_LLM_MODEL = "m";
  const bal = async () => Number((await one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org.id]))!.b);
  const b0 = await bal(); const bi = await buildItem(org.id, seoIt.id);
  ok(bi.ok && b0 - (await bal()) === 6000, "SEO-статья сгенерирована, списано 60 ₽: " + JSON.stringify(bi));
  const row = (await one<{ body: string; status: string; meta: { seo?: { slug: string; faq: unknown[] } } }>("select body,status,meta from kz_content_items where id=$1", [seoIt.id]))!;
  ok(row.status === "ready" && /<h2>/.test(row.body) && !/<script/.test(row.body) && row.meta.seo?.slug === "kak-chitat-zakupki-po-44-fz" && row.meta.seo.faq.length === 3, "в БД: HTML очищен, meta.seo с slug и FAQ");

  ok((await enqueue(org.id, seoIt.id)).ok, "SEO-статья поставлена в очередь");
  const pubs = await q<{ channel_id: string }>("select channel_id from kz_publications where item_id=$1", [seoIt.id]);
  ok(pubs.length === 1 && pubs[0].channel_id === chWp.id, "SEO ушла только в WordPress, не в Telegram");
  wpReq = []; const pr = await processQueue(5);
  const pub = (await one<{ status: string; external_url: string; error: string | null }>("select status,external_url,error from kz_publications where item_id=$1", [seoIt.id]))!;
  ok(pr.sent === 1 && pub.status === "published" && pub.external_url === "https://site.example/kak-chitat-zakupki/" && JSON.parse(wpReq.find((r) => r.url === "/wp-json/wp/v2/posts")!.body).title.startsWith("Как читать"), "очередь: статья опубликована в WP с Title из meta.seo");
  ok((await enqueue(org.id, postIt.id)).ok, "обычный пост поставлен в очередь");
  const pp = await q<{ channel_id: string }>("select channel_id from kz_publications where item_id=$1", [postIt.id]);
  ok(pp.length === 1 && pp[0].channel_id === chTg.id, "обычный пост ушёл только в Telegram, не в WordPress");
  await q("update kz_factories set channel_ids=$2 where id=$1", [fac.id, [chTg.id]]); await q("update kz_content_items set status='ready' where id=$1", [seoIt.id]);
  const en = await enqueue(org.id, seoIt.id); ok(!en.ok && /WordPress или Webhook/.test((en as { error: string }).error), "SEO без сайт-канала → понятная ошибка");
  srv.close(); process.exit(process.exitCode ?? 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
