import { describe, it } from "node:test";
import assert from "node:assert/strict";

const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";

describe("права ролей", () => {
  it("наблюдатель только смотрит, редактор работает с материалами, управление — у админа и владельца", async () => {
    const { can } = await import("../src/lib/roles");
    assert.deepEqual(["viewer", "editor", "admin", "owner"].map((r) => can(r, "view")), [true, true, true, true]);
    assert.deepEqual(["viewer", "editor", "admin", "owner"].map((r) => can(r, "write")), [false, true, true, true]);
    assert.deepEqual(["viewer", "editor", "admin", "owner"].map((r) => can(r, "manage")), [false, false, true, true]);
    assert.deepEqual(["viewer", "editor", "admin", "owner"].map((r) => can(r, "owner")), [false, false, false, true]);
    assert.equal(can("unknown", "view"), false, "неизвестная роль не получает ничего");
  });
});

describe("гостевые ссылки", { skip: skipDb }, () => {
  it("ссылка создаёт наблюдателя, не попадает в команду, истекает и отзывается", async () => {
    const { q, one } = await import("../src/lib/db");
    const { createGuestLink, guestByToken, revokeGuestLink, listGuestLinks } = await import("../src/lib/guest");
    const { listTeam } = await import("../src/lib/team");
    const org = (await one<{ id: string }>("insert into kz_orgs(name) values('guest-test') returning id"))!.id;
    const owner = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'o','x') returning id", [`o-${org}@t.ru`]))!.id;
    await q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, owner]);
    try {
      const r = await createGuestLink(org, owner, "клиент", "7", "https://x.ru");
      assert.ok(r.ok); const token = r.ok ? r.link.split("/g/")[1] : "";
      const g = await guestByToken(token);
      assert.equal(g?.orgId, org);
      const m = await one<{ role: string }>("select role from kz_memberships where org_id=$1 and user_id=$2", [org, g!.userId]);
      assert.equal(m?.role, "viewer");
      assert.equal((await listTeam(org)).members.length, 1, "гость не виден в списке команды");
      assert.equal(await guestByToken("x".repeat(43)), null, "чужой токен не подходит");
      await q("update kz_guest_links set expires_at=now() - interval '1 minute' where org_id=$1", [org]);
      assert.equal(await guestByToken(token), null, "просроченная ссылка не работает");
      await q("update kz_guest_links set expires_at=null where org_id=$1", [org]);
      assert.ok(await guestByToken(token));
      const [l] = await listGuestLinks(org);
      await revokeGuestLink(org, l.id);
      assert.equal(await guestByToken(token), null, "отозванная ссылка не работает");
      assert.equal((await one<{ n: string }>("select count(*) n from kz_memberships where org_id=$1", [org]))!.n, "1", "служебный пользователь удалён");
    } finally {
      await q("delete from kz_orgs where id=$1", [org]); await q("delete from kz_users where id=$1", [owner]);
    }
  });
});
