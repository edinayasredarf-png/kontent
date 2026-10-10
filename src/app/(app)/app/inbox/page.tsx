import Link from "next/link";
import { Check, EyeOff, ExternalLink, Inbox as InboxIcon, RotateCcw, Sparkles } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { commentStatusAction, hideSpamAction, replyCommentAction, suggestReplyAction } from "@/lib/engage-actions";
import { classifyPending, TONE_LABEL, type Tone } from "@/lib/comments";
import { PRICES, rub } from "@/lib/wallet";
import { Form } from "@/components/Form";
import { Empty, PageHead } from "@/components/ui";

const TABS: [string, string][] = [["new", "Новые"], ["done", "Обработанные"], ["hidden", "Скрытые"]];

const TONES: [string, string][] = [["", "Все"], ["negative", "Негатив"], ["question", "Вопросы"], ["spam", "Спам"], ["positive", "Позитив"]];
const TONE_CLS: Record<Tone, string> = { neutral: "bg-tile text-ink2", positive: "bg-good-soft text-good", question: "bg-accent-soft text-accent-ink", negative: "bg-bad-soft text-bad", spam: "bg-warn-soft text-warn" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ s?: string; t?: string; err?: string }> }) {
  const { s, t, err } = await searchParams;
  const tone = TONES.some(([k]) => k && k === t) ? t! : "";
  const st = TABS.some(([k]) => k === s) ? s! : "new";
  const c = await requireCtx();
  await classifyPending(c.org.id);
  const [rows, counts, channels, toneCounts] = await Promise.all([
    q<{ id: string; author: string; body: string; posted_at: string; status: string; reply: string | null; tone: Tone | null; draft: string | null; topic: string | null; url: string | null; channel: string; kind: string }>(
      `select cm.id,cm.author,cm.body,cm.posted_at,cm.status,cm.reply,cm.tone,cm.draft,i.topic,p.external_url url,ch.title channel,ch.kind
         from kz_comments cm join kz_channels ch on ch.id=cm.channel_id left join kz_publications p on p.id=cm.publication_id left join kz_content_items i on i.id=p.item_id
        where cm.org_id=$1 and cm.status=$2 ${tone ? "and cm.tone=$3" : ""} order by cm.posted_at desc limit 100`, tone ? [c.org.id, st, tone] : [c.org.id, st]),
    q<{ status: string; n: string }>("select status,count(*) n from kz_comments where org_id=$1 group by status", [c.org.id]),
    q<{ kind: string }>("select distinct kind from kz_channels where org_id=$1", [c.org.id]),
    q<{ tone: string; n: string }>("select tone,count(*) n from kz_comments where org_id=$1 and status='new' and tone is not null group by tone", [c.org.id]),
  ]);
  const tc = Object.fromEntries(toneCounts.map((x) => [x.tone, Number(x.n)]));
  const cnt = Object.fromEntries(counts.map((x) => [x.status, Number(x.n)]));
  const hasTg = channels.some((x) => x.kind === "telegram");
  const write = c.org.role !== "viewer";
  return (
    <>
      <PageHead title="Входящие" sub="Комментарии под вашими постами в одном месте. Собираются автоматически." />
      <div className="mb-4 flex gap-1 text-sm">{TABS.map(([k, l]) => <Link key={k} href={`/app/inbox?s=${k}`} className={`rounded-lg px-3 py-1.5 ${st === k ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}{cnt[k] ? <span className="ml-1.5 text-xs text-ink3">{cnt[k]}</span> : null}</Link>)}</div>
      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        {TONES.map(([k, l]) => <Link key={k || "all"} href={`/app/inbox?s=${st}${k ? `&t=${k}` : ""}`} className={`rounded-full px-3 py-1 ${tone === k ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}{k && st === "new" && tc[k] ? <span className="ml-1 text-ink3">{tc[k]}</span> : null}</Link>)}
        {write && st === "new" && tc.spam > 0 && <form action={hideSpamAction} className="ml-auto"><button className="btn btn-ghost !px-3 !py-1"><EyeOff size={13} />Скрыть весь спам ({tc.spam})</button></form>}
      </div>
      {err && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      {hasTg && <p className="mb-4 rounded-xl bg-tile px-4 py-3 text-xs text-ink2">VK: комментарии собираются и на них можно отвечать отсюда. Telegram: Bot API не отдаёт комментарии каналов, поэтому здесь они не появятся — читайте их в группе обсуждения канала.</p>}
      {rows.length === 0 ? <Empty icon={<InboxIcon />} title={st === "new" ? "Новых комментариев нет" : "Здесь пусто"} text="Комментарии к постам VK подтянутся в течение часа после появления." /> : (
        <div className="space-y-3">{rows.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink3">
              <b className="text-sm text-ink">{r.author}</b>{r.tone && r.tone !== "neutral" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLS[r.tone]}`}>{TONE_LABEL[r.tone]}</span>}<span>·</span><span>{new Date(r.posted_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
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
                    <textarea key={r.draft ?? "e"} name="text" required rows={2} maxLength={4000} defaultValue={r.draft ?? ""} placeholder="Ответ от имени сообщества" className="input min-w-[16rem] flex-1 text-sm" />
                  </Form>
                )}
                {!r.reply && r.tone !== "spam" && (
                  <form action={suggestReplyAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost !py-1.5" title="ИИ предложит ответ, вы сможете его поправить"><Sparkles size={14} />{r.draft ? "Другой ответ" : "Ответ от ИИ"}{c.org.unlimited ? "" : ` · ${rub(PRICES.reply)}`}</button></form>
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
