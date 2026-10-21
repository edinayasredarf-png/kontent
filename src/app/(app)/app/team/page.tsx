import { Trash2, X } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { PLANS, fmtLimit } from "@/lib/plans";
import { canManageTeam, listTeam, ROLE_HINT, ROLE_LABEL } from "@/lib/team";
import { Form, Field } from "@/components/Form";
import { inviteAction, removeMemberAction, revokeInviteAction, setRoleAction } from "@/lib/account-actions";
import { PageHead } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { q } from "@/lib/db";
import { ModalButton } from "@/components/ui/ModalButton";

import { SubmitButton } from "@/components/SubmitButton";
export default async function Team() {
  const c = await requireCtx();
  const { members, invites } = await listTeam(c.org.id);
  const avs = new Map((await q<{ user_id: string; v: string }>("select user_id, extract(epoch from updated_at)::bigint::text v from kz_user_avatars where user_id = any($1::uuid[])", [members.map((m) => m.user_id)]).catch(() => [])).map((r) => [r.user_id, Number(r.v)]));
  const manage = canManageTeam(c.org.role);
  const lim = c.org.unlimited ? null : PLANS[c.org.plan].members;
  const roles = c.org.role === "owner" ? ["admin", "editor", "viewer"] : ["editor", "viewer"];
  return (
    <>
      <PageHead title="Команда" sub={`Участников: ${members.length}${invites.length ? ` + приглашений: ${invites.length}` : ""} из ${fmtLimit(lim)}`} />
      <div className="mx-auto w-full max-w-[640px]">
        <section className="card">
          {members.map((m) => {
            const editable = manage && m.role !== "owner" && (m.role !== "admin" || c.org.role === "owner") && m.user_id !== c.user.id;
            return (
              <div key={m.user_id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <Avatar id={m.user_id} v={avs.get(m.user_id)} name={m.name} email={m.email} className="size-9" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.name || m.email}{m.user_id === c.user.id && <span className="ml-2 text-xs font-normal text-ink3">это вы</span>}</div><div className="truncate text-xs text-ink3">{m.email}</div></div>
                {editable ? (
                  <form action={setRoleAction} className="flex items-center gap-2"><input type="hidden" name="user" value={m.user_id} />
                    <select name="role" defaultValue={m.role} className="input !w-auto !py-1.5 text-xs">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}{!roles.includes(m.role) && <option value={m.role}>{ROLE_LABEL[m.role]}</option>}</select>
                    <SubmitButton className="btn btn-ghost !py-1.5 text-xs">Сохранить</SubmitButton></form>
                ) : <span className="chip">{ROLE_LABEL[m.role]}</span>}
                {(editable || (m.user_id === c.user.id && m.role !== "owner")) && (
                  <form action={removeMemberAction}><input type="hidden" name="user" value={m.user_id} /><SubmitButton data-confirm="Убрать участника из команды? Доступ к организации у него пропадёт." data-confirm-ok="Убрать" className="text-ink3 hover:text-bad" title={m.user_id === c.user.id ? "Выйти из организации" : "Убрать из команды"}><Trash2 size={15} /></SubmitButton></form>
                )}
              </div>
            );
          })}
          {invites.length > 0 && <div className="border-t border-line bg-tile/50 px-5 py-2 text-xs font-medium text-ink2">Ожидают принятия</div>}
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1 truncate text-sm">{i.email ?? "Любой, у кого есть ссылка"}</div>
              <span className="chip">{ROLE_LABEL[i.role]}</span>
              <span className="text-xs text-ink3">до {new Date(i.expires_at).toLocaleDateString("ru-RU")}</span>
              {manage && <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><SubmitButton data-confirm="Отозвать приглашение? Ссылка перестанет работать." data-confirm-ok="Отозвать" className="text-ink3 hover:text-bad" title="Отозвать"><X size={15} /></SubmitButton></form>}
            </div>
          ))}
        </section>
        <div className="mt-5 flex justify-center">
          <ModalButton label="Пригласить" title="Пригласить в команду">
          {manage ? (
            <Form action={inviteAction} submit="Создать ссылку">
              <Field label="Email (необязательно)"><input name="email" type="email" className="input" placeholder="colleague@company.ru" /></Field>
              <Field label="Роль"><select name="role" className="input" defaultValue="editor">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_HINT[r]}</option>)}</select></Field>
              <p className="text-xs text-ink3">Письмо не отправляется — скопируйте ссылку и передайте человеку. Если указан email, принять приглашение сможет только его владелец.</p>
            </Form>
          ) : <p className="text-sm text-ink2">Приглашать могут владелец и администратор.</p>}
          </ModalButton>
        </div>
      </div>
    </>
  );
}
