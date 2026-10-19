import { AlertTriangle, Pause, Play, RefreshCw, Trash2, X } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLANS, fmtLimit } from "@/lib/plans";
import { Form, Field } from "@/components/Form";
import { addKeywordsAction, addManualAction, deleteKeywordAction, deleteSourceAction, refreshSourceAction, toggleSourceAction } from "@/lib/monitor/actions";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { sourceView } from "@/lib/monitor/display";
import { AddSourceForm } from "@/components/AddSourceForm";
import { SuggestKeywords } from "@/components/SuggestKeywords";
import { SourceIcon } from "@/components/monitor/SourceIcon";
import { SettingsTabs } from "@/components/monitor/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { PRICES, rub } from "@/lib/wallet";

const IBTN = "grid size-9 place-items-center rounded-full bg-accent-soft text-ink2 transition hover:bg-tile2 hover:text-ink";

/** Содержимое настроек мониторинга: источники, ключевые слова, ручное добавление. Используется и в модальном окне, и на отдельной странице. */
export async function SettingsBody() {
  const c = await requireCtx();
  const [sources, kws, maxCh, brands] = await Promise.all([
    q<{ id: string; kind: Kind; title: string; ref: string; config: Record<string, unknown> | null; status: string; last_fetched_at: string | null; last_error: string | null; items: string }>(
      `select s.id,s.kind,s.title,s.ref,s.config,s.status,s.last_fetched_at,s.last_error,(select count(*) from kz_feed_items i where i.source_id=s.id) items
         from kz_sources s where s.org_id=$1 order by s.created_at`, [c.org.id]),
    q<{ id: string; word: string; kind: string }>("select id,word,kind from kz_keywords where org_id=$1 order by kind,word", [c.org.id]),
    q<{ id: string; title: string }>("select id,title from kz_channels where org_id=$1 and kind='max' and status='active' order by created_at", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
  ]);
  const lim = c.org.unlimited ? null : PLANS[c.org.plan].sources;
  const used = sources.filter((s) => s.kind !== "manual").length;
  const inc = kws.filter((k) => k.kind === "include"), exc = kws.filter((k) => k.kind === "exclude");
  const vkOn = !!process.env.VK_SERVICE_TOKEN?.trim();
  const box = "rounded-2xl bg-tile p-4";

  const sourcesNode = (<>
    <p className="text-sm text-ink2">Источников: {used} из {fmtLimit(lim)}. Лента обновляется сама каждый час, кнопка «Обновить» на странице делает это сразу.</p>
    {sources.length === 0 ? <p className={`${box} text-center text-sm text-ink2`}>Пока пусто. Добавьте первый источник ниже.</p> : (
      <ul className="space-y-2.5">{sources.map((s) => {
        const sv = sourceView(s.kind, s.title, s.ref, s.config ?? {});
        return (
          <li key={s.id} className={`${box} flex flex-wrap items-center gap-3`}>
            <SourceIcon kind={s.kind} avatar={typeof s.config?.avatar === "string" ? s.config.avatar : undefined} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold"><span className="max-w-full break-words">{sv.name}</span><span className="chip !bg-surface">{KIND_LABEL[s.kind]}</span>{s.status === "paused" && <span className="chip !bg-warn-soft !text-warn">пауза</span>}</p>
              <p className="break-words text-xs text-ink2 sm:truncate">{sv.address} · постов: {s.items} · {s.last_fetched_at ? `обновлено ${new Date(s.last_fetched_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : s.kind === "manual" ? "добавлено вручную" : "ещё не обновлялся"}</p>
              {s.last_error && <p className="mt-1 flex items-start gap-1.5 text-xs text-bad"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{s.last_error}</p>}
            </div>
            <div className="flex gap-1.5">
              {s.kind !== "manual" && (<>
                <form action={refreshSourceAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className={IBTN} title="Обновить сейчас" aria-label="Обновить источник"><RefreshCw size={15} /></SubmitButton></form>
                <form action={toggleSourceAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className={IBTN} title={s.status === "active" ? "Пауза" : "Возобновить"} aria-label={s.status === "active" ? "Поставить на паузу" : "Возобновить"}>{s.status === "active" ? <Pause size={15} /> : <Play size={15} />}</SubmitButton></form>
              </>)}
              <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><SubmitButton data-confirm="Удалить источник вместе со всеми его постами в ленте?" className={`${IBTN} hover:!text-bad`} title="Удалить вместе с постами" aria-label="Удалить источник"><Trash2 size={15} /></SubmitButton></form>
            </div>
          </li>);
      })}</ul>
    )}
    <section className={box}><b className="mb-3 block text-sm">Добавить источник</b><AddSourceForm vkOn={vkOn} maxChannels={maxCh} /></section>
  </>);

  const wordsNode = (<>
    <p className="text-sm text-ink2">Слова из первого списка поднимают пост выше и подсвечиваются. Слова из второго скрывают пост целиком. Падежи учитываются: «закупки» найдёт и «закупками».</p>
    <section className={box}><KwList title="Ищем" items={inc} /><KwList title="Исключаем" items={exc} danger /></section>
    <section className={box}><b className="mb-3 block text-sm">Добавить слова</b>
      <Form action={addKeywordsAction} submit="Добавить">
        <Field label="Слова или фразы через запятую"><textarea name="words" rows={2} required className="input" placeholder="закупки, госзаказ, 44-ФЗ" /></Field>
        <Field label="Что с ними делать"><select name="kind" className="input"><option value="include">Искать: поднимать наверх</option><option value="exclude">Исключать: скрывать пост</option></select></Field>
      </Form></section>
    <SuggestKeywords brands={brands} priceLabel={c.org.unlimited ? "бесплатно для админа" : rub(PRICES.idea)} />
  </>);

  const manualNode = (
    <section className={box}>
      <b className="mb-1 block text-sm">Добавить пост вручную</b>
      <p className="mb-4 text-xs text-ink2">Для MAX, закрытых каналов, писем: всё, что нельзя прочитать автоматически.</p>
      <Form action={addManualAction} submit="Добавить в ленту">
        <Field label="Текст поста"><textarea name="text" rows={4} required className="input" /></Field>
        <Field label="Ссылка (необязательно)"><input name="url" className="input" placeholder="https://" /></Field>
        <Field label="Откуда (необязательно)"><input name="label" className="input" placeholder="Канал в MAX «…»" /></Field>
      </Form>
    </section>
  );

  return <SettingsTabs tabs={[{ key: "sources", label: "Источники", badge: String(used), node: sourcesNode }, { key: "words", label: "Ключевые слова", badge: String(kws.length), node: wordsNode }, { key: "manual", label: "Вручную", node: manualNode }]} />;
}

function KwList({ title, items, danger }: { title: string; items: { id: string; word: string }[]; danger?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <span className="label">{title}</span>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-xs text-ink3">пока нет</span>}
        {items.map((k) => (
          <form key={k.id} action={deleteKeywordAction} className={`chip !pr-1 ${danger ? "!bg-bad-soft !text-bad" : "!bg-accent-soft !text-accent-ink"}`}>
            <input type="hidden" name="id" value={k.id} />{k.word}
            <SubmitButton className="grid size-5 place-items-center rounded-full hover:bg-ink/10" title="Удалить" aria-label={`Удалить «${k.word}»`}><X size={12} /></SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
