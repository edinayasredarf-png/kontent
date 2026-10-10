import { Link2, Trash2 } from "lucide-react";
import { createShareLinkAction, revokeShareLinkAction } from "@/lib/share-actions";
import type { ShareLink } from "@/lib/share";
import { CopyField } from "./CopyField";

const when = (d: string | null) => (d ? new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—");

/** Ссылки для клиента: согласование материалов и отчёт без регистрации. */
export function ShareCard({ brandId, links, canEdit }: { brandId: string; links: ShareLink[]; canEdit: boolean }) {
  const active = links.filter((l) => !l.revoked);
  return (
    <section className="card p-5">
      <b className="flex items-center gap-2 text-sm"><Link2 size={15} />Доступ для клиента</b>
      <p className="mb-3 mt-1 text-xs text-ink2">Ссылка без регистрации: клиент смотрит готовые материалы, одобряет или просит правки и видит отчёт по результатам.</p>
      {active.map((l) => (
        <div key={l.id} className="mb-3 rounded-xl bg-tile p-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-ink2">
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.label || "Ссылка"}</span>
            <span>{l.can_approve ? "согласование" : "комментарии"}{l.show_report ? " · отчёт" : ""}{l.auto_publish ? " · автопубликация" : ""}</span>
          </div>
          {l.url ? <CopyField value={l.url} /> : <p className="text-xs text-warn">Адрес недоступен: сменился ключ шифрования. Отзовите ссылку и создайте новую.</p>}
          <div className="mt-2 flex items-center justify-between text-xs text-ink3">
            <span>{l.expires_at ? `до ${when(l.expires_at)}` : "бессрочно"} · открывали: {when(l.last_seen_at)}</span>
            {canEdit && <form action={revokeShareLinkAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="brand" value={brandId} /><button className="inline-flex items-center gap-1 text-bad hover:underline"><Trash2 size={12} />Отозвать</button></form>}
          </div>
        </div>
      ))}
      {canEdit && (
        <details className="rounded-xl border border-line p-3" open={active.length === 0}>
          <summary className="cursor-pointer text-xs font-medium text-ink2">Создать ссылку</summary>
          <form action={createShareLinkAction} className="mt-3 space-y-2.5">
            <input type="hidden" name="brand" value={brandId} />
            <input name="label" maxLength={60} placeholder="Для кого (например, директор Иван)" className="input" />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="approve" defaultChecked />Клиент может одобрять и просить правки</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="report" defaultChecked />Показывать отчёт по результатам</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="auto" />Публиковать сразу после одобрения клиентом</label>
            <label className="flex items-center gap-2 text-xs">Срок действия, дней
              <input name="days" type="number" min={0} max={365} defaultValue={0} className="input !w-20 !py-1" /><span className="text-ink3">0 — без срока</span></label>
            <button className="btn">Создать ссылку</button>
          </form>
        </details>
      )}
    </section>
  );
}
