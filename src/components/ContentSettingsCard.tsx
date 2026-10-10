import { Settings2 } from "lucide-react";
import { CAROUSEL_STYLES, EMOJI, HASHTAGS, LENGTHS, POST_TYPES, type ContentSettings } from "@/lib/postsettings";
import { saveContentSettingsAction } from "@/lib/carousel/actions";
import { PRICES, rub } from "@/lib/wallet";

const Sel = ({ name, value, opts }: { name: string; value: string | number; opts: Record<string, string> }) => (
  <select name={name} defaultValue={String(value)} className="input">{Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
);

/** Настройки контента завода: как писать посты и как оформлять карусели. Применяются к новым материалам и к плану. */
export function ContentSettingsCard({ factoryId, st, free }: { factoryId: string; st: ContentSettings; free: boolean }) {
  return (
    <details className="card mb-4 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Settings2 size={15} />Настройки контента: посты и карусели</summary>
      <form action={saveContentSettingsAction} className="mt-4 space-y-5">
        <input type="hidden" name="factory" value={factoryId} />
        <div>
          <span className="label">Типы постов (если выбрано несколько, план распределит их по идеям)</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(POST_TYPES).map(([k, v]) => (
              <label key={k} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="checkbox" name="postTypes" value={k} defaultChecked={st.postTypes.includes(k)} className="hidden" />{v}</label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Длина поста</label><Sel name="length" value={st.length} opts={LENGTHS} /></div>
          <div><label className="label">Эмодзи</label><Sel name="emoji" value={st.emoji} opts={EMOJI} /></div>
          <div><label className="label">Хештеги</label><Sel name="hashtags" value={st.hashtags} opts={HASHTAGS} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Призыв к действию</label><input name="cta" defaultValue={st.cta} maxLength={200} placeholder="Например: Запишитесь на бесплатную консультацию" className="input" /></div>
          <div><label className="label">Ссылка на сайт или товар</label><input name="link" defaultValue={st.link} maxLength={300} placeholder="https://" className="input" /><p className="mt-1 text-xs text-ink3">Будет добавляться в конце постов как есть.</p></div>
        </div>
        <div>
          <label className="label">Примеры ваших постов</label>
          <textarea name="examples" defaultValue={st.examples} rows={5} maxLength={3000} placeholder="Вставьте 2–3 примера постов, которые вам нравятся. Нейросеть перенимает манеру и интонацию, но не содержание." className="input text-sm" />
        </div>
        <label className="flex items-start gap-2 rounded-xl bg-tile p-3 text-sm"><input type="checkbox" name="learn" defaultChecked={st.learn} className="mt-0.5" /><span><b>Учиться на результатах</b><span className="block text-xs text-ink2">Когда накопится статистика (от 6 постов), ИИ видит, какие темы и форматы набрали больше просмотров, и предлагает идеи в этом духе.</span></span></label>
        <div className="border-t border-line pt-4">
          <b className="mb-3 block text-sm">Карусели</b>
          <div className="grid gap-4 sm:grid-cols-4">
            <div><label className="label">Слайдов</label><Sel name="slides" value={st.slides} opts={Object.fromEntries([4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), String(n)]))} /></div>
            <div><label className="label">Оформление</label><Sel name="carouselStyle" value={st.carouselStyle} opts={CAROUSEL_STYLES} /></div>
            <div><label className="label">Формат</label><Sel name="carouselFormat" value={st.carouselFormat} opts={{ portrait: "Вертикальный 4:5", square: "Квадрат 1:1" }} /></div>
            <div><label className="label">Обложка</label><Sel name="carouselCover" value={st.carouselCover} opts={{ plain: "Цветная, без картинки", ai: `Фон нейросетью${free ? "" : ` (+${rub(PRICES.image)})`}` }} /></div>
          </div>
          <p className="mt-2 text-xs text-ink3">Тексты на слайдах набираются шрифтом без искажений, цвета и логотип берутся из брендбука. Карусель стоит {free ? "бесплатно для админа" : rub(PRICES.carousel)}.</p>
        </div>
        <button className="btn">Сохранить настройки</button>
      </form>
    </details>
  );
}
