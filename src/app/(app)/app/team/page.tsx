import { Trash2, X } from "lucide-react";
import { pageCtx } from "@/lib/auth";
import { can, ROLE_MATRIX } from "@/lib/roles";
import { EXPIRY, listGuestLinks } from "@/lib/guest";
import { PLANS, fmtLimit } from "@/lib/plans";
import { canManageTeam, listTeam, ROLE_HINT, ROLE_LABEL } from "@/lib/team";
import { Form, Field } from "@/components/Form";
import { createGuestLinkAction, inviteAction, removeMemberAction, revokeGuestLinkAction, revokeInviteAction, setRoleAction } from "@/lib/account-actions";
import { OrgTabs } from "@/components/shell/OrgTabs";
import { Avatar } from "@/components/Avatar";
import { q } from "@/lib/db";
import { ModalButton } from "@/components/ui/ModalButton";
import { InviteUser } from "@/components/InviteUser";

import { SubmitButton } from "@/components/SubmitButton";
export default async function Team() {
  const c = await pageCtx("write");
  const [{ members, invites }, guests] = await Promise.all([listTeam(c.org.id), listGuestLinks(c.org.id)]);
  const avs = new Map((await q<{ user_id: string; v: string }>("select user_id, extract(epoch from updated_at)::bigint::text v from kz_user_avatars where user_id = any($1::uuid[])", [members.map((m) => m.user_id)]).catch(() => [])).map((r) => [r.user_id, Number(r.v)]));
  const manage = canManageTeam(c.org.role);
  const lim = c.org.unlimited ? null : PLANS[c.org.plan].members;
  const roles = c.org.role === "owner" ? ["admin", "editor", "viewer"] : ["editor", "viewer"];
  const inviteBtn = <InviteUser manage={manage} roles={roles.map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HINT[r] }))} />;
  return (
    <>
      <OrgTabs action={inviteBtn} />
      <div className="w-full max-w-[742px]">
        <h1 className="mb-2.5 text-2xl font-medium leading-6 text-ink">Пользователи</h1>
        <p className="mb-2 text-sm text-ink2">{`Участников: ${members.length}${invites.length ? ` + приглашений: ${invites.length}` : ""} из ${fmtLimit(lim)}`}</p>
        <section>
          {members.map((m) => {
            const editable = manage && m.role !== "owner" && (m.role !== "admin" || c.org.role === "owner") && m.user_id !== c.user.id;
            return (
              <div key={m.user_id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-medium text-ink">{m.name || m.email}{m.user_id === c.user.id && <span className="ml-2 text-xs font-normal text-ink3">это вы</span>}</div>
                  {editable ? (
                    <form action={setRoleAction} className="mt-2 flex items-center gap-2"><input type="hidden" name="user" value={m.user_id} />
                      <select name="role" defaultValue={m.role} className="rounded-lg bg-tile px-2 py-1 text-sm font-medium text-ink/70">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}{!roles.includes(m.role) && <option value={m.role}>{ROLE_LABEL[m.role]}</option>}</select>
                      <SubmitButton className="text-sm font-medium text-accent">Сохранить</SubmitButton></form>
                  ) : <div className="mt-2 text-sm font-medium text-ink/70">{ROLE_LABEL[m.role]}</div>}
                </div>
                {(editable || (m.user_id === c.user.id && m.role !== "owner")) && (
                  <form action={removeMemberAction}><input type="hidden" name="user" value={m.user_id} /><SubmitButton data-confirm="Убрать участника из команды? Доступ к организации у него пропадёт." data-confirm-ok="Убрать" className="grid size-10 place-items-center rounded-2xl text-ink/60 hover:text-bad" title={m.user_id === c.user.id ? "Выйти из организации" : "Убрать из команды"}><Trash2 size={20} /></SubmitButton></form>
                )}
              </div>
            );
          })}
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-4">
              <div className="min-w-0"><div className="truncate text-base font-medium text-ink">{i.email ?? "Любой, у кого есть ссылка"}</div><div className="mt-2 text-sm font-medium text-ink/70">{ROLE_LABEL[i.role]} · ожидает принятия, до {new Date(i.expires_at).toLocaleDateString("ru-RU")}</div></div>
              {manage && <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><SubmitButton data-confirm="Отозвать приглашение? Ссылка перестанет работать." data-confirm-ok="Отозвать" className="grid size-10 place-items-center rounded-2xl text-ink/60 hover:text-bad" title="Отозвать"><X size={20} /></SubmitButton></form>}
            </div>
          ))}
        </section>
        {manage && (
          <section className="mt-8">
            <h3 className="mb-1 text-base font-semibold">Гостевые ссылки</h3>
            <p className="mb-3 text-sm text-ink2">Для тех, кому нужно только посмотреть: клиент, инвестор, коллега. По ссылке открывается кабинет без регистрации и пароля. Изменять, создавать, публиковать и тратить деньги гость не может, баланс, команду и настройки он не видит.</p>
            <div className="card">
              {guests.length === 0 && <p className="px-5 py-4 text-sm text-ink3">Ссылок пока нет.</p>}
              {guests.map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{g.label || "Гость"}</div>
                    <div className="text-xs text-ink3">{g.last_used_at ? `открывали ${new Date(g.last_used_at).toLocaleDateString("ru-RU")}` : "ещё не открывали"}</div></div>
                  <span className="text-xs text-ink3">{g.expires_at ? `до ${new Date(g.expires_at).toLocaleDateString("ru-RU")}` : "без срока"}</span>
                  <form action={revokeGuestLinkAction}><input type="hidden" name="id" value={g.id} /><SubmitButton data-confirm="Отозвать ссылку? Гость сразу потеряет доступ." data-confirm-ok="Отозвать" className="text-ink3 hover:text-bad" aria-label="Отозвать ссылку"><Trash2 size={15} /></SubmitButton></form>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <ModalButton label="Гостевая ссылка" title="Ссылка для просмотра без регистрации">
                <Form action={createGuestLinkAction} submit="Создать ссылку">
                  <Field label="Кому (для себя)"><input name="label" className="input" maxLength={60} placeholder="Например: клиент Иванов" /></Field>
                  <Field label="Email, чтобы отправить письмо (необязательно)"><input name="email" type="email" className="input" placeholder="client@company.ru" /></Field>
                  <Field label="Срок действия"><select name="expiry" className="input" defaultValue="30">{Object.entries(EXPIRY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
                  <p className="text-xs text-ink3">Ссылка показывается один раз. Если откроете её сами в этом же браузере, она заменит вашу сессию: проверяйте в режиме инкогнито.</p>
                </Form>
              </ModalButton>
            </div>
          </section>
        )}
        <section id="roles" className="mt-8">
          <h3 className="mb-3 text-base font-semibold">Кто что может</h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink3"><th className="px-5 py-3 font-normal">Действие</th>{["viewer", "editor", "admin", "owner"].map((r) => <th key={r} className="px-2 py-3 text-center font-normal">{ROLE_LABEL[r]}</th>)}</tr></thead>
              <tbody>{ROLE_MATRIX.map((r) => (
                <tr key={r.what} className="border-t border-line"><td className="px-5 py-2.5">{r.what}</td>
                  {["viewer", "editor", "admin", "owner"].map((role) => <td key={role} className="px-2 py-2.5 text-center">{can(role, r.cap) ? <span className="text-good">✓</span> : <span className="text-ink3">—</span>}</td>)}</tr>))}</tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
