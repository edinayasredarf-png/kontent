import Link from "next/link";
import { ArrowLeft, Pause, Play, RefreshCw, Trash2, X, AlertTriangle } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLANS, fmtLimit } from "@/lib/plans";
import { Form, Field } from "@/components/Form";
import { addKeywordsAction, addManualAction, addSourceAction, deleteKeywordAction, deleteSourceAction, refreshSourceAction, toggleSourceAction } from "@/lib/monitor/actions";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { PageHead } from "@/components/ui";

export const maxDuration = 60;

export default async function MonitorSettings() {
  const c = await requireCtx();
  const [sources, kws] = await Promise.all([
    q<{ id: string; kind: Kind; title: string; ref: string; status: string; last_fetched_at: string | null; last_error: string | null; items: string }>(
      `select s.id,s.kind,s.title,s.ref,s.status,s.last_fetched_at,s.last_error,(select count(*) from kz_feed_items i where i.source_id=s.id) items
         from kz_sources s where s.org_id=$1 order by s.created_at`, [c.org.id]),
    q<{ id: string; word: string; kind: string }>("select id,word,kind from kz_keywords where org_id=$1 order by kind,word", [c.org.id]),
  ]);
  const lim = c.org.unlimited ? null : PLANS[c.org.plan].sources;
  const used = sources.filter((s) => s.kind !== "manual").length;
  const inc = kws.filter((k) => k.kind === "include"), exc = kws.filter((k) => k.kind === "exclude");
  const vkOn = !!process.env.VK_SERVICE_TOKEN?.trim();

  return (
    <>
      <Link href="/app/monitor" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />К ленте</Link>
      <PageHead title="Источники и ключевые слова" sub={`Источников: ${used} из ${fmtLimit(lim)}. Лента обновляется сама каждый час.`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="card">
            <div className="border-b border-line px-5 py-3 text-sm font-medium">Источники</div>
            {sources.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink2">Пока пусто. Добавьте первый источник справа.</p>}
            {sources.map((s) => (
              <div key={s.id} className="border-b border-line px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip">{KIND_LABEL[s.kind]}</span>
                  <span className="min-w-[8rem] flex-1 truncate text-sm font-medium">{s.title}</span>
                  {s.status === "paused" && <span className="chip">пауза</span>}
                  <span className="text-xs text-ink3">постов: {s.items}</span>
                  {s.kind !== "manual" && (<>
                    <form action={refreshSourceAction}><input type="hidden" name="id" value={s.id} /><button className="text-ink3 hover:text-ink" title="Обновить сейчас"><RefreshCw size={15} /></button></form>
                    <form action={toggleSourceAction}><input type="hidden" name="id" value={s.id} /><button className="text-ink3 hover:text-ink" title={s.status === "active" ? "Пауза" : "Возобновить"}>{s.status === "active" ? <Pause size={15} /> : <Play size={15} />}</button></form>
                  </>)}
                  <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><button className="text-ink3 hover:text-bad" title="Удалить вместе с постами"><Trash2 size={15} /></button></form>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink3">{s.kind === "site" ? `${s.ref} · ` : ""}{s.last_fetched_at ? `обновлено ${new Date(s.last_fetched_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : s.kind === "manual" ? "добавлено вручную" : "ещё не обновлялся"}</p>
                {s.last_error && <p className="mt-1 flex items-start gap-1.5 text-xs text-bad"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{s.last_error}</p>}
              </div>
            ))}
          </section>

          <section className="card p-5">
            <b className="text-sm">Ключевые слова</b>
            <p className="mb-4 mt-1 text-xs text-ink2">Посты со словами из первого списка поднимаются наверх ленты. Слова из второго скрывают пост целиком. Падежи учитываются: «закупки» найдёт и «закупками».</p>
            <KwList title="Ищем" items={inc} />
            <KwList title="Исключаем" items={exc} danger />
          </section>
        </div>

        <div className="space-y-6">
          <section className="card h-fit p-5">
            <b className="mb-4 block text-sm">Добавить источник</b>
            <Form action={addSourceAction} submit="Проверить и добавить">
              <Field label="Тип">
                <select name="kind" className="input">
                  <option value="site">Сайт или RSS-лента</option><option value="telegram">Telegram-канал (публичный)</option>
                  <option value="vk" disabled={!vkOn}>Сообщество VK{vkOn ? "" : " — нужен VK_SERVICE_TOKEN"}</option><option value="news">Новости по запросу</option>
                </select>
              </Field>
              <Field label="Адрес, @канал или запрос"><input name="value" required className="input" placeholder="example.ru · @channel · vk.com/name · «закупки 44-ФЗ»" /></Field>
              <p className="text-xs text-ink3">Мы проверим, что источник читается. Сайты — через RSS, если её нет, берём заголовки с главной страницы. MAX и закрытые каналы читать нельзя — добавляйте посты вручную ниже.</p>
            </Form>
          </section>

          <section className="card h-fit p-5">
            <b className="mb-4 block text-sm">Добавить ключевые слова</b>
            <Form action={addKeywordsAction} submit="Добавить">
              <Field label="Слова или фразы через запятую"><textarea name="words" rows={2} required className="input" placeholder="закупки, госзаказ, 44-ФЗ" /></Field>
              <Field label="Что с ними делать"><select name="kind" className="input"><option value="include">Искать — поднимать наверх</option><option value="exclude">Исключать — скрывать пост</option></select></Field>
            </Form>
          </section>

          <section className="card h-fit p-5">
            <b className="mb-1 block text-sm">Добавить пост вручную</b>
            <p className="mb-4 text-xs text-ink2">Для MAX, закрытых каналов, писем — всё, что нельзя прочитать автоматически.</p>
            <Form action={addManualAction} submit="Добавить в ленту">
              <Field label="Текст поста"><textarea name="text" rows={4} required className="input" /></Field>
              <Field label="Ссылка (необязательно)"><input name="url" className="input" placeholder="https://" /></Field>
              <Field label="Откуда (необязательно)"><input name="label" className="input" placeholder="Канал в MAX «…»" /></Field>
            </Form>
          </section>
        </div>
      </div>
    </>
  );
}

function KwList({ title, items, danger }: { title: string; items: { id: string; word: string }[]; danger?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <span className="label">{title}</span>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-xs text-ink3">—</span>}
        {items.map((k) => (
          <form key={k.id} action={deleteKeywordAction} className={`chip !pr-1 ${danger ? "!bg-bad-soft !text-bad" : "!bg-accent-soft !text-accent-ink"}`}>
            <input type="hidden" name="id" value={k.id} />{k.word}
            <button className="grid size-5 place-items-center rounded-full hover:bg-ink/10" title="Удалить" aria-label={`Удалить «${k.word}»`}><X size={12} /></button>
          </form>
        ))}
      </div>
    </div>
  );
}
