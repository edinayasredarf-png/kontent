import Link from "next/link";
import { Check, EyeOff, ExternalLink, Inbox as InboxIcon, RotateCcw } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { commentStatusAction, replyCommentAction } from "@/lib/engage-actions";
import { Form } from "@/components/Form";
import { Empty, PageHead } from "@/components/ui";

const TABS: [string, string][] = [["new", "Новые"], ["done", "Обработанные"], ["hidden", "Скрытые"]];

export default async function Inbox({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const st = TABS.some(([k]) => k === s) ? s! : "new";
  const c = await requireCtx();
  const [rows, counts, channels] = await Promise.all([
    q<{ id: string; author: string; body: string; posted_at: string; status: string; reply: string | null; topic: string | null; url: string | null; channel: string; kind: string }>(
      `select cm.id,cm.author,cm.body,cm.posted_at,cm.status,cm.reply,i.topic,p.external_url url,ch.title channel,ch.kind
         from kz_comments cm join kz_channels ch on ch.id=cm.channel_id left join kz_publications p on p.id=cm.publication_id left join kz_content_items i on i.id=p.item_id
        where cm.org_id=$1 and cm.status=$2 order by cm.posted_at desc limit 100`, [c.org.id, st]),
    q<{ status: string; n: string }>("select status,count(*) n from kz_comments where org_id=$1 group by status", [c.org.id]),
    q<{ kind: string }>("select distinct kind from kz_channels where org_id=$1", [c.org.id]),
  ]);
  const cnt = Object.fromEntries(counts.map((x) => [x.status, Number(x.n)]));
  const hasTg = channels.some((x) => x.kind === "telegram");
  const write = c.org.role !== "viewer";
  return (
    <>
      <PageHead title="Входящие" sub="Комментарии под вашими постами в одном месте. Собираются автоматически." />
      <div className="mb-4 flex gap-1 text-sm">{TABS.map(([k, l]) => <Link key={k} href={`/app/inbox?s=${k}`} className={`rounded-lg px-3 py-1.5 ${st === k ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}{cnt[k] ? <span className="ml-1.5 text-xs text-ink3">{cnt[k]}</span> : null}</Link>)}</div>
      {hasTg && <p className="mb-4 rounded-xl bg-tile px-4 py-3 text-xs text-ink2">VK: комментарии собираются и на них можно отвечать отсюда. Telegram: Bot API не отдаёт комментарии каналов, поэтому здесь они не появятся — читайте их в группе обсуждения канала.</p>}
      {rows.length === 0 ? <Empty icon={<InboxIcon />} title={st === "new" ? "Новых комментариев нет" : "Здесь пусто"} text="Комментарии к постам VK подтянутся в течение часа после появления." /> : (
        <div className="space-y-3">{rows.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink3">
              <b className="text-sm text-ink">{r.author}</b><span>·</span><span>{new Date(r.posted_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span>·</span><span>{r.channel}</span>{r.url && <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink">пост<ExternalLink size={11} /></a>}
            </div>
            {r.topic && <p className="mb-1 text-xs text-ink3">К посту: {r.topic}</p>}
            <p className="whitespace-pre-wrap text-sm">{r.body}</p>
            {r.reply && <p className="mt-2 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">Ваш ответ: {r.reply}</p>}
            {write && (
              <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3">
                {r.kind === "vk" && !r.reply && (
                  <Form action={replyCommentAction} submit="Ответить" className="flex flex-1 flex-wrap items-start gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea name="text" required rows={2} maxLength={4000} placeholder="Ответ от имени сообщества" className="input min-w-[16rem] flex-1 text-sm" />
                  </Form>
                )}
                <div className="ml-auto flex gap-1">
                  {r.status !== "done" && <form action={commentStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="done" /><button className="btn btn-ghost !px-2.5 !py-1.5" title="Обработано"><Check size={14} /></button></form>}
                  {r.status !== "hidden" && <form action={commentStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="hidden" /><button className="btn btn-ghost !px-2.5 !py-1.5" title="Скрыть"><EyeOff size={14} /></button></form>}
                  {r.status !== "new" && <form action={commentStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="new" /><button className="btn btn-ghost !px-2.5 !py-1.5" title="Вернуть в новые"><RotateCcw size={14} /></button></form>}
                </div>
              </div>
            )}
          </article>
        ))}</div>
      )}
    </>
  );
}
