import { LINK_MODES } from "@/lib/links";
import { Settings2 } from "lucide-react";
import { CAROUSEL_STYLES, EMOJI, HASHTAGS, LENGTHS, LOGO_POS_LABEL, POST_TYPES, type ContentSettings } from "@/lib/postsettings";
import { STYLES } from "@/lib/images";
import { saveContentSettingsAction } from "@/lib/carousel/actions";
import { PRICES, rub } from "@/lib/wallet";

import { SubmitButton } from "@/components/SubmitButton";
import { Switch } from "@/components/ui/Switch";
const Sel = ({ name, value, opts }: { name: string; value: string | number; opts: Record<string, string> }) => (
  <select name={name} defaultValue={String(value)} className="input">{Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
);

/** Настройки контента завода: как писать посты и как оформлять карусели. Применяются к новым материалам и к плану. */
export function ContentSettingsCard({ factoryId, st, free, bare }: { factoryId: string; st: ContentSettings; free: boolean; bare?: boolean }) {
  const form = (
      <form action={saveContentSettingsAction} className={bare ? "space-y-5" : "mt-4 space-y-5"}>
        <input type="hidden" name="factory" value={factoryId} />
        <div>
          <span className="label">Типы постов (если выбрано несколько, план распределит их по идеям)</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(POST_TYPES).map(([k, v]) => (
              <label key={k} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="postTypes" value={k} defaultChecked={st.postTypes.includes(k)} className="hidden" />{v}</label>
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
          <label className="label">Ссылки на ваш сайт в постах</label>
          <Sel name="linkMode" value={st.linkMode} opts={LINK_MODES} />
          <p className="mt-1 text-xs text-ink3">Работает для ссылки на сайт из поля выше. UTM-метки (источник, кампания) попадут в вашу Метрику или аналитику; со счётчиком в ссылке будет адрес нашего сервиса, и переходы видны в «Аналитике».</p>
        </div>
        <div>
          <label className="label">Примеры ваших постов</label>
          <textarea name="examples" defaultValue={st.examples} rows={5} maxLength={3000} placeholder="Вставьте 2–3 примера постов, которые вам нравятся. Нейросеть перенимает манеру и интонацию, но не содержание." className="input text-sm" />
        </div>
        <Switch name="learn" defaultChecked={st.learn} label="Учиться на результатах" hint="Когда накопится статистика (от 6 постов), ИИ видит, какие темы и форматы набрали больше просмотров, и предлагает идеи в этом духе." />
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
        <div className="border-t border-line pt-4">
          <b className="mb-3 block text-sm">Картинки к статьям</b>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Единый стиль картинок</label><Sel name="imgStyle" value={st.imgStyle} opts={{ "": "Как в брендбуке (если не задан — иллюстрация)", ...Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])) }} /><p className="mt-1 text-xs text-ink3">Все картинки одной статьи рисуются в этом стиле и с вашей палитрой, поэтому выглядят как одна серия.</p></div>
            <div className="space-y-2">
              <Switch name="imgLogo" defaultChecked={st.imgLogo} label="Добавлять логотип на картинки статей" hint="Перед созданием картинок это можно изменить для каждой отдельно. Нужен загруженный логотип бренда." />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Место логотипа</label><Sel name="imgLogoPos" value={st.imgLogoPos} opts={LOGO_POS_LABEL} /></div>
                <div><label className="label">Размер, % ширины</label><input type="number" name="imgLogoScale" min={4} max={40} defaultValue={st.imgLogoScale} className="input" /></div>
              </div>
            </div>
          </div>
        </div>
        <SubmitButton className="btn">Сохранить настройки</SubmitButton>
      </form>
  );
  return bare ? form : (
    <details className="card mb-4 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Settings2 size={15} />Настройки контента: посты и карусели</summary>
      {form}
    </details>
  );
}
