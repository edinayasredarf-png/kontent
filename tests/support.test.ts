import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";
let org = "", user = "", admin = "";

describe("поддержка и уведомления", { skip: skipDb }, () => {
  before(async () => {
    const { one, q } = await import("../src/lib/db");
    org = (await one<{ id: string }>("insert into kz_orgs(name,balance_kop,plan,unlimited) values('sup',100000,'start',false) returning id"))!.id;
    user = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'Клиент','x') returning id", [`c-${org}@t.ru`]))!.id;
    admin = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'Админ','x') returning id", [`a-${org}@t.ru`]))!.id;
    await q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer')", [org, user, admin]);
    process.env.PLATFORM_ADMIN_EMAILS = `a-${org}@t.ru`;
  });
  after(async () => { const { q } = await import("../src/lib/db"); await q("delete from kz_orgs where id=$1", [org]); await q("delete from kz_users where id in ($1,$2)", [user, admin]); });

  it("обращение: создаётся, админ получает уведомление, ответ виден клиенту в колокольчике, повторное письмо открывает его снова", async () => {
    const { createTicket, staffReply, clientReply, ticketFor, myTickets, messagesOf } = await import("../src/lib/support");
    const { listNotifications, unreadCount, markRead } = await import("../src/lib/notify");
    const bad = await createTicket({ orgId: org, userId: user, email: "c@t.ru", name: "Клиент", plan: "start", role: "owner" }, { subject: "а", category: "publish", body: "коротко", page: "" });
    assert.equal(bad.ok, false);
    const r = await createTicket({ orgId: org, userId: user, email: "c@t.ru", name: "Клиент", plan: "start", role: "owner" }, { subject: "Пост не вышел в VK", category: "publish", body: "Нажал опубликовать, ошибки нет, поста нет в сообществе", page: "/app/publications" });
    assert.ok(r.ok); const id = r.ok ? r.id : "";
    assert.equal((await ticketFor(id))?.status, "open");
    await new Promise((x) => setTimeout(x, 300));
    assert.ok((await listNotifications(admin, 10)).some((n) => n.kind === "support" && n.href === `/app/admin/support/${id}`), "администратор получил уведомление");
    assert.ok((await staffReply(id, admin, "Проверили: у ключа сообщества нет права на фото. Выдайте право и повторите.")).ok);
    assert.equal((await ticketFor(id))?.status, "answered");
    const n = (await listNotifications(user, 10)).find((x) => x.kind === "support");
    assert.ok(n && n.href === `/app/help/${id}` && !n.read_at, "клиент увидел ответ в колокольчике");
    assert.equal(await unreadCount(user), 1);
    assert.equal((await myTickets(user, org, false))[0].unread, true, "в списке обращений отмечен новый ответ");
    assert.equal((await myTickets(user, org, true)).length, 1, "владелец и админ видят обращения всей организации");
    await markRead(user, n.id);
    assert.equal(await unreadCount(user), 0);
    assert.ok((await clientReply(id, user, "Право выдал, всё получилось, спасибо")).ok);
    assert.equal((await ticketFor(id))?.status, "open", "ответ клиента снова открывает обращение");
    assert.equal((await messagesOf(id)).length, 3);
  });

  it("уведомления: не дублируются, не уходят наблюдателям и гостям, объявление доходит до редакторов", async () => {
    const { notify, listNotifications } = await import("../src/lib/notify");
    const { broadcast } = await import("../src/lib/support");
    await notify(org, { kind: "published", title: "Опубликовано: тест", href: "https://vk.com/wall-1_2", dedupe: "pub:1" });
    await notify(org, { kind: "published", title: "Опубликовано: тест", href: "https://vk.com/wall-1_2", dedupe: "pub:1" });
    const mine = (await listNotifications(user, 20)).filter((x) => x.kind === "published");
    assert.equal(mine.length, 1, "дубль подавлен");
    assert.equal((await listNotifications(admin, 20)).some((x) => x.kind === "published"), false, "наблюдатель не получает рабочие уведомления");
    await broadcast("Новая функция", "Правка выделенного текста", "/app/help");
    assert.ok((await listNotifications(user, 20)).some((x) => x.kind === "announce"));
  });

  it("периодические уведомления: идеи на одобрении собираются пачкой раз в сутки", async () => {
    const { one, q } = await import("../src/lib/db");
    const { runNotifyJobs } = await import("../src/lib/notify-jobs");
    const { listNotifications } = await import("../src/lib/notify");
    const b = (await one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'Б') returning id", [org]))!.id;
    const f = (await one<{ id: string }>("insert into kz_factories(org_id,brand_id,name,status,approval) values($1,$2,'З','active','manual') returning id", [org, b]))!.id;
    await q("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,status) select $1,$2,$3,'post','идея '||g,'idea' from generate_series(1,3) g", [org, f, b]);
    await runNotifyJobs(); await runNotifyJobs();
    const ideas = (await listNotifications(user, 30)).filter((x) => x.kind === "ideas_pending");
    assert.equal(ideas.length, 1); assert.ok(ideas[0].title.includes("3"));
  });
});
