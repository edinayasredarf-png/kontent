import http from "node:http";
import { q, one } from "../src/lib/db";
import { seal } from "../src/lib/crypto";
import { parseCount, parseTgViews, parseVkUrl, parseTgUrl, collectStats, collectComments, replyToComment, analytics, recommendations } from "../src/lib/engage";
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
let vkCalls: { m: string; p: URLSearchParams }[] = []; let tgHits = 0;
const srv = http.createServer((req, res) => {
  const ch: Buffer[] = []; req.on("data", (d) => ch.push(d));
  req.on("end", () => {
    const url = req.url ?? ""; const body = Buffer.concat(ch).toString();
    if (url.startsWith("/method/")) {
      const m = url.slice(8); const p = new URLSearchParams(body); vkCalls.push({ m, p }); res.setHeader("content-type", "application/json");
      if (m === "wall.getById") return res.end(JSON.stringify({ response: { items: [{ id: 7, owner_id: -55, views: { count: 1200 }, likes: { count: 30 }, comments: { count: 4 }, reposts: { count: 2 } }, { id: 8, owner_id: -55, likes: { count: 1 } }] } }));
      if (m === "wall.getComments") return res.end(JSON.stringify({ response: { items: [
        { id: 1, from_id: 111, date: 1790000000, text: "Отличный пост!" }, { id: 2, from_id: -55, date: 1790000100, text: "Наш ответ" },
        { id: 3, from_id: 222, date: 1790000200, text: "  " }, { id: 4, from_id: 333, date: 1790000300, text: "Вопрос про цены", deleted: false }],
        profiles: [{ id: 111, first_name: "Иван", last_name: "Петров" }], groups: [{ id: 55, name: "Сообщество" }] } }));
      if (m === "wall.createComment") return res.end(JSON.stringify({ response: { comment_id: 9 } }));
    }
    const t = url.match(/^\/(\w+)\/(\d+)\?embed=1/);
    if (t) { tgHits++; if (t[2] === "404") { res.statusCode = 404; return res.end("x"); } return res.end(`<div class="tgme_widget_message_views">${t[2] === "1" ? "1.2K" : "845"}</div>`); }
    if (url === "/chat/completions") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ choices: [{ message: { content: "1) Лучше работают посты утром." } }] })); }
    res.statusCode = 404; res.end("{}");
  });
}).listen(54360);
const base = "http://localhost:54360";
(async () => {
  process.env.VK_API_BASE = base; process.env.TG_WEB_BASE = base;
  ok(parseCount("1.2K") === 1200 && parseCount("3,4M") === 3_400_000 && parseCount("845") === 845 && parseCount("мусор") === 0, "parseCount: K/M/запятая/мусор");
  ok(parseTgViews('<span class="tgme_widget_message_views">12.5K</span>') === 12500 && parseTgViews("<div></div>") === null, "parseTgViews");
  ok(JSON.stringify(parseVkUrl("https://vk.com/wall-55_7")) === '{"owner":"-55","id":"7"}' && parseVkUrl("https://evil.com/x") === null, "parseVkUrl");
  ok(parseTgUrl("https://t.me/mychannel/12")?.id === "12" && parseTgUrl("https://t.me/a/12") === null && parseTgUrl("https://evil.com/mychannel/12") === null && parseTgUrl("https://t.me/ab;rm/1") === null, "parseTgUrl: строго t.me/<username>/<id>");

  const u = (await one<{ id: string }>("insert into kz_users(email,password_hash) values('c@x.ru','x') returning id"))!;
  const org = (await one<{ id: string }>("insert into kz_orgs(name,balance_kop) values('O',50000) returning id"))!;
  const br = (await one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'B') returning id", [org.id]))!;
  const chV = (await one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'vk','VK группа',$3) returning id", [org.id, br.id, JSON.stringify(seal({ token: "tok", target: "55" }))]))!;
  const chT = (await one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'telegram','TG канал',$3) returning id", [org.id, br.id, JSON.stringify(seal({ token: "t", target: "@mychan" }))]))!;
  const mkPost = async (topic: string, kind: string, ch: string, url: string, hoursAgo: number) => {
    const it = (await one<{ id: string }>("insert into kz_content_items(org_id,brand_id,kind,topic,status) values($1,$2,$3,$4,'published') returning id", [org.id, br.id, kind, topic]))!;
    return (await one<{ id: string }>("insert into kz_publications(org_id,item_id,channel_id,status,external_url,published_at) values($1,$2,$3,'published',$4,now() - ($5||' hours')::interval) returning id", [org.id, it.id, ch, url, String(hoursAgo)]))!;
  };
  const p1 = await mkPost("VK пост 1", "post", chV.id, "https://vk.com/wall-55_7", 2);
  const p2 = await mkPost("VK пост 2", "carousel", chV.id, "https://vk.com/wall-55_8", 30);
  const p3 = await mkPost("TG пост 1", "post", chT.id, "https://t.me/mychan/1", 5);
  const p4 = await mkPost("TG пост 404", "post", chT.id, "https://t.me/mychan/404", 5);
  await mkPost("Без ссылки", "post", chT.id, "", 5).then((p) => q("update kz_publications set external_url=null where id=$1", [p.id]));

  let r = await collectStats(60);
  ok(r.updated === 3, "статистика: VK×2 + TG×1 обновлены, 404 и пост без ссылки пропущены: " + JSON.stringify(r));
  ok(vkCalls.filter((c) => c.m === "wall.getById").length === 1 && vkCalls[0].p.get("posts") === "-55_7,-55_8", "VK: один пакетный запрос на канал");
  ok(vkCalls[0].p.get("access_token") === "tok" && !vkCalls[0].p.get("v")?.startsWith("4"), "VK: токен расшифрован и передан в теле");
  const s1 = (await one<{ views: number; likes: number; comments: number; reposts: number }>("select views,likes,comments,reposts from kz_post_stats where publication_id=$1", [p1.id]))!;
  ok(s1.views === 1200 && s1.likes === 30 && s1.comments === 4 && s1.reposts === 2, "VK: просмотры и реакции записаны");
  ok((await one<{ views: number }>("select views from kz_post_stats where publication_id=$1", [p2.id]))!.views === 0, "VK: нет views в ответе → 0, пост не теряется");
  ok((await one<{ views: number }>("select views from kz_post_stats where publication_id=$1", [p3.id]))!.views === 1200, "Telegram: «1.2K» → 1200 просмотров");
  ok(!(await one("select 1 from kz_post_stats where publication_id=$1", [p4.id])), "Telegram 404: статистики нет, проход не упал");
  ok(r.errors.some((e) => /tg mychan/.test(e)), "ошибка Telegram записана в отчёт");

  vkCalls = []; tgHits = 0; r = await collectStats(60);
  ok(vkCalls.length === 0 && tgHits === 1, "повторный проход сразу: свежие не опрашиваются повторно (кроме ранее неудавшегося)");
  await q("update kz_post_stats set fetched_at=now() - interval '2 hours' where publication_id=$1", [p1.id]);
  vkCalls = []; await collectStats(60); ok(vkCalls.filter((c) => c.m === "wall.getById").length === 1, "через час свежий пост опрашивается снова");

  // комментарии
  const cr = await collectComments(25);
  ok(cr.added === 2, "комментарии: свой ответ сообщества и пустой отброшены, 2 чужих добавлены: " + JSON.stringify(cr));
  const cms = await q<{ author: string; body: string; ext_id: string }>("select author,body,ext_id from kz_comments order by ext_id");
  ok(cms[0].author === "Иван Петров" && cms[1].author === "id333" && cms[0].ext_id === "-55_7_1", "авторы из profiles, запасной id333");
  vkCalls = []; ok((await collectComments(25)).added === 0, "повторный сбор не плодит дубли");
  const cid = (await one<{ id: string }>("select id from kz_comments where ext_id='-55_7_1'"))!.id;
  ok(!(await replyToComment(org.id, cid, "   ")).ok, "пустой ответ отклонён");
  const other = (await one<{ id: string }>("insert into kz_orgs(name) values('Чужая') returning id"))!;
  ok(!(await replyToComment(other.id, cid, "Взлом")).ok, "чужая организация не может ответить");
  vkCalls = []; const rr = await replyToComment(org.id, cid, "Спасибо!");
  const cc = vkCalls.find((c) => c.m === "wall.createComment")!;
  ok(rr.ok && cc.p.get("owner_id") === "-55" && cc.p.get("post_id") === "7" && cc.p.get("reply_to_comment") === "1" && cc.p.get("from_group") === "55" && cc.p.get("message") === "Спасибо!", "ответ ушёл в VK от имени сообщества с reply_to_comment");
  const after = (await one<{ status: string; reply: string }>("select status,reply from kz_comments where id=$1", [cid]))!;
  ok(after.status === "done" && after.reply === "Спасибо!", "комментарий помечен обработанным, ответ сохранён");

  // аналитика
  await q("insert into kz_post_stats(publication_id,org_id,views,likes) values($1,$2,100,5) on conflict(publication_id) do update set views=100", [p4.id, org.id]);
  const a = await analytics(org.id, 30);
  ok(Number(a.tot.posts) === 4 && Number(a.tot.views) === 1200 + 0 + 1200 + 100, `итоги: ${a.tot.posts} поста, ${a.tot.views} просмотров`);
  ok(a.byKind[0].kind === "post" && a.byChannel.length === 2 && a.top[0].views === 1200 && a.byHour.length >= 1, "разрезы: форматы, каналы, топ, часы");
  ok(Number((await analytics(org.id, 7)).tot.posts) === 4 && Number((await analytics(other.id, 30)).tot.posts) === 0, "другая организация видит 0");
  // рекомендации
  process.env.SELFHOSTED_LLM_URL = base; process.env.SELFHOSTED_LLM_MODEL = "m";
  const b0 = Number((await one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org.id]))!.b);
  const rec = await recommendations(org.id, 30); const b1 = Number((await one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org.id]))!.b);
  ok(!!rec.text && b0 - b1 === 600, "рекомендации получены, списано 6 ₽");
  ok(!!(await recommendations(other.id, 30)).error, "мало данных → понятный отказ без списания");
  process.env.SELFHOSTED_LLM_URL = "http://localhost:1"; const rf = await recommendations(org.id, 30);
  ok(!!rf.error && Number((await one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org.id]))!.b) === b1, "сбой шлюза → возврат денег");
  srv.close(); process.exit(process.exitCode ?? 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
