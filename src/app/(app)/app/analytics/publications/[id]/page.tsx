import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { requirePageFeature } from "@/lib/plan-catalog";
import { publishedAnalytics, publicationBrand, nativeKindName } from "@/lib/published-analytics";
import { PublishedPostMedia } from "@/components/PublishedPostMedia";
import { PostText } from "@/components/monitor/PostText";
import { SubmitButton } from "@/components/SubmitButton";
import { refreshPublicationStatsAction } from "@/lib/engage-actions";
import { KIND } from "@/components/ui";
export default async function PublicationAnalytics({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{err?:string}>}) {
  const {id}=await params,c=await requireCtx(), sp=await searchParams;
  await requirePageFeature(c.org.id,"analytics");
  if(!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const [p]=await publishedAnalytics(c.org.id,{},id);
  if(!p) notFound();
  const brand=await publicationBrand(c.org.id,id);
  const count=(value:number)=>p.last_fetched_at?value.toLocaleString("ru-RU"):"—";
  const metrics=[["Просмотры",count(p.views)],["Лайки и реакции",p.kind==='vk'?count(p.likes):"—"],["Комментарии",p.kind==='vk'?count(p.comments):"—"],["Репосты",p.kind==='vk'?count(p.reposts):"—"],["Вовлечённость",p.kind==='vk'&&p.last_fetched_at&&p.views?`${((p.likes+p.comments+p.reposts)/p.views*100).toFixed(1)}%`:"—"]];
  return <div className="max-w-[1100px]"><Link href="/app/analytics" className="mb-5 inline-flex items-center gap-2 text-sm text-ink2"><ArrowLeft size={15}/>Аналитика</Link><h1 className="text-3xl font-semibold">{KIND[p.material_kind]??"Материал"} {nativeKindName(p.kind)}</h1><p className="mt-3 text-ink2">{brand?.name} · {p.author} · Опубликован через JuicerAI{p.posted_at?` · ${new Date(p.posted_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})} МСК`:""}</p>{sp.err&&<p role="alert" className="mt-4 rounded-2xl bg-bad-soft p-4 text-sm text-bad">{sp.err}</p>}<div className="my-6 flex flex-wrap gap-3">{p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><ExternalLink size={16}/>Открыть пост</a>}{canWrite(c.org.role)&&<form action={refreshPublicationStatsAction}><input type="hidden" name="id" value={id}/><SubmitButton className="btn btn-ghost"><RefreshCw size={16}/>Обновить статистику</SubmitButton></form>}<Link href={`/app/create?item=${p.item_id}`} className="btn btn-ghost">Открыть материал</Link></div>{!p.last_fetched_at&&<p className="mb-5 rounded-2xl bg-accent-soft p-4 text-sm">Материал уже в аналитике. Первые показатели появятся после автоматического обновления или нажатия «Обновить статистику».</p>}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{metrics.map(([label,value])=><div key={label} className="card p-5"><p className="text-sm text-ink2">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div>{p.last_fetched_at&&<p className="mt-4 text-xs text-ink3">Обновлено: {new Date(p.last_fetched_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})} МСК</p>}<section className="card mt-6 p-6"><h2 className="mb-4 text-lg font-semibold">Текст и изображения материала</h2><PublishedPostMedia assets={p.assets}/><PostText title="" text={p.body}/></section></div>;
}
