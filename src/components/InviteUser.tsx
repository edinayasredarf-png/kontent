"use client";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "./ui/Modal";
import { useReadOnly } from "./shell/RoleContext";
import { inviteAction } from "@/lib/account-actions";

/** Кнопка «Добавить пользователя» и правая панель приглашения: почта, роль, «где сможет работать». */
export function InviteUser({ roles, manage }: { roles: { value: string; label: string; hint: string }[]; manage: boolean }) {
  const [open, setOpen] = useState(false), [role, setRole] = useState(""), ro = useReadOnly();
  const [state, run, pending] = useActionState(async (p: unknown, f: FormData) => ({ ...((await inviteAction(p, f)) ?? {}), at: Date.now() }), {} as { error?: string; ok?: string; at?: number });
  if (ro) return null;
  const close = () => setOpen(false);
  const label = "mb-2 block text-base font-medium text-ink/70";
  return (
    <>
      <button type="button" className="btn-rect" onClick={() => setOpen(true)}>Добавить пользователя<Plus size={16} /></button>
      {open && (
        <Modal title="Приглашение пользователя" onClose={close}>
          {!manage ? <p className="text-base text-ink">Приглашать могут владелец и администратор.</p> : state.ok ? (
            <div className="space-y-5">
              <p className="whitespace-pre-line break-all rounded-xl bg-good-soft px-4 py-3 text-sm text-good">{state.ok}</p>
              <button type="button" onClick={close} className="grid h-9 place-items-center rounded-lg bg-slate-200 px-3.5 text-base font-medium text-ink dark:bg-tile2">Закрыть</button>
            </div>
          ) : (
            <form action={run} className="max-w-[520px]">
              <div className="pb-5"><label className={label}>Почта для приглашения</label><input name="email" type="email" placeholder="example@example.ru" className="input" /></div>
              <div className="pb-10">
                <h3 className="text-lg font-medium text-ink">Роль в личном кабинете</h3>
                <p className="mt-3 text-base font-medium leading-5 text-ink">От роли пользователя зависят его возможности в личном кабинете и доступ к разным разделам. <a href="/app/team#roles" onClick={close} className="text-accent">Подробнее о ролях</a></p>
                <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="input mt-3">
                  <option value="" disabled>Выбрать</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.hint}</option>)}
                </select>
              </div>
              <div className="pb-8">
                <h3 className="text-lg font-medium text-ink">Где сможет работать</h3>
                <p className="mt-2 text-base leading-5 text-ink">Можно открыть пользователю все сервисы организации или только некоторые.</p>
                <div className="pt-5">
                  <label className="flex items-center gap-1.5 py-2 text-base font-medium"><input type="radio" name="scope" value="all" defaultChecked className="size-4 accent-[var(--accent)]" />Все сервисы</label>
                  <label className="flex cursor-not-allowed items-center gap-1.5 py-2 text-base font-medium text-ink/50" title="Скоро: пока доступ открывается ко всем сервисам"><input type="radio" name="scope" value="some" disabled className="size-4" />Только некоторые<span className="ml-1 rounded-full bg-tile px-2 py-0.5 text-xs font-normal">скоро</span></label>
                </div>
              </div>
              {state.error && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
              <div className="flex gap-3 pt-5">
                <button disabled={!role || pending} className={`h-9 rounded-lg px-3.5 text-base font-medium ${role ? "bg-accent text-white" : "bg-slate-200 text-ink/40 dark:bg-tile2"}`}>{pending ? "Создаём…" : "Дальше"}</button>
                <button type="button" onClick={close} className="h-9 rounded-lg bg-slate-200 px-3.5 text-base font-medium text-ink dark:bg-tile2">Отменить</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
