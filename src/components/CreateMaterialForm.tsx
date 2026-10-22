"use client";
import { useRef, useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { Switch } from "@/components/ui/Switch";
import { ImagePicker } from "@/components/ImagePicker";
import { AutoTextarea } from "@/components/AutoTextarea";
import { AiTextTools } from "@/components/AiTextTools";
import { NewsPicker } from "@/components/NewsPicker";

const MULTI = "__multi", SOURCE = "__source";
type Act = (f: FormData) => void | Promise<void>;

/**
 * «Создать материал»: один вход для трёх сценариев. Тип материала выбирается в списке: один формат, несколько форматов по одной теме
 * или «из ссылки или текста» — тогда форма меняется: вместо темы ссылка или текст, и сервис разбивает источник на несколько материалов.
 */
export function CreateMaterialForm({ factoryId, kinds, labels, defaultKind, createAction, repurposeAction, priceHint, sourcePrice, editPrice = "" }: {
  factoryId: string; kinds: string[]; labels: Record<string, string>; defaultKind: string;
  createAction: Act; repurposeAction: Act; priceHint: string; sourcePrice: string; editPrice?: string;
}) {
  const [type, setType] = useState(defaultKind), [plan, setPlan] = useState(false);
  const topicRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopicState] = useState(""), [textmode, setTextmode] = useState<"ai" | "asis">("ai");
  // замена текста из кода (ИИ-правка, выбор новости): обновляем поле и его высоту
  const setTopic = (t: string) => { setTopicState(t); const el = topicRef.current; if (el) { el.value = t; el.dispatchEvent(new Event("input", { bubbles: true })); } };
  const longText = topic.length > 300;
  const [pollMode, setPollMode] = useState<"options" | "open">("options"), [pollCount, setPollCount] = useState(4);
  const source = type === SOURCE, multi = type === MULTI;
  return (
    <form action={source ? repurposeAction : createAction} className="space-y-3">
      <input type="hidden" name="factory" value={factoryId} />
      {!source && !multi && <input type="hidden" name="kinds" value={type} />}
      {source ? (
        <>
          <input name="url" type="url" maxLength={500} placeholder="Ссылка на статью (https://…)" className="input" />
          <textarea name="text" rows={5} maxLength={30000} placeholder="…или вставьте текст целиком: блог, расшифровку вебинара, длинный пост (от 400 знаков)" className="input" />
        </>
      ) : (
        <>
          <AutoTextarea ref={topicRef} name="topic" required minLength={3} maxLength={20000} rows={2} value={topic} onChange={(e) => setTopicState(e.target.value)}
            placeholder="Тема, идея или готовый текст целиком. Для SEO-статьи: поисковый запрос" className="input !min-h-[4.5rem] leading-6" />
          <div className="flex flex-wrap items-center gap-2">
            <NewsPicker onPick={(n) => { setTopic(`${n.title}\n\n${n.body}`.trim()); setTextmode("ai"); }} />
            {topic.length > 0 && <span className="ml-auto text-xs text-ink3">Знаков: {topic.length}</span>}
          </div>
          {topic.trim().length >= 20 && <AiTextTools getText={() => topicRef.current?.value ?? topic} setText={setTopic} price={editPrice} />}
          {longText && (
            <div className="space-y-1.5 rounded-2xl bg-tile p-3">
              <span className="label">Что сделать с этим текстом</span>
              <div className="flex flex-wrap gap-2">
                <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="textmode" value="ai" checked={textmode === "ai"} onChange={() => setTextmode("ai")} className="hidden" />Написать материал по тексту</label>
                <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="textmode" value="asis" checked={textmode === "asis"} onChange={() => { setTextmode("asis"); if (type !== "post" && kinds.includes("post")) setType("post"); }} className="hidden" />Оставить как есть (пост без ИИ, бесплатно)</label>
              </div>
              <p className="text-xs text-ink3">{textmode === "asis" ? "Текст станет постом без изменений и откроется в окне: там можно доработать его ИИ и посмотреть, как он выглядит в соцсетях." : "ИИ возьмёт ваш текст за основу: факты и мысли сохранятся, форма подстроится под выбранный формат."}</p>
            </div>
          )}
          <input name="hook" maxLength={300} placeholder="Хук или угол (необязательно)" className="input" />
        </>
      )}
      <div className={`grid gap-3 ${source || plan ? "sm:grid-cols-2" : ""}`}>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Тип материала" className="input">
          {kinds.map((k) => <option key={k} value={k}>{labels[k]}</option>)}
          <option value={MULTI}>Несколько форматов по одной теме</option>
          <option value={SOURCE}>Из ссылки или текста → несколько материалов</option>
        </select>
        {source ? (
          <select name="count" defaultValue="5" aria-label="Сколько материалов" className="input">{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>Материалов: {n}</option>)}</select>
        ) : plan ? (
          <input name="date" type="date" className="input" title="Дата выхода идеи в плане (если пусто — ближайший свободный день)" aria-label="Дата" />
        ) : null}
      </div>
      {type === "poll" && !source && (
        <div className="space-y-2 rounded-2xl bg-tile p-3">
          <span className="label">Какой опрос сделать</span>
          <div className="flex flex-wrap gap-2">
            <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="pollmode" value="options" checked={pollMode === "options"} onChange={() => setPollMode("options")} className="hidden" />С вариантами ответов</label>
            <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="pollmode" value="open" checked={pollMode === "open"} onChange={() => setPollMode("open")} className="hidden" />Открытый вопрос (без вариантов)</label>
          </div>
          {pollMode === "options" ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink2">
              <label className="flex items-center gap-2">Сколько вариантов
                <select name="pollcount" value={pollCount} onChange={(e) => setPollCount(Number(e.target.value))} className="input !w-auto !py-1 text-xs">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" name="pollmulti" />Можно выбрать несколько (в Telegram)</label>
            </div>
          ) : null}
          <p className="text-xs text-ink3">{pollMode === "options" ? "В Telegram выйдет встроенный опрос с кнопками, в VK и MAX варианты уйдут текстом, голосовать цифрой в комментариях." : "Только вопрос: люди отвечают своими словами в комментариях. Вопрос будет открытым, не «да или нет»."} Вопрос и варианты можно будет поправить в окне материала.</p>
        </div>
      )}
      {multi && (
        <div>
          <span className="label">Какие материалы создать по этой теме</span>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => <label key={k} className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="checkbox" name="kinds" value={k} defaultChecked={k === defaultKind} className="hidden" />{labels[k]}</label>)}
          </div>
        </div>
      )}
      {!source && <ImagePicker hint="Фото или картинка к посту. Если приложите своё, ИИ не будет создавать другое; доработать его можно в самом материале." />}
      {!source && <Switch name="mode" value="ideas" onChange={(e) => setPlan(e.target.checked)} label="Только добавить в план" hint="Текст не пишется сразу: тема ляжет в план идеей, дату можно выбрать. Без этого материал создаётся сразу и откроется в окне: его можно посмотреть и поправить до отправки в план." />}
      <SubmitButton className="btn btn-accent h-12 w-full justify-center text-[15px]">{source ? <Layers size={16} /> : <Sparkles size={16} />}{source ? "Разобрать на материалы" : "Создать"}</SubmitButton>
      <p className="text-xs text-ink3">{source
        ? `Сервис выделит разные мысли и предложит материалы с отдельным углом подачи; тексты потом пишутся по фактам исходника. ${sourcePrice} Идеи встанут в план на ближайшие свободные дни.`
        : priceHint}</p>
    </form>
  );
}
