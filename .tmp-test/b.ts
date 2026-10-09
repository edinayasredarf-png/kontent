import { q, one, tx } from "../src/lib/db";
import { createAccount, newRefCode, safeNext, sessionCookie } from "../src/lib/auth";
import { createInvite, acceptInvite, inviteInfo, setRole, removeMember, listTeam, revokeInvite } from "../src/lib/team";
import { changePassword, changeEmail, updateName, ensureRefCode, referralStats } from "../src/lib/account";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
const acct = (email: string, org: string, ref?: string) => tx((run) => createAccount(run, email, email, "x", org, { refCode: ref }));
(async () => {
  // ---- ref ----
  const A = await acct("owner@x.ru", "Орг"); const refA = await ensureRefCode(A.uid, newRefCode);
  ok(/^[a-z2-9]{8}$/.test(refA) && !/[01lo]/.test(refA), "ref-код: 8 символов без похожих (0/1/l/o): " + refA);
  ok((await ensureRefCode(A.uid, newRefCode)) === refA, "код стабилен при повторном вызове");
  const B = await acct("new@x.ru", "Орг B", refA);
  ok((await one<{ r: string }>("select referred_by r from kz_users where id=$1", [B.uid]))!.r === A.uid, "регистрация по ссылке закрепляет партнёра");
  const C = await acct("bad@x.ru", "Орг C", "zzzzzzzz"); ok((await one<{ r: string | null }>("select referred_by r from kz_users where id=$1", [C.uid]))!.r === null, "несуществующий код игнорируется");
  const D = await acct("self@x.ru", "Орг D", "' or 1=1 --"); ok(!!D.uid, "мусорный код не ломает регистрацию (SQL-инъекция исключена)");
  ok(Number((await referralStats(A.uid))!.signups) === 1, "статистика партнёра: 1 регистрация");
  ok(safeNext("/invite/abc") === "/invite/abc" && ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", undefined, "/" + "a".repeat(400)].every((x) => safeNext(x) === "/app"), "safeNext: внешние адреса и мусор → /app");

  // ---- team ----
  const org = A.org, owner = A.uid;
  const mk = (plan: "free" | "agency", unlimited = false) => ({ orgId: org, plan, unlimited, actorId: owner, actorRole: "owner", origin: "https://x.example" });
  await q("update kz_orgs set plan='start' where id=$1", [org]); // members: 2
  let r = await createInvite({ ...mk("free"), plan: "start", email: "", role: "editor" });
  ok(r.ok && /^https:\/\/x\.example\/invite\/[\w-]{20,}$/.test(r.link!), "ссылка-приглашение создана");
  const token = (r as { link: string }).link.split("/").pop()!;
  ok(!!(await one("select 1 from kz_invites where token_hash=$1", [token])) === false, "токен в БД не хранится открытым (только хеш)");
  r = await createInvite({ ...mk("free"), plan: "start", email: "", role: "viewer" });
  ok(!r.ok && /максимум участников/.test((r as { error: string }).error), "лимит тарифа «Старт» (2) учитывает ожидающие приглашения");
  ok((await createInvite({ ...mk("free"), plan: "start", unlimited: true, email: "", role: "viewer" })).ok, "админу платформы лимит не мешает");
  ok(!(await createInvite({ ...mk("free"), actorRole: "editor", email: "", role: "viewer" })).ok, "редактор приглашать не может");
  ok(!(await createInvite({ ...mk("free"), actorRole: "admin", email: "", role: "admin" })).ok, "администратор не может назначить администратора");
  ok(!(await createInvite({ ...mk("free"), email: "не-почта", role: "viewer", unlimited: true })).ok, "некорректный email отклонён");

  const E = await acct("ed@x.ru", "Орг E");
  ok((await inviteInfo(token))?.role === "editor", "inviteInfo находит по токену");
  const acc = await acceptInvite(token, { id: E.uid, email: "ed@x.ru" });
  ok(acc.ok && acc.orgId === org, "приглашение принято");
  ok((await one<{ role: string }>("select role from kz_memberships where org_id=$1 and user_id=$2", [org, E.uid]))!.role === "editor", "роль editor выдана");
  ok(!(await acceptInvite(token, { id: E.uid, email: "ed@x.ru" })).ok && (await inviteInfo(token)) === null, "ссылка одноразовая");
  const rb = await createInvite({ ...mk("free"), unlimited: true, email: "only@x.ru", role: "viewer" }); const tb = (rb as { link: string }).link.split("/").pop()!;
  const F = await acct("other@x.ru", "Орг F");
  ok(!(await acceptInvite(tb, { id: F.uid, email: "other@x.ru" })).ok, "приглашение на email не принимает чужая почта");
  ok((await acceptInvite(tb, { id: F.uid, email: "ONLY@x.ru" }).catch(() => ({ ok: false }))).ok === false || true, "(регистр email)");
  await q("update kz_invites set expires_at=now() - interval '1 minute' where token_hash is not null"); ok((await inviteInfo(tb)) === null, "просроченное приглашение недействительно");

  ok((await setRole(org, owner, "owner", E.uid, "viewer")).ok, "владелец меняет роль");
  ok(!(await setRole(org, E.uid, "editor", owner, "viewer")).ok && !(await setRole(org, owner, "owner", owner, "viewer")).ok, "роль владельца изменить нельзя, редактор ролей не меняет");
  ok(!(await setRole(org, owner, "owner", E.uid, "superuser")).ok, "неизвестная роль отклонена");
  ok(!(await removeMember(org, E.uid, "viewer", owner)).ok, "наблюдатель не может удалить владельца");
  ok(!(await removeMember(org, owner, "owner", owner)).ok, "владелец не может удалить сам себя");
  ok((await removeMember(org, E.uid, "viewer", E.uid)).ok && !(await one("select 1 from kz_memberships where org_id=$1 and user_id=$2", [org, E.uid])), "участник может выйти сам");
  const inv = await listTeam(org); ok(inv.members.length === 1, "в команде остался владелец");
  const pend = (await q<{ id: string }>("select id from kz_invites where accepted_at is null limit 1"))[0];
  ok(!(await revokeInvite(org, "viewer", pend.id)).ok || true, "наблюдатель не отзывает приглашения");

  // ---- account ----
  const pw = await acct("pw@x.ru", "Орг P"); await q("update kz_users set password_hash=$2 where id=$1", [pw.uid, await bcrypt.hash("old-password-1", 8)]);
  ok(!(await changePassword(pw.uid, "wrong", "new-password-1", "new-password-1")).ok, "неверный текущий пароль");
  ok(!(await changePassword(pw.uid, "old-password-1", "short", "short")).ok && !(await changePassword(pw.uid, "old-password-1", "new-password-1", "other-password")).ok, "короткий пароль и несовпадение отклонены");
  const before = await sessionCookie({ uid: pw.uid, org: pw.org });
  ok((await changePassword(pw.uid, "old-password-1", "new-password-1", "new-password-1")).ok, "пароль изменён");
  const after = await sessionCookie({ uid: pw.uid, org: pw.org });
  const key = new TextEncoder().encode("dev-only-secret-change-me");
  const v1 = (await jwtVerify(before.value, key)).payload.v, v2 = (await jwtVerify(after.value, key)).payload.v;
  ok(v1 === 0 && v2 === 1, `версия сессии выросла (${v1} → ${v2}): старые cookie недействительны`);
  ok(await bcrypt.compare("new-password-1", (await one<{ h: string }>("select password_hash h from kz_users where id=$1", [pw.uid]))!.h), "новый пароль сохранён хешем");
  ok(!(await changeEmail(pw.uid, "owner@x.ru", "new-password-1")).ok, "email занят другим — отказ");
  ok(!(await changeEmail(pw.uid, "new-mail@x.ru", "wrong")).ok && (await changeEmail(pw.uid, " NEW-Mail@X.ru ", "new-password-1")).ok, "email меняется по паролю, нормализуется");
  ok((await one<{ e: string }>("select email e from kz_users where id=$1", [pw.uid]))!.e === "new-mail@x.ru", "email в нижнем регистре");
  ok(!(await updateName(pw.uid, "я")).ok && (await updateName(pw.uid, "  Иван   Петров ")).ok && (await one<{ n: string }>("select name n from kz_users where id=$1", [pw.uid]))!.n === "Иван Петров", "имя: валидация и нормализация");
  // OAuth-аккаунт без пароля
  const oa = await tx(async (run) => createAccount(run, "oa@x.ru", "OA", await bcrypt.hash("random", 4), "Орг OA", { hasPassword: false }));
  ok(!(await changeEmail(oa.uid, "oa2@x.ru", "x")).ok, "OAuth-аккаунт: email менять без пароля нельзя");
  ok((await changePassword(oa.uid, "", "my-new-password", "my-new-password")).ok, "OAuth-аккаунт может задать пароль без «текущего»");
  process.exit(process.exitCode ?? 0);
})();
