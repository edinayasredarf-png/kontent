import { ExternalPostsCarousel } from "./ExternalPostsCarousel";
import { publishedAnalytics, isPublished } from "@/lib/published-analytics";
import { parsePostLink } from "@/lib/external-posts";
import { PublishedPostMedia } from "./PublishedPostMedia";
import { ExternalPostMedia } from "./ExternalPostMedia";
import Link from "next/link";
import { Globe, Plus, Send, Users } from "lucide-react";
import { listExternal, XKIND_NAME, type XKind, type XRow } from "@/lib/external-posts";
import { addExternalAction } from "@/lib/external-actions";
import { Form } from "@/components/Form";
import { ModalButton } from "@/components/ui/ModalButton";

const ICON: Record<XKind, typeof Send> = { telegram: Send, vk: Users, max: Globe };
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));
export const erOf = (r: Pick<XRow, "views" | "likes" | "comments" | "reposts">) => (r.views ? `${(((r.likes + r.comments + r.reposts) / r.views) * 100).toFixed(1)}%` : "—");

/** Unified portfolio: native publications plus posts added by link, without duplicate cards. */
export async function ExternalPosts({ orgId, from, to, brand, channel = "", format = "", full = false }: { orgId: string; from: string | null; to: string | null; brand: string; channel?: string; format?: string; full?: boolean }) {
  const [external, native] = await Promise.all([listExternal(orgId, { from, to, brand, channel, format }), publishedAnalytics(orgId, { from, to, brand, channel, format })]);
  const key = (row: {kind:string;url:string}) => { try { const parsed=parsePostLink(row.url); return `${parsed.kind}:${parsed.ref}`; } catch { return `${row.kind}:${row.url}`; } };
  const nativeKeys=new Set(native.map(key));
  const rows = [...native,...external.filter(row=>!nativeKeys.has(key(row)))].sort((a,b)=>new Date(b.posted_at??b.created_at).getTime()-new Date(a.posted_at??a.created_at).getTime()).slice(0,200);
  if (!rows.length) return full ? <p className="rounded-2xl bg-tile p-5 text-sm text-ink2">За выбранный период материалов нет.</p> : null;
  const cards = <>{rows.map((r) => { const I = ICON[r.kind]; const measured=!isPublished(r)||!!r.last_fetched_at; const display=(n:number)=>measured?fmt(n):"—"; return (
          <Link key={r.id} href={isPublished(r)?`/app/analytics/publications/${r.id}`:`/app/analytics/post/${r.id}`} className="block min-w-0 rounded-2xl bg-tile p-4 transition hover:opacity-90">
            <div className="flex items-center gap-2 text-xs text-ink2">
              <span className="chip inline-flex items-center gap-1 !bg-surface"><I size={12} />{XKIND_NAME[r.kind]}</span>
              {r.author && <span className="truncate">{r.author}</span>}
              <span className="ml-auto shrink-0">{(r.posted_at ?? r.created_at) ? new Date(r.posted_at ?? r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : ""}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm">{r.body || "Без текста (картинка, видео или документ)"}</p>
            {isPublished(r)?<PublishedPostMedia assets={r.assets} compact/>:<ExternalPostMedia id={r.id} count={r.image_count} unchecked={!r.media_checked_at} compact />}
            {isPublished(r) && !r.last_fetched_at && <p className="mt-2 text-xs text-ink3">Опубликовано через JuicerAI · Статистика ещё собирается</p>}
            {r.last_error && <p className="mt-1.5 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">{r.last_error}</p>}
            <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              {[["Просмотры", display(r.views)], ["Лайки", r.kind === "max" ? "—" : display(r.likes)], ["Комм.", r.kind === "vk" ? display(r.comments) : "—"], ["Репосты", r.kind === "vk" ? display(r.reposts) : "—"], ["Вовлечённость", erOf(r)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-surface px-1 py-1.5"><dd className="text-sm font-semibold">{v}</dd><dt className="break-words text-[10px] leading-tight text-ink2">{l}</dt></div>))}
            </dl>
            {r.d24 != null && r.d24 > 0 && <p className="mt-1.5 text-xs text-good">+{fmt(r.d24)} просмотров за сутки</p>}
          </Link>); })}
  </>;
  if (full) return <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</div>;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ from, to, brand, channel, format })) if (value) params.set(key, value);
  return <ExternalPostsCarousel href={`/app/analytics/materials?${params}`}>{cards}</ExternalPostsCarousel>;

}

export function AddExternalPost({ brands }: { brands: { id: string; name: string }[] }) {
  return (
    <ModalButton label="Добавить по ссылке" title="Добавить материал по ссылке" className="btn btn-accent !rounded-xl" icon={<Plus size={16} />}>
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
  );
}
