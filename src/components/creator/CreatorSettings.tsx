"use client";
import { useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal, Sparkles, Settings2, UserRound, Info, ImageIcon } from "lucide-react";
import { QUALITY, FORMATS, NO_OPTS, slidePrice, type CreateOpts, type ImgModel, type QualityKey, type FormatKey } from "@/lib/creator/consts";
import { POST_TYPES } from "@/lib/postsettings";
import { STYLES } from "@/lib/studio-catalog";
import type { StudioSettings } from "@/lib/creator/actions";
import { rub } from "./ui";

export function CreatorSettings({kind, models, textModels, settings: s, opts, audience, hasLogo, disabled, set, setOpts}: {
  kind: string; models: ImgModel[]; textModels: string[]; settings: StudioSettings; opts: CreateOpts;
  audience: string; hasLogo: boolean; disabled: boolean;
  set: (p: Partial<StudioSettings>) => void; setOpts: (p: CreateOpts) => void;
}) {
  const [open, setOpen] = useState<string[]>(["model", "format"]);
  const [filter, setFilter] = useState("all");
  const car = kind === "carousel";
  const model = models.find(m => m.id === s.model);
  const sections = ["model", "format", "style", "audience", "about"];
  const toggle = (id: string) => setOpen(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  const reset = () => { set({model: models[0]?.id ?? "", quality:"1k",format:"portrait",n:5,textInImage:false,logo:hasLogo,logoPos:"br",style:"",structure:""}); setOpts({...NO_OPTS}); setFilter("all"); };
  const panel = (id: string, title: string, icon: React.ReactNode, children: React.ReactNode) => <section className="rounded-[10px] bg-tile">
    <button type="button" className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13px] font-medium" onClick={() => toggle(id)} aria-expanded={open.includes(id)} aria-controls={`creator-${id}`}>
      {icon}<span className="flex-1">{title}</span><ChevronDown size={14} className={`transition-transform ${open.includes(id) ? "rotate-180" : ""}`} />
    </button>
    {open.includes(id) && <div id={`creator-${id}`} className="space-y-3 px-3.5 pb-4">{children}</div>}
  </section>;
  const select = (label: string, value: string | number, onChange: (v:string)=>void, children:React.ReactNode) => <label className="block text-xs text-ink2">{label}<select className="input mt-1.5 !rounded-lg !bg-surface !px-2.5 !py-2 text-xs" value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>;
  const check = (label: string, checked: boolean, onChange: (v:boolean)=>void, unavailable=false) => <label className={`flex items-center justify-between gap-3 text-xs ${unavailable ? "opacity-50" : ""}`}><span>{label}</span><input type="checkbox" className="size-4 accent-accent" checked={checked} disabled={unavailable} onChange={e=>onChange(e.target.checked)} /></label>;
  const formatHint:Record<string,string> = {post:"Готовый текст для ленты с хуком и призывом к действию.",seo:"Статья с поисковой структурой, заголовками и метаданными. Ключевые слова укажите в запросе.",reels:"Сценарий короткого ролика: хук, кадры, текст и хронометраж. Готовое видео не создаётся.",story:"Тексты последовательных экранов сторис.",infographic:"Структура, данные и визуальная инфографика. Проверьте цифры перед публикацией.",poll:"Вопрос и варианты ответов для аудитории.",email:"Тема письма и текст для рассылки.",guide:"Структурированный гайд с практическими шагами.",contest:"Механика конкурса, условия и текст публикации.",article:"Развёрнутая статья с последовательной структурой."};
  const requirements: Record<string, [string,string]> = {
    seo: ["Ключевые слова и объём", "Например: CRM для малого бизнеса, выбор CRM; 6–8 тысяч знаков"],
    reels: ["Хронометраж и съёмка", "Например: 30 секунд, говорящая голова, субтитры и 3 сцены"],
    poll: ["Варианты и механика", "Например: 4 варианта ответа, один правильный, добавить пояснение"],
    story: ["Экраны и интерактив", "Например: 5 экранов, вопрос в начале, опрос в конце"],
    infographic: ["Данные и структура", "Укажите проверенные цифры, единицы измерения и желаемые блоки"],
    email: ["Цель и призыв", "Например: пригласить на вебинар, короткое письмо, кнопка регистрации"],
    guide: ["Разделы и объём", "Например: 7 практических шагов и чек-лист в конце"],
    contest: ["Правила и призы", "Условия участия, сроки, призы и способ выбора победителя"],
    article: ["Структура и объём", "Например: 5 разделов, примеры и выводы; около 8 тысяч знаков"],
    post: ["Длина и оформление", "Например: до 1000 знаков, без эмодзи, вопрос в конце"],
  };
  const req = requirements[kind] || requirements.post;
  return <aside aria-label="Настройки создания материала" className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-3">
    <fieldset disabled={disabled} className="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-190px)] lg:overflow-y-auto lg:pr-1 disabled:opacity-60">
      {panel("model", "Модели нейросетей", <Sparkles size={15}/>, <>
        {select("Модель текста",opts.textModel || "", v=>setOpts({...opts,textModel:v}), <><option value="">Автоматически по формату</option>{textModels.map(m=><option key={m} value={m}>{m}</option>)}</>)}
        {car && <>
          <div className="flex gap-1.5" role="group" aria-label="Фильтр стоимости моделей">{[["all","Все"],["low","Дешевле"],["high","Дороже"]].map(([v,l])=><button key={v} type="button" aria-pressed={filter===v} onClick={()=>setFilter(v)} className={`rounded-md border px-2 py-1.5 text-[11px] ${filter===v ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>{l}</button>)}</div>
          {select("Модель изображений",s.model, v=>set({model:v,textInImage:false}),models.filter(m=>m.id===s.model || filter==="all" || (filter==="low" ? m.kop<=models.reduce((a,x)=>a+x.kop,0)/models.length : m.kop>models.reduce((a,x)=>a+x.kop,0)/models.length)).map(m=><option key={m.id} value={m.id}>{m.label} · {rub(slidePrice(m,s.quality))}/слайд</option>))}
          {!models.length && <p className="text-xs text-bad">Нет доступных моделей изображений. Обратитесь к администратору.</p>}
        </>}
        <p className="text-[11px] leading-relaxed text-ink3">Доступны модели, подключённые администратором. Итоговая цена показана перед созданием.</p>
      </>)}
      {panel("format",car ? "Слайды и изображения" : "Формат материала",<ImageIcon size={15}/>,car ? <>
        <div className="grid grid-cols-2 gap-2">{select("Слайды",s.n,v=>set({n:Number(v)}),[3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>))}{select("Качество",s.quality,v=>set({quality:v as QualityKey}),Object.entries(QUALITY).map(([k,v])=><option key={k} value={k}>{v.label}</option>))}</div>
        {select("Пропорции",s.format,v=>set({format:v as FormatKey}),Object.entries(FORMATS).map(([k,v])=><option key={k} value={k}>{v.label}</option>))}
        {check("Текст рисует нейросеть",s.textInImage && !!model?.text,v=>set({textInImage:v}),!model?.text)}
        <p className="text-[11px] leading-relaxed text-ink3">По умолчанию набираем текст фирменным шрифтом без ошибок в кириллице.</p>
        {check("Логотип бренда",s.logo && hasLogo,v=>set({logo:v}),!hasLogo)}
        {!hasLogo && <p className="text-[11px] text-ink3">Загрузите логотип в разделе «Бренды».</p>}
        {s.logo && hasLogo && select("Положение логотипа",s.logoPos,v=>set({logoPos:v as StudioSettings["logoPos"]}),[["tl","Сверху слева"],["tr","Сверху справа"],["bl","Снизу слева"],["br","Снизу справа"],["bc","Снизу по центру"],["tc","Сверху по центру"]].map(([k,v])=><option key={k} value={k}>{v}</option>))}
      </> : <><p className="text-xs leading-relaxed text-ink2">{formatHint[kind] || "Материал в голосе вашего бренда."}</p><label className="block text-xs text-ink2">{req[0]}<textarea className="input mt-1.5 min-h-24 !rounded-lg !bg-surface text-xs" maxLength={600} value={opts.requirements || ""} onChange={e=>setOpts({...opts,requirements:e.target.value})} placeholder={req[1]}/></label></>)}
      {panel("style","Стиль и подача",<SlidersHorizontal size={15}/>,<>
        {select("Тип подачи",opts.postType,v=>setOpts({...opts,postType:v}),<><option value="">По настройкам завода</option>{Object.entries(POST_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</>)}
        {select("Манера письма",opts.voice,v=>setOpts({...opts,voice:v}),<><option value="">Голос бренда</option>{Object.entries(STYLES).filter(([k])=>k!=="normal").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</>)}
        {car && <label className="block text-xs text-ink2">Визуальный стиль<textarea aria-label="Визуальный стиль" className="input mt-1.5 min-h-20 !rounded-lg !bg-surface text-xs" maxLength={500} value={s.style} onChange={e=>set({style:e.target.value})} placeholder="Например: минимализм, светлый фон, предметные фото"/></label>}
      </>)}
      {panel("audience","Аудитория",<UserRound size={15}/>,<><p className="text-[11px] leading-relaxed text-ink3">{audience || "Аудитория из настроек бренда"}</p><label className="block text-xs">Другая аудитория<textarea className="input mt-1.5 min-h-20 !rounded-lg !bg-surface text-xs" maxLength={400} value={opts.audience} onChange={e=>setOpts({...opts,audience:e.target.value})} placeholder="Оставьте пустым, чтобы использовать аудиторию бренда"/></label></>)}
      {panel("about","О моделях и цене",<Info size={15}/>,<><p className="break-words text-xs leading-relaxed text-ink2">Текст: {opts.textModel || "модель, назначенная для этого формата"}{car && <><br/>Изображения: {model?.id || "не настроены"}<br/>{model?.hint}</>}</p><p className="text-[11px] leading-relaxed text-ink3">Сначала составим описание и план. Создание запускается после подтверждения. При ошибке генерации стоимость возвращается.</p></>)}
      <div className="grid grid-cols-2 gap-1.5 rounded-[10px] bg-tile p-2"><button type="button" className="flex items-center justify-center gap-1 rounded-lg bg-accent px-2 py-2 text-[11px] text-white" onClick={reset}><RotateCcw size={12}/>Сбросить всё</button><button type="button" className="flex items-center justify-center gap-1 rounded-lg bg-accent px-2 py-2 text-[11px] text-white" onClick={()=>setOpen(open.length===sections.length ? [] : sections)}><Settings2 size={12}/>{open.length===sections.length ? "Свернуть всё" : "Открыть всё"}</button></div>
    </fieldset>
  </aside>;
}
