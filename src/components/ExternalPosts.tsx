import Link from "next/link";
import { ExternalLink, Globe, LinkIcon, Plus, Send, Users } from "lucide-react";
import { listExternal, XKIND_NAME, type XKind, type XRow } from "@/lib/external-posts";
import { addExternalAction } from "@/lib/external-actions";
import { Form } from "@/components/Form";
import { ModalButton } from "@/components/ui/ModalButton";

const ICON: Record<XKind, typeof Send> = { telegram: Send, vk: Users, max: Globe };
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));
export const erOf = (r: Pick<XRow, "views" | "likes" | "comments" | "reposts">) => (r.views ? `${(((r.likes + r.comments + r.reposts) / r.views) * 100).toFixed(1)}%` : "—");

/** Материалы, опубликованные не через сервис: добавляются по ссылке (VK, MAX, Telegram), для них копится своя статистика. */
export async function ExternalPosts({ orgId, write, from, to, brand, brands }: { orgId: string; write: boolean; from: string | null; to: string | null; brand: string; brands: { id: string; name: string }[] }) {
  const rows = await listExternal(orgId, { from, to, brand });
  return (
    <section className="card mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="mr-auto"><b className="text-sm">Материалы по ссылке</b><p className="text-xs text-ink2">Посты, опубликованные вами вне сервиса: добавьте ссылку из VK, MAX или Telegram, и сервис будет собирать по ним статистику.</p></div>
        {write && (
          <ModalButton label="Добавить по ссылке" title="Добавить материал по ссылке" className="pill pill-on" icon={<Plus size={16} />}>
            <Form action={addExternalAction} submit="Добавить">
              <div><label className="label">Ссылка на пост</label><input name="link" required placeholder="https://t.me/канал/123 · https://vk.com/wall-123_456 · ссылка на пост в MAX" className="input" /></div>
              {brands.length > 0 && <div><label className="label">Бренд (необязательно)</label><select name="brand" className="input"><option value="">Без бренда</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
              <ul className="space-y-1 text-xs text-ink3">
                <li><b className="text-ink2">Telegram:</b> публичный канал, адрес вида t.me/имя/123. Доступны просмотры (и реакции, если Telegram их показывает на странице).</li>
                <li><b className="text-ink2">VK:</b> адрес поста vk.com/wall-123_456. Просмотры, лайки, комментарии, репосты. Если сообщество подключено у нас, добавляются ещё охват и действия читателей.</li>
                <li><b className="text-ink2">MAX:</b> канал должен быть подключён в «Каналах» (бот — администратор), иначе MAX не отдаёт данные. Доступны просмотры.</li>
              </ul>
            </Form>
          </ModalButton>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-tile px-4 py-5 text-center text-sm text-ink2"><LinkIcon size={16} className="mr-1.5 inline" />Пока ничего не добавлено{from || to || brand ? " за этот период" : ""}.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => { const I = ICON[r.kind]; return (
            <Link key={r.id} href={`/app/analytics/post/${r.id}`} className="block rounded-2xl bg-tile p-3 transition hover:opacity-90">
              <div className="flex items-center gap-2 text-xs text-ink2">
                <span className="chip inline-flex items-center gap-1 !bg-surface"><I size={12} />{XKIND_NAME[r.kind]}</span>
                {r.author && <span className="truncate">{r.author}</span>}
                <span className="ml-auto shrink-0">{(r.posted_at ?? r.created_at) ? new Date(r.posted_at ?? r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : ""}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm">{r.body || "Без текста (картинка, видео или документ)"}</p>
              {r.last_error && <p className="mt-1.5 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">{r.last_error}</p>}
              <dl className="mt-2 grid grid-cols-5 gap-1.5 text-center">
                {[["Просмотры", fmt(r.views)], ["Лайки", r.kind === "max" ? "—" : fmt(r.likes)], ["Комм.", r.kind === "vk" ? fmt(r.comments) : "—"], ["Репосты", r.kind === "vk" ? fmt(r.reposts) : "—"], ["Вовлечённость", erOf(r)]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface px-1 py-1.5"><dd className="text-sm font-semibold">{v}</dd><dt className="text-[10px] leading-tight text-ink2">{l}</dt></div>))}
              </dl>
              {r.d24 != null && r.d24 > 0 && <p className="mt-1.5 text-xs text-good">+{fmt(r.d24)} просмотров за сутки</p>}
            </Link>); })}
        </div>
      )}
      <p className="mt-3 text-xs text-ink3">Показатели обновляются автоматически: в первые 3 дня каждый час, потом реже. Новые посты не попадают в общие цифры выше, они считаются отдельно.</p>
    </section>
  );
}
