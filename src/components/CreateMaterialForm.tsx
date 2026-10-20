"use client";
import { useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { Switch } from "@/components/ui/Switch";
import { ImagePicker } from "@/components/ImagePicker";

const MULTI = "__multi", SOURCE = "__source";
type Act = (f: FormData) => void | Promise<void>;

/**
 * «Создать материал»: один вход для трёх сценариев. Тип материала выбирается в списке: один формат, несколько форматов по одной теме
 * или «из ссылки или текста» — тогда форма меняется: вместо темы ссылка или текст, и сервис разбивает источник на несколько материалов.
 */
export function CreateMaterialForm({ factoryId, kinds, labels, defaultKind, createAction, repurposeAction, priceHint, sourcePrice }: {
  factoryId: string; kinds: string[]; labels: Record<string, string>; defaultKind: string;
  createAction: Act; repurposeAction: Act; priceHint: string; sourcePrice: string;
}) {
  const [type, setType] = useState(defaultKind), [plan, setPlan] = useState(false);
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
          <input name="topic" required minLength={3} maxLength={300} placeholder="Тема материала (для SEO-статьи — поисковый запрос)" className="input" />
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
