import { savePollAction } from "@/lib/carousel/actions";

/** Опрос материала: вопрос и варианты. В Telegram выйдет встроенным опросом, в остальных площадках текстом с цифрами. */
export function PollPanel({ itemId, factoryId, poll, editable }: { itemId: string; factoryId: string; poll: { question: string; options: string[] }; editable: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <b className="text-sm">Опрос</b>
      <p className="text-sm font-medium">{poll.question}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink2">{poll.options.map((o, i) => <li key={i}>{o}</li>)}</ol>
      {editable && (
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить вопрос и варианты</summary>
          <form action={savePollAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
            <input name="question" defaultValue={poll.question} maxLength={280} className="input font-medium" />
            <textarea name="options" defaultValue={poll.options.join("\n")} rows={5} className="input" placeholder="Каждый вариант с новой строки (2–10)" />
            <button className="btn">Сохранить опрос</button>
          </form>
        </details>
      )}
    </div>
  );
}
