"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp, Search, Sparkles, Loader2, ExternalLink, ArrowRight, Check, CalendarDays } from "lucide-react";
import type { TrendFactory, TrendRun } from "@/lib/trends-data";
import { findTrendsAction, trendMaterialAction, trendTopicsAction } from "@/lib/trends-actions";
import { tokens } from "@/lib/tokens";

export function Trends({ factories, initial, price, topicPrice, canWrite }: { factories: TrendFactory[]; initial: TrendRun | null; price: number; topicPrice: number; canWrite: boolean }) {
  const router = useRouter();
  const first = factories.find(f=>f.id === initial?.factory_id) ?? factories[0];
  const [factory,setFactory] = useState(first.id), [query,setQuery] = useState(initial?.query ?? first.niche ?? ""), [days,setDays] = useState(initial?.days ?? 7);
  const [report,setReport] = useState(initial), [busy,setBusy] = useState(false), [creating,setCreating] = useState<string | null>(null), [error,setError] = useState("");
  const [topicBusy,setTopicBusy]=useState(false),[topics,setTopics]=useState<Record<string,string[]>>({});
  const pending = useRef(false), making = useRef(false);
  const fac = factories.find(f=>f.id===factory)!;
  const suggestions = [...new Set([...(topics[factory]??[]),fac.niche,fac.product,...factories.filter(f=>f.brand===fac.brand).map(f=>f.niche)].map(s=>s.trim()).filter(s=>s.length>=3 && s.length<=120))].slice(0,8);
  const visible = report?.factory_id === factory ? report : null;
  async function suggest() {
    if(pending.current||!canWrite)return;
    pending.current=true;setTopicBusy(true);setError("");
    try{const result=await trendTopicsAction(factory);if(result.error)setError(result.error);if(result.topics)setTopics(old=>({...old,[factory]:result.topics!}));}
    catch{setError("Не удалось получить темы. Повторите запрос: готовый подбор по текущему брифу сохранён.");}
    finally{pending.current=false;setTopicBusy(false);}
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (pending.current || !canWrite) return;
    pending.current = true; setBusy(true); setError("");
    try { const r = await findTrendsAction({ factory,query,days }); if (r.error) setError(r.error); if (r.run) setReport(r.run); }
    catch { setError("Не удалось получить ответ. Повторите запрос: готовая подборка сохраняется, повтор в течение 30 минут не списывает токены."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function create(id: string) {
    if (making.current || !visible || !canWrite) return;
    making.current = true; setCreating(id); setError("");
    try { const r = await trendMaterialAction(visible.id,id); if(r.error) setError(r.error); if(r.url) router.push(r.url); }
    catch { setError("Не удалось открыть материал. Повторное нажатие откроет уже сохранённую идею."); }
    finally { making.current = false; setCreating(null); }
  }
  return <div className="mx-auto w-full max-w-6xl">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><TrendingUp size={26}/></span><h1 className="text-3xl font-semibold">Тренды</h1></div><p className="mt-4 max-w-2xl leading-relaxed text-ink2">Свежие темы вашей ниши и идеи с учётом продукта, аудитории и брифа компании.</p></div><Link href={`/app/factories/${factory}`} className="btn btn-ghost">Бриф и настройки <ArrowRight size={16}/></Link></div>
    <form onSubmit={search} className="card p-5 md:p-7">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto]"><label className="block"><span className="label">Бренд и направление</span><select disabled={busy || topicBusy || !!creating} className="input min-h-12" value={factory} onChange={e=>{setFactory(e.target.value);setQuery(factories.find(f=>f.id===e.target.value)?.niche ?? "");setError("");}}>{factories.map(f=><option key={f.id} value={f.id}>{f.brand} · {f.name}</option>)}</select></label><fieldset><legend className="label">Период публикаций</legend><div className="flex gap-2">{[7,30].map(n=><button key={n} disabled={busy || topicBusy} type="button" aria-pressed={days===n} onClick={()=>setDays(n)} className={`btn min-h-12 ${days===n?"btn-accent":"btn-ghost"}`}><CalendarDays size={16}/>{n} дней</button>)}</div></fieldset></div>
      <div className="mt-5"><label htmlFor="trend-query" className="label">Тема или ниша</label><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-4 text-ink3" size={20}/><input id="trend-query" required minLength={3} maxLength={120} disabled={busy || topicBusy} value={query} onChange={e=>setQuery(e.target.value)} className="input min-h-14 !pl-12" placeholder="Например: уход за комнатными растениями" /></div><button disabled={busy || topicBusy || !!creating || !canWrite || query.trim().length<3} className="btn btn-accent min-h-14 justify-center px-6">{busy?<Loader2 size={18} className="animate-spin"/>:<Sparkles size={18}/>} {busy?"Анализируем публикации…":`Найти идеи · ${tokens(price)}`}</button></div></div>
      <div className="mt-4"><button type="button" onClick={suggest} disabled={busy||topicBusy||!!creating||!canWrite} className="btn btn-ghost max-w-full !whitespace-normal text-left">{topicBusy?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>}Предложить темы по брифу · {tokens(topicPrice)}</button><p className="mt-2 text-xs text-ink3">Это темы для поиска. Их актуальность проверим по свежим публикациям. Повтор по тому же брифу в течение 7 дней — без нового списания.</p></div>
      {suggestions.length>0 && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs text-ink3">Из брифа направления:</span>{suggestions.map(s=><button key={s} disabled={busy || topicBusy} type="button" onClick={()=>setQuery(s)} className="btn btn-ghost max-w-full whitespace-normal text-left text-xs">{s}</button>)}</div>}
      <p className="mt-4 text-xs leading-relaxed text-ink3">Ищем свежие публикации через Google Новости и анализируем заголовки и анонсы. Это сигналы обсуждаемости, а не измерение спроса или рейтинг просмотров. Готовый повторный запрос в течение 30 минут — без нового списания.</p>
    </form>
    {!canWrite && <p className="mt-4 text-sm text-ink2">Наблюдатель может смотреть подборки. Для анализа и создания материала нужна роль редактора.</p>}
    {error && <p role="alert" className="mt-5 rounded-2xl bg-bad-soft p-4 text-sm text-bad">{error}</p>}
    {busy && <div role="status" className="mt-8 flex items-center gap-3 rounded-3xl bg-tile p-6 text-ink2"><Loader2 className="shrink-0 animate-spin" size={24}/><p>Собираем свежие публикации и сопоставляем темы с брифом. Обычно это занимает до минуты.</p></div>}
    {visible ? <section aria-label="Подборка трендов" className={`mt-9 ${busy?"opacity-50":""}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Идеи для «{factories.find(f=>f.id===visible.factory_id)?.brand}»</h2><p className="mt-2 text-sm text-ink2">Запрос: {visible.query} · За {visible.days} дней · Подборка от {new Date(visible.created_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})} МСК</p></div><span className="chip">Изучено публикаций: {visible.result.sources.length}</span></div>
      {visible.result.summary && <p className="mb-6 rounded-3xl bg-accent-soft p-5 leading-relaxed text-ink">{visible.result.summary}</p>}
      <div className="grid items-start gap-5 md:grid-cols-2">{visible.result.ideas.map(idea=><article key={idea.id} className="card p-6"><div className="mb-4 flex items-center justify-between gap-3"><span className="chip">{idea.kind==="carousel"?"Карусель":"Пост"}</span><span className="text-xs text-ink3">{idea.sources.length>1?"Несколько публикаций":"Инфоповод"}</span></div><h3 className="text-xl font-semibold leading-snug">{idea.title}</h3><p className="mt-4 leading-relaxed text-ink2">{idea.hook}</p><div className="mt-5 rounded-2xl bg-surface p-4"><p className="flex items-center gap-2 text-sm font-medium"><Check size={16} className="text-accent"/>Почему подходит компании</p><p className="mt-2 text-sm leading-relaxed text-ink2">{idea.fit}</p></div><p className="mt-5 text-sm leading-relaxed text-ink2"><strong className="font-medium text-ink">Как подать: </strong>{idea.angle}</p><details className="mt-5 text-sm"><summary className="cursor-pointer font-medium text-ink2">Источники и даты ({idea.sources.length})</summary><ul className="mt-3 space-y-3">{visible.result.sources.filter(s=>idea.sources.includes(s.id)).map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-accent hover:underline">{s.title}<ExternalLink size={14} className="mt-1 shrink-0"/></a><time dateTime={s.date} className="mt-1 block text-xs text-ink3">{new Date(s.date).toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"})}</time></li>)}</ul></details><button type="button" disabled={busy || topicBusy || !!creating || !canWrite} onClick={()=>create(idea.id)} className="btn btn-accent mt-6 max-w-full !whitespace-normal text-left">{creating===idea.id?<Loader2 size={16} className="animate-spin"/>:<ArrowRight size={16}/>}Открыть в создании контента</button></article>)}</div><p className="mt-5 text-xs leading-relaxed text-ink3">Идея сохраняется без генерации текста. Стоимость создания материала показывается в редакторе. Перед публикацией проверьте факты по первоисточникам.</p>
    </section> : !busy && <div className="mt-8 rounded-3xl border border-dashed border-line px-6 py-16 text-center"><TrendingUp size={40} className="mx-auto text-accent"/><h2 className="mt-5 text-xl font-medium">Что сейчас обсуждают в вашей нише?</h2><p className="mx-auto mt-3 max-w-lg leading-relaxed text-ink2">Выберите направление компании, укажите тему и нажмите «Найти идеи». Покажем свежие инфоповоды, связь с брендом и варианты подачи.</p></div>}
  </div>;
}
